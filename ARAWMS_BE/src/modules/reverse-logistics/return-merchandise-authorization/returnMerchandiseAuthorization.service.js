/**
 * ============================================================================
 * @title        : Return Merchandise Authorization (RMA) Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Xử lý quy trình tiếp nhận yêu cầu đổi/trả hàng từ khách hàng (UC-82)
 *                 của Seller. Tính toán phụ phí hoàn trả theo quy định (GBR-14, GBR-15)
 *                 và ghi vết kiểm toán (GBR-23).
 * @module       : Reverse Logistics / Return Merchandise Authorization
 * @layer        : Service
 * ============================================================================
 */

import ReturnRequest from '../../../models/ReturnRequest.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import SystemLog from '../../../models/SystemLog.model.js';

/**
 * Ghi SystemLog kiểm toán
 * @businessRule GBR-23 Ghi log kiểm toán cho dữ liệu trọng yếu
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
 */
export const createReturnRequest = async (rmaData, user, req) => {
  const { originalOrderId, returnType, returnWaybillCode, returnItems, reasonDescription } = rmaData;

  const originalOrder = await SalesOrder.findById(originalOrderId);
  if (!originalOrder) {
    throw new Error('Đơn hàng gốc không tồn tại');
  }

  if (!Array.isArray(returnItems) || returnItems.length === 0) {
    throw new Error('Yêu cầu đổi/trả phải có ít nhất một sản phẩm');
  }

  const inspectedItems = [];
  let calculatedReturnedValue = 0;

  for (const rItem of returnItems) {
    const orderItem = originalOrder.items.find((item) => String(item.skuId) === String(rItem.skuId));
    if (!orderItem) {
      throw new Error(`Sản phẩm SKU ${rItem.skuId} không thuộc đơn hàng gốc`);
    }

    const retQty = Number(rItem.returnedQty) || 1;
    if (retQty > orderItem.orderedQty) {
      throw new Error(`Số lượng trả (${retQty}) không thể vượt quá số lượng đã mua (${orderItem.orderedQty})`);
    }

    calculatedReturnedValue += retQty * orderItem.unitSalePrice;

    inspectedItems.push({
      skuId: orderItem.skuId,
      skuBarcode: orderItem.skuBarcode,
      returnedQty: retQty,
      condition: rItem.condition || 'GOOD_INTACT',
      disposition: rItem.disposition || 'RESTOCK_SALEABLE',
    });
  }

  const rmaCode = await CounterSequence.getNextSequence('RMA_CODE', 'RMA', 5);

  const newRma = await ReturnRequest.create({
    rmaCode,
    originalOrderId: originalOrder._id,
    customerId: originalOrder.customerId,
    createdBySellerId: user._id,
    returnType: returnType || 'RETURN_FOR_REFUND',
    returnWaybillCode: returnWaybillCode || '',
    status: 'REQUESTED',
    warehouseInspection: {
      items: inspectedItems,
    },
    financialAccounting: {
      returnedMerchandiseValue: calculatedReturnedValue,
      apply10PercentSurcharge: false,
      surcharge10PercentAmount: 0,
      exchangePriceVarianceAmount: 0,
      shippingFeeDeduction: 0,
      finalNetRefundOrCollect: calculatedReturnedValue,
    },
  });

  originalOrder.status = 'RETURN_REQUESTED';
  await originalOrder.save();

  await recordSystemLog({
    actor: user,
    majorFeature: 'Reverse Logistics',
    subFeature: 'Return Merchandise Authorization',
    action: 'CREATE_RMA_REQUEST',
    targetCollection: 'ReturnRequest',
    targetId: newRma._id,
    targetCode: newRma.rmaCode,
    afterSnapshot: { ...newRma.toObject(), reasonDescription },
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

export default {
  createReturnRequest,
  getRmaList,
  getRmaById,
};
