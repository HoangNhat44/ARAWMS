import ReturnRequest from '../../../models/ReturnRequest.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import Sku from '../../../models/Sku.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import SystemLog from '../../../models/SystemLog.model.js';

/**
 * Ghi SystemLog kiểm toán
 */
const recordSystemLog = async ({ actor, majorFeature, subFeature, action, targetCollection, targetId, targetCode, beforeSnapshot, afterSnapshot, req }) => {
  try {
    await SystemLog.create({
      actorId: actor?._id,
      actorRole: actor?.roleCode || 'SELLER',
      majorFeature: majorFeature || 'Reverse Logistics',
      subFeature: subFeature || 'Customer Exchange Processing',
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
    console.error('❌ Lỗi ghi SystemLog Customer Exchange:', err.message);
  }
};

/**
 * UC-83: Tạo đơn hàng đổi sản phẩm mới (chọn mã SKU thay thế) cho khách (Create Customer Exchange Order)
 */
export const createExchangeOrder = async (rmaId, exchangeData, user, req) => {
  const { newItems, shippingRecipient } = exchangeData;

  const rma = await ReturnRequest.findById(rmaId);
  if (!rma) {
    throw new Error('Phiếu RMA không tồn tại');
  }

  if (rma.returnType !== 'EXCHANGE_PRODUCT') {
    throw new Error('Chỉ có thể tạo đơn hàng đổi mới cho phiếu RMA có loại EXCHANGE_PRODUCT');
  }

  if (rma.financialAccounting?.exchangeOrderId) {
    throw new Error('Phiếu RMA này đã được tạo đơn hàng đổi mới trước đó');
  }

  if (!Array.isArray(newItems) || newItems.length === 0) {
    throw new Error('Đơn hàng đổi mới phải có ít nhất một sản phẩm thay thế');
  }

  let itemsSubtotal = 0;
  const processedItems = [];

  for (const item of newItems) {
    const sku = await Sku.findById(item.skuId);
    if (!sku || !sku.isActive) {
      throw new Error(`Sản phẩm SKU ${item.skuId} không tồn tại hoặc đã ngừng kinh doanh`);
    }

    const available = (sku.onHandQty || 0) - (sku.reservedQty || 0);
    const qty = Number(item.orderedQty) || 1;

    if (available < qty) {
      throw new Error(`Sản phẩm ${sku.skuCode} không đủ tồn khả dụng (Còn ${available}, yêu cầu ${qty})`);
    }

    const salePrice = Number(item.unitSalePrice) !== undefined ? Number(item.unitSalePrice) : sku.retailPrice;
    itemsSubtotal += qty * salePrice;

    processedItems.push({
      skuId: sku._id,
      skuCode: sku.skuCode,
      skuBarcode: sku.skuBarcode,
      orderedQty: qty,
      unitSalePrice: salePrice,
      unitCogsSnapshot: sku.unitCogs || 0,
      fifoPickList: [],
      packedScannedQty: 0,
    });
  }

  const shippingFee = Number(exchangeData.shippingFee) || 0;
  const totalOrderAmount = itemsSubtotal + shippingFee;

  const returnedValue = rma.financialAccounting?.returnedMerchandiseValue || 0;
  const varianceAmount = totalOrderAmount - returnedValue;

  const orderCode = await CounterSequence.getNextSequence('ORDER_CODE', 'ORD', 5);

  const exchangeOrder = await SalesOrder.create({
    orderCode,
    customerId: rma.customerId,
    sellerId: user._id,
    orderType: 'EXCHANGE_ORDER',
    linkedReturnRequestId: rma._id,
    status: 'PENDING',
    shippingRecipient: {
      name: shippingRecipient?.name || '',
      phone: shippingRecipient?.phone || '',
      address: shippingRecipient?.address || '',
    },
    items: processedItems,
    financialSummary: {
      itemsSubtotal,
      shippingFee,
      discountAmount: 0,
      totalOrderAmount,
      expectedCodAmount: Math.max(0, varianceAmount),
    },
    warehouseFulfillment: {},
    codReconciliationStatus: 'UNRECONCILED',
  });

  rma.financialAccounting = {
    ...rma.financialAccounting,
    exchangeOrderId: exchangeOrder._id,
    exchangePriceVarianceAmount: varianceAmount,
  };
  await rma.save();

  await recordSystemLog({
    actor: user,
    majorFeature: 'Reverse Logistics',
    subFeature: 'Customer Exchange Processing',
    action: 'CREATE_EXCHANGE_ORDER',
    targetCollection: 'SalesOrder',
    targetId: exchangeOrder._id,
    targetCode: exchangeOrder.orderCode,
    afterSnapshot: { exchangeOrder: exchangeOrder.toObject(), linkedRmaCode: rma.rmaCode },
    req,
  });

  return {
    exchangeOrder,
    rma,
    varianceAmount,
  };
};

export default {
  createExchangeOrder,
};
