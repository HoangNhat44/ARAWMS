/**
 * ============================================================================
 * @title        : Return Merchandise Authorization (RMA) Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-06
 * @description  : Xử lý quy trình tiếp nhận yêu cầu đổi/trả hàng từ khách hàng (UC-82)
 *                 của Seller. Áp dụng chính xác các Business Rules chuẩn trong BR.md:
 *                 - GBR-11: Phụ phí 10% đối với đổi/trả do lỗi khách hàng
 *                 - GBR-12: Miễn 100% phụ phí và phí ship đối với lỗi cửa hàng/xưởng
 *                 - GBR-13: Cách ly hàng lỗi vào khu vực DEFECT_QUARANTINE
 *                 - GBR-14: Phiếu chi hoàn tiền (CashFlowVoucher) bắt buộc do Kế toán lập
 *                           kèm tham chiếu chứng từ gốc (salesOrderId, returnRequestId)
 *                 - GBR-23: Đối chiếu mã vận đơn hoàn & video mở hộp kiểm hàng
 * @module       : Reverse Logistics / Return Merchandise Authorization
 * @layer        : Service
 * ============================================================================
 */

import ReturnRequest from '../../../models/ReturnRequest.model.js';
import CashFlowVoucher from '../../../models/CashFlowVoucher.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import { emitRmaAlert } from '../../../config/socket.js';
import {
  RMA_BUSINESS_RULES,
  RMA_ELIGIBLE_ORDER_STATUSES,
  RMA_ACTIVE_STATUSES,
  classifyReturnFaultByBR,
  calculateRefundFinancialsByBR,
} from './returnMerchandiseAuthorization.rules.js';

/**
 * Ghi SystemLog kiểm toán
 */
const recordSystemLog = async ({ actor, majorFeature, subFeature, action, targetCollection, targetId, targetCode, beforeSnapshot, afterSnapshot, req }) => {
  try {
    await SystemLog.create({
      actorId: actor?._id,
      actorRole: actor?.roleCode || 'SELLER',
      majorFeature: majorFeature || 'Reverse Logistics',
      subFeature: subFeature || 'Return Merchandise Authorization',
      action,
      targetCollection,
      targetId,
      targetCode,
      beforeSnapshot,
      afterSnapshot,
      ipAddress: req?.ip || '127.0.0.1',
      userAgent: req?.headers?.['user-agent'] || 'System',
    });
  } catch (err) {
    console.error('❌ Lỗi ghi SystemLog RMA:', err.message);
  }
};

/**
 * UC-82: Tiếp nhận phản hồi và tạo yêu cầu đổi/trả hàng (Create Merchandise Return Request - RMA)
 * Áp dụng chuẩn GBR-11, GBR-12, GBR-13, GBR-14, GBR-23 từ BR.md
 */
export const createReturnRequest = async (rmaData, user, req) => {
  const {
    originalOrderId,
    returnType,
    returnWaybillCode,
    returnItems,
    reasonDescription,
    faultType,
    shippingFeeDeduction = 0,
    refundBanking,
  } = rmaData;

  const originalOrder = await SalesOrder.findById(originalOrderId);
  if (!originalOrder) {
    throw new Error('Không tìm thấy đơn hàng gốc. Hướng dẫn: tải lại danh sách đơn (F5) rồi chọn lại đơn cần đổi/trả.');
  }

  if (!Array.isArray(returnItems) || returnItems.length === 0) {
    throw new Error('Yêu cầu đổi/trả phải có ít nhất một sản phẩm. Hướng dẫn: tick chọn sản phẩm và nhập số lượng trả.');
  }

  // Chỉ đơn hàng đã giao thành công mới được tạo yêu cầu đổi/trả
  if (!RMA_ELIGIBLE_ORDER_STATUSES.includes(originalOrder.status)) {
    throw new Error(`Không thể tạo yêu cầu đổi trả vì đơn hàng ${originalOrder.orderCode} chưa giao thành công. Chức năng đổi hoặc trả hàng chỉ có thể thực hiện khi khách hàng đã nhận được sản phẩm thành công nhằm đảm bảo có sản phẩm thực tế để kiểm tra và đối chiếu.`);
  }

  // Bắt buộc có lý do
  if (!reasonDescription || reasonDescription.trim().length < RMA_BUSINESS_RULES.REASON_MIN_LENGTH) {
    throw new Error('Vui lòng nhập lý do đổi hoặc trả hàng rõ ràng.');
  }

  // Chuẩn hóa thông tin tài khoản nhận hoàn tiền (Chủ tài khoản luôn viết IN HOA)
  const normalizedRefundBanking = refundBanking
    ? {
        bankName: (refundBanking.bankName || '').trim(),
        accountNumber: (refundBanking.accountNumber || '').trim(),
        accountHolder: (refundBanking.accountHolder || '').toUpperCase().trim(),
      }
    : {};

  // Trả hàng hoàn tiền cần thông tin tài khoản để Kế toán lập phiếu chi
  if (returnType === 'RETURN_FOR_REFUND') {
    if (!normalizedRefundBanking.bankName || !normalizedRefundBanking.accountNumber || !normalizedRefundBanking.accountHolder) {
      throw new Error('Thiếu thông tin tài khoản nhận hoàn tiền. Vui lòng nhập đầy đủ Ngân hàng, Số tài khoản và Tên chủ tài khoản.');
    }
  }

  // Kiểm tra đơn có phiếu RMA nào đang xử lý không
  const activeRma = await ReturnRequest.findOne({
    originalOrderId: originalOrder._id,
    status: { $in: RMA_ACTIVE_STATUSES },
  }).lean();
  if (activeRma) {
    throw new Error(`Đơn ${originalOrder.orderCode} đã có phiếu ${activeRma.rmaCode} đang xử lý. Hướng dẫn: hoàn tất hoặc từ chối phiếu đó trước khi tạo phiếu mới.`);
  }

  // Kiểm tra số lượng đã trả ở các phiếu trước (không tính phiếu bị từ chối)
  const previousRmas = await ReturnRequest.find({
    originalOrderId: originalOrder._id,
    status: { $ne: 'REJECTED' },
  }).select('warehouseInspection.items').lean();
  const alreadyReturnedBySku = {};
  for (const prev of previousRmas) {
    for (const it of prev.warehouseInspection?.items || []) {
      const key = String(it.skuId);
      alreadyReturnedBySku[key] = (alreadyReturnedBySku[key] || 0) + (Number(it.returnedQty) || 0);
    }
  }

  // Phân loại lỗi theo GBR-11 (Lỗi khách hàng) vs GBR-12 (Lỗi cửa hàng/xưởng)
  const faultClassification = classifyReturnFaultByBR(reasonDescription, faultType);

  const inspectedItems = [];
  let calculatedReturnedValue = 0;
  let totalOrderQty = 0;
  let totalReturnedQty = 0;

  for (const item of originalOrder.items || []) {
    totalOrderQty += Number(item.orderedQty) || 0;
  }

  for (const rItem of returnItems) {
    const orderItem = originalOrder.items.find((item) => String(item.skuId) === String(rItem.skuId));
    if (!orderItem) {
      throw new Error(`Sản phẩm (SKU ${rItem.skuId}) không thuộc đơn ${originalOrder.orderCode}. Hướng dẫn: chỉ chọn các sản phẩm có trong đơn gốc.`);
    }

    const retQty = Number(rItem.returnedQty) || 1;
    const alreadyReturned = alreadyReturnedBySku[String(orderItem.skuId)] || 0;
    const remaining = orderItem.orderedQty - alreadyReturned;
    if (retQty > remaining) {
      throw new Error(
        `Sản phẩm ${orderItem.skuCode}: số lượng yêu cầu trả là ${retQty}, vượt quá số lượng còn được phép trả là ${Math.max(remaining, 0)} trong tổng số ${orderItem.orderedQty} sản phẩm đã mua, số lượng đã trả trước đó là ${alreadyReturned}. ` +
        'Hướng dẫn: giảm số lượng trả xuống bằng hoặc thấp hơn số còn lại.'
      );
    }

    calculatedReturnedValue += retQty * orderItem.unitSalePrice;
    totalReturnedQty += retQty;

    // [GBR-13] Defective Garment Quarantine Isolation:
    // Nếu hàng lỗi xưởng hoặc tình trạng bẩn/hư hỏng -> tự động định tuyến vào QUARANTINE_DEFECT
    const itemCondition = rItem.condition || (faultClassification.isStoreFault ? 'DIRTY_OR_DAMAGED' : 'GOOD_INTACT');
    const itemDisposition =
      itemCondition === 'DIRTY_OR_DAMAGED' || faultClassification.isStoreFault
        ? 'QUARANTINE_DEFECT'
        : (rItem.disposition || 'RESTOCK_SALEABLE');

    inspectedItems.push({
      skuId: orderItem.skuId,
      skuBarcode: orderItem.skuBarcode,
      returnedQty: retQty,
      condition: itemCondition,
      disposition: itemDisposition,
    });
  }

  // Tính toán hoàn tiền theo GBR-11 (khấu trừ 10% nếu lỗi khách) hoặc GBR-12 (hoàn 100% nếu lỗi shop)
  const financials = calculateRefundFinancialsByBR({
    returnedMerchandiseValue: calculatedReturnedValue,
    isStoreFault: faultClassification.isStoreFault,
    shippingFeeDeduction,
  });

  const rmaCode = await CounterSequence.getNextSequence('RMA_CODE', 'RMA', 5);

  const newRma = await ReturnRequest.create({
    rmaCode,
    originalOrderId: originalOrder._id,
    customerId: originalOrder.customerId,
    createdBySellerId: user._id,
    returnType: returnType || 'RETURN_FOR_REFUND',
    returnWaybillCode: (returnWaybillCode || '').toUpperCase().trim(),
    reasonDescription: reasonDescription || '',
    refundBanking: normalizedRefundBanking,
    status: 'REQUESTED',
    warehouseInspection: {
      items: inspectedItems,
    },
    financialAccounting: {
      returnedMerchandiseValue: financials.returnedMerchandiseValue,
      apply10PercentSurcharge: financials.apply10PercentSurcharge,
      surcharge10PercentAmount: financials.surcharge10PercentAmount,
      exchangePriceVarianceAmount: 0,
      shippingFeeDeduction: financials.shippingFeeDeduction,
      finalNetRefundOrCollect: financials.finalNetRefundOrCollect,
    },
  });

  // Thống nhất trạng thái đơn hàng gốc sau khi đổi/trả (không còn trạng thái trả 1 phần)
  if (returnType === 'EXCHANGE_PRODUCT') {
    originalOrder.status = 'EXCHANGE_REQUESTED';
  } else {
    originalOrder.status = 'RETURN_REQUESTED';
  }
  originalOrder.linkedReturnRequestId = newRma._id;
  await originalOrder.save();

  // Phát thông báo Realtime tự động gửi đến Kho (Warehouse) qua Socket.io (chuẩn bị đối chiếu theo GBR-23)
  emitRmaAlert({
    rmaCode: newRma.rmaCode,
    originalOrderCode: originalOrder.orderCode,
    returnType: newRma.returnType,
    appliedRule: financials.appliedRule,
    itemsCount: inspectedItems.length,
    reasonDescription: reasonDescription || 'Không có ghi chú',
    message: `Đơn ${originalOrder.orderCode} vừa tạo phiếu ${newRma.returnType === 'EXCHANGE_PRODUCT' ? 'đổi hàng' : 'trả hàng'}: ${newRma.rmaCode} - ${financials.appliedRule}`,
    createdAt: new Date(),
  });

  await recordSystemLog({
    actor: user,
    majorFeature: 'Reverse Logistics',
    subFeature: 'Return Merchandise Authorization',
    action: 'CREATE_RMA_REQUEST',
    targetCollection: 'ReturnRequest',
    targetId: newRma._id,
    targetCode: newRma.rmaCode,
    afterSnapshot: { ...newRma.toObject(), appliedRule: financials.appliedRule, reasonDescription },
    req,
  });

  return newRma;
};

/**
 * Lấy danh sách RMA
 */
export const getRmaList = async (filters, user) => {
  const { status, returnType, search, page = 1, limit = 20 } = filters;
  const query = {};

  if (user.roleCode === 'SELLER') {
    if (filters.viewAll !== 'true') {
      query.createdBySellerId = user._id;
    }
  }

  if (status) query.status = status;
  if (returnType) query.returnType = returnType;
  if (filters.customerId) query.customerId = filters.customerId;

  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { rmaCode: new RegExp(s, 'i') },
      { returnWaybillCode: new RegExp(s, 'i') },
    ];
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

  const rmas = await ReturnRequest.find(query)
    .populate('customerId', 'customerCode fullName phone')
    .populate('createdBySellerId', 'employeeCode fullName email')
    .populate('originalOrderId', 'orderCode totalOrderAmount status')
    .populate('financialAccounting.exchangeOrderId', 'orderCode totalOrderAmount status')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const total = await ReturnRequest.countDocuments(query);

  return {
    items: rmas,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

/**
 * Lấy chi tiết RMA theo ID
 */
export const getRmaById = async (rmaId) => {
  const rma = await ReturnRequest.findById(rmaId)
    .populate('customerId')
    .populate('createdBySellerId', 'employeeCode fullName email')
    .populate('originalOrderId')
    .populate('financialAccounting.exchangeOrderId')
    .populate('warehouseInspection.items.skuId')
    .lean();

  if (!rma) {
    throw new Error('Phiếu RMA không tồn tại');
  }

  return rma;
};

/**
 * [GBR-14] Seller gửi YÊU CẦU HOÀN TIỀN cho Kế toán duyệt lập phiếu chi (CashFlowVoucher).
 */
export const submitRefundRequest = async (rmaId, { note } = {}, user, req) => {
  const rma = await ReturnRequest.findById(rmaId).populate('originalOrderId', 'orderCode');
  if (!rma) throw new Error('Không tìm thấy phiếu RMA. Hướng dẫn: tải lại danh sách phiếu đổi/trả rồi thử lại.');

  if (rma.returnType !== 'RETURN_FOR_REFUND') {
    throw new Error(`[BR: GBR-14] Phiếu ${rma.rmaCode} là phiếu ĐỔI HÀNG nên không phát sinh hoàn tiền. Hướng dẫn: chỉ gửi yêu cầu hoàn tiền cho phiếu "Trả hàng hoàn tiền".`);
  }
  if (rma.status === 'REJECTED' || rma.status === 'COMPLETED') {
    throw new Error(`Phiếu ${rma.rmaCode} đã ở trạng thái ${rma.status}, không thể gửi yêu cầu hoàn tiền.`);
  }
  const current = rma.refundRequest?.status || 'NONE';
  if (current === 'PENDING_ACCOUNTANT') {
    throw new Error(`Phiếu ${rma.rmaCode} đã gửi yêu cầu hoàn tiền và đang chờ Kế toán duyệt. Hướng dẫn: vui lòng chờ Kế toán xử lý.`);
  }
  if (current === 'APPROVED') {
    throw new Error(`Phiếu ${rma.rmaCode} đã được Kế toán duyệt và lập phiếu chi. Không cần gửi lại.`);
  }

  const bank = rma.refundBanking || {};
  if (!bank.bankName || !bank.accountNumber || !bank.accountHolder) {
    throw new Error(`[BR: GBR-14] Phiếu ${rma.rmaCode} thiếu thông tin tài khoản nhận hoàn tiền. Hướng dẫn: bổ sung Ngân hàng / Số tài khoản / Chủ tài khoản trước khi gửi Kế toán.`);
  }

  // Đảm bảo tên chủ tài khoản luôn viết hoa
  rma.refundBanking.accountHolder = String(bank.accountHolder).toUpperCase().trim();

  const amount = Number(rma.financialAccounting?.finalNetRefundOrCollect) || 0;
  if (amount <= 0) {
    throw new Error(`Số tiền hoàn của phiếu ${rma.rmaCode} bằng 0 nên không cần tạo yêu cầu hoàn tiền.`);
  }

  rma.refundRequest = {
    status: 'PENDING_ACCOUNTANT',
    requestedByUserId: user._id,
    requestedAt: new Date(),
    requestedAmount: amount,
    requestNote: note || '',
  };
  await rma.save();

  emitRmaAlert({
    rmaCode: rma.rmaCode,
    originalOrderCode: rma.originalOrderId?.orderCode,
    returnType: rma.returnType,
    message: `[GBR-14] Yêu cầu hoàn tiền ${amount.toLocaleString('vi-VN')}đ cho phiếu ${rma.rmaCode} đang chờ Kế toán duyệt lập phiếu chi`,
    createdAt: new Date(),
  });

  await recordSystemLog({
    actor: user,
    action: 'REQUEST_REFUND_TO_ACCOUNTANT',
    targetCollection: 'ReturnRequest',
    targetId: rma._id,
    targetCode: rma.rmaCode,
    afterSnapshot: rma.refundRequest.toObject ? rma.refundRequest.toObject() : rma.refundRequest,
    req,
  });

  return rma;
};

/**
 * Kế toán: danh sách yêu cầu hoàn tiền (mặc định đang chờ duyệt).
 */
export const getRefundRequests = async (filters = {}) => {
  const status = filters.status || 'PENDING_ACCOUNTANT';
  const items = await ReturnRequest.find({ 'refundRequest.status': status })
    .populate('customerId', 'customerCode fullName phone')
    .populate('originalOrderId', 'orderCode status')
    .populate('refundRequest.requestedByUserId', 'employeeCode fullName')
    .sort({ 'refundRequest.requestedAt': -1 })
    .lean();
  return { items, total: items.length };
};

/**
 * [GBR-14] Kế toán DUYỆT yêu cầu hoàn tiền và tạo PHIẾU CHI (CashFlowVoucher)
 * bắt buộc gắn tham chiếu chứng từ gốc (salesOrderId & returnRequestId).
 */
export const approveRefundRequest = async (rmaId, { paymentMethod = 'BANK_TRANSFER', note } = {}, accountant, req) => {
  const rma = await ReturnRequest.findById(rmaId);
  if (!rma) throw new Error('Không tìm thấy phiếu RMA. Hướng dẫn: tải lại danh sách yêu cầu hoàn tiền.');

  if (rma.refundRequest?.status !== 'PENDING_ACCOUNTANT') {
    throw new Error(`Phiếu ${rma.rmaCode} không ở trạng thái chờ Kế toán duyệt (hiện tại: ${rma.refundRequest?.status || 'NONE'}). Hướng dẫn: yêu cầu Seller gửi yêu cầu hoàn tiền trước.`);
  }

  // [GBR-14] Mandatory Voucher Source Document Reference
  if (!rma.originalOrderId || !rma._id) {
    throw new Error('[BR: GBR-14] Không thể lập phiếu chi hoàn tiền do thiếu chứng từ gốc tham chiếu (originalOrderId / returnRequestId).');
  }

  const amount = Number(rma.refundRequest.requestedAmount) || 0;
  const voucherCode = await CounterSequence.getNextSequence('CASH_OUT_VOUCHER', 'PC', 5);
  const voucher = await CashFlowVoucher.create({
    voucherCode,
    flowType: 'CASH_OUT',
    category: 'CUSTOMER_RETURN_REFUND',
    amount,
    paymentMethod,
    salesOrderId: rma.originalOrderId,
    returnRequestId: rma._id,
    createdByAccountantId: accountant._id,
    note: note || `[GBR-14] Hoàn tiền khách theo phiếu ${rma.rmaCode} - ${rma.refundBanking?.bankName || ''} ${rma.refundBanking?.accountNumber || ''} ${(rma.refundBanking?.accountHolder || '').toUpperCase()}`.trim(),
  });

  rma.refundRequest.status = 'APPROVED';
  rma.refundRequest.reviewedByAccountantId = accountant._id;
  rma.refundRequest.reviewedAt = new Date();
  rma.refundRequest.voucherId = voucher._id;
  rma.status = 'ACCOUNTANT_APPROVED';
  rma.financialAccounting.approvedByAccountantId = accountant._id;
  rma.financialAccounting.approvedAt = new Date();
  await rma.save();

  await recordSystemLog({
    actor: accountant,
    subFeature: 'Refund Approval',
    action: 'APPROVE_REFUND_CREATE_VOUCHER',
    targetCollection: 'CashFlowVoucher',
    targetId: voucher._id,
    targetCode: voucher.voucherCode,
    afterSnapshot: voucher.toObject(),
    req,
  });

  return { rma, voucher };
};

/**
 * Kế toán TỪ CHỐI yêu cầu hoàn tiền (bắt buộc ghi lý do để Seller xử lý lại).
 */
export const rejectRefundRequest = async (rmaId, { reason } = {}, accountant, req) => {
  const rma = await ReturnRequest.findById(rmaId);
  if (!rma) throw new Error('Không tìm thấy phiếu RMA. Hướng dẫn: tải lại danh sách yêu cầu hoàn tiền.');
  if (rma.refundRequest?.status !== 'PENDING_ACCOUNTANT') {
    throw new Error(`Phiếu ${rma.rmaCode} không ở trạng thái chờ Kế toán duyệt nên không thể từ chối.`);
  }
  if (!reason || !reason.trim()) {
    throw new Error('Bắt buộc nhập lý do từ chối. Hướng dẫn: ghi rõ lý do (ví dụ: sai số tài khoản, hàng trả chưa về kho) để Seller chỉnh sửa và gửi lại.');
  }

  rma.refundRequest.status = 'REJECTED';
  rma.refundRequest.rejectReason = reason.trim();
  rma.refundRequest.reviewedByAccountantId = accountant._id;
  rma.refundRequest.reviewedAt = new Date();
  await rma.save();

  await recordSystemLog({
    actor: accountant,
    subFeature: 'Refund Approval',
    action: 'REJECT_REFUND_REQUEST',
    targetCollection: 'ReturnRequest',
    targetId: rma._id,
    targetCode: rma.rmaCode,
    afterSnapshot: { rejectReason: reason.trim() },
    req,
  });

  return rma;
};

export default {
  createReturnRequest,
  getRmaList,
  getRmaById,
  submitRefundRequest,
  getRefundRequests,
  approveRefundRequest,
  rejectRefundRequest,
};
