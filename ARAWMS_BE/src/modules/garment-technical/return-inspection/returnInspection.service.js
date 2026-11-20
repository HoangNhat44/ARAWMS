/**
 * ============================================================================
 * @title        : Return Inspection Service
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Xử lý nghiệp vụ KCS kiểm tra hàng hoàn/trả cho Nhân viên Kỹ thuật (Garment Technician).
 *                 Bao gồm: tra cứu/quét đơn hàng, ghi nhận biên bản KCS (ĐẠT/KHÔNG ĐẠT),
 *                 lưu video khui kiện, cập nhật trạng thái đơn hàng và tạo phiếu yêu cầu nhập kho hoàn (FinishedGoodsTicket).
 * @module       : Garment Technical / Return Inspection
 * @layer        : Service
 * ============================================================================
 */

import mongoose from 'mongoose';
import SalesOrder from '../../../models/SalesOrder.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import ReturnInspection from '../../../models/ReturnInspection.model.js';
import FinishedGoodsTicket from '../../../models/FinishedGoodsTicket.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import Sku from '../../../models/Sku.model.js';
import OrderQrToken from '../../../models/OrderQrToken.js';
import ProductUnit from '../../../models/ProductUnit.js';
import { getOrderStatusLabel } from '../../../common/constants/enums.js';

export const ALLOWED_RETURN_SCAN_STATUSES = ['EXCHANGE_REQUESTED', 'RETURN_REQUESTED', 'RETURNED'];

const createServiceError = (message, status = 400, code = 'BAD_REQUEST') => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

/**
 * Computes the Option-A return outcome from expected order quantity and inspected units.
 * - PASSED / RETURN_COMPLETED: 100% expected items scanned and accepted for saleable restock.
 * (RETURNED = parcel arrived back at the warehouse, waiting for KCS; it is an input status, not an outcome.)
 * - PARTIAL / PARTIALLY_RETURNED: at least one saleable item, plus defect or shortage.
 * - FAILED / RETURN_FAILED: zero saleable items.
 */
export const computeOrderReturnOutcome = (expectedTotalQty, units = []) => {
  const expected = Math.max(0, Number(expectedTotalQty) || 0);
  const passedQty = units.filter((u) => u.disposition !== 'QUARANTINE_DEFECT').length;
  const defectQty = units.filter((u) => u.disposition === 'QUARANTINE_DEFECT').length;

  if (expected > 0 && passedQty >= expected && defectQty === 0) {
    return {
      inspectionResult: 'PASSED',
      orderStatus: 'RETURN_COMPLETED',
      rmaStatus: 'UNBOXED_INSPECTED',
      passedQty,
      defectQty,
    };
  }
  if (passedQty > 0) {
    return {
      inspectionResult: 'PARTIAL',
      orderStatus: 'PARTIALLY_RETURNED',
      rmaStatus: 'UNBOXED_INSPECTED',
      passedQty,
      defectQty,
    };
  }
  return {
    inspectionResult: 'FAILED',
    orderStatus: 'RETURN_FAILED',
    rmaStatus: 'REJECTED',
    passedQty,
    defectQty,
  };
};

/** Finds or provisions a default active location for FINISHED_GOODS or DEFECT_QUARANTINE tickets. */
const resolveTicketLocation = async (warehouseType, session) => {
  const query = { warehouseType, status: 'ACTIVE', isDeleted: { $ne: true } };
  const existing = await WarehouseLocation.findOne(query).session(session || null);
  if (existing) return existing;

  if (warehouseType === 'DEFECT_QUARANTINE') {
    const [created] = await WarehouseLocation.create(
      [
        {
          locationCode: 'KHU-HANG-LOI-01',
          barcode: 'LOC-DEFECT-QUARANTINE-01',
          warehouseType: 'DEFECT_QUARANTINE',
          zoneCode: 'DEFECT',
          rackCode: 'Q',
          shelfCode: '01',
          maxCapacity: 100000,
          capacityUnit: 'PIECE',
          status: 'ACTIVE',
          isQuarantine: true,
        },
      ],
      session ? { session } : undefined
    );
    return created;
  }

  return WarehouseLocation.findOne({ status: 'ACTIVE', isDeleted: { $ne: true } }).session(session || null);
};

/**
 * Tra cứu thông tin đơn hàng hoặc yêu cầu đổi trả bằng mã đơn, mã vận đơn, mã RMA hoặc QR token.
 *
 * @async
 * @function lookupOrderByCode
 * @param {string} rawCode - Mã đơn hàng, mã vận đơn GHN, tracking code, mã RMA hoặc QR code (PACK:v1:...) cần quét.
 * @returns {Promise<Object>} Thông tin đơn hàng, RMA (nếu có) và lịch sử kiểm tra trước đó.
 * @throws {Error} Nếu mã tra cứu rỗng hoặc không tìm thấy bản ghi phù hợp.
 */
export const lookupOrderByCode = async (rawCode) => {
  let code = String(rawCode || '').trim();
  if (!code) {
    const err = new Error('Vui lòng nhập hoặc quét mã đơn hàng, mã vận đơn hoặc mã RMA');
    err.status = 400;
    throw err;
  }

  // 1. Xử lý nếu mã quét được là QR Token chuẩn AraWMS (PACK:v1:<64-hex>) hoặc chuỗi hex 64 ký tự
  let qrToken = null;
  if (code.startsWith('PACK:v1:')) {
    qrToken = code.slice('PACK:v1:'.length).trim();
  } else if (/^[a-f0-9]{64}$/i.test(code)) {
    qrToken = code.trim();
  }

  let order = null;
  let rma = null;

  // Nếu là QR Token, tìm qua qr.token hoặc bảng OrderQrToken
  if (qrToken) {
    order = await SalesOrder.findOne({ 'qr.token': qrToken, isDeleted: { $ne: true } })
      .populate('customerId', 'fullName phone email address deliveryAddress')
      .populate({
        path: 'items.skuId',
        select: 'skuCode skuBarcode styleName color size retailPrice productId',
        populate: { path: 'productId', select: 'productCode productName category' },
      })
      .lean();

    if (!order) {
      const tokenDoc = await OrderQrToken.findOne({ token: qrToken, revokedAt: null }).lean();
      if (tokenDoc?.orderId) {
        order = await SalesOrder.findById(tokenDoc.orderId)
          .populate('customerId', 'fullName phone email address deliveryAddress')
          .populate({
            path: 'items.skuId',
            select: 'skuCode skuBarcode styleName color size retailPrice productId',
            populate: { path: 'productId', select: 'productCode productName category' },
          })
          .lean();
      }
    }
  }

  // 2. Nếu chưa tìm thấy theo QR token, tìm trực tiếp theo mã đơn, mã vận đơn hoặc tracking
  if (!order) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactRegex = new RegExp(`^${escaped}$`, 'i');

    const searchConditions = [
      { orderCode: exactRegex },
      { 'warehouseFulfillment.waybillCode': exactRegex },
      { 'sourceDetails.externalTrackingCode': exactRegex },
      { 'sourceDetails.externalOrderCode': exactRegex },
    ];

    if (mongoose.Types.ObjectId.isValid(code)) {
      searchConditions.push({ _id: code });
    }

    order = await SalesOrder.findOne({
      $or: searchConditions,
      isDeleted: { $ne: true },
    })
      .populate('customerId', 'fullName phone email address deliveryAddress')
      .populate({
        path: 'items.skuId',
        select: 'skuCode skuBarcode styleName color size retailPrice productId',
        populate: { path: 'productId', select: 'productCode productName category' },
      })
      .lean();
  }

  // 3. Nếu chưa thấy, tìm trong ReturnRequest theo rmaCode hoặc returnWaybillCode
  if (!order) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactRegex = new RegExp(`^${escaped}$`, 'i');

    rma = await ReturnRequest.findOne({
      $or: [{ rmaCode: exactRegex }, { returnWaybillCode: exactRegex }],
    })
      .populate('customerId', 'fullName phone email address')
      .lean();

    if (rma && rma.originalOrderId) {
      order = await SalesOrder.findById(rma.originalOrderId)
        .populate('customerId', 'fullName phone email address deliveryAddress')
        .populate({
          path: 'items.skuId',
          select: 'skuCode skuBarcode styleName color size retailPrice productId',
          populate: { path: 'productId', select: 'productCode productName category' },
        })
        .lean();
    }
  } else {
    rma = await ReturnRequest.findOne({ originalOrderId: order._id }).lean();
  }

  // 4. Nếu vẫn chưa thấy, thử tìm khớp một phần (partial regex) cho orderCode hoặc waybillCode
  if (!order && code.length >= 4) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const partialRegex = new RegExp(escaped, 'i');

    order = await SalesOrder.findOne({
      $or: [
        { orderCode: partialRegex },
        { 'warehouseFulfillment.waybillCode': partialRegex },
      ],
      isDeleted: { $ne: true },
    })
      .populate('customerId', 'fullName phone email address deliveryAddress')
      .populate({
        path: 'items.skuId',
        select: 'skuCode skuBarcode styleName color size retailPrice productId',
        populate: { path: 'productId', select: 'productCode productName category' },
      })
      .lean();

    if (order) {
      rma = await ReturnRequest.findOne({ originalOrderId: order._id }).lean();
    }
  }

  if (!order) {
    const err = new Error(`Không tìm thấy đơn hàng hoặc mã vận đơn phù hợp với: "${code}"`);
    err.status = 404;
    throw err;
  }

  // 5. Tra cứu lịch sử kiểm tra hàng hoàn trước đó của đơn này (nếu có)
  const existingInspections = await ReturnInspection.find({ orderId: order._id })
    .sort({ createdAt: -1 })
    .populate('inspectedByTechId', 'fullName username email')
    .populate('inboundTicketId', 'ticketCode status createdAt')
    .lean();

  return {
    order,
    rma: rma || null,
    existingInspections,
  };
};

/**
 * Lấy danh sách các đơn hàng gần đây để người dùng chọn nhanh / quét thử nghiệm.
 *
 * @async
 * @function getRecentReturnableOrders
 * @returns {Promise<Array>} Danh sách các đơn hàng gợi ý.
 */
export const getRecentReturnableOrders = async () => {
  const finalizedOrderIds = await ReturnInspection.distinct('orderId', { sessionStatus: 'FINALIZED' });

  return SalesOrder.find({
    status: { $in: ALLOWED_RETURN_SCAN_STATUSES },
    _id: { $nin: finalizedOrderIds },
    isDeleted: { $ne: true },
  })
    .populate('customerId', 'fullName phone')
    .select('orderCode status warehouseFulfillment.waybillCode totalOrderAmount financialSummary items createdAt')
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(15)
    .lean();
};

/**
 * Ghi lại quá trình kiểm tra hàng hoàn/trả.
 * - Nếu ĐẠT: Chuyển trạng thái đơn sang 'RETURN_COMPLETED' (Hoàn thành công), sẵn sàng tạo lệnh nhập kho.
 * - Nếu KHÔNG ĐẠT: Yêu cầu bắt buộc video & lý do từ chối, lưu video gắn với đơn và ghi nhận trạng thái từ chối hoàn.
 *
 * @async
 * @function submitReturnInspection
 * @param {Object} payload - Dữ liệu biên bản kiểm tra từ Front-end.
 * @param {Object} user - Thông tin nhân viên kỹ thuật thực hiện.
 * @returns {Promise<Object>} Bản ghi ReturnInspection vừa tạo.
 */
export const submitReturnInspection = async (payload = {}, user) => {
  const {
    orderId,
    items = [],
    inspectionResult,
    qcNote = '',
    rejectReason = '',
    videoUrl = '',
    imageUrls = [],
    returnWaybillCode = '',
  } = payload;

  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    const err = new Error('Mã định danh đơn hàng (orderId) không hợp lệ');
    err.status = 400;
    throw err;
  }

  if (!['PASSED', 'FAILED'].includes(inspectionResult)) {
    const err = new Error('Kết quả kiểm tra phải là "PASSED" (Đạt) hoặc "FAILED" (Không đạt)');
    err.status = 400;
    throw err;
  }

  if (inspectionResult === 'FAILED') {
    if (!videoUrl || !videoUrl.trim()) {
      const err = new Error('Bắt buộc phải đính kèm đường dẫn video quay quá trình khui/kiểm hàng khi kết luận KHÔNG ĐẠT');
      err.status = 400;
      throw err;
    }
    if (!rejectReason || !rejectReason.trim()) {
      const err = new Error('Bắt buộc phải nhập lý do hàng hoàn không đạt tiêu chuẩn');
      err.status = 400;
      throw err;
    }
  }

  // Kiểm tra đơn hàng tồn tại
  const order = await SalesOrder.findById(orderId).populate('customerId', 'fullName phone email');
  if (!order) {
    const err = new Error('Đơn hàng không tồn tại trong hệ thống');
    err.status = 404;
    throw err;
  }

  // Tìm RMA liên kết nếu có
  const rma = await ReturnRequest.findOne({ originalOrderId: order._id });

  // Chuẩn hóa danh sách sản phẩm kiểm tra
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Vui lòng cung cấp danh sách sản phẩm kiểm tra');
    err.status = 400;
    throw err;
  }

  const resolvedItems = [];
  for (const item of items) {
    if (!item.skuId || !mongoose.Types.ObjectId.isValid(item.skuId)) {
      const err = new Error(`Mã SKU không hợp lệ: ${item.skuId}`);
      err.status = 400;
      throw err;
    }

    const skuDoc = await Sku.findById(item.skuId);
    if (!skuDoc) {
      const err = new Error(`Không tìm thấy SKU với ID: ${item.skuId}`);
      err.status = 404;
      throw err;
    }

    resolvedItems.push({
      skuId: skuDoc._id,
      skuCode: item.skuCode || skuDoc.skuCode,
      skuBarcode: item.skuBarcode || skuDoc.skuBarcode || skuDoc.skuCode,
      productName: item.productName || skuDoc.styleName || 'Sản phẩm',
      color: item.color || skuDoc.color || '',
      size: item.size || skuDoc.size || '',
      quantity: Number(item.quantity) || 1,
      condition: item.condition || 'GOOD_INTACT',
      passed: inspectionResult === 'PASSED' ? (item.passed !== false) : false,
      note: item.note ? String(item.note).trim() : '',
    });
  }

  // Sinh mã biên bản kiểm tra: KTH-00001
  const inspectionCode = await CounterSequence.getNextSequence('RETURN_INSPECTION_CODE', 'KTH', 5);

  const customerName = order.shippingRecipient?.name || order.customerId?.fullName || '';
  const customerPhone = order.shippingRecipient?.phone || order.customerId?.phone || '';

  const returnInspection = new ReturnInspection({
    inspectionCode,
    orderId: order._id,
    orderCode: order.orderCode,
    waybillCode: order.warehouseFulfillment?.waybillCode || '',
    returnWaybillCode: returnWaybillCode || rma?.returnWaybillCode || '',
    rmaId: rma?._id || null,
    rmaCode: rma?.rmaCode || '',
    customerId: order.customerId?._id || order.customerId,
    customerName,
    customerPhone,
    items: resolvedItems,
    inspectionResult,
    qcNote: qcNote ? qcNote.trim() : '',
    rejectReason: inspectionResult === 'FAILED' ? rejectReason.trim() : '',
    videoUrl: videoUrl ? videoUrl.trim() : '',
    imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
    inspectedByTechId: user._id,
    inspectedAt: new Date(),
    inboundRequested: false,
  });

  await returnInspection.save();

  // Xử lý luồng theo kết quả kiểm tra
  if (inspectionResult === 'PASSED') {
    // 1. Chuyển trạng thái đơn hàng sang RETURN_COMPLETED (Hoàn thành công)
    const prevStatus = order.status;
    order.status = 'RETURN_COMPLETED';
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      from: prevStatus,
      to: 'RETURN_COMPLETED',
      by: user._id,
      at: new Date(),
      note: `KCS kiểm tra hàng hoàn: ĐẠT (${inspectionCode}). ${qcNote ? 'Ghi chú: ' + qcNote.trim() : 'Đủ điều kiện hoàn hàng'}`.trim(),
    });

    if (videoUrl?.trim()) {
      order.warehouseFulfillment = order.warehouseFulfillment || {};
      order.warehouseFulfillment.returnUnboxingVideoUrl = videoUrl.trim();
      order.warehouseFulfillment.returnInspectionId = returnInspection._id;
    }
    await order.save();

    // 2. Cập nhật ReturnRequest nếu có
    if (rma) {
      rma.status = 'UNBOXED_INSPECTED';
      rma.warehouseInspection = {
        inspectedByStaffId: user._id,
        inspectedAt: new Date(),
        unboxingVideoUrl: videoUrl ? videoUrl.trim() : '',
        items: resolvedItems.map((it) => ({
          skuId: it.skuId,
          skuBarcode: it.skuBarcode,
          returnedQty: it.quantity,
          condition: ['GOOD_INTACT', 'MISSING_TAG', 'DIRTY_OR_DAMAGED'].includes(it.condition)
            ? it.condition
            : 'GOOD_INTACT',
          disposition: 'RESTOCK_SALEABLE',
        })),
      };
      await rma.save();
    }
  } else {
    // KHÔNG ĐẠT (FAILED): Ghi nhận video và lý do từ chối gắn với đơn hàng
    const prevStatus = order.status;
    order.status = 'RETURN_FAILED';
    if (videoUrl?.trim()) {
      order.warehouseFulfillment = order.warehouseFulfillment || {};
      order.warehouseFulfillment.returnUnboxingVideoUrl = videoUrl.trim();
      order.warehouseFulfillment.returnInspectionId = returnInspection._id;
    }
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      from: prevStatus,
      to: 'RETURN_FAILED',
      by: user._id,
      at: new Date(),
      note: `KCS kiểm tra hàng hoàn: KHÔNG ĐẠT (${inspectionCode}). Lý do: ${rejectReason.trim()}. Link video: ${videoUrl.trim()}`,
    });
    await order.save();

    // Cập nhật ReturnRequest sang REJECTED nếu có
    if (rma) {
      rma.status = 'REJECTED';
      rma.refundRequest = rma.refundRequest || {};
      rma.refundRequest.rejectReason = rejectReason.trim();
      rma.warehouseInspection = {
        inspectedByStaffId: user._id,
        inspectedAt: new Date(),
        unboxingVideoUrl: videoUrl.trim(),
        items: resolvedItems.map((it) => ({
          skuId: it.skuId,
          skuBarcode: it.skuBarcode,
          returnedQty: it.quantity,
          condition: ['GOOD_INTACT', 'MISSING_TAG', 'DIRTY_OR_DAMAGED'].includes(it.condition)
            ? it.condition
            : 'DIRTY_OR_DAMAGED',
          disposition: 'QUARANTINE_DEFECT',
        })),
      };
      await rma.save();
    }
  }

  const populatedResult = await ReturnInspection.findById(returnInspection._id)
    .populate('inspectedByTechId', 'fullName username email')
    .lean();

  return populatedResult;
};

/**
 * Lấy danh sách kết quả kiểm tra hàng hoàn kèm bộ lọc Đạt / Không đạt và thống kê tổng hợp.
 *
 * @async
 * @function listReturnInspections
 * @param {Object} query - Bộ lọc: result (ALL/PASSED/FAILED), search, inboundStatus, page, limit.
 * @returns {Promise<Object>} Danh sách biên bản kiểm tra, phân trang và số liệu thống kê.
 */
export const listReturnInspections = async (query = {}) => {
  const filter = { sessionStatus: { $ne: 'CANCELLED' } };

  if (query.sessionStatus && ['RECORDING', 'PENDING_REVIEW', 'FINALIZED'].includes(query.sessionStatus)) {
    filter.sessionStatus = query.sessionStatus;
  } else if (query.sessionStatus !== 'ALL') {
    // Mặc định bảng lịch sử hiển thị các biên bản đã chốt (tương thích ngược bản ghi cũ không có field sessionStatus)
    filter.$or = [{ sessionStatus: 'FINALIZED' }, { sessionStatus: { $exists: false } }];
  }

  if (query.result && ['PASSED', 'PARTIAL', 'FAILED'].includes(query.result)) {
    filter.inspectionResult = query.result;
  }

  if (query.inboundStatus === 'PENDING') {
    filter.inspectionResult = { $in: ['PASSED', 'PARTIAL'] };
    filter.inboundRequested = false;
  } else if (query.inboundStatus === 'REQUESTED') {
    filter.inboundRequested = true;
  }

  if (query.search) {
    const s = query.search.trim();
    const searchOr = [
      { inspectionCode: { $regex: s, $options: 'i' } },
      { orderCode: { $regex: s, $options: 'i' } },
      { waybillCode: { $regex: s, $options: 'i' } },
      { returnWaybillCode: { $regex: s, $options: 'i' } },
      { rmaCode: { $regex: s, $options: 'i' } },
      { customerName: { $regex: s, $options: 'i' } },
      { customerPhone: { $regex: s, $options: 'i' } },
      { qcNote: { $regex: s, $options: 'i' } },
      { rejectReason: { $regex: s, $options: 'i' } },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else {
      filter.$or = searchOr;
    }
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const finalizedMatch = { $or: [{ sessionStatus: 'FINALIZED' }, { sessionStatus: { $exists: false } }] };

  const [totalCount, pendingReviewCount, passedCount, partialCount, failedCount, pendingInboundCount] =
    await Promise.all([
      ReturnInspection.countDocuments(finalizedMatch),
      ReturnInspection.countDocuments({ sessionStatus: { $in: ['RECORDING', 'PENDING_REVIEW'] } }),
      ReturnInspection.countDocuments({ ...finalizedMatch, inspectionResult: 'PASSED' }),
      ReturnInspection.countDocuments({ ...finalizedMatch, inspectionResult: 'PARTIAL' }),
      ReturnInspection.countDocuments({ ...finalizedMatch, inspectionResult: 'FAILED' }),
      ReturnInspection.countDocuments({
        ...finalizedMatch,
        inspectionResult: { $in: ['PASSED', 'PARTIAL'] },
        inboundRequested: false,
      }),
    ]);

  const [totalFiltered, inspections] = await Promise.all([
    ReturnInspection.countDocuments(filter),
    ReturnInspection.find(filter)
      .populate('inspectedByTechId', 'fullName username email')
      .populate('inboundTicketId', 'ticketCode status createdAt')
      .populate('defectInboundTicketId', 'ticketCode status createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    inspections,
    stats: {
      totalCount,
      pendingReviewCount,
      passedCount,
      partialCount,
      failedCount,
      pendingInboundCount,
    },
    pagination: {
      page,
      limit,
      totalRecords: totalFiltered,
      totalPages: Math.ceil(totalFiltered / limit) || 1,
    },
  };
};

/**
 * Tạo phiếu yêu cầu nhập kho hàng hoàn (FinishedGoodsTicket) từ danh sách biên bản kiểm tra ĐẠT.
 *
 * @async
 * @function createReturnInboundTicket
 * @param {Object} payload - { inspectionIds: Array<string> }
 * @param {Object} user - Kỹ thuật viên gửi yêu cầu nhập kho.
 * @returns {Promise<Object>} Phiếu FinishedGoodsTicket loại INBOUND_FROM_RETURN ở trạng thái READY_TO_CONFIRM.
 * @throws {Error} Nếu không có biên bản hợp lệ hoặc có biên bản đã được yêu cầu nhập kho.
 */
export const createReturnInboundTicket = async (payload = {}, user) => {
  const { inspectionIds = [] } = payload;

  if (!Array.isArray(inspectionIds) || inspectionIds.length === 0) {
    const err = new Error('Vui lòng chọn ít nhất một biên bản kiểm tra đạt chuẩn để yêu cầu nhập kho hoàn');
    err.status = 400;
    throw err;
  }

  // Lấy các biên bản kiểm tra tương ứng
  const inspections = await ReturnInspection.find({ _id: { $in: inspectionIds } });

  if (inspections.length !== inspectionIds.length) {
    const err = new Error('Một số biên bản kiểm tra không tồn tại trong hệ thống');
    err.status = 404;
    throw err;
  }

  for (const insp of inspections) {
    if (insp.inspectionResult !== 'PASSED') {
      const err = new Error(`Biên bản "${insp.inspectionCode}" có kết quả không đạt, không thể tạo phiếu nhập kho`);
      err.status = 400;
      throw err;
    }
    if (insp.inboundRequested) {
      const err = new Error(`Biên bản "${insp.inspectionCode}" đã được gửi yêu cầu nhập kho trước đó`);
      err.status = 400;
      throw err;
    }
  }

  // Tổng hợp các mặt hàng SKU đạt chuẩn từ các biên bản
  const skuQtyMap = new Map();
  for (const insp of inspections) {
    for (const item of insp.items) {
      if (item.passed !== false && item.quantity > 0) {
        const key = item.skuId.toString();
        if (!skuQtyMap.has(key)) {
          skuQtyMap.set(key, {
            skuId: item.skuId,
            skuBarcode: item.skuBarcode || item.skuCode,
            totalQty: 0,
          });
        }
        skuQtyMap.get(key).totalQty += Number(item.quantity);
      }
    }
  }

  if (skuQtyMap.size === 0) {
    const err = new Error('Không có sản phẩm đạt chuẩn nào để yêu cầu nhập kho');
    err.status = 400;
    throw err;
  }

  // Tìm vị trí kho thành phẩm mặc định (FINISHED_GOODS)
  let defaultLocation = await WarehouseLocation.findOne({ warehouseType: 'FINISHED_GOODS', status: 'ACTIVE' });
  if (!defaultLocation) {
    defaultLocation = await WarehouseLocation.findOne({ status: 'ACTIVE' });
  }

  if (!defaultLocation) {
    const err = new Error('Hệ thống chưa có vị trí kho hoạt động để chỉ định nhập thành phẩm');
    err.status = 400;
    throw err;
  }

  // Xây dựng danh sách items cho FinishedGoodsTicket
  const ticketItems = [];
  let totalBatchQty = 0;

  for (const entry of skuQtyMap.values()) {
    ticketItems.push({
      skuId: entry.skuId,
      skuBarcode: entry.skuBarcode,
      designatedFifoLocationId: defaultLocation._id,
      expectedQty: entry.totalQty,
      scannedQty: 0,
    });
    totalBatchQty += entry.totalQty;
  }

  // Sinh mã phiếu nhập hàng hoàn: PNHH-000001
  const ticketCode = await CounterSequence.getNextSequence('FINISHED_GOODS_TICKET', 'PNHH', 6);
  const inspectionCodesStr = inspections.map((i) => i.inspectionCode).join(', ');

  const ticket = new FinishedGoodsTicket({
    ticketCode,
    ticketType: 'INBOUND_FROM_RETURN',
    garmentInspection: {
      inspectedByTechId: user?._id,
      inspectedAt: new Date(),
      totalBatchQty,
      passedQty: totalBatchQty,
      failedDefectQty: 0,
      qcNote: `Yêu cầu nhập kho hàng hoàn từ ${inspections.length} đơn kiểm tra đạt: ${inspectionCodesStr}`,
    },
    createdByManagerId: user?._id,
    status: 'READY_TO_CONFIRM',
    defectAction: 'NONE',
    items: ticketItems,
  });

  await ticket.save();

  // Cập nhật trạng thái inboundRequested và gắn ticketId cho các biên bản kiểm tra
  await ReturnInspection.updateMany(
    { _id: { $in: inspectionIds } },
    {
      $set: {
        inboundRequested: true,
        inboundTicketId: ticket._id,
        inboundRequestedAt: new Date(),
      },
    }
  );

  return {
    ticket,
    inspectionsCount: inspections.length,
    totalQty: totalBatchQty,
  };
};

/**
 * Mở hoặc khôi phục phiên quét & quay video hàng hoàn cho một đơn hàng.
 * Chỉ chấp nhận các đơn ở trạng thái EXCHANGE_REQUESTED, RETURN_REQUESTED, hoặc RETURNED chưa KCS hoàn tất.
 */
export const openReturnInspectionSession = async (rawCode, user) => {
  const { order, rma } = await lookupOrderByCode(rawCode);

  if (!ALLOWED_RETURN_SCAN_STATUSES.includes(order.status)) {
    throw createServiceError(
      `Đơn hàng "${order.orderCode}" đang ở trạng thái "${getOrderStatusLabel(order.status)}". Chỉ kiểm tra hàng hoàn đối với đơn Đang đổi hàng, Yêu cầu trả hàng hoặc Đã hoàn về kho chưa KCS.`,
      409,
      'INVALID_ORDER_STATUS'
    );
  }

  const finalized = await ReturnInspection.findOne({
    orderId: order._id,
    $or: [{ sessionStatus: 'FINALIZED' }, { sessionStatus: { $exists: false } }],
  }).lean();
  if (finalized) {
    throw createServiceError(
      `Đơn hàng "${order.orderCode}" đã được kiểm định KCS hoàn tất (${finalized.inspectionCode}).`,
      409,
      'ORDER_ALREADY_INSPECTED'
    );
  }

  const packedUnits = await ProductUnit.find({ packedOrderId: order._id })
    .select('_id barcode skuId inventoryStatus')
    .lean();

  let session = await ReturnInspection.findOne({
    orderId: order._id,
    sessionStatus: { $in: ['RECORDING', 'PENDING_REVIEW'] },
  });

  if (session) {
    if (!session.video?.publicId && session.sessionStatus !== 'RECORDING') {
      session.sessionStatus = 'RECORDING';
      await session.save();
    }
  } else {
    const inspectionCode = await CounterSequence.getNextSequence('RETURN_INSPECTION_CODE', 'KTH', 5);
    const customerName = order.shippingRecipient?.name || order.customerId?.fullName || '';
    const customerPhone = order.shippingRecipient?.phone || order.customerId?.phone || '';

    const initItems = (order.items || []).map((item) => ({
      skuId: item.skuId?._id || item.skuId,
      skuCode: item.skuCode || item.skuId?.skuCode || '',
      skuBarcode: item.skuBarcode || item.skuId?.skuBarcode || item.skuCode || '',
      productName: item.productName || item.skuId?.styleName || 'Sản phẩm',
      color: item.color || item.skuId?.color || '',
      size: item.size || item.skuId?.size || '',
      quantity: Number(item.orderedQty) || 1,
      condition: 'GOOD_INTACT',
      passed: true,
      note: '',
    }));

    session = await ReturnInspection.create({
      inspectionCode,
      sessionStatus: 'RECORDING',
      orderId: order._id,
      orderCode: order.orderCode,
      originalOrderStatus: order.status,
      waybillCode: order.warehouseFulfillment?.waybillCode || '',
      returnWaybillCode: rma?.returnWaybillCode || '',
      rmaId: rma?._id || null,
      rmaCode: rma?.rmaCode || '',
      customerId: order.customerId?._id || order.customerId,
      customerName,
      customerPhone,
      items: initItems,
      scannedUnits: [],
      inspectionResult: null,
      inspectedByTechId: user._id,
      inspectedAt: new Date(),
      inboundRequested: false,
      defectInboundRequested: false,
    });
  }

  return {
    session: session.toObject(),
    order,
    rma: rma || null,
    packedUnits,
  };
};

/**
 * Quét barcode sản phẩm vật lý (ProductUnit CODE_128) hoặc SKU barcode trong đơn hàng hoàn đang quay.
 */
export const scanReturnUnitBarcode = async (sessionId, rawBarcode) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw createServiceError('Mã phiên kiểm hàng hoàn không hợp lệ', 400, 'INVALID_SESSION');
  }
  const barcode = String(rawBarcode || '').trim();
  if (!/^[A-Za-z0-9._-]{3,120}$/.test(barcode)) {
    throw createServiceError('Barcode sản phẩm không hợp lệ', 400, 'INVALID_BARCODE');
  }

  const session = await ReturnInspection.findOne({
    _id: sessionId,
    sessionStatus: { $in: ['RECORDING', 'PENDING_REVIEW'] },
  });
  if (!session) {
    throw createServiceError('Phiên kiểm hàng hoàn không tồn tại hoặc đã chốt', 404, 'SESSION_NOT_FOUND');
  }

  const alreadyScanned = (session.scannedUnits || []).some(
    (entry) => String(entry.unitBarcode).toUpperCase() === barcode.toUpperCase()
  );
  if (alreadyScanned) {
    return { result: 'REJECTED', reason: 'BARCODE_ALREADY_SCANNED', session: session.toObject() };
  }

  const orderItems = session.items || [];
  const expectedBySku = new Map();
  for (const item of orderItems) {
    const key = String(item.skuId);
    expectedBySku.set(key, (expectedBySku.get(key) || 0) + (Number(item.quantity) || 0));
  }
  const scannedCountForSku = (skuId) =>
    (session.scannedUnits || []).filter((entry) => String(entry.skuId) === String(skuId)).length;

  // 1. Ưu tiên đối chiếu theo ProductUnit (tem từng chiếc đã đóng gói)
  const unit = await ProductUnit.findOne({ barcode })
    .populate('skuId', 'skuCode skuBarcode styleName color size')
    .lean();

  if (unit) {
    if (unit.packedOrderId && String(unit.packedOrderId) !== String(session.orderId)) {
      return { result: 'REJECTED', reason: 'BARCODE_ASSIGNED_OTHER_ORDER', session: session.toObject() };
    }
    const skuId = String(unit.skuId?._id || unit.skuId);
    const matchingOrderItem = orderItems.find((it) => String(it.skuId) === skuId);
    if (!matchingOrderItem) {
      return { result: 'REJECTED', reason: 'ITEM_NOT_IN_ORDER', session: session.toObject() };
    }
    if (scannedCountForSku(skuId) >= (expectedBySku.get(skuId) || 0)) {
      return { result: 'REJECTED', reason: 'QTY_EXCEEDED', session: session.toObject() };
    }

    const scannedUnit = {
      productUnitId: unit._id,
      unitBarcode: unit.barcode,
      skuId: unit.skuId?._id || unit.skuId,
      skuCode: matchingOrderItem.skuCode || unit.skuId?.skuCode || '',
      skuBarcode: matchingOrderItem.skuBarcode || unit.skuId?.skuBarcode || '',
      productName: matchingOrderItem.productName || unit.skuId?.styleName || 'Sản phẩm',
      color: matchingOrderItem.color || unit.skuId?.color || '',
      size: matchingOrderItem.size || unit.skuId?.size || '',
      scannedAt: new Date(),
      disposition: 'RESTOCK_SALEABLE',
      condition: 'GOOD_INTACT',
      note: '',
    };

    session.scannedUnits.push(scannedUnit);
    await session.save();
    return { result: 'ACCEPTED', scannedUnit, session: session.toObject() };
  }

  // 2. Fallback: nếu đơn cũ chưa có ProductUnit riêng, cho phép quét theo skuBarcode hoặc skuCode của sản phẩm trong đơn
  const upper = barcode.toUpperCase();
  const matchingSkuItem = orderItems.find(
    (it) =>
      String(it.skuBarcode || '').toUpperCase() === upper ||
      String(it.skuCode || '').toUpperCase() === upper
  );

  if (!matchingSkuItem) {
    return { result: 'REJECTED', reason: 'BARCODE_NOT_FOUND', session: session.toObject() };
  }

  const skuKey = String(matchingSkuItem.skuId);
  const currentCount = scannedCountForSku(skuKey);
  if (currentCount >= (expectedBySku.get(skuKey) || 0)) {
    return { result: 'REJECTED', reason: 'QTY_EXCEEDED', session: session.toObject() };
  }

  const syntheticBarcode = `${barcode}#${currentCount + 1}`;
  const scannedUnit = {
    productUnitId: null,
    unitBarcode: syntheticBarcode,
    skuId: matchingSkuItem.skuId,
    skuCode: matchingSkuItem.skuCode || '',
    skuBarcode: matchingSkuItem.skuBarcode || barcode,
    productName: matchingSkuItem.productName || 'Sản phẩm',
    color: matchingSkuItem.color || '',
    size: matchingSkuItem.size || '',
    scannedAt: new Date(),
    disposition: 'RESTOCK_SALEABLE',
    condition: 'GOOD_INTACT',
    note: '',
  };

  session.scannedUnits.push(scannedUnit);
  await session.save();
  return { result: 'ACCEPTED', scannedUnit, session: session.toObject() };
};

/** Gỡ một barcode sản phẩm vừa quét khỏi phiên kiểm hàng hoàn. */
export const removeReturnScannedUnit = async (sessionId, rawBarcode) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw createServiceError('Mã phiên kiểm hàng hoàn không hợp lệ', 400, 'INVALID_SESSION');
  }
  const barcode = String(rawBarcode || '').trim();
  const session = await ReturnInspection.findOne({
    _id: sessionId,
    sessionStatus: { $in: ['RECORDING', 'PENDING_REVIEW'] },
  });
  if (!session) {
    throw createServiceError('Phiên kiểm hàng hoàn không tồn tại hoặc đã chốt', 404, 'SESSION_NOT_FOUND');
  }
  const before = session.scannedUnits.length;
  session.scannedUnits = session.scannedUnits.filter(
    (entry) => String(entry.unitBarcode).toUpperCase() !== barcode.toUpperCase()
  );
  if (session.scannedUnits.length === before) {
    throw createServiceError('Không tìm thấy barcode này trong danh sách đã quét', 404, 'BARCODE_NOT_SCANNED');
  }
  await session.save();
  return { session: session.toObject() };
};

/** Kết thúc pha quay hình và chuyển phiên sang chờ phân loại & gửi nhập kho. */
export const finishReturnRecordingSession = async (sessionId) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw createServiceError('Mã phiên kiểm hàng hoàn không hợp lệ', 400, 'INVALID_SESSION');
  }
  const session = await ReturnInspection.findById(sessionId);
  if (!session) {
    throw createServiceError('Không tìm thấy phiên kiểm hàng hoàn', 404, 'SESSION_NOT_FOUND');
  }
  if (session.sessionStatus === 'RECORDING') {
    session.sessionStatus = 'PENDING_REVIEW';
    await session.save();
  }
  return { session: session.toObject() };
};

/** Hủy phiên kiểm hàng hoàn nháp khi chưa có video đã lưu trên Cloudinary. */
export const cancelReturnInspectionSession = async (sessionId) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw createServiceError('Mã phiên kiểm hàng hoàn không hợp lệ', 400, 'INVALID_SESSION');
  }
  const session = await ReturnInspection.findById(sessionId);
  if (!session) {
    throw createServiceError('Không tìm thấy phiên kiểm hàng hoàn', 404, 'SESSION_NOT_FOUND');
  }
  if (session.sessionStatus === 'FINALIZED') {
    throw createServiceError('Không thể hủy biên bản đã chốt', 409, 'SESSION_FINALIZED');
  }
  if (session.video?.publicId) {
    throw createServiceError('Phiên đã có video lưu trên Cloudinary, không thể hủy bỏ', 409, 'VIDEO_ALREADY_SAVED');
  }
  session.sessionStatus = 'CANCELLED';
  await session.save();
  return { session: session.toObject() };
};

/**
 * Chốt phân loại sản phẩm (đạt nhập kho vs hàng lỗi) cho 1 hoặc nhiều đơn đã quay,
 * tự động đổi trạng thái từng đơn (RETURN_COMPLETED / PARTIALLY_RETURNED / RETURN_FAILED),
 * đánh dấu ProductUnit.inventoryStatus = 'DEFECT_PENDING' (lỗi, chờ kho nhận) cho sản phẩm lỗi,
 * và tạo đồng thời phiếu nhập kho hàng đạt (INBOUND_FROM_RETURN) + phiếu nhập hàng lỗi (DEFECT_QUARANTINE_INBOUND).
 */
export const finalizeReturnInspectionsAndRequestInbound = async (payload = {}, user) => {
  const entries = Array.isArray(payload.inspections) ? payload.inspections : [];
  if (entries.length === 0) {
    throw createServiceError('Vui lòng chọn ít nhất một đơn đã quét để chốt phân loại & yêu cầu nhập kho', 400, 'EMPTY_BATCH');
  }

  const validConditions = new Set([
    'GOOD_INTACT',
    'MISSING_TAG',
    'DIRTY_OR_DAMAGED',
    'DEFECTIVE_SEWING',
    'WRONG_ITEM',
    'USED',
  ]);
  const rmaConditions = new Set(['GOOD_INTACT', 'MISSING_TAG', 'DIRTY_OR_DAMAGED']);

  const dbSession = await mongoose.startSession();
  try {
    let responsePayload;
    await dbSession.withTransaction(async () => {
      const restockMap = new Map();
      const defectMap = new Map();
      const finalizedDocs = [];
      const now = new Date();

      const addToSkuMap = (targetMap, unit) => {
        const key = String(unit.skuId);
        const existing = targetMap.get(key) || {
          skuId: unit.skuId,
          skuBarcode: unit.skuBarcode || unit.skuCode || key,
          totalQty: 0,
          unitBarcodes: [],
        };
        existing.totalQty += 1;
        // Chỉ truyền barcode vật lý thật (có productUnitId) để Quản lý kho khôi phục / gán đúng chiếc
        if (unit.productUnitId && unit.unitBarcode) {
          existing.unitBarcodes.push(unit.unitBarcode);
        }
        targetMap.set(key, existing);
      };

      for (const entry of entries) {
        if (!entry?.inspectionId || !mongoose.Types.ObjectId.isValid(entry.inspectionId)) {
          throw createServiceError('Mã biên bản kiểm tra không hợp lệ', 400, 'INVALID_INSPECTION_ID');
        }
        const insp = await ReturnInspection.findOne({
          _id: entry.inspectionId,
          sessionStatus: { $in: ['RECORDING', 'PENDING_REVIEW'] },
        }).session(dbSession);

        if (!insp) {
          throw createServiceError(
            `Biên bản ${entry.inspectionId} không tồn tại hoặc đã được chốt trước đó`,
            409,
            'INSPECTION_UNAVAILABLE'
          );
        }

        const effectiveVideoUrl = insp.video?.url || insp.videoUrl || '';
        if (!effectiveVideoUrl) {
          throw createServiceError(
            `Đơn "${insp.orderCode}" chưa hoàn tất tải video lên Cloudinary. Hãy đợi video tải xong trước khi chốt.`,
            409,
            'VIDEO_UPLOAD_PENDING'
          );
        }

        const order = await SalesOrder.findById(insp.orderId).session(dbSession);
        if (!order) {
          throw createServiceError(`Không tìm thấy đơn hàng ${insp.orderCode}`, 404, 'ORDER_NOT_FOUND');
        }

        // Áp dụng quyết định phân loại từng chiếc từ client lên scannedUnits
        const unitDecisionMap = new Map(
          (Array.isArray(entry.units) ? entry.units : []).map((u) => [String(u.unitBarcode || '').toUpperCase(), u])
        );

        for (const unit of insp.scannedUnits) {
          const decision = unitDecisionMap.get(String(unit.unitBarcode).toUpperCase());
          if (decision) {
            unit.disposition =
              decision.disposition === 'QUARANTINE_DEFECT' ? 'QUARANTINE_DEFECT' : 'RESTOCK_SALEABLE';
            if (decision.condition && validConditions.has(decision.condition)) {
              unit.condition = decision.condition;
            } else if (unit.disposition === 'QUARANTINE_DEFECT' && unit.condition === 'GOOD_INTACT') {
              unit.condition = 'DIRTY_OR_DAMAGED';
            } else if (unit.disposition === 'RESTOCK_SALEABLE') {
              unit.condition = 'GOOD_INTACT';
            }
            unit.note = decision.note ? String(decision.note).trim() : '';
          }
        }

        const expectedTotalQty = (order.items || []).reduce((sum, item) => sum + (Number(item.orderedQty) || 0), 0);
        const outcome = computeOrderReturnOutcome(expectedTotalQty, insp.scannedUnits);

        // Đánh dấu từng ProductUnit không đạt là DEFECT_PENDING (lỗi, chờ kho nhận vào kho hàng lỗi).
        // Trạng thái DEFECTIVE (đang trong kho hàng lỗi) chỉ được đặt khi Quản lý kho xác nhận phiếu
        // DEFECT_QUARANTINE_INBOUND. Thao tác của kỹ thuật viên không đổi.
        for (const unit of insp.scannedUnits) {
          if (unit.disposition === 'QUARANTINE_DEFECT') {
            addToSkuMap(defectMap, unit);
            if (unit.productUnitId) {
              await ProductUnit.updateOne(
                { _id: unit.productUnitId },
                {
                  $set: {
                    inventoryStatus: 'DEFECT_PENDING',
                    defectReason: unit.note || unit.condition || entry.rejectReason || 'Hàng hoàn không đạt KCS',
                    returnInspectionId: insp._id,
                    returnedFromOrderId: order._id,
                    inspectedAt: now,
                  },
                },
                { session: dbSession }
              );
            }
          } else {
            addToSkuMap(restockMap, unit);
          }
        }

        // Cập nhật tóm tắt items theo SKU trên ReturnInspection
        const updatedItems = (order.items || []).map((orderItem) => {
          const skuKey = String(orderItem.skuId);
          const skuUnits = insp.scannedUnits.filter((u) => String(u.skuId) === skuKey);
          const defectUnit = skuUnits.find((u) => u.disposition === 'QUARANTINE_DEFECT');
          const allGood = skuUnits.length >= (Number(orderItem.orderedQty) || 1) && !defectUnit;
          return {
            skuId: orderItem.skuId,
            skuCode: orderItem.skuCode,
            skuBarcode: orderItem.skuBarcode || orderItem.skuCode,
            productName: orderItem.productName || 'Sản phẩm',
            color: orderItem.color || '',
            size: orderItem.size || '',
            quantity: Number(orderItem.orderedQty) || 1,
            condition: defectUnit ? defectUnit.condition : 'GOOD_INTACT',
            passed: allGood,
            note: skuUnits.map((u) => u.note).filter(Boolean).join('; '),
          };
        });

        insp.items = updatedItems;
        insp.sessionStatus = 'FINALIZED';
        insp.inspectionResult = outcome.inspectionResult;
        insp.qcNote = entry.qcNote ? String(entry.qcNote).trim() : insp.qcNote || '';
        insp.rejectReason =
          outcome.inspectionResult !== 'PASSED'
            ? String(entry.rejectReason || '').trim() ||
              (outcome.defectQty > 0
                ? `${outcome.defectQty} sản phẩm lỗi`
                : `Thiếu ${Math.max(0, expectedTotalQty - outcome.passedQty)} sản phẩm`)
            : '';
        insp.inspectedByTechId = user._id;
        insp.inspectedAt = now;
        await insp.save({ session: dbSession });

        // Cập nhật trạng thái đơn hàng theo Phương án A (RETURN_COMPLETED / PARTIALLY_RETURNED / RETURN_FAILED)
        const prevStatus = order.status;
        order.status = outcome.orderStatus;
        order.warehouseFulfillment = order.warehouseFulfillment || {};
        order.warehouseFulfillment.returnUnboxingVideoUrl = effectiveVideoUrl;
        order.warehouseFulfillment.returnInspectionId = insp._id;
        order.statusHistory = order.statusHistory || [];
        order.statusHistory.push({
          from: prevStatus,
          to: outcome.orderStatus,
          by: user._id,
          at: now,
          note: `KCS hàng hoàn (${insp.inspectionCode}): ${getOrderStatusLabel(outcome.orderStatus)} — Đạt: ${outcome.passedQty}/${expectedTotalQty}, Hàng lỗi: ${outcome.defectQty}. ${insp.qcNote || insp.rejectReason || ''}`.trim(),
        });
        await order.save({ session: dbSession });

        // Đồng bộ ReturnRequest (nếu có)
        if (insp.rmaId) {
          const rma = await ReturnRequest.findById(insp.rmaId).session(dbSession);
          if (rma) {
            rma.status = outcome.rmaStatus;
            if (outcome.rmaStatus === 'REJECTED') {
              rma.refundRequest = rma.refundRequest || {};
              rma.refundRequest.rejectReason = insp.rejectReason;
            }
            rma.warehouseInspection = {
              inspectedByStaffId: user._id,
              inspectedAt: now,
              unboxingVideoUrl: effectiveVideoUrl,
              items: insp.scannedUnits.map((u) => ({
                skuId: u.skuId,
                skuBarcode: u.skuBarcode || u.skuCode,
                returnedQty: 1,
                condition: rmaConditions.has(u.condition)
                  ? u.condition
                  : u.disposition === 'QUARANTINE_DEFECT'
                    ? 'DIRTY_OR_DAMAGED'
                    : 'GOOD_INTACT',
                disposition: u.disposition,
              })),
            };
            await rma.save({ session: dbSession });
          }
        }

        finalizedDocs.push({ insp, outcome });
      }

      const codesStr = finalizedDocs.map(({ insp }) => insp.inspectionCode).join(', ');
      let restockTicket = null;
      let defectTicket = null;

      // 1. Tạo phiếu yêu cầu nhập kho thành phẩm (Hàng đạt chuẩn)
      if (restockMap.size > 0) {
        const fgLocation = await resolveTicketLocation('FINISHED_GOODS', dbSession);
        if (!fgLocation) {
          throw createServiceError('Hệ thống chưa có vị trí kho thành phẩm hoạt động', 400, 'NO_ACTIVE_LOCATION');
        }
        const ticketCode = await CounterSequence.getNextSequence('FINISHED_GOODS_TICKET', 'PNHH', 6, {
          session: dbSession,
        });
        const restockItems = [...restockMap.values()].map((item) => ({
          skuId: item.skuId,
          skuBarcode: item.skuBarcode,
          designatedFifoLocationId: fgLocation._id,
          expectedQty: item.totalQty,
          scannedQty: 0,
          unitBarcodes: item.unitBarcodes,
        }));
        const totalRestockQty = restockItems.reduce((sum, item) => sum + item.expectedQty, 0);

        [restockTicket] = await FinishedGoodsTicket.create(
          [
            {
              ticketCode,
              ticketType: 'INBOUND_FROM_RETURN',
              garmentInspection: {
                inspectedByTechId: user._id,
                inspectedAt: now,
                totalBatchQty: totalRestockQty,
                passedQty: totalRestockQty,
                failedDefectQty: 0,
                qcNote: `Yêu cầu nhập kho hàng hoàn đạt chuẩn từ ${finalizedDocs.length} biên bản: ${codesStr}`,
              },
              createdByManagerId: user._id,
              status: 'READY_TO_CONFIRM',
              defectAction: 'NONE',
              items: restockItems,
            },
          ],
          { session: dbSession }
        );

        const restockInspIds = finalizedDocs
          .filter(({ outcome }) => outcome.passedQty > 0)
          .map(({ insp }) => insp._id);
        await ReturnInspection.updateMany(
          { _id: { $in: restockInspIds } },
          {
            $set: {
              inboundRequested: true,
              inboundTicketId: restockTicket._id,
              inboundRequestedAt: now,
            },
          },
          { session: dbSession }
        );
      }

      // 2. Tạo phiếu yêu cầu nhập kho hàng lỗi (DEFECT_QUARANTINE_INBOUND)
      if (defectMap.size > 0) {
        const defectLocation = await resolveTicketLocation('DEFECT_QUARANTINE', dbSession);
        if (!defectLocation) {
          throw createServiceError('Hệ thống chưa có vị trí kho hàng lỗi hoạt động', 400, 'NO_DEFECT_LOCATION');
        }
        const ticketCode = await CounterSequence.getNextSequence('FINISHED_GOODS_TICKET', 'PNHL', 6, {
          session: dbSession,
        });
        const defectItems = [...defectMap.values()].map((item) => ({
          skuId: item.skuId,
          skuBarcode: item.skuBarcode,
          designatedFifoLocationId: defectLocation._id,
          expectedQty: item.totalQty,
          scannedQty: 0,
          unitBarcodes: item.unitBarcodes,
        }));
        const totalDefectQty = defectItems.reduce((sum, item) => sum + item.expectedQty, 0);

        [defectTicket] = await FinishedGoodsTicket.create(
          [
            {
              ticketCode,
              ticketType: 'DEFECT_QUARANTINE_INBOUND',
              garmentInspection: {
                inspectedByTechId: user._id,
                inspectedAt: now,
                totalBatchQty: totalDefectQty,
                passedQty: 0,
                failedDefectQty: totalDefectQty,
                qcNote: `Yêu cầu nhập kho hàng hoàn LỖI (DEFECTIVE) từ ${finalizedDocs.length} biên bản: ${codesStr}`,
              },
              createdByManagerId: user._id,
              status: 'READY_TO_CONFIRM',
              defectAction: 'NONE',
              items: defectItems,
            },
          ],
          { session: dbSession }
        );

        const defectInspIds = finalizedDocs
          .filter(({ outcome }) => outcome.defectQty > 0)
          .map(({ insp }) => insp._id);
        await ReturnInspection.updateMany(
          { _id: { $in: defectInspIds } },
          {
            $set: {
              defectInboundRequested: true,
              defectInboundTicketId: defectTicket._id,
              defectInboundRequestedAt: now,
            },
          },
          { session: dbSession }
        );
      }

      responsePayload = {
        finalizedCount: finalizedDocs.length,
        results: finalizedDocs.map(({ insp, outcome }) => ({
          inspectionId: String(insp._id),
          inspectionCode: insp.inspectionCode,
          orderId: String(insp.orderId),
          orderCode: insp.orderCode,
          inspectionResult: outcome.inspectionResult,
          orderStatus: outcome.orderStatus,
          passedQty: outcome.passedQty,
          defectQty: outcome.defectQty,
        })),
        restockTicket: restockTicket ? restockTicket.toObject() : null,
        defectTicket: defectTicket ? defectTicket.toObject() : null,
      };
    });

    return responsePayload;
  } finally {
    await dbSession.endSession();
  }
};

