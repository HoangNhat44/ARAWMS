/**
 * ============================================================================
 * @title        : Customer Exchange Processing Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Xử lý quy trình tạo đơn hàng đổi mới cho khách hàng (UC-83) của Seller,
 *                 liên kết phiếu RMA, tính chênh lệch giá và kích hoạt giữ chỗ kho (GBR-10).
 * @module       : Reverse Logistics / Customer Exchange Processing
 * @layer        : Service
 * ============================================================================
 */

import ReturnRequest from '../../../models/ReturnRequest.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import Sku from '../../../models/Sku.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import { ghnService } from '../../ghn/ghn.service.js';

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
    throw new Error('Không thể tạo đơn hàng đổi mới vì phiếu yêu cầu này được đăng ký là Trả hàng hoàn tiền. Chức năng tạo đơn đổi mới chỉ có thể thực hiện khi khách hàng có nhu cầu đổi sản phẩm khác.');
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

  const originalOrder = await SalesOrder.findById(rma.originalOrderId);
  const originalWaybill = originalOrder?.warehouseFulfillment?.waybillCode || 'Không có';
  const originalOrderSnapshot = originalOrder
    ? {
        orderCode: originalOrder.orderCode,
        waybillCode: originalWaybill,
        status: originalOrder.status,
        deliveredAt: originalOrder.warehouseFulfillment?.deliveredAt || originalOrder.updatedAt,
        items: (originalOrder.items || []).map((it) => ({
          skuId: it.skuId,
          skuCode: it.skuCode,
          productName: it.productName,
          orderedQty: it.orderedQty,
          unitSalePrice: it.unitSalePrice,
        })),
        totalOrderAmount: originalOrder.financialSummary?.totalOrderAmount || 0,
      }
    : null;

  const orderCode = await CounterSequence.getNextSequence('ORDER_CODE', 'ORD', 5);

  const exchangeOrder = await SalesOrder.create({
    orderCode,
    customerId: rma.customerId,
    sellerId: user._id,
    orderType: 'EXCHANGE_ORDER',
    linkedReturnRequestId: rma._id,
    originalOrderId: rma.originalOrderId,
    originalOrderSnapshot,
    status: 'CONFIRMED_RESERVED',
    confirmedAt: new Date(),
    notes: `Đơn đổi hàng từ đơn gốc #${originalOrder?.orderCode || ''} - Mã vận đơn trước: ${originalWaybill}. Lý do: ${rma.reasonDescription || 'Đổi sản phẩm'}`,
    statusHistory: [
      {
        from: 'ORIGINAL_ORDER',
        to: 'CONFIRMED_RESERVED',
        by: user._id,
        at: new Date(),
        note: `Khởi tạo đơn đổi mới từ đơn gốc #${originalOrder?.orderCode || ''}`,
      },
    ],
    shippingRecipient: {
      name: (shippingRecipient?.name || originalOrder?.shippingRecipient?.name || '').toUpperCase().trim(),
      phone: shippingRecipient?.phone || originalOrder?.shippingRecipient?.phone || '',
      address: shippingRecipient?.address || originalOrder?.shippingRecipient?.address || '',
    },
    items: processedItems,
    financialSummary: {
      itemsSubtotal,
      shippingFee,
      discountAmount: 0,
      totalOrderAmount,
      expectedCodAmount: Math.max(0, varianceAmount),
    },
    warehouseFulfillment: {
      carrierName: 'GHN',
      stockReservedAt: new Date(),
    },
    codReconciliationStatus: 'UNRECONCILED',
  });

  // Tự động giữ chỗ tồn kho cho sản phẩm trong đơn đổi mới
  for (const it of processedItems) {
    await Sku.findByIdAndUpdate(it.skuId, { $inc: { reservedQty: it.orderedQty } });
  }

  // Tự động tạo mã vận đơn GHN mới độc lập cho đơn đổi mới (GBR-10)
  try {
    const ghnRes = await ghnService.createShippingOrderFromSalesOrder(exchangeOrder);
    if (ghnRes?.waybillCode) {
      exchangeOrder.warehouseFulfillment = {
        carrierName: 'GHN',
        waybillCode: ghnRes.waybillCode,
        ghnStatus: ghnRes.ghnStatus || 'ready_to_pick',
        ghnStatusName: ghnRes.ghnStatusName || 'Chờ lấy hàng',
        ghnUpdatedAt: new Date(),
        stockReservedAt: new Date(),
      };
      await exchangeOrder.save();
    }
  } catch (ghnErr) {
    console.warn('⚠️ [GHN Exchange Waybill]:', ghnErr.message);
  }

  // Cập nhật liên kết 2 chiều trong đơn gốc
  if (originalOrder) {
    originalOrder.exchangeOrderIds = [...(originalOrder.exchangeOrderIds || []), exchangeOrder._id];
    originalOrder.status = 'EXCHANGE_REQUESTED';
    originalOrder.statusHistory = [
      ...(originalOrder.statusHistory || []),
      {
        from: originalOrder.status,
        to: 'EXCHANGE_REQUESTED',
        by: user._id,
        at: new Date(),
        note: `Đã sinh đơn đổi mới #${exchangeOrder.orderCode} - Vận đơn mới: ${exchangeOrder.warehouseFulfillment?.waybillCode || 'Đang tạo'}`,
      },
    ];
    await originalOrder.save();
  }

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
