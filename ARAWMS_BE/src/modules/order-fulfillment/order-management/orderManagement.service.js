/**
 * ============================================================================
 * @title        : Order Management Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-14
 * @description  : Xử lý toàn bộ logic nghiệp vụ cốt lõi cho phân hệ Seller Order:
 *                 tạo đơn hàng (UC-78), xác nhận giữ chỗ tồn kho (UC-79, GBR-10),
 *                 cập nhật trạng thái (UC-80), hủy đơn và giải phóng tồn kho (UC-81, GBR-11),
 *                 ghi nhận SystemLog kiểm toán (GBR-23).
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
 * Ghi SystemLog kiểm toán
 * @businessRule GBR-23 Ghi log kiểm toán cho dữ liệu trọng yếu
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
 * Đánh giá tồn kho khả dụng của danh sách sản phẩm trong đơn.
 * - shortage: không đủ hàng (khả dụng < số đặt)
 * - belowThreshold: còn đủ nhưng sau đơn sẽ thấp hơn ngưỡng cảnh báo tồn (Sku.safetyStockThreshold)
 *
 * @param {Array<{skuId: any, orderedQty: number}>} items
 * @returns {Promise<Array<Object>>} Mỗi phần tử: { skuCode, available, requested, remainingAfter, threshold, shortage, belowThreshold, message }
 */
export const evaluateStockForItems = async (items = []) => {
  const results = [];
  for (const item of items) {
    const sku = await Sku.findById(item.skuId).select('skuCode onHandQty reservedQty safetyStockThreshold');
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

/**
 * UC-78: Tạo đơn hàng bán lẻ trực tiếp từ chat (Create Direct New Order)
 */
export const createDirectOrder = async (orderData, user, req) => {
  const { customerId, conversationId, shippingRecipient, items, financialSummary = {} } = orderData;

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

  // 2. Validate từng SKU và snapshot giá vốn / thông tin
  let itemsSubtotal = 0;
  const processedItems = [];

  for (const item of items) {
    const sku = await Sku.findById(item.skuId);
    if (!sku || !sku.isActive) {
      throw new Error(`Sản phẩm SKU ${item.skuId} không tồn tại hoặc đã ngừng kinh doanh`);
    }

    const qty = Number(item.orderedQty) || 1;
    const salePrice = Number(item.unitSalePrice) !== undefined ? Number(item.unitSalePrice) : sku.retailPrice;

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

  // Phí ship mặc định nội bộ là 30.000đ cho đơn Online (0đ cho POS). Tuyệt đối không đẩy phí này lên API GHN.
  const isPosOrder = orderData.orderType === 'POS_DIRECT';
  const shippingFee = isPosOrder
    ? 0
    : (financialSummary.shippingFee !== undefined && financialSummary.shippingFee !== null
        ? Number(financialSummary.shippingFee)
        : DEFAULT_INTERNAL_SHIPPING_FEE);
  const discountAmount = Number(financialSummary.discountAmount) || 0;
  const totalOrderAmount = itemsSubtotal + shippingFee - discountAmount;
  const expectedCodAmount = orderData.paymentMethod === 'BANK_TRANSFER' ? 0 : totalOrderAmount;

  // 3. Sinh mã đơn nguyên tử qua CounterSequence (ORD-00001)
  const orderCode = await CounterSequence.getNextSequence('ORDER_CODE', 'ORD', 5);

  // 4. Tạo bản ghi SalesOrder
  const newOrder = await SalesOrder.create({
    orderCode,
    customerId: customer._id,
    conversationId: conversationId || undefined,
    sellerId: user._id,
    orderType: orderData.orderType || 'DIRECT_SALES',
    channel: orderData.channel || 'FACEBOOK_MESSENGER',
    paymentMethod: orderData.paymentMethod || 'COD',
    paymentStatus: orderData.paymentStatus || 'PENDING',
    notes: orderData.notes || '',
    linkedReturnRequestId: orderData.linkedReturnRequestId || null,
    status: 'PENDING',
    statusHistory: [{
      from: 'NONE',
      to: 'PENDING',
      by: user._id,
      at: new Date(),
      note: 'Tạo đơn hàng mới',
    }],
    isCustomerConfirmed: false,
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
    },
    codReconciliationStatus: 'UNRECONCILED',
  });

  // 4b. Tự động đẩy đơn lên GHN API để lấy mã vận đơn (order_code) và trạng thái realtime từ GHN
  //     (Lưu ý: GhnService chỉ đẩy tiền hàng thuần, KHÔNG đẩy phí ship 30k lên GHN)
  if (!isPosOrder) {
    try {
      const ghnRes = await ghnService.createShippingOrderFromSalesOrder(newOrder);
      if (ghnRes?.waybillCode) {
        newOrder.warehouseFulfillment = {
          ...(newOrder.warehouseFulfillment?.toObject ? newOrder.warehouseFulfillment.toObject() : newOrder.warehouseFulfillment),
          carrierName: 'GHN',
          waybillCode: ghnRes.waybillCode,
          ghnStatus: ghnRes.ghnStatus || 'ready_to_pick',
          ghnStatusName: ghnRes.ghnStatusName || 'Chờ lấy hàng',
          ghnUpdatedAt: new Date(),
          ghnExpectedDeliveryTime: ghnRes.expectedDeliveryTime ? new Date(ghnRes.expectedDeliveryTime) : undefined,
        };
        await newOrder.save();

        // Bắn tin nhắn thông báo mã vận đơn & trạng thái GHN cho khách qua Chat
        try {
          await notificationTemplateService.sendOrderNotificationToChat({
            order: newOrder,
            messageText: notificationTemplateService.buildGhnStatusUpdateText(
              newOrder,
              newOrder.warehouseFulfillment.ghnStatus,
              ghnRes.waybillCode
            ),
            notificationType: 'GHN_READY_TO_PICK',
            senderSellerId: user?._id,
          });
        } catch (chatErr) {
          console.warn('⚠️ [GHN Auto-Notify on Create]:', chatErr.message);
        }
      }
    } catch (ghnErr) {
      console.warn(`⚠️ [GHN Auto-Create Waybill] Chưa lấy được mã vận đơn GHN ngay khi tạo đơn ${newOrder.orderCode}:`, ghnErr.message);
    }
  }

  // 5. Cập nhật chỉ số khách hàng
  await Customer.findByIdAndUpdate(customer._id, {
    $inc: { totalOrders: 1, totalSpent: totalOrderAmount },
  });

  // 6. Ghi SystemLog
  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'Order Management',
    action: 'CREATE_DIRECT_ORDER',
    targetCollection: 'SalesOrder',
    targetId: newOrder._id,
    targetCode: newOrder.orderCode,
    afterSnapshot: newOrder.toObject(),
    req,
  });

  // [Cảnh báo cho Sale] Báo ngay khi sản phẩm trong đơn hết hàng / dưới ngưỡng tồn
  const stockWarnings = (await evaluateStockForItems(processedItems))
    .filter((r) => r.shortage || r.belowThreshold);

  return { ...newOrder.toObject(), stockWarnings };
};

/**
 * Cập nhật danh sách sản phẩm và chi tiết đơn hàng khi đang ở trạng thái PENDING
 * @businessRule GBR-08 Đơn hàng chỉ được phép sửa sản phẩm khi ở trạng thái PENDING. Sau khi xác nhận chốt đơn thì khóa hoàn toàn.
 */
export const updateOrderItemsAndDetails = async (orderId, updateData, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  // [BR: GBR-08] Chỉ cho phép sửa sản phẩm khi PENDING
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
      const salePrice = Number(item.unitSalePrice) !== undefined ? Number(item.unitSalePrice) : sku.retailPrice;

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
 * UC-79: Xác nhận đơn hàng & Kích hoạt giữ chỗ tồn kho (+ReservedQty)
 * Confirm Order Creation & Stock Reservation
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

  // Kiểm tra tồn kho khả dụng cho tất cả SKU trước
  for (const item of order.items) {
    const sku = await Sku.findById(item.skuId);
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

  // Tăng tồn giữ chỗ (+reservedQty) nguyên tử và ghi nhận InventoryTransaction (ORDER_RESERVE)
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
    );

    if (!sku) {
      throw new Error(
        `Không thể chốt đơn ${order.orderCode}: sản phẩm ${item.skuCode} vừa có đơn khác chốt trước và không còn đủ tồn khả dụng. ` +
        'Vui lòng làm mới danh sách và kiểm tra lại số lượng.'
      );
    }

    const txCode = await CounterSequence.getNextSequence('INVENTORY_TX', 'TX', 6);
    await InventoryTransaction.create({
      transactionCode: txCode,
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
    });
  }

  const prevConfirmStatus = order.status;
  // Cập nhật trạng thái đơn hàng
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

  // [GBR-10] Tự động lấy mã vận đơn (order_code) từ GHN API nếu đơn chưa có, hoặc đồng bộ trạng thái realtime từ GHN
  if (order.orderType !== 'POS_DIRECT') {
    try {
      const existingWaybill = order.warehouseFulfillment?.waybillCode;
      if (!existingWaybill) {
        const ghnRes = await ghnService.createShippingOrderFromSalesOrder(order);
        if (ghnRes?.waybillCode) {
          order.warehouseFulfillment.waybillCode = ghnRes.waybillCode;
          order.warehouseFulfillment.ghnStatus = ghnRes.ghnStatus || 'ready_to_pick';
          order.warehouseFulfillment.ghnStatusName = ghnRes.ghnStatusName || 'Chờ lấy hàng';
          order.warehouseFulfillment.ghnUpdatedAt = new Date();
          if (ghnRes.expectedDeliveryTime) {
            order.warehouseFulfillment.ghnExpectedDeliveryTime = new Date(ghnRes.expectedDeliveryTime);
          }
        }
      } else {
        const detailRes = await ghnService.getOrderDetail(existingWaybill);
        if (detailRes?.status) {
          order.warehouseFulfillment.ghnStatus = detailRes.status;
          order.warehouseFulfillment.ghnStatusName = detailRes.statusName;
          order.warehouseFulfillment.ghnUpdatedAt = new Date();
        }
      }
    } catch (ghnErr) {
      console.warn(`⚠️ [GHN Confirm Sync] Không thể lấy/đồng bộ vận đơn GHN cho đơn ${order.orderCode}:`, ghnErr.message);
    }
  }

  await order.save();

  // Gửi thông báo tự động xác nhận chốt đơn kèm mã vận đơn GHN vào chat
  try {
    const waybillText = order.warehouseFulfillment?.waybillCode
      ? `\nMã vận đơn GHN: ${order.warehouseFulfillment.waybillCode}`
      : '';
    await notificationTemplateService.sendOrderNotificationToChat({
      order,
      messageText: `${notificationTemplateService.buildOrderConfirmedSuccessText(order)}${waybillText}`,
      notificationType: 'CONFIRMED_SUCCESS',
      senderSellerId: user?._id,
    });
  } catch (notifyErr) {
    console.warn('⚠️ Lỗi gửi thông báo chốt đơn tự động:', notifyErr.message);
  }

  await recordSystemLog({
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
  });

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

  let waybillCode = (order.warehouseFulfillment?.waybillCode || '').trim();
  let ghnStatus = 'ready_to_pick';
  let ghnStatusName = 'Chờ lấy hàng';
  let codAmount = undefined;

  if (!waybillCode) {
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

  // Nếu đơn đang PENDING và chuyển sang trạng thái GHN đang lấy/giao -> kích hoạt giữ chỗ kho theo GBR-07 trước
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
 * UC-81: Hủy đơn hàng & Giải phóng tồn kho giữ chỗ (-ReservedQty)
 * Cancel Order & Stock Release
 * @businessRule GBR-08 / GBR-11 Bắt buộc phải có lý do hủy đơn. Chỉ cho phép hủy khi chưa đóng gói.
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
    ['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED', 'COMPLETED', 'RETURN_REQUESTED', 'EXCHANGE_REQUESTED', 'RETURNED'].includes(order.status);

  if (isPickedByCarrier) {
    throw new Error('Không thể hủy đơn hàng vì shipper đã lấy kiện hàng đi giao. Chức năng hủy đơn chỉ có thể thực hiện khi hàng chưa rời kho (trước khi shipper lấy hàng). Nếu muốn thu hồi đơn này, vui lòng liên hệ trực tiếp với bộ phận vận chuyển để hỗ trợ.');
  }

  if (!['PENDING', 'CONFIRMED_RESERVED', 'PICKING'].includes(order.status)) {
    throw new Error(`Không thể hủy đơn hàng đang ở trạng thái "${getOrderStatusLabel(order.status)}". Chức năng hủy đơn chỉ có thể thực hiện đối với đơn hàng chưa xuất kho giao đi.`);
  }

  const beforeSnapshot = order.toObject();

  // [BR: GBR-08] Đơn đã giữ chỗ (CONFIRMED_RESERVED / PICKING): nhả reservedQty của từng SKU
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
 * Tạo đơn bán lẻ trực tiếp tại quầy AraStore POS (Khách lấy hàng ngay)
 * Trừ trực tiếp onHandQty (không qua bước giữ chỗ), trạng thái COMPLETED.
 * @businessRule GBR-07 / GBR-08 / Offline POS Flow
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

    const salePrice = Number(item.unitSalePrice) !== undefined ? Number(item.unitSalePrice) : sku.retailPrice;
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

/**
 * Gửi phiếu xác nhận đơn hàng vào phiên chat Messenger
 */
export const sendOrderConfirmationReceipt = async (orderId, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) throw new Error('Đơn hàng không tồn tại');

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
 * Tra cứu danh sách đơn hàng kèm số lượng theo từng trạng thái (phục vụ thanh tab lọc).
 *
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

export default {
  createDirectOrder,
  updateOrderItemsAndDetails,
  confirmOrderReserve,
  syncOrderWithGhn,
  switchOrderGhnStatus,
  cancelOrder,
  createPosDirectOrder,
  sendOrderConfirmationReceipt,
  simulateCustomerConfirm,
  getOrderList,
  getOrderById,
};
