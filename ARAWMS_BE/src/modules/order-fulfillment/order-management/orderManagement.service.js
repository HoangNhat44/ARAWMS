/**
 * ============================================================================
 * @title        : Order Management Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
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
import { ORDER_STATUS } from '../../../common/constants/enums.js';
import notificationTemplateService from '../../conversational-commerce/chat-interface/notificationTemplate.service.js';

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
 * UC-78: Tạo đơn hàng bán lẻ trực tiếp từ chat (Create Direct New Order)
 */
export const createDirectOrder = async (orderData, user, req) => {
  const { customerId, conversationId, shippingRecipient, items, financialSummary = {} } = orderData;

  // 1. Kiểm tra khách hàng
  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new Error('Khách hàng không tồn tại');
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

  const shippingFee = Number(financialSummary.shippingFee) || 0;
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
    warehouseFulfillment: {},
    codReconciliationStatus: 'UNRECONCILED',
  });

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

  return newOrder;
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
    throw new Error(`[BR: GBR-08] Chỉ có thể chỉnh sửa sản phẩm khi đơn hàng ở trạng thái PENDING (chưa chốt). Trạng thái hiện tại: ${order.status}`);
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
        `Sản phẩm ${sku.skuCode} không đủ tồn khả dụng (Còn ${available}, yêu cầu ${item.orderedQty})`
      );
    }
  }

  // Tăng tồn giữ chỗ (+reservedQty) và ghi nhận InventoryTransaction (ORDER_RESERVE)
  for (const item of order.items) {
    const sku = await Sku.findByIdAndUpdate(
      item.skuId,
      { $inc: { reservedQty: item.orderedQty } },
      { new: true }
    );

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

  // Cập nhật trạng thái đơn hàng
  order.status = 'CONFIRMED_RESERVED';
  order.isCustomerConfirmed = true;
  order.customerConfirmedAt = new Date();
  order.confirmedAt = new Date();
  order.warehouseFulfillment = {
    ...order.warehouseFulfillment,
    stockReservedAt: new Date(),
  };
  await order.save();

  // Gửi thông báo tự động xác nhận chốt đơn vào chat
  try {
    await notificationTemplateService.sendOrderNotificationToChat({
      order,
      messageText: notificationTemplateService.buildOrderConfirmedSuccessText(order),
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
 * Ma trận chuyển trạng thái hợp lệ của đơn bán lẻ.
 * Trạng thái CANCELLED / RETURNED là trạng thái kết thúc, không thể chuyển tiếp.
 * @constant {Object<string, string[]>}
 */
export const ORDER_STATUS_TRANSITIONS = {
  PENDING: ['CONFIRMED_RESERVED', 'CANCELLED'],
  CONFIRMED_RESERVED: ['PICKING', 'CANCELLED'],
  PICKING: ['PACKED', 'CANCELLED'],
  PACKED: ['HANDED_OVER_CARRIER'],
  HANDED_OVER_CARRIER: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['RETURN_REQUESTED'],
  COMPLETED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

/**
 * Cập nhật thông tin người nhận và/hoặc trạng thái đơn hàng theo ma trận chuyển trạng thái.
 *
 * @async
 * @function updateOrderStatus
 * @param {string} orderId - ID đơn hàng.
 * @param {Object} updateData - { status?, shippingRecipient?, waybillCode?, cancelReason? }.
 * @param {Object} user - Người thực hiện (req.user).
 * @param {Object} [req] - Express Request để ghi log.
 * @returns {Promise<Object>} Đơn hàng sau cập nhật.
 * @throws {Error} Trạng thái không hợp lệ hoặc không được phép chuyển.
 * @businessRule GBR-10 Chuyển sang CONFIRMED_RESERVED phải đi qua luồng giữ chỗ tồn kho.
 * @businessRule GBR-11 Chuyển sang CANCELLED phải đi qua luồng hủy để nhả tồn giữ chỗ.
 * @businessRule GBR-13 Bàn giao vận chuyển bắt buộc có mã vận đơn.
 * @businessRule GBR-23 Ghi SystemLog trước/sau khi cập nhật.
 */
export const updateOrderStatus = async (orderId, updateData, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  const nextStatus = updateData.status;
  if (nextStatus && nextStatus !== order.status) {
    // 1. Trạng thái phải thuộc danh mục hệ thống
    if (!ORDER_STATUS.includes(nextStatus)) {
      throw new Error(`Trạng thái "${nextStatus}" không hợp lệ`);
    }
    // 2. Kiểm tra ma trận chuyển trạng thái
    const allowed = ORDER_STATUS_TRANSITIONS[order.status] || [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(
        `Không thể chuyển đơn từ ${order.status} sang ${nextStatus}` +
        (allowed.length ? ` (cho phép: ${allowed.join(', ')})` : ' (đơn đã ở trạng thái kết thúc)')
      );
    }
    // 3. [BR: GBR-10] / [BR: GBR-11] Uỷ quyền cho luồng chuyên biệt để xử lý tồn kho
    if (nextStatus === 'CONFIRMED_RESERVED') return confirmOrderReserve(orderId, user, req);
    if (nextStatus === 'CANCELLED') {
      return cancelOrder(orderId, updateData.cancelReason || 'Seller cập nhật trạng thái Hủy', user, req);
    }
  }

  const beforeSnapshot = order.toObject();

  // Cho phép cập nhật thông tin người nhận nếu chưa đóng gói
  if (updateData.shippingRecipient && !['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED'].includes(order.status)) {
    order.shippingRecipient = {
      ...order.shippingRecipient,
      ...updateData.shippingRecipient,
    };
  }

  if (nextStatus && nextStatus !== order.status) {
    // [BR: GBR-13] Bàn giao cho hãng vận chuyển bắt buộc có mã vận đơn
    if (nextStatus === 'HANDED_OVER_CARRIER') {
      const waybill = (updateData.waybillCode || order.warehouseFulfillment?.waybillCode || '').trim();
      if (!waybill) throw new Error('[BR: GBR-13] Vui lòng nhập mã vận đơn trước khi bàn giao vận chuyển');
      order.warehouseFulfillment.waybillCode = waybill;
      order.warehouseFulfillment.handedOverAt = new Date();

      // Gửi thông báo vận đơn tự động vào chat
      try {
        await notificationTemplateService.sendOrderNotificationToChat({
          order,
          messageText: notificationTemplateService.buildPackingCompletedText(order, waybill),
          notificationType: 'PACKED_WAYBILL',
          senderSellerId: user?._id,
        });
      } catch (notifyErr) {
        console.warn('⚠️ Lỗi gửi thông báo vận đơn:', notifyErr.message);
      }
    }
    if (nextStatus === 'PACKED') {
      order.warehouseFulfillment.packedAt = new Date();
      order.warehouseFulfillment.packedByStaffId = user._id;
    }
    order.status = nextStatus;
  }

  await order.save();

  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'Order Management',
    action: 'UPDATE_ORDER_STATUS',
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
    throw new Error('[BR: GBR-08] Bắt buộc phải nhập lý do hủy đơn hàng.');
  }

  // Không cho phép hủy khi đã đóng gói, đang giao, đã giao hoặc đã hoàn thành
  if (['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.status)) {
    throw new Error(`[BR: GBR-08] Không thể hủy đơn hàng ở trạng thái ${order.status}. Chỉ có thể hủy đơn trước khi đóng gói (PENDING, CONFIRMED_RESERVED, PICKING).`);
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

  // Cập nhật trạng thái đơn và lý do hủy
  order.status = 'CANCELLED';
  order.cancelReason = cancelReason.trim();
  order.canceledByUserId = user?._id;
  order.canceledAt = new Date();
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

  if (filters.fromDate || filters.toDate) {
    baseQuery.createdAt = {};
    if (filters.fromDate) baseQuery.createdAt.$gte = new Date(filters.fromDate);
    if (filters.toDate) {
      const end = new Date(filters.toDate);
      end.setHours(23, 59, 59, 999);
      baseQuery.createdAt.$lte = end;
    }
  }

  // 2. Tìm kiếm theo mã đơn / tên / SĐT người nhận / mã SKU
  if (search && search.trim()) {
    const re = new RegExp(escapeRegex(search.trim()), 'i');
    baseQuery.$or = [
      { orderCode: re },
      { 'shippingRecipient.name': re },
      { 'shippingRecipient.phone': re },
      { 'items.skuCode': re },
    ];
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
  updateOrderStatus,
  cancelOrder,
  createPosDirectOrder,
  sendOrderConfirmationReceipt,
  simulateCustomerConfirm,
  getOrderList,
  getOrderById,
};
