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
  const expectedCodAmount = totalOrderAmount;

  // 3. Sinh mã đơn nguyên tử qua CounterSequence (ORD-00001)
  const orderCode = await CounterSequence.getNextSequence('ORDER_CODE', 'ORD', 5);

  // 4. Tạo bản ghi SalesOrder
  const newOrder = await SalesOrder.create({
    orderCode,
    customerId: customer._id,
    conversationId: conversationId || undefined,
    sellerId: user._id,
    orderType: orderData.orderType || 'DIRECT_SALES',
    linkedReturnRequestId: orderData.linkedReturnRequestId || null,
    status: 'PENDING',
    shippingRecipient: {
      name: shippingRecipient?.name || customer.fullName,
      phone: shippingRecipient?.phone || customer.phone,
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
  order.warehouseFulfillment = {
    ...order.warehouseFulfillment,
    stockReservedAt: new Date(),
  };
  await order.save();

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
 * UC-80: Cập nhật thông tin nhận hàng hoặc trạng thái đơn hàng
 */
export const updateOrderStatus = async (orderId, updateData, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  const beforeSnapshot = order.toObject();

  // Cho phép cập nhật thông tin người nhận nếu chưa đóng gói
  if (updateData.shippingRecipient && !['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED'].includes(order.status)) {
    order.shippingRecipient = {
      ...order.shippingRecipient,
      ...updateData.shippingRecipient,
    };
  }

  if (updateData.status && updateData.status !== order.status) {
    order.status = updateData.status;
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
 */
export const cancelOrder = async (orderId, cancelReason, user, req) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  // Không cho phép hủy khi đã đóng gói hoặc đang giao
  if (['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED', 'CANCELLED'].includes(order.status)) {
    throw new Error(`Không thể hủy đơn hàng ở trạng thái ${order.status}`);
  }

  const beforeSnapshot = order.toObject();

  // Nếu đơn đã ở CONFIRMED_RESERVED: Nhả reservedQty của từng SKU
  if (order.status === 'CONFIRMED_RESERVED') {
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

  // Cập nhật trạng thái đơn
  order.status = 'CANCELLED';
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
 * Tra cứu danh sách đơn hàng
 */
export const getOrderList = async (filters, user) => {
  const { status, search, page = 1, limit = 20 } = filters;
  const query = {};

  if (user.roleCode === 'SELLER') {
    if (filters.viewAll !== 'true') {
      query.sellerId = user._id;
    }
  } else if (filters.sellerId) {
    query.sellerId = filters.sellerId;
  }

  if (status) query.status = status;
  if (filters.customerId) query.customerId = filters.customerId;

  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { orderCode: new RegExp(s, 'i') },
      { 'shippingRecipient.name': new RegExp(s, 'i') },
      { 'shippingRecipient.phone': new RegExp(s, 'i') },
    ];
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

  const orders = await SalesOrder.find(query)
    .populate('customerId', 'customerCode fullName phone')
    .populate('sellerId', 'employeeCode fullName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const total = await SalesOrder.countDocuments(query);

  return {
    items: orders,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
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
  confirmOrderReserve,
  updateOrderStatus,
  cancelOrder,
  getOrderList,
  getOrderById,
};
