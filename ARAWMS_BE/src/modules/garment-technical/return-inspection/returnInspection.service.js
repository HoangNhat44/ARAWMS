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
  const preferredStatuses = [
    'RETURN_REQUESTED',
    'EXCHANGE_REQUESTED',
    'HANDED_OVER_CARRIER',
    'CARRIER_PICKED_UP',
    'DELIVERED',
    'RETURNED',
    'PACKED',
    'PICKING',
    'CONFIRMED_RESERVED',
    'COMPLETED',
  ];

  let orders = await SalesOrder.find({
    status: { $in: preferredStatuses },
    isDeleted: { $ne: true },
  })
    .populate('customerId', 'fullName phone')
    .select('orderCode status warehouseFulfillment.waybillCode totalOrderAmount financialSummary createdAt')
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(10)
    .lean();

  if (!orders || orders.length === 0) {
    orders = await SalesOrder.find({ isDeleted: { $ne: true } })
      .populate('customerId', 'fullName phone')
      .select('orderCode status warehouseFulfillment.waybillCode totalOrderAmount financialSummary createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
  }

  return orders;
};

/**
 * Ghi lại quá trình kiểm tra hàng hoàn/trả.
 * - Nếu ĐẠT: Chuyển trạng thái đơn sang 'RETURNED' (Đã hoàn về kho / Hoàn thành công), sẵn sàng tạo lệnh nhập kho.
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
    // 1. Chuyển trạng thái đơn hàng sang RETURNED (Đã hoàn về kho / Hoàn thành công)
    const prevStatus = order.status;
    order.status = 'RETURNED';
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      from: prevStatus,
      to: 'RETURNED',
      by: user._id,
      at: new Date(),
      note: `KCS kiểm tra hàng hoàn: ĐẠT (${inspectionCode}). ${qcNote ? 'Ghi chú: ' + qcNote.trim() : 'Đủ điều kiện hoàn hàng'}`.trim(),
    });

    if (videoUrl?.trim()) {
      order.warehouseFulfillment = order.warehouseFulfillment || {};
      order.warehouseFulfillment.packagingVideoUrl = videoUrl.trim();
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
    if (videoUrl?.trim()) {
      order.warehouseFulfillment = order.warehouseFulfillment || {};
      order.warehouseFulfillment.packagingVideoUrl = videoUrl.trim();
    }
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      from: order.status,
      to: order.status,
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
  const filter = {};

  if (query.result && ['PASSED', 'FAILED'].includes(query.result)) {
    filter.inspectionResult = query.result;
  }

  if (query.inboundStatus === 'PENDING') {
    filter.inspectionResult = 'PASSED';
    filter.inboundRequested = false;
  } else if (query.inboundStatus === 'REQUESTED') {
    filter.inboundRequested = true;
  }

  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
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
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  // Thống kê tổng hợp
  const [totalCount, passedCount, failedCount, pendingInboundCount] = await Promise.all([
    ReturnInspection.countDocuments({}),
    ReturnInspection.countDocuments({ inspectionResult: 'PASSED' }),
    ReturnInspection.countDocuments({ inspectionResult: 'FAILED' }),
    ReturnInspection.countDocuments({ inspectionResult: 'PASSED', inboundRequested: false }),
  ]);

  const [totalFiltered, inspections] = await Promise.all([
    ReturnInspection.countDocuments(filter),
    ReturnInspection.find(filter)
      .populate('inspectedByTechId', 'fullName username email')
      .populate('inboundTicketId', 'ticketCode status createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    inspections,
    stats: {
      totalCount,
      passedCount,
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

