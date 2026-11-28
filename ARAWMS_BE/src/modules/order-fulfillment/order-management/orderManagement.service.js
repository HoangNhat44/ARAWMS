/**
 * ============================================================================
 * @title        : Order Management Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-29
 * @description  : Xử lý toàn bộ logic nghiệp vụ cốt lõi cho phân hệ Seller Order:
 *                 tạo đơn hàng (UC-78), xác nhận giữ chỗ tồn kho (UC-79, [BR: GBR-10]),
 *                 cảnh báo tồn kho tối thiểu ([BR: GBR-08]), đồng bộ vận đơn GHN ([BR: GBR-13]),
 *                 cập nhật trạng thái (UC-80), hủy đơn và giải phóng tồn kho (UC-81, [BR: GBR-11]),
 *                 ghi nhận SystemLog kiểm toán nội bộ.
 * @module       : Order Fulfillment / Order Management
 * @layer        : Service
 * ============================================================================
 */

import mongoose from 'mongoose';
import SalesOrder from '../../../models/SalesOrder.model.js';
import Sku from '../../../models/Sku.model.js';
import Customer from '../../../models/Customer.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import { ORDER_STATUS, getOrderStatusLabel } from '../../../common/constants/enums.js';
import notificationTemplateService from '../../conversational-commerce/chat-interface/notificationTemplate.service.js';
import {
  ghnService,
  DEFAULT_INTERNAL_SHIPPING_FEE,
  mapGhnStatusToOrderStatus,
  getGhnStatusLabel,
  GHN_PICKED_UP_STATUSES,
} from '../../ghn/ghn.service.js';
import { applyGhnStatusToSalesOrder } from '../../ghn/ghn.webhook.controller.js';

/**
 * Ghi SystemLog kiểm toán nội bộ cho mọi thao tác nghiệp vụ trọng yếu trên SalesOrder.
 */
const recordSystemLog = async ({ actor, majorFeature, subFeature, action, targetCollection, targetId, targetCode, beforeSnapshot, afterSnapshot, req }) => {
  try {
    await SystemLog.create({
      actorId: actor?._id,
      actorRole: actor?.roleCode || 'SELLER',
      majorFeature: majorFeature || 'Order Fulfillment',
      subFeature: subFeature || 'Order Management',
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
    console.error('❌ Lỗi ghi SystemLog:', err.message);
  }
};

/**
 * ====================================================================================================================================
 * [BẢNG TRA CỨU CÔNG THỨC CẢNH BÁO TỒN KHO - BE: evaluateStockForItems / buildStockWarningsFromSkuMap]
 * ====================================================================================================================================
 * | STT | Biến tính toán               | Màn hình FE hiển thị                     | Nguồn DB (Collection.field)                       | Công thức & Quy tắc BR                            |
 * |-----|------------------------------|------------------------------------------|---------------------------------------------------|---------------------------------------------------|
 * | 1   | available (tồn khả dụng)     | QuickOrderModal (stockWarnings)          | skus.{onHandQty, reservedQty}                     | [BR: GBR-10] onHandQty - reservedQty              |
 * | 2   | remainingAfter               | Hộp cảnh báo sau tạo đơn                 | skus.{onHandQty, reservedQty}                     | available - orderedQty                            |
 * | 3   | shortage & belowThreshold    | Cảnh báo thiếu hàng / sắp hết            | skus.safetyStockThreshold (mặc định 10)           | [BR: GBR-08] shortage: <qty; below: <threshold    |
 * ====================================================================================================================================
 * @businessRule GBR-08 Cảnh báo tồn kho thấp khi tồn khả dụng giảm dưới ngưỡng safetyStockThreshold
 * @businessRule GBR-10 Tính tồn khả dụng dựa trên tồn vật lý trừ tồn đã giữ chỗ
 */
/**
 * Tính danh sách cảnh báo tồn kho từ tập bản ghi SKU đã tải sẵn (không truy vấn DB lặp lại).
 * @param {Array<{skuId: any, orderedQty: number}>} items
 * @param {Map<string, Object>} skuMap
 * @returns {Array<Object>}
 */
const buildStockWarningsFromSkuMap = (items = [], skuMap = new Map()) => {
  const results = [];
  for (const item of items) {
    const sku = skuMap.get(String(item.skuId));
    if (!sku) continue;
    const available = (sku.onHandQty || 0) - (sku.reservedQty || 0);
    const requested = Number(item.orderedQty) || 0;
    const threshold = sku.safetyStockThreshold ?? 10;
    const remainingAfter = available - requested;
    const shortage = available < requested;
    const belowThreshold = !shortage && remainingAfter < threshold;

    let message = '';
    if (shortage) {
      message = `${sku.skuCode}: HẾT/THIẾU HÀNG - khả dụng ${available}, khách đặt ${requested} (thiếu ${requested - available}).`;
    } else if (belowThreshold) {
      message = `${sku.skuCode}: sau đơn này chỉ còn ${remainingAfter}, thấp hơn ngưỡng cảnh báo ${threshold}.`;
    }
    results.push({ skuCode: sku.skuCode, available, requested, remainingAfter, threshold, shortage, belowThreshold, message });
  }
  return results;
};

export const evaluateStockForItems = async (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const uniqueIds = [...new Set(items.map((it) => String(it.skuId)).filter(Boolean))];
  const skus = await Sku.find({ _id: { $in: uniqueIds } })
    .select('skuCode onHandQty reservedQty safetyStockThreshold')
    .lean();
  const skuMap = new Map(skus.map((s) => [String(s._id), s]));
  return buildStockWarningsFromSkuMap(items, skuMap);
};

/**
 * Thời gian chờ tối đa (ms) cho API GHN trên luồng đồng bộ khi tạo/chốt đơn.
 * Nếu GHN phản hồi nhanh (hoặc mock trong test): trả waybillCode ngay trong HTTP response.
 * Nếu GHN Sandbox chậm hơn ngưỡng này: trả kết quả chốt đơn ngay cho Seller và tiếp tục
 * cập nhật mã vận đơn + bắn tin xác nhận vào chat ở nền để tránh treo nút loading.
 */
const GHN_INLINE_WAIT_MS = 1200;

/**
 * Gửi thông báo chốt đơn vào chat không chặn luồng HTTP response của Seller.
 */
const fireOrderConfirmedChatNotify = (order, waybillCode, userId) => {
  void notificationTemplateService
    .sendOrderNotificationToChat({
      order,
      messageText: notificationTemplateService.buildOrderConfirmedSuccessText(order, waybillCode),
      notificationType: 'CONFIRMED_SUCCESS',
      senderSellerId: userId,
    })
    .catch((chatErr) => {
      console.warn('⚠️ [Auto-Confirm Chat Notify]:', chatErr.message);
    });
};

/**
 * Đồng bộ mã vận đơn GHN với giới hạn thời gian chờ trên luồng chính + bắn tin chat ở nền.
 * Đảm bảo đơn đã CONFIRMED_RESERVED & giữ chỗ kho phản hồi tức thì ngay cả khi GHN/Meta phản hồi chậm.
 */
const syncGhnWaybillWithGraceAndNotify = async ({ order, userId, inlineTimeoutMs = GHN_INLINE_WAIT_MS }) => {
  const existingWaybill = order.warehouseFulfillment?.waybillCode;
  if (existingWaybill) {
    fireOrderConfirmedChatNotify(order, existingWaybill, userId);
    return;
  }

  let finishedInline = false;
  const ghnTask = (async () => {
    try {
      const ghnRes = await ghnService.createShippingOrderFromSalesOrder(order);
      if (!ghnRes?.waybillCode) return null;

      const fulfillmentPatch = {
        carrierName: 'GHN',
        waybillCode: ghnRes.waybillCode,
        ghnStatus: ghnRes.ghnStatus || 'ready_to_pick',
        ghnStatusName: ghnRes.ghnStatusName || 'Chờ lấy hàng',
        ghnUpdatedAt: new Date(),
        ...(ghnRes.expectedDeliveryTime
          ? { ghnExpectedDeliveryTime: new Date(ghnRes.expectedDeliveryTime) }
          : {}),
      };

      if (finishedInline) {
        await SalesOrder.findByIdAndUpdate(order._id, {
          $set: {
            'warehouseFulfillment.carrierName': fulfillmentPatch.carrierName,
            'warehouseFulfillment.waybillCode': fulfillmentPatch.waybillCode,
            'warehouseFulfillment.ghnStatus': fulfillmentPatch.ghnStatus,
            'warehouseFulfillment.ghnStatusName': fulfillmentPatch.ghnStatusName,
            'warehouseFulfillment.ghnUpdatedAt': fulfillmentPatch.ghnUpdatedAt,
            ...(fulfillmentPatch.ghnExpectedDeliveryTime
              ? { 'warehouseFulfillment.ghnExpectedDeliveryTime': fulfillmentPatch.ghnExpectedDeliveryTime }
              : {}),
          },
        });
      } else {
        order.warehouseFulfillment = {
          ...(order.warehouseFulfillment?.toObject ? order.warehouseFulfillment.toObject() : order.warehouseFulfillment),
          ...fulfillmentPatch,
        };
      }
      return ghnRes.waybillCode;
    } catch (ghnErr) {
      console.warn(`⚠️ [GHN Auto-Create Waybill] Chưa lấy được mã vận đơn GHN cho đơn ${order.orderCode}:`, ghnErr.message);
      return null;
    }
  })();

  let timeoutHandle = null;
  const timeoutSentinel = Symbol('GHN_INLINE_TIMEOUT');
  const timeoutPromise = new Promise((resolve) => {
    timeoutHandle = setTimeout(() => resolve(timeoutSentinel), inlineTimeoutMs);
    if (typeof timeoutHandle.unref === 'function') {
      timeoutHandle.unref();
    }
  });

  const raceResult = await Promise.race([ghnTask, timeoutPromise]);
  if (timeoutHandle) clearTimeout(timeoutHandle);

  if (raceResult === timeoutSentinel) {
    finishedInline = true;
    // GHN phản hồi chậm: trả HTTP ngay cho Seller; khi GHN xong ở nền sẽ tự lưu waybillCode và gửi tin chat
    void ghnTask
      .then((waybillCode) => {
        fireOrderConfirmedChatNotify(order, waybillCode, userId);
      })
      .catch(() => {
        fireOrderConfirmedChatNotify(order, null, userId);
      });
    return;
  }

  // GHN phản hồi kịp trong ngưỡng: lưu waybillCode đồng bộ trước khi trả về, còn tin nhắn Facebook gửi ở nền
  if (raceResult) {
    await order.save();
  }
  fireOrderConfirmedChatNotify(order, raceResult, userId);
};

/**
 * UC-78: Tạo đơn hàng bán lẻ trực tiếp từ chat (Create Direct New Order)
 */
export const createDirectOrder = async (orderData, user, req) => {
  const { customerId, conversationId, shippingRecipient, items, financialSummary = {}, autoConfirm = false } = orderData;

  // 1. Kiểm tra khách hàng hoặc tự động liên kết / tạo mới theo số điện thoại
  let customer = null;
  if (customerId) {
    customer = await Customer.findById(customerId);
  }
  if (!customer && shippingRecipient?.phone) {
    const cleanPhone = String(shippingRecipient.phone).replace(/\D/g, '');
    if (cleanPhone) {
      customer = await Customer.findOne({ phone: cleanPhone });
      if (!customer) {
        // Tự động tạo hồ sơ khách hàng mới nếu tạo đơn ngoài chat
        const customerCode = await CounterSequence.getNextSequence('CUSTOMER_CODE', 'CUST', 5);
        customer = await Customer.create({
          customerCode,
          fullName: (shippingRecipient.name || 'Khách Hàng Mới').trim(),
          phone: cleanPhone,
          addresses: shippingRecipient.address
            ? [{
                recipientName: (shippingRecipient.name || 'Khách Hàng').trim(),
                phone: cleanPhone,
                fullAddress: shippingRecipient.address.trim(),
                isDefault: true,
              }]
            : [],
        });
      }
    }
  }

  if (!customer) {
    throw new Error('Vui lòng nhập đầy đủ Số điện thoại và Họ tên người nhận ở mục "Thông tin người nhận hàng".');
  }

  if (!items || items.length === 0) {
    throw new Error('Đơn hàng phải chứa ít nhất một sản phẩm');
  }

  // Validate số điện thoại người nhận (chỉ chấp nhận 10 chữ số Việt Nam)
  const rawPhone = shippingRecipient?.phone || customer.phone || '';
  const cleanPhone = String(rawPhone).replace(/\D/g, '');
  if (orderData.orderType !== 'POS_DIRECT' && cleanPhone && cleanPhone !== '0900000000') {
    if (!/^(0[35789])[0-9]{8}$/.test(cleanPhone)) {
      throw new Error('Số điện thoại người nhận không hợp lệ. Vui lòng nhập đúng 10 chữ số (đầu số 03, 05, 07, 08, 09).');
    }
  }

  // 2. Truy vấn hàng loạt tất cả SKU trong 1 lần query thay vì N+1 query lặp lại
  const uniqueSkuIds = [...new Set(items.map((it) => String(it.skuId)).filter(Boolean))];
  const fetchedSkus = await Sku.find({ _id: { $in: uniqueSkuIds } }).lean();
  const skuMap = new Map(fetchedSkus.map((s) => [String(s._id), s]));

  let itemsSubtotal = 0;
  const processedItems = [];
  const requestedQtyBySku = new Map();

  for (const item of items) {
    const sku = skuMap.get(String(item.skuId));
    if (!sku || !sku.isActive) {
      throw new Error(`Sản phẩm SKU ${item.skuId} không tồn tại hoặc đã ngừng kinh doanh`);
    }

    const qty = Number(item.orderedQty) || 1;
    const salePrice = item.unitSalePrice !== undefined && item.unitSalePrice !== null && !Number.isNaN(Number(item.unitSalePrice))
      ? Number(item.unitSalePrice)
      : sku.retailPrice;

    itemsSubtotal += qty * salePrice;
    const skuKey = String(sku._id);
    requestedQtyBySku.set(skuKey, (requestedQtyBySku.get(skuKey) || 0) + qty);

    processedItems.push({
      skuId: sku._id,
      skuCode: sku.skuCode,
      skuBarcode: sku.skuBarcode,
      productName: item.productName || sku.styleName,
      color: item.color || sku.color,
      size: item.size || sku.size,
      thumbnailUrl: item.thumbnailUrl || sku.thumbnailUrl || '',
      orderedQty: qty,
      unitSalePrice: salePrice,
      unitCogsSnapshot: sku.unitCogs || 0,
      fifoPickList: [],
      packedScannedQty: 0,
    });
  }

  /*
   * ====================================================================================================================================
   * [BẢNG TRA CỨU CÔNG THỨC TÍNH TIỀN & TRẠNG THÁI ĐƠN HÀNG - BE: createDirectOrder (UC-78)]
   * ====================================================================================================================================
   * | STT | Trường tài chính / Status    | Màn hình FE hiển thị                     | Nguồn DB (Collection.field)                       | Công thức & Quy tắc BR                            |
   * |-----|------------------------------|------------------------------------------|---------------------------------------------------|---------------------------------------------------|
   * | 1   | itemsSubtotal                | PaymentSummary, SellerOrders, OrderDetail| sales_orders.financialSummary.itemsSubtotal       | Σ (orderedQty * unitSalePrice)                    |
   * | 2   | shippingFee                  | Phí GHN (nội bộ, không đẩy sang GHN)     | sales_orders.financialSummary.shippingFee         | POS: 0đ; Online: mặc định 30.000đ                 |
   * | 3   | totalOrderAmount             | Cột Tổng tiền / Tổng COD                 | sales_orders.financialSummary.totalOrderAmount    | itemsSubtotal + shippingFee - discountAmount      |
   * | 4   | expectedCodAmount            | Đối soát COD ([BR: GBR-18])              | sales_orders.financialSummary.expectedCodAmount   | BANK_TRANSFER: 0đ; COD: totalOrderAmount          |
   * | 5   | initialStatus (PENDING/CONF) | Trạng thái khởi tạo đơn hàng             | sales_orders.status & skus.reservedQty            | PENDING: chưa giữ kho; autoConfirm: +reservedQty  |
   * ====================================================================================================================================
   */
  const isPosOrder = orderData.orderType === 'POS_DIRECT';
  const shippingFee = isPosOrder
    ? 0
    : (financialSummary.shippingFee !== undefined && financialSummary.shippingFee !== null
        ? Number(financialSummary.shippingFee)
        : DEFAULT_INTERNAL_SHIPPING_FEE);
  const discountAmount = Number(financialSummary.discountAmount) || 0;
  const totalOrderAmount = itemsSubtotal + shippingFee - discountAmount;
  const expectedCodAmount = orderData.paymentMethod === 'BANK_TRANSFER' ? 0 : totalOrderAmount;

  // 2b. [BR: GBR-10] Nếu Seller chọn "Tạo & Chốt đơn ngay" (autoConfirm = true): kiểm tra đủ tồn khả dụng trên skuMap đã tải (0 query thừa)
  const shouldAutoConfirm = Boolean(autoConfirm) && !isPosOrder;
  if (shouldAutoConfirm) {
    for (const [skuKey, totalNeeded] of requestedQtyBySku.entries()) {
      const sku = skuMap.get(skuKey);
      const available = (sku?.onHandQty || 0) - (sku?.reservedQty || 0);
      if (available < totalNeeded) {
        throw new Error(
          `Không thể tạo và chốt đơn ngay: sản phẩm ${sku?.skuCode || skuKey} không đủ tồn khả dụng ` +
          `(còn ${available}, cần ${totalNeeded}). Vui lòng chọn "Chờ khách xác nhận" hoặc điều chỉnh số lượng.`
        );
      }
    }
  }

  // 3. Sinh mã đơn nguyên tử qua CounterSequence (ORD-00001)
  const orderCode = await CounterSequence.getNextSequence('ORDER_CODE', 'ORD', 5);

  const initialStatus = shouldAutoConfirm ? 'CONFIRMED_RESERVED' : 'PENDING';
  const now = new Date();

  const resolvedChannel = SalesOrder.schema.path('channel').enumValues.includes(orderData.channel)
    ? orderData.channel
    : 'FACEBOOK_MESSENGER';
  const resolvedSourceType =
    orderData.sourceDetails?.sourceType ||
    (resolvedChannel === 'SHOPEE'
      ? 'SHOPEE_STORE'
      : resolvedChannel === 'TIKTOK'
      ? 'TIKTOK_SHOP'
      : resolvedChannel === 'EXCEL_IMPORT'
      ? 'EXCEL_CUSTOM'
      : ['FACEBOOK', 'FACEBOOK_MESSENGER'].includes(resolvedChannel)
      ? 'FANPAGE'
      : 'OTHER');

  // 4. Tạo bản ghi SalesOrder
  const newOrder = await SalesOrder.create({
    orderCode,
    customerId: customer._id,
    conversationId: conversationId || undefined,
    sellerId: user._id,
    // UI labels such as 'ONLINE' are not stored types; anything outside the schema enum is a direct sale.
    orderType: ['DIRECT_SALES', 'EXCHANGE_ORDER', 'POS_SHIP'].includes(orderData.orderType)
      ? orderData.orderType : 'DIRECT_SALES',
    channel: resolvedChannel,
    sourceDetails: {
      ...(orderData.sourceDetails || {}),
      sourceType: resolvedSourceType,
    },
    paymentMethod: orderData.paymentMethod || 'COD',
    paymentStatus: orderData.paymentStatus || 'PENDING',
    notes: orderData.notes || '',
    linkedReturnRequestId: orderData.linkedReturnRequestId || null,
    status: initialStatus,
    statusHistory: [{
      from: 'NONE',
      to: initialStatus,
      by: user._id,
      at: now,
      note: shouldAutoConfirm
        ? 'Tạo và xác nhận chốt đơn ngay (kích hoạt giữ chỗ tồn kho)'
        : 'Tạo đơn hàng mới (chờ khách xác nhận)',
    }],
    isCustomerConfirmed: shouldAutoConfirm,
    customerConfirmedAt: shouldAutoConfirm ? now : undefined,
    confirmedAt: shouldAutoConfirm ? now : undefined,
    shippingRecipient: {
      name: shippingRecipient?.name || customer.fullName,
      phone: cleanPhone || shippingRecipient?.phone || customer.phone || '',
      address: shippingRecipient?.address || (customer.addresses?.[0]?.fullAddress || ''),
    },
    items: processedItems,
    financialSummary: {
      itemsSubtotal,
      shippingFee,
      discountAmount,
      totalOrderAmount,
      expectedCodAmount,
    },
    warehouseFulfillment: {
      carrierName: 'GHN',
      ...(shouldAutoConfirm ? { stockReservedAt: now } : {}),
    },
    codReconciliationStatus: 'UNRECONCILED',
  });

  // 4b. [BR: GBR-10] Nếu autoConfirm = true: khóa giữ chỗ tồn kho nguyên tử (+reservedQty), tạo vận đơn GHN ([BR: GBR-13]) và gửi thông báo chốt đơn vào chat
  //     Nếu đơn đang PENDING (khách chưa chốt): KHÔNG đẩy vận đơn GHN sớm để tránh tự nhảy trạng thái.
  if (shouldAutoConfirm) {
    const reservedSoFar = [];
    const txPayloads = [];
    try {
      for (const item of processedItems) {
        const sku = await Sku.findOneAndUpdate(
          {
            _id: item.skuId,
            $expr: {
              $gte: [
                { $subtract: [{ $ifNull: ['$onHandQty', 0] }, { $ifNull: ['$reservedQty', 0] }] },
                item.orderedQty,
              ],
            },
          },
          { $inc: { reservedQty: item.orderedQty } },
          { new: true }
        ).lean();
        if (!sku) {
          throw new Error(`Sản phẩm ${item.skuCode} vừa có đơn khác chốt trước và không còn đủ tồn khả dụng.`);
        }
        reservedSoFar.push({ skuId: item.skuId, qty: item.orderedQty });
        skuMap.set(String(sku._id), sku);
        txPayloads.push({ item, sku });
      }
    } catch (reserveErr) {
      // Rollback giữ chỗ nếu xảy ra race-condition giữa chừng
      await Promise.all(
        reservedSoFar.map((r) => Sku.findByIdAndUpdate(r.skuId, { $inc: { reservedQty: -r.qty } }))
      );
      await SalesOrder.findByIdAndDelete(newOrder._id);
      throw reserveErr;
    }

    // Sinh mã và ghi sổ cái InventoryTransaction theo lô (giảm số lần round-trip DB)
    const txCodes = await Promise.all(
      txPayloads.map(() => CounterSequence.getNextSequence('INVENTORY_TX', 'TX', 6))
    );
    await InventoryTransaction.insertMany(
      txPayloads.map(({ item, sku }, idx) => ({
        transactionCode: txCodes[idx],
        warehouseType: 'FINISHED_GOODS',
        itemType: 'FINISHED_SKU',
        skuId: sku._id,
        transactionType: 'ORDER_RESERVE',
        referenceModel: 'SalesOrder',
        referenceId: newOrder._id,
        quantityChange: item.orderedQty,
        onHandBefore: sku.onHandQty,
        onHandAfter: sku.onHandQty,
        unitCostSnapshot: sku.unitCogs || 0,
        performedByUserId: user._id,
      }))
    );

    // Chạy song song: đồng bộ GHN (giới hạn thời gian chờ trên luồng chính) + cập nhật thống kê khách hàng + ghi SystemLog
    await Promise.all([
      syncGhnWaybillWithGraceAndNotify({ order: newOrder, userId: user?._id }),
      Customer.findByIdAndUpdate(customer._id, {
        $inc: { totalOrders: 1, totalSpent: totalOrderAmount },
      }),
      recordSystemLog({
        actor: user,
        majorFeature: 'Order Fulfillment',
        subFeature: 'Order Management',
        action: 'CREATE_DIRECT_ORDER',
        targetCollection: 'SalesOrder',
        targetId: newOrder._id,
        targetCode: newOrder.orderCode,
        afterSnapshot: newOrder.toObject(),
        req,
      }),
    ]);
  } else {
    // Đơn PENDING: cập nhật thống kê khách hàng + ghi SystemLog song song
    await Promise.all([
      Customer.findByIdAndUpdate(customer._id, {
        $inc: { totalOrders: 1, totalSpent: totalOrderAmount },
      }),
      recordSystemLog({
        actor: user,
        majorFeature: 'Order Fulfillment',
        subFeature: 'Order Management',
        action: 'CREATE_DIRECT_ORDER',
        targetCollection: 'SalesOrder',
        targetId: newOrder._id,
        targetCode: newOrder.orderCode,
        afterSnapshot: newOrder.toObject(),
        req,
      }),
    ]);
  }

  // [Cảnh báo cho Sale] Tính trực tiếp từ skuMap mới nhất (0 query DB bổ sung)
  const stockWarnings = buildStockWarningsFromSkuMap(processedItems, skuMap)
    .filter((r) => r.shortage || r.belowThreshold);

  return { ...newOrder.toObject(), stockWarnings };
};

/**
 * Cập nhật danh sách sản phẩm và chi tiết đơn hàng khi đang ở trạng thái PENDING (chưa giữ chỗ kho).
 * @businessRule GBR-10 Đơn hàng chỉ được phép sửa sản phẩm khi ở trạng thái PENDING (chưa kích hoạt giữ chỗ). Sau khi xác nhận chốt đơn thì khóa hoàn toàn.
 */
export const updateOrderItemsAndDetails = async (orderId, updateData, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  // [BR: GBR-10] Chỉ cho phép sửa sản phẩm khi đơn đang PENDING (chưa giữ chỗ tồn kho)
  if (order.status !== 'PENDING') {
    throw new Error(`Chỉ có thể chỉnh sửa sản phẩm khi đơn hàng ở trạng thái Chờ xác nhận (chưa chốt đơn). Trạng thái hiện tại: ${getOrderStatusLabel(order.status)}.`);
  }

  const beforeSnapshot = order.toObject();

  // Cập nhật người nhận & ghi chú & hình thức thanh toán
  if (updateData.shippingRecipient) {
    let updatePhone = updateData.shippingRecipient.phone;
    if (updatePhone) {
      updatePhone = String(updatePhone).replace(/\D/g, '');
      if (updatePhone !== '0900000000' && !/^(0[35789])[0-9]{8}$/.test(updatePhone)) {
        throw new Error('Số điện thoại người nhận không hợp lệ. Vui lòng nhập đúng 10 chữ số (đầu số 03, 05, 07, 08, 09).');
      }
    }
    order.shippingRecipient = {
      ...order.shippingRecipient,
      ...updateData.shippingRecipient,
      ...(updatePhone ? { phone: updatePhone } : {}),
    };
  }
  if (updateData.notes !== undefined) order.notes = updateData.notes;
  if (updateData.paymentMethod) order.paymentMethod = updateData.paymentMethod;

  // Cập nhật sản phẩm nếu có truyền danh sách items mới
  if (Array.isArray(updateData.items) && updateData.items.length > 0) {
    let itemsSubtotal = 0;
    const processedItems = [];

    for (const item of updateData.items) {
      const sku = await Sku.findById(item.skuId);
      if (!sku || !sku.isActive) {
        throw new Error(`Sản phẩm SKU ${item.skuId} không tồn tại hoặc đã ngừng kinh doanh`);
      }

      const qty = Math.max(1, Number(item.orderedQty) || 1);
      const salePrice = item.unitSalePrice !== undefined && item.unitSalePrice !== null && !Number.isNaN(Number(item.unitSalePrice))
      ? Number(item.unitSalePrice)
      : sku.retailPrice;

      itemsSubtotal += qty * salePrice;

      processedItems.push({
        skuId: sku._id,
        skuCode: sku.skuCode,
        skuBarcode: sku.skuBarcode,
        productName: item.productName || sku.styleName,
        color: item.color || sku.color,
        size: item.size || sku.size,
        thumbnailUrl: item.thumbnailUrl || sku.thumbnailUrl || '',
        orderedQty: qty,
        unitSalePrice: salePrice,
        unitCogsSnapshot: sku.unitCogs || 0,
        fifoPickList: [],
        packedScannedQty: 0,
      });
    }

    const shippingFee = updateData.financialSummary?.shippingFee !== undefined
      ? Number(updateData.financialSummary.shippingFee)
      : (order.financialSummary?.shippingFee || 0);

    const discountAmount = updateData.financialSummary?.discountAmount !== undefined
      ? Number(updateData.financialSummary.discountAmount)
      : (order.financialSummary?.discountAmount || 0);

    const totalOrderAmount = itemsSubtotal + shippingFee - discountAmount;
    const expectedCodAmount = order.paymentMethod === 'BANK_TRANSFER' ? 0 : totalOrderAmount;

    order.items = processedItems;
    order.financialSummary = {
      itemsSubtotal,
      shippingFee,
      discountAmount,
      totalOrderAmount,
      expectedCodAmount,
    };
  }

  await order.save();

  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'Order Management',
    action: 'UPDATE_ORDER_ITEMS',
    targetCollection: 'SalesOrder',
    targetId: order._id,
    targetCode: order.orderCode,
    beforeSnapshot,
    afterSnapshot: order.toObject(),
    req,
  });

  return order;
};

/**
 * ====================================================================================================================================
 * [BẢNG TRA CỨU LOGIC GIỮ CHỖ TỒN KHO & ĐỒNG BỘ GHN - BE: confirmOrderReserve (UC-79)]
 * ====================================================================================================================================
 * | STT | Bước xử lý                   | Tác động DB (Collection.field)           | Nghiệp vụ / Công thức / BR                                        |
 * |-----|------------------------------|------------------------------------------|-------------------------------------------------------------------|
 * | 1   | Kiểm tra tồn nguyên tử       | skus.{onHandQty, reservedQty}            | [BR: GBR-10] (onHandQty - reservedQty) >= orderedQty              |
 * | 2   | Khóa tồn giữ chỗ & Sổ cái    | skus.reservedQty (+=qty), inventory_tx   | Ghi ORDER_RESERVE (chưa trừ onHandQty; trừ khi đóng gói [GBR-12]) |
 * | 3   | Chuyển trạng thái & GHN      | sales_orders.{status,warehouseFulfillment}| PENDING -> CONFIRMED_RESERVED + tạo mã GHN [BR: GBR-13]          |
 * ====================================================================================================================================
 * @businessRule GBR-10 Chuyển số lượng SKU từ tồn khả dụng sang tồn giữ chỗ khi xác nhận đơn hàng
 * @businessRule GBR-13 Tự động khởi tạo/đồng bộ mã vận đơn GHN cho đơn đã chốt
 */
export const confirmOrderReserve = async (orderId, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  if (order.status !== 'PENDING') {
    throw new Error(`Chỉ có thể xác nhận đơn hàng ở trạng thái PENDING. Trạng thái hiện tại: ${order.status}`);
  }

  const beforeSnapshot = order.toObject();

  // Kiểm tra tồn kho khả dụng cho tất cả SKU trong 1 lần query (tránh N+1)
  const uniqueOrderSkuIds = [...new Set(order.items.map((it) => String(it.skuId)).filter(Boolean))];
  const preCheckSkus = await Sku.find({ _id: { $in: uniqueOrderSkuIds } }).lean();
  const preCheckSkuMap = new Map(preCheckSkus.map((s) => [String(s._id), s]));

  for (const item of order.items) {
    const sku = preCheckSkuMap.get(String(item.skuId));
    if (!sku) {
      throw new Error(`Sản phẩm mã ${item.skuCode} không còn tồn tại trong hệ thống`);
    }

    const available = (sku.onHandQty || 0) - (sku.reservedQty || 0);
    if (available < item.orderedQty) {
      throw new Error(
        `Không thể chốt đơn ${order.orderCode}: sản phẩm ${sku.skuCode} không đủ tồn khả dụng ` +
        `(còn ${available}, khách đặt ${item.orderedQty}, thiếu ${item.orderedQty - available}). ` +
        'Hướng dẫn: (1) báo khách thời gian chờ hàng, (2) giảm số lượng hoặc đổi sang SKU/size khác ở mục chỉnh sửa đơn, ' +
        'hoặc (3) liên hệ Kho để nhập thêm hàng rồi chốt lại.'
      );
    }
  }

  // Tăng tồn giữ chỗ (+reservedQty) nguyên tử và ghi nhận InventoryTransaction (ORDER_RESERVE) theo lô
  const reservedSoFar = [];
  const txPayloads = [];
  try {
    for (const item of order.items) {
      const sku = await Sku.findOneAndUpdate(
        {
          _id: item.skuId,
          $expr: {
            $gte: [
              { $subtract: [{ $ifNull: ['$onHandQty', 0] }, { $ifNull: ['$reservedQty', 0] }] },
              item.orderedQty,
            ],
          },
        },
        { $inc: { reservedQty: item.orderedQty } },
        { new: true }
      ).lean();

      if (!sku) {
        throw new Error(
          `Không thể chốt đơn ${order.orderCode}: sản phẩm ${item.skuCode} vừa có đơn khác chốt trước và không còn đủ tồn khả dụng. ` +
          'Vui lòng làm mới danh sách và kiểm tra lại số lượng.'
        );
      }
      reservedSoFar.push({ skuId: item.skuId, qty: item.orderedQty });
      txPayloads.push({ item, sku });
    }
  } catch (reserveErr) {
    await Promise.all(
      reservedSoFar.map((r) => Sku.findByIdAndUpdate(r.skuId, { $inc: { reservedQty: -r.qty } }))
    );
    throw reserveErr;
  }

  const txCodes = await Promise.all(
    txPayloads.map(() => CounterSequence.getNextSequence('INVENTORY_TX', 'TX', 6))
  );
  await InventoryTransaction.insertMany(
    txPayloads.map(({ item, sku }, idx) => ({
      transactionCode: txCodes[idx],
      warehouseType: 'FINISHED_GOODS',
      itemType: 'FINISHED_SKU',
      skuId: sku._id,
      transactionType: 'ORDER_RESERVE',
      referenceModel: 'SalesOrder',
      referenceId: order._id,
      quantityChange: item.orderedQty,
      onHandBefore: sku.onHandQty,
      onHandAfter: sku.onHandQty,
      unitCostSnapshot: sku.unitCogs || 0,
      performedByUserId: user._id,
    }))
  );

  const prevConfirmStatus = order.status;
  // Cập nhật trạng thái đơn hàng và lưu DB ngay trước khi gọi dịch vụ ngoài
  order.status = 'CONFIRMED_RESERVED';
  order.statusHistory = [
    ...(order.statusHistory || []),
    {
      from: prevConfirmStatus,
      to: 'CONFIRMED_RESERVED',
      by: user?._id,
      at: new Date(),
      note: 'Xác nhận chốt đơn và kích hoạt giữ chỗ tồn kho',
    },
  ];
  order.isCustomerConfirmed = true;
  order.customerConfirmedAt = new Date();
  order.confirmedAt = new Date();
  order.warehouseFulfillment = {
    ...(order.warehouseFulfillment?.toObject ? order.warehouseFulfillment.toObject() : order.warehouseFulfillment),
    carrierName: 'GHN',
    stockReservedAt: new Date(),
  };

  await order.save();

  // [BR: GBR-13] Đồng bộ GHN có giới hạn thời gian chờ + gửi thông báo chat không chặn luồng + ghi SystemLog song song
  const sideEffects = [
    recordSystemLog({
      actor: user,
      majorFeature: 'Order Fulfillment',
      subFeature: 'Order Management',
      action: 'CONFIRM_ORDER_RESERVE',
      targetCollection: 'SalesOrder',
      targetId: order._id,
      targetCode: order.orderCode,
      beforeSnapshot,
      afterSnapshot: order.toObject(),
      req,
    }),
  ];

  if (order.orderType !== 'POS_DIRECT') {
    const existingWaybill = order.warehouseFulfillment?.waybillCode;
    if (!existingWaybill) {
      sideEffects.push(syncGhnWaybillWithGraceAndNotify({ order, userId: user?._id }));
    } else {
      fireOrderConfirmedChatNotify(order, existingWaybill, user?._id);
      void ghnService
        .getOrderDetail(existingWaybill)
        .then((detailRes) => {
          if (!detailRes?.status) return null;
          return SalesOrder.findByIdAndUpdate(order._id, {
            $set: {
              'warehouseFulfillment.ghnStatus': detailRes.status,
              'warehouseFulfillment.ghnStatusName': detailRes.statusName,
              'warehouseFulfillment.ghnUpdatedAt': new Date(),
            },
          });
        })
        .catch((ghnErr) => {
          console.warn(`⚠️ [GHN Confirm Sync] Không thể đồng bộ vận đơn GHN cho đơn ${order.orderCode}:`, ghnErr.message);
        });
    }
  } else {
    fireOrderConfirmedChatNotify(order, null, user?._id);
  }

  await Promise.all(sideEffects);

  return order;
};

/**
 * Đồng bộ mã vận đơn & trạng thái Realtime trực tiếp từ GHN API cho 1 đơn hàng:
 * - Nếu đơn chưa có waybillCode: tự động đẩy đơn lên GHN (không đẩy 30k ship) để lấy order_code về,
 *   lưu vào DB và bắn tin nhắn vận đơn cho khách.
 * - Nếu đơn đã có waybillCode: gọi ghnService.getOrderDetail(waybillCode) để lấy trạng thái realtime từ GHN,
 *   cập nhật trạng thái đơn hàng theo GHN và bắn tin nhắn cho khách nếu trạng thái thay đổi.
 */
export const syncOrderWithGhn = async (orderId, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  if (order.orderType === 'POS_DIRECT' || order.channel === 'POS' || order.channel === 'POS_OFFLINE') {
    const orderObj = order.toObject ? order.toObject() : order;
    return {
      ...orderObj,
      chatNotified: false,
    };
  }

  if (order.status === 'PENDING') {
    throw new Error('Đơn hàng đang ở trạng thái Chờ xác nhận. Vui lòng xác nhận chốt đơn trước khi tạo hoặc đồng bộ vận đơn GHN.');
  }

  let waybillCode = (order.warehouseFulfillment?.waybillCode || '').trim();
  let ghnStatus = 'ready_to_pick';
  let ghnStatusName = 'Chờ lấy hàng';
  let codAmount = undefined;

  if (!waybillCode) {
    const rec = order.shippingRecipient || {};
    const hasMaskedRecipient = [rec.name, rec.phone, rec.address].some((v) => String(v || '').includes('*'));
    if (hasMaskedRecipient) {
      throw new Error('Thông tin người nhận đang bị sàn che (***). Vui lòng bổ sung Tên, SĐT và Địa chỉ thật trước khi tạo vận đơn GHN.');
    }

    const createRes = await ghnService.createShippingOrderFromSalesOrder(order);
    waybillCode = createRes.waybillCode;
    ghnStatus = createRes.ghnStatus || 'ready_to_pick';
    ghnStatusName = createRes.ghnStatusName || 'Chờ lấy hàng';
  } else {
    const detailRes = await ghnService.getOrderDetail(waybillCode);
    ghnStatus = detailRes.status || order.warehouseFulfillment?.ghnStatus || 'ready_to_pick';
    ghnStatusName = detailRes.statusName || order.warehouseFulfillment?.ghnStatusName;
    codAmount = detailRes.codAmount;
  }

  const syncRes = await applyGhnStatusToSalesOrder({
    order,
    ghnStatus,
    waybillCode,
    codAmount,
    sendChatNotification: true,
  });

  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'GHN Realtime Sync',
    action: 'SYNC_ORDER_WITH_GHN',
    targetCollection: 'SalesOrder',
    targetId: order._id,
    targetCode: order.orderCode,
    afterSnapshot: {
      waybillCode,
      ghnStatus,
      orderStatus: syncRes.order.status,
    },
    req,
  });

  const orderResult = syncRes.order?.toObject ? syncRes.order.toObject() : syncRes.order;
  orderResult.chatNotified = Boolean(syncRes.chatMessage);
  return orderResult;
};

/**
 * Chuyển trạng thái vận đơn trên GHN (Sandbox / Webhook Flow) và đồng bộ trạng thái SalesOrder + bắn tin cho khách
 */
export const switchOrderGhnStatus = async (orderId, targetGhnStatus, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  const cleanGhnStatus = String(targetGhnStatus || '').toLowerCase().trim();
  if (!cleanGhnStatus) {
    throw new Error('Vui lòng chọn trạng thái GHN cần chuyển đổi.');
  }

  // [BR: GBR-10] Nếu đơn đang PENDING và chuyển sang trạng thái GHN đang lấy/giao -> kích hoạt giữ chỗ kho trước
  if (order.status === 'PENDING' && cleanGhnStatus !== 'cancel') {
    await confirmOrderReserve(orderId, user, req);
  }

  const freshOrder = await SalesOrder.findById(orderId);
  let waybillCode = (freshOrder.warehouseFulfillment?.waybillCode || '').trim();

  // Nếu chưa có mã vận đơn GHN -> tự động tạo trên GHN API trước
  if (!waybillCode) {
    const createRes = await ghnService.createShippingOrderFromSalesOrder(freshOrder);
    waybillCode = createRes.waybillCode;
  }

  // Gọi GHN devSwitchStatus
  await ghnService.devSwitchStatus(waybillCode, cleanGhnStatus);

  // Đồng bộ trạng thái vào SalesOrder và bắn tin nhắn tự động cho khách
  const syncRes = await applyGhnStatusToSalesOrder({
    order: freshOrder,
    ghnStatus: cleanGhnStatus,
    waybillCode,
    sendChatNotification: true,
  });

  const orderResult = syncRes.order?.toObject ? syncRes.order.toObject() : syncRes.order;
  orderResult.chatNotified = Boolean(syncRes.chatMessage);
  return orderResult;
};

/**
 * ====================================================================================================================================
 * [BẢNG TRA CỨU LOGIC HỦY ĐƠN & GIẢI PHÓNG TỒN KHO - BE: cancelOrder (UC-81)]
 * ====================================================================================================================================
 * | STT | Bước xử lý                   | Tác động DB (Collection.field)           | Nghiệp vụ / Công thức / BR                                        |
 * |-----|------------------------------|------------------------------------------|-------------------------------------------------------------------|
 * | 1   | Điều kiện được phép hủy      | sales_orders.{status, ghnStatus}         | [BR: GBR-11] Chỉ hủy PENDING/CONFIRMED/PICKING & shipper chưa lấy |
 * | 2   | Nhả tồn giữ chỗ về khả dụng  | skus.reservedQty (-=qty), inventory_tx   | Ghi ORDER_CANCEL_RELEASE khi đơn đã giữ chỗ; PENDING không đổi    |
 * | 3   | Hoàn trừ thống kê khách hàng | customers.{totalOrders, totalSpent}      | totalOrders -= 1; totalSpent -= financialSummary.totalOrderAmount |
 * ====================================================================================================================================
 * @businessRule GBR-11 Đơn hàng bị hủy tự động giải phóng tồn kho giữ chỗ về lại tồn khả dụng. Bắt buộc lý do hủy và chỉ hủy khi shipper chưa lấy hàng.
 */
export const cancelOrder = async (orderId, cancelReason, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  if (!cancelReason || !cancelReason.trim()) {
    throw new Error('Vui lòng nhập lý do hủy đơn hàng.');
  }

  if (order.status === 'CANCELLED') {
    throw new Error('Đơn hàng này đã bị hủy trước đó.');
  }

  // Đơn chỉ hủy khi shipper chưa lấy hàng (PENDING, CONFIRMED_RESERVED, PICKING và GHN chưa lấy hàng)
  const ghnStatus = String(order.warehouseFulfillment?.ghnStatus || '').toLowerCase().trim();
  const isPickedByCarrier =
    GHN_PICKED_UP_STATUSES.includes(ghnStatus) ||
    ['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED', 'COMPLETED', 'RETURN_REQUESTED', 'EXCHANGE_REQUESTED', 'RETURNED', 'RETURN_COMPLETED', 'PARTIALLY_RETURNED', 'RETURN_FAILED'].includes(order.status);

  if (isPickedByCarrier) {
    throw new Error('Không thể hủy đơn hàng vì shipper đã lấy kiện hàng đi giao. Chức năng hủy đơn chỉ có thể thực hiện khi hàng chưa rời kho (trước khi shipper lấy hàng). Nếu muốn thu hồi đơn này, vui lòng liên hệ trực tiếp với bộ phận vận chuyển để hỗ trợ.');
  }

  if (!['PENDING', 'CONFIRMED_RESERVED', 'PICKING'].includes(order.status)) {
    throw new Error(`Không thể hủy đơn hàng đang ở trạng thái "${getOrderStatusLabel(order.status)}". Chức năng hủy đơn chỉ có thể thực hiện đối với đơn hàng chưa xuất kho giao đi.`);
  }

  const beforeSnapshot = order.toObject();

  // [BR: GBR-11] Đơn đã giữ chỗ (CONFIRMED_RESERVED / PICKING): nhả reservedQty của từng SKU về lại tồn khả dụng
  if (['CONFIRMED_RESERVED', 'PICKING'].includes(order.status)) {
    for (const item of order.items) {
      const sku = await Sku.findByIdAndUpdate(
        item.skuId,
        { $inc: { reservedQty: -item.orderedQty } },
        { new: true }
      );

      const txCode = await CounterSequence.getNextSequence('INVENTORY_TX', 'TX', 6);
      await InventoryTransaction.create({
        transactionCode: txCode,
        warehouseType: 'FINISHED_GOODS',
        itemType: 'FINISHED_SKU',
        skuId: item.skuId,
        transactionType: 'ORDER_CANCEL_RELEASE',
        referenceModel: 'SalesOrder',
        referenceId: order._id,
        quantityChange: -item.orderedQty,
        onHandBefore: sku ? sku.onHandQty : 0,
        onHandAfter: sku ? sku.onHandQty : 0,
        unitCostSnapshot: sku ? sku.unitCogs : 0,
        performedByUserId: user._id,
      });
    }
  }

  const prevCancelStatus = order.status;
  // Cập nhật trạng thái đơn và lý do hủy
  order.status = 'CANCELLED';
  order.cancelReason = cancelReason.trim();
  order.canceledByUserId = user?._id;
  order.canceledAt = new Date();
  order.statusHistory = [
    ...(order.statusHistory || []),
    {
      from: prevCancelStatus,
      to: 'CANCELLED',
      by: user?._id,
      at: new Date(),
      note: `Hủy đơn: ${cancelReason.trim()}`,
    },
  ];

  // Đồng bộ trạng thái hủy sang GHN nếu đơn đã có mã vận đơn
  if (order.warehouseFulfillment?.waybillCode) {
    try {
      await ghnService.devSwitchStatus(order.warehouseFulfillment.waybillCode, 'cancel');
      order.warehouseFulfillment.ghnStatus = 'cancel';
      order.warehouseFulfillment.ghnStatusName = 'Đã hủy';
      order.warehouseFulfillment.ghnUpdatedAt = new Date();
    } catch (swErr) {
      console.warn('⚠️ [GHN devSwitchStatus Cancel]:', swErr.message);
    }
  }

  await order.save();

  // Gửi thông báo tự động hủy đơn hàng vào khung chat khách hàng (nếu có hội thoại Facebook)
  try {
    await notificationTemplateService.sendOrderNotificationToChat({
      order,
      messageText: notificationTemplateService.buildOrderCancelledText(order, cancelReason.trim()),
      notificationType: 'ORDER_CANCELLED',
      senderSellerId: user?._id,
    });
  } catch (notifyErr) {
    console.warn('⚠️ Lỗi gửi thông báo hủy đơn tự động vào chat:', notifyErr.message);
  }

  // Hoàn lại tích lũy của khách hàng
  await Customer.findByIdAndUpdate(order.customerId, {
    $inc: {
      totalOrders: -1,
      totalSpent: -order.financialSummary.totalOrderAmount,
    },
  });

  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'Order Management',
    action: 'CANCEL_ORDER',
    targetCollection: 'SalesOrder',
    targetId: order._id,
    targetCode: order.orderCode,
    beforeSnapshot,
    afterSnapshot: { ...order.toObject(), cancelReason },
    req,
  });

  return order;
};

/**
 * ====================================================================================================================================
 * [BẢNG TRA CỨU LOGIC ĐƠN BÁN TẠI QUẦY POS - BE: createPosDirectOrder]
 * ====================================================================================================================================
 * | STT | Bước xử lý                   | Tác động DB (Collection.field)           | Nghiệp vụ / Công thức / BR                                        |
 * |-----|------------------------------|------------------------------------------|-------------------------------------------------------------------|
 * | 1   | Kiểm tra tồn khả dụng        | skus.{onHandQty, reservedQty}            | [BR: GBR-10] onHandQty - reservedQty >= orderedQty                |
 * | 2   | Tính tiền đơn POS            | sales_orders.financialSummary            | sub=Σ(qty*price); ship=0đ; total=sub-discount; COD=0đ             |
 * | 3   | Trừ kho ngay & Hoàn tất      | skus.onHandQty (-=qty), status=COMPLETED | Ghi POS_DIRECT_SALE; customers.totalOrders+=1, totalSpent+=total  |
 * ====================================================================================================================================
 * @businessRule GBR-10 Kiểm tra tồn khả dụng trước khi xuất kho bán tại quầy
 */
export const createPosDirectOrder = async (posData, user, req) => {
  const { customerId, items, shippingRecipient, financialSummary = {}, paymentMethod = 'CASH', notes = '' } = posData;

  let customer = null;
  if (customerId) {
    customer = await Customer.findById(customerId);
  }
  if (!customer) {
    // Nếu không chọn khách cụ thể, tìm hoặc tạo khách vãng lai bán lẻ tại quầy
    customer = await Customer.findOne({ customerCode: 'CUST-WALKIN' });
    if (!customer) {
      customer = await Customer.create({
        customerCode: 'CUST-WALKIN',
        fullName: shippingRecipient?.name || 'Khách vãng lai POS',
        phone: shippingRecipient?.phone || '0900000000',
        notes: 'Khách mua trực tiếp tại quầy AraStore',
      });
    }
  }

  if (!items || items.length === 0) {
    throw new Error('Đơn bán tại quầy phải có ít nhất 1 sản phẩm');
  }

  let itemsSubtotal = 0;
  const processedItems = [];

  // 1. Kiểm tra tồn kho khả dụng cho toàn bộ SKU trước khi trừ
  for (const item of items) {
    const sku = await Sku.findById(item.skuId);
    if (!sku || !sku.isActive) {
      throw new Error(`Sản phẩm SKU ${item.skuId} không tồn tại hoặc đã ngừng kinh doanh`);
    }

    const qty = Math.max(1, Number(item.orderedQty) || 1);
    const available = (sku.onHandQty || 0) - (sku.reservedQty || 0);
    if (available < qty) {
      throw new Error(`Sản phẩm ${sku.skuCode} không đủ tồn khả dụng tại quầy (Tồn khả dụng: ${available}, Cần: ${qty})`);
    }

    const salePrice = item.unitSalePrice !== undefined && item.unitSalePrice !== null && !Number.isNaN(Number(item.unitSalePrice))
      ? Number(item.unitSalePrice)
      : sku.retailPrice;
    itemsSubtotal += qty * salePrice;

    processedItems.push({
      skuId: sku._id,
      skuCode: sku.skuCode,
      skuBarcode: sku.skuBarcode,
      productName: item.productName || sku.styleName,
      color: item.color || sku.color,
      size: item.size || sku.size,
      thumbnailUrl: item.thumbnailUrl || sku.thumbnailUrl || '',
      orderedQty: qty,
      unitSalePrice: salePrice,
      unitCogsSnapshot: sku.unitCogs || 0,
      fifoPickList: [],
      packedScannedQty: qty,
    });
  }

  const discountAmount = Number(financialSummary.discountAmount) || 0;
  const totalOrderAmount = itemsSubtotal - discountAmount;

  // 2. Sinh mã đơn POS-xxxxx
  const orderCode = await CounterSequence.getNextSequence('ORDER_CODE_POS', 'POS', 5);

  // 3. Tạo bản ghi SalesOrder trạng thái COMPLETED
  const newOrder = await SalesOrder.create({
    orderCode,
    customerId: customer._id,
    sellerId: user._id,
    orderType: 'POS_DIRECT',
    channel: 'POS_OFFLINE',
    status: 'COMPLETED',
    statusHistory: [{
      from: 'NONE',
      to: 'COMPLETED',
      by: user._id,
      at: new Date(),
      note: 'Tạo đơn bán lẻ trực tiếp tại quầy AraStore POS',
    }],
    isCustomerConfirmed: true,
    customerConfirmedAt: new Date(),
    confirmedAt: new Date(),
    paymentMethod,
    paymentStatus: 'PAID',
    notes: notes || 'Bán lẻ tại quầy AraStore',
    shippingRecipient: {
      name: shippingRecipient?.name || customer.fullName,
      phone: shippingRecipient?.phone || customer.phone,
      address: shippingRecipient?.address || 'Nhận trực tiếp tại quầy AraStore',
    },
    items: processedItems,
    financialSummary: {
      itemsSubtotal,
      shippingFee: 0,
      discountAmount,
      totalOrderAmount,
      expectedCodAmount: 0,
    },
    warehouseFulfillment: {
      packedAt: new Date(),
      packedByStaffId: user._id,
    },
    codReconciliationStatus: 'MATCHED',
  });

  // 4. Trừ trực tiếp onHandQty và ghi nhận InventoryTransaction
  for (const it of processedItems) {
    const sku = await Sku.findByIdAndUpdate(
      it.skuId,
      { $inc: { onHandQty: -it.orderedQty } },
      { new: true }
    );

    const txCode = await CounterSequence.getNextSequence('INVENTORY_TX', 'TX', 6);
    await InventoryTransaction.create({
      transactionCode: txCode,
      warehouseType: 'FINISHED_GOODS',
      itemType: 'FINISHED_SKU',
      skuId: it.skuId,
      transactionType: 'POS_DIRECT_SALE',
      referenceModel: 'SalesOrder',
      referenceId: newOrder._id,
      quantityChange: -it.orderedQty,
      onHandBefore: (sku ? sku.onHandQty : 0) + it.orderedQty,
      onHandAfter: sku ? sku.onHandQty : 0,
      unitCostSnapshot: it.unitCogsSnapshot,
      performedByUserId: user._id,
    });
  }

  await Customer.findByIdAndUpdate(customer._id, {
    $inc: { totalOrders: 1, totalSpent: totalOrderAmount },
  });

  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'Order Management',
    action: 'CREATE_POS_DIRECT_ORDER',
    targetCollection: 'SalesOrder',
    targetId: newOrder._id,
    targetCode: newOrder.orderCode,
    afterSnapshot: newOrder.toObject(),
    req,
  });

  return newOrder;
};

const isOrderFromFacebook = (order) => {
  if (!order) return false;
  const nonFbChannels = ['SHOPEE', 'TIKTOK', 'EXCEL_IMPORT', 'POS_OFFLINE', 'POS', 'ZALO', 'HOTLINE', 'DIRECT_OTHER'];
  const nonFbSources = ['TIKTOK_SHOP', 'SHOPEE_STORE', 'EXCEL_CUSTOM', 'POS'];
  if (nonFbChannels.includes(order.channel) || nonFbSources.includes(order.sourceDetails?.sourceType)) {
    return false;
  }
  return ['FACEBOOK', 'FACEBOOK_MESSENGER'].includes(order.channel) || order.sourceDetails?.sourceType === 'FANPAGE';
};

/**
 * Gửi phiếu xác nhận đơn hàng vào phiên chat Messenger
 */
export const sendOrderConfirmationReceipt = async (orderId, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) throw new Error('Đơn hàng không tồn tại');

  if (!isOrderFromFacebook(order)) {
    throw new Error('Chức năng gửi phiếu xác nhận qua Chat chỉ áp dụng cho đơn hàng từ kênh Facebook.');
  }

  const msgText = notificationTemplateService.buildOrderConfirmationText(order);
  const chatMessage = await notificationTemplateService.sendOrderNotificationToChat({
    order,
    messageText: msgText,
    notificationType: 'CONFIRM_REQUEST',
    senderSellerId: user?._id,
  });

  const isExpired24h = chatMessage?.deliveryStatus === 'FAILED_24H_EXPIRED';
  const message = isExpired24h
    ? 'Đã tạo phiếu trên web, nhưng Messenger chưa nhận được do khách chưa nhắn tin trong vòng 24 giờ qua. Hãy nhờ khách gửi 1 tin nhắn để mở lại kết nối.'
    : 'Đã gửi phiếu xác nhận đơn hàng vào chat thành công!';

  return {
    success: true,
    message,
    chatMessage,
    deliveryStatus: chatMessage?.deliveryStatus || 'DELIVERED',
  };
};

/**
 * Sandbox / Simulator: Giả lập khách hàng nhắn "OK chốt đơn"
 */
export const simulateCustomerConfirm = async (orderId, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) throw new Error('Đơn hàng không tồn tại');

  if (!isOrderFromFacebook(order)) {
    throw new Error('Luồng xác nhận hai chiều qua Chat chỉ áp dụng cho đơn hàng từ Facebook.');
  }

  if (order.status !== 'PENDING') {
    throw new Error(`Đơn hàng hiện tại ở trạng thái ${order.status}, không thể xác nhận lại.`);
  }

  const confirmedOrder = await confirmOrderReserve(orderId, user, req);
  return {
    success: true,
    message: 'Đã giả lập khách hàng xác nhận chốt đơn thành công!',
    order: confirmedOrder,
  };
};

/** Escape ký tự đặc biệt để chuỗi tìm kiếm không bị hiểu là biểu thức RegExp */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Các trường cho phép sắp xếp trên bảng danh sách đơn */
const SORTABLE_FIELDS = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  total: 'financialSummary.totalOrderAmount',
  orderCode: 'orderCode',
};

/**
 * ====================================================================================================================================
 * [BẢNG TRA CỨU NGUỒN GỐC SỐ ĐẾM TRẠNG THÁI & PHÂN TRANG - BE: getOrderList]
 * ====================================================================================================================================
 * | STT | Trường trả về / Bộ lọc       | Màn hình FE hiển thị                     | Nguồn DB (Collection.field)                       | Nghiệp vụ / Công thức                             |
 * |-----|------------------------------|------------------------------------------|---------------------------------------------------|---------------------------------------------------|
 * | 1   | statusCounts[status]         | Dải nút đếm Status (SellerOrdersPage)    | SalesOrder.aggregate($match baseQuery, $group)    | Đếm số đơn từng status (độc lập tab status bấm)   |
 * | 2   | statusCounts.ALL             | Pill "Tất cả (N)" (SellerOrdersPage)     | Tổng hợp từ kết quả aggregate statusCounts        | Σ statusCounts[status]                            |
 * | 3   | items[] & pagination         | Bảng đơn hàng & phân trang               | SalesOrder.find(query) + countDocuments(query)    | Seller mặc định chỉ thấy đơn sellerId=user._id    |
 * ====================================================================================================================================
 * @async
 * @function getOrderList
 * @param {Object} filters - { status, search, page, limit, customerId, fromDate, toDate, sortBy, sortDir, viewAll }.
 * @param {Object} user - Người dùng đang đăng nhập (req.user).
 * @returns {Promise<{items: Array, pagination: Object, statusCounts: Object}>}
 */
export const getOrderList = async (filters, user) => {
  const { status, search, page = 1, limit = 20 } = filters;
  const baseQuery = {};

  // 1. Phạm vi dữ liệu: Seller mặc định chỉ thấy đơn của mình
  if (user.roleCode === 'SELLER') {
    if (filters.viewAll !== 'true') {
      baseQuery.sellerId = user._id;
    }
  } else if (filters.sellerId) {
    baseQuery.sellerId = new mongoose.Types.ObjectId(filters.sellerId);
  }

  if (filters.customerId) baseQuery.customerId = new mongoose.Types.ObjectId(filters.customerId);

  // Lọc theo Kênh / Nguồn đơn hàng (Shopee, TikTok, Facebook, POS...)
  let channelCondition = null;
  if (filters.channel && filters.channel !== 'ALL') {
    if (filters.channel === 'POS') {
      channelCondition = { $or: [{ orderType: 'POS_DIRECT' }, { channel: 'POS_OFFLINE' }] };
    } else if (filters.channel === 'ONLINE') {
      baseQuery.channel = { $nin: ['POS_OFFLINE'] };
      baseQuery.orderType = { $ne: 'POS_DIRECT' };
    } else if (filters.channel === 'FACEBOOK') {
      channelCondition = {
        $or: [
          { channel: { $in: ['FACEBOOK', 'FACEBOOK_MESSENGER'] } },
          { 'sourceDetails.sourceType': 'FANPAGE' },
        ],
      };
    } else if (filters.channel === 'SHOPEE') {
      channelCondition = {
        $or: [
          { channel: 'SHOPEE' },
          { 'sourceDetails.sourceType': 'SHOPEE_STORE' },
        ],
      };
    } else if (filters.channel === 'TIKTOK') {
      channelCondition = {
        $or: [
          { channel: 'TIKTOK' },
          { 'sourceDetails.sourceType': 'TIKTOK_SHOP' },
        ],
      };
    } else if (filters.channel === 'EXCEL_IMPORT') {
      channelCondition = {
        $or: [
          { channel: 'EXCEL_IMPORT' },
          { 'sourceDetails.sourceType': 'EXCEL_CUSTOM' },
          { 'sourceDetails.importBatchCode': { $exists: true, $ne: null } },
        ],
      };
    } else {
      baseQuery.channel = filters.channel;
    }
  }

  // Lọc theo Nguồn cụ thể (ID Fanpage / TikTok Shop / Shopee Mall)
  if (filters.sourceId && filters.sourceId !== 'ALL') {
    baseQuery['sourceDetails.sourceId'] = filters.sourceId;
  }

  // Lọc theo Trạng thái duyệt của Kho đối với đơn import
  if (filters.importStatus && filters.importStatus !== 'ALL') {
    baseQuery.importStatus = filters.importStatus;
  }

  if (filters.fromDate || filters.toDate) {
    baseQuery.createdAt = {};
    if (filters.fromDate) baseQuery.createdAt.$gte = new Date(filters.fromDate);
    if (filters.toDate) {
      const end = new Date(filters.toDate);
      end.setHours(23, 59, 59, 999);
      baseQuery.createdAt.$lte = end;
    }
  }

  // 2. Tìm kiếm theo mã đơn / tên / SĐT người nhận / mã SKU / mã đơn sàn
  let searchCondition = null;
  if (search && search.trim()) {
    const re = new RegExp(escapeRegex(search.trim()), 'i');
    searchCondition = {
      $or: [
        { orderCode: re },
        { 'sourceDetails.externalOrderCode': re },
        { 'sourceDetails.sourceName': re },
        { 'shippingRecipient.name': re },
        { 'shippingRecipient.phone': re },
        { 'items.skuCode': re },
      ],
    };
  }

  // Kết hợp điều kiện kênh và tìm kiếm không bị ghi đè $or
  if (channelCondition && searchCondition) {
    baseQuery.$and = [channelCondition, searchCondition];
  } else if (channelCondition) {
    Object.assign(baseQuery, channelCondition);
  } else if (searchCondition) {
    Object.assign(baseQuery, searchCondition);
  }

  const query = status ? { ...baseQuery, status } : baseQuery;
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(200, Math.max(1, Number(limit)));
  const sortField = SORTABLE_FIELDS[filters.sortBy] || 'createdAt';
  const sortDir = filters.sortDir === 'asc' ? 1 : -1;

  const [orders, total, countsAgg] = await Promise.all([
    SalesOrder.find(query)
      .populate('customerId', 'customerCode fullName phone facebookPsid')
      .populate('sellerId', 'employeeCode fullName email')
      .populate('items.skuId', 'skuCode styleName color size')
      .sort({ [sortField]: sortDir, _id: sortDir })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    SalesOrder.countDocuments(query),
    // 3. Đếm theo trạng thái trên cùng phạm vi lọc (bỏ qua bộ lọc status)
    SalesOrder.aggregate([{ $match: baseQuery }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const statusCounts = countsAgg.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});
  statusCounts.ALL = countsAgg.reduce((sum, c) => sum + c.count, 0);

  return {
    items: orders,
    statusCounts,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  };
};

/**
 * Lấy chi tiết đơn hàng theo ID
 */
export const getOrderById = async (orderId) => {
  const order = await SalesOrder.findById(orderId)
    .populate('customerId')
    .populate('sellerId', 'employeeCode fullName email')
    .populate('statusHistory.by', 'employeeCode fullName roleCode')
    .populate('items.skuId')
    .lean();

  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  return order;
};

/**
 * Cập nhật thông tin người nhận (Tên, SĐT, Địa chỉ thật) cho đơn chưa bàn giao vận chuyển.
 * Hữu ích khi đơn import từ sàn TMĐT bị che thông tin (***) cần bổ sung dữ liệu thật trước khi đẩy GHN.
 */
export const updateOrderRecipient = async (orderId, recipientData, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  const EDITABLE_STATUSES = ['PENDING', 'CONFIRMED_RESERVED', 'PICKING', 'PACKED'];
  if (!EDITABLE_STATUSES.includes(order.status)) {
    throw new Error(
      `Không thể sửa thông tin người nhận khi đơn hàng đang ở trạng thái ${getOrderStatusLabel(order.status)}.`
    );
  }

  const currentGhnStatus = String(order.warehouseFulfillment?.ghnStatus || '').toLowerCase();
  if (currentGhnStatus && currentGhnStatus !== 'ready_to_pick') {
    throw new Error(
      `Đơn hàng đã được GHN tiếp nhận vận chuyển (${order.warehouseFulfillment.waybillCode || ''} - ${currentGhnStatus}), không thể sửa thông tin người nhận.`
    );
  }

  // Nếu trước đó đã lỡ tạo mã vận đơn nháp (ready_to_pick) với thông tin cũ/bị che -> hủy nháp & reset để đồng bộ lại với thông tin thật
  if (order.warehouseFulfillment?.waybillCode && (!currentGhnStatus || currentGhnStatus === 'ready_to_pick')) {
    try {
      await ghnService.devSwitchStatus(order.warehouseFulfillment.waybillCode, 'cancel');
    } catch {
      // Không chặn cập nhật nếu GHN sandbox không hỗ trợ hủy nháp
    }
    order.warehouseFulfillment.waybillCode = '';
    order.warehouseFulfillment.ghnStatus = '';
    order.warehouseFulfillment.ghnStatusName = '';
    order.warehouseFulfillment.ghnUpdatedAt = null;
  }

  const beforeRecipient = {
    name: order.shippingRecipient?.name || '',
    phone: order.shippingRecipient?.phone || '',
    address: order.shippingRecipient?.address || '',
  };

  const cleanName = String(recipientData.name || '').trim();
  const cleanPhone = String(recipientData.phone || '').trim();
  const cleanAddress = String(recipientData.address || '').trim();

  order.shippingRecipient = {
    name: cleanName,
    phone: cleanPhone,
    address: cleanAddress,
  };

  // Đồng bộ hoặc gộp khách hàng nếu bản ghi Customer hiện tại đang lưu SĐT bị che (*)
  if (order.customerId) {
    const currentCustomer = await Customer.findById(order.customerId);
    if (currentCustomer && (String(currentCustomer.phone || '').includes('*') || currentCustomer.phone === '0900000000')) {
      const existingRealCustomer = await Customer.findOne({
        _id: { $ne: currentCustomer._id },
        phone: cleanPhone,
      });

      if (existingRealCustomer) {
        order.customerId = existingRealCustomer._id;
      } else {
        currentCustomer.fullName = cleanName;
        currentCustomer.phone = cleanPhone;
        currentCustomer.addresses = [
          {
            recipientName: cleanName,
            phone: cleanPhone,
            fullAddress: cleanAddress,
            isDefault: true,
          },
        ];
        await currentCustomer.save();
      }
    }
  }

  order.statusHistory = [
    ...(order.statusHistory || []),
    {
      from: order.status,
      to: order.status,
      by: user?._id || null,
      at: new Date(),
      note: `Cập nhật thông tin người nhận: ${cleanName} (${cleanPhone})`,
    },
  ];

  await order.save();

  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'Order Management',
    action: 'UPDATE_ORDER_RECIPIENT',
    targetCollection: 'SalesOrder',
    targetId: order._id,
    targetCode: order.orderCode,
    beforeSnapshot: beforeRecipient,
    afterSnapshot: order.shippingRecipient,
    req,
  });

  return getOrderById(order._id);
};

/**
 * Gửi tin nhắn hỏi xác nhận khách hàng trước khi hủy đơn hàng (chỉ áp dụng đơn Facebook)
 */
export const sendCancelConfirmationInquiry = async (orderId, reason = '', user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) throw new Error('Đơn hàng không tồn tại');

  if (!isOrderFromFacebook(order)) {
    throw new Error('Chức năng gửi tin nhắn hỏi xác nhận hủy qua Chat chỉ áp dụng cho đơn hàng từ kênh Facebook.');
  }

  if (!['PENDING', 'CONFIRMED_RESERVED', 'PICKING'].includes(order.status)) {
    throw new Error('Đơn hàng hiện không ở trạng thái cho phép hủy.');
  }

  const msgText = notificationTemplateService.buildOrderCancelInquiryText(order, String(reason || '').trim());
  const chatMessage = await notificationTemplateService.sendOrderNotificationToChat({
    order,
    messageText: msgText,
    notificationType: 'CANCEL_INQUIRY',
    senderSellerId: user?._id,
  });

  const isExpired24h = chatMessage?.deliveryStatus === 'FAILED_24H_EXPIRED';
  const message = isExpired24h
    ? 'Đã ghi nhận tin nhắn trên web, nhưng Messenger chưa nhận được do quá khung 24h Meta.'
    : 'Đã gửi tin nhắn hỏi xác nhận hủy đơn vào khung chat Messenger của khách!';

  return {
    success: true,
    message,
    chatMessage,
    deliveryStatus: chatMessage?.deliveryStatus || 'DELIVERED',
  };
};

export default {
  createDirectOrder,
  updateOrderItemsAndDetails,
  updateOrderRecipient,
  confirmOrderReserve,
  syncOrderWithGhn,
  switchOrderGhnStatus,
  cancelOrder,
  createPosDirectOrder,
  sendOrderConfirmationReceipt,
  sendCancelConfirmationInquiry,
  simulateCustomerConfirm,
  getOrderList,
  getOrderById,
};
