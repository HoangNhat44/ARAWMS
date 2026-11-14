/*
 * File: sellerOrderManagement.test.mjs
 * Author: Nguyễn Quang Huy & ARAWMS Team
 * Description: Unit & Integration tests for Seller Order Management (UC-78 to UC-81, POS, RBAC).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { createTestToken } from './support/authSession.mjs';
import Product from '../src/models/Product.model.js';
import Sku from '../src/models/Sku.model.js';
import Customer from '../src/models/Customer.model.js';
import SalesOrder from '../src/models/SalesOrder.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import { ghnService } from '../src/modules/ghn/ghn.service.js';
import notificationTemplateService from '../src/modules/conversational-commerce/chat-interface/notificationTemplate.service.js';

let replSet;
let sellerToken;
let techToken;
let testProduct;
let testSkuInStock;
let testSkuLowStock;

test.before(async () => {
  // Mock external services to keep tests isolated and deterministic
  ghnService.createShippingOrderFromSalesOrder = async (order) => ({
    waybillCode: `GHN-${order?.orderCode || 'TEST001'}`,
    ghnStatus: 'ready_to_pick',
    ghnStatusName: 'Chờ lấy hàng',
    expectedDeliveryTime: new Date(Date.now() + 86400000),
  });
  ghnService.getOrderDetail = async () => ({
    status: 'ready_to_pick',
    statusName: 'Chờ lấy hàng',
  });
  notificationTemplateService.sendOrderNotificationToChat = async () => {};

  // Setup MongoDB replica set in memory
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());

  sellerToken = await createTestToken('SELLER');
  techToken = await createTestToken('GARMENT_TECHNICIAN');

  // Seed sample Product and SKUs
  testProduct = await Product.create({
    productCode: 'SP-SELLER-01',
    productName: 'Áo Thun Nam Cotton AraStore',
    category: 'Áo thun',
    basePrice: 150000,
    isActive: true,
  });

  // SKU 1: Dồi dào tồn kho (onHand: 100, reserved: 0)
  testSkuInStock = await Sku.create({
    skuCode: 'SP-SELLER-01-DEN-M',
    skuBarcode: 'BAR-SELLER-DEN-M',
    productId: testProduct._id,
    styleName: 'Áo Thun Nam Cotton',
    color: 'Đen',
    size: 'M',
    retailPrice: 150000,
    unitCogs: 80000,
    onHandQty: 100,
    reservedQty: 0,
    safetyStockThreshold: 10,
    isActive: true,
  });

  // SKU 2: Tồn kho thấp / thiếu (onHand: 2, reserved: 0)
  testSkuLowStock = await Sku.create({
    skuCode: 'SP-SELLER-01-TRANG-L',
    skuBarcode: 'BAR-SELLER-TRANG-L',
    productId: testProduct._id,
    styleName: 'Áo Thun Nam Cotton',
    color: 'Trắng',
    size: 'L',
    retailPrice: 160000,
    unitCogs: 85000,
    onHandQty: 2,
    reservedQty: 0,
    safetyStockThreshold: 5,
    isActive: true,
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

// ============================================================================
// 1. UC-78: Tạo đơn hàng trực tiếp (Direct Order)
// ============================================================================
test('UC-78: Seller tạo đơn hàng trực tiếp với khách hàng mới thành công', async () => {
  const payload = {
    shippingRecipient: {
      name: 'Nguyễn Văn A',
      phone: '0987654321',
      address: 'Số 123 Đường Cầu Giấy, Hà Nội',
    },
    items: [
      {
        skuId: String(testSkuInStock._id),
        orderedQty: 2,
        unitSalePrice: 150000,
      },
    ],
    financialSummary: {
      discountAmount: 20000,
    },
    paymentMethod: 'COD',
    notes: 'Giao giờ hành chính',
  };

  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send(payload);

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.success, true);
  const order = res.body.data;

  assert.match(order.orderCode, /^ORD-\d+$/);
  assert.equal(order.status, 'PENDING');
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].skuCode, testSkuInStock.skuCode);
  assert.equal(order.items[0].orderedQty, 2);

  // Kiểm tra tính toán tài chính (2 * 150.000 + 30.000 phí ship - 20.000 giảm giá = 310.000)
  assert.equal(order.financialSummary.itemsSubtotal, 300000);
  assert.equal(order.financialSummary.shippingFee, 30000);
  assert.equal(order.financialSummary.discountAmount, 20000);
  assert.equal(order.financialSummary.totalOrderAmount, 310000);

  // Đảm bảo khách hàng được tự động lưu vào DB
  const customer = await Customer.findOne({ phone: '0987654321' });
  assert.ok(customer, 'Customer should be auto-created');
  assert.equal(customer.fullName, 'Nguyễn Văn A');
});

test('UC-78: Cảnh báo thiếu hàng (stockWarnings) khi đặt vượt số lượng tồn khả dụng', async () => {
  const payload = {
    shippingRecipient: {
      name: 'Trần Thị B',
      phone: '0912345678',
      address: 'Đống Đa, Hà Nội',
    },
    items: [
      {
        skuId: String(testSkuLowStock._id),
        orderedQty: 5, // Chỉ có onHand 2, đặt 5 -> thiếu 3
        unitSalePrice: 160000,
      },
    ],
  };

  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send(payload);

  assert.equal(res.status, 201);
  assert.ok(Array.isArray(res.body.data.stockWarnings));
  const warning = res.body.data.stockWarnings.find((w) => w.skuCode === testSkuLowStock.skuCode);
  assert.ok(warning, 'Should have stock warning for low stock SKU');
  assert.equal(warning.shortage, true);
});

test('UC-78: Từ chối tạo đơn khi số điện thoại người nhận sai định dạng', async () => {
  const invalidPayload = {
    shippingRecipient: {
      name: 'Khách Lỗi SĐT',
      phone: '012345678', // Thiếu chữ số, không đúng đầu số VN
      address: 'Hà Nội',
    },
    items: [{ skuId: String(testSkuInStock._id), orderedQty: 1 }],
  };

  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send(invalidPayload);

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('UC-78: Từ chối tạo đơn khi danh sách sản phẩm rỗng', async () => {
  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      shippingRecipient: { name: 'Khách Test', phone: '0977889900' },
      items: [],
    });

  assert.equal(res.status, 400);
  assert.match(res.body.message, /ít nhất một sản phẩm/);
});

// ============================================================================
// 2. Bán lẻ tại quầy POS trực tiếp (POS Direct Order)
// ============================================================================
test('POS: Tạo đơn bán trực tiếp tại quầy AraStore POS và trừ tồn ngay', async () => {
  const initialOnHand = testSkuInStock.onHandQty;
  const posPayload = {
    items: [
      {
        skuId: String(testSkuInStock._id),
        orderedQty: 3,
        unitSalePrice: 150000,
      },
    ],
    financialSummary: { discountAmount: 0 },
    paymentMethod: 'CASH',
  };

  const res = await request(app)
    .post('/api/orders/pos-direct')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send(posPayload);

  assert.equal(res.status, 201, JSON.stringify(res.body));
  const order = res.body.data;
  assert.match(order.orderCode, /^POS-\d+$/);
  assert.equal(order.status, 'COMPLETED');
  assert.equal(order.orderType, 'POS_DIRECT');
  assert.equal(order.financialSummary.shippingFee, 0, 'POS order must not have shipping fee');

  // Đảm bảo onHandQty bị trừ trực tiếp ngay tại quầy
  const updatedSku = await Sku.findById(testSkuInStock._id);
  assert.equal(updatedSku.onHandQty, initialOnHand - 3);

  // Đảm bảo có ghi nhận giao dịch kho POS_DIRECT_SALE
  const tx = await InventoryTransaction.findOne({
    referenceId: order._id,
    transactionType: 'POS_DIRECT_SALE',
  });
  assert.ok(tx, 'InventoryTransaction for POS sale must exist');
});

// ============================================================================
// 3. GBR-08: Chỉnh sửa sản phẩm đơn hàng khi PENDING
// ============================================================================
test('GBR-08: Sửa sản phẩm thành công khi đơn đang PENDING và khóa khi đã chốt', async () => {
  // Tạo đơn ban đầu 1 sản phẩm
  const createRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      shippingRecipient: { name: 'Người Nhận', phone: '0988112233', address: 'HN' },
      items: [{ skuId: String(testSkuInStock._id), orderedQty: 1, unitSalePrice: 150000 }],
    });
  const orderId = createRes.body.data._id;

  // 1. Sửa tăng lên 4 sản phẩm khi còn PENDING
  const updateRes = await request(app)
    .put(`/api/orders/${orderId}/items`)
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      items: [{ skuId: String(testSkuInStock._id), orderedQty: 4, unitSalePrice: 150000 }],
      notes: 'Khách tăng số lượng lên 4 áo',
    });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.data.items[0].orderedQty, 4);
  assert.equal(updateRes.body.data.financialSummary.itemsSubtotal, 600000);

  // 2. Chốt đơn (sang CONFIRMED_RESERVED)
  await request(app)
    .post(`/api/orders/${orderId}/confirm`)
    .set('Authorization', `Bearer ${sellerToken}`);

  // 3. Thử sửa lại sau khi đã chốt đơn -> Phải bị từ chối theo GBR-08
  const tryUpdateAfterConfirm = await request(app)
    .put(`/api/orders/${orderId}/items`)
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      items: [{ skuId: String(testSkuInStock._id), orderedQty: 2 }],
    });
  assert.equal(tryUpdateAfterConfirm.status, 400);
  assert.match(tryUpdateAfterConfirm.body.message, /Chỉ có thể chỉnh sửa sản phẩm khi đơn hàng ở trạng thái Chờ xác nhận/);
});

// ============================================================================
// 4. UC-79 & GBR-10: Xác nhận đơn hàng & Kích hoạt giữ chỗ tồn kho
// ============================================================================
test('UC-79: Chốt đơn thành công khi đủ hàng, tăng reservedQty và ghi transaction', async () => {
  const currentSku = await Sku.findById(testSkuInStock._id);
  const initialReserved = currentSku.reservedQty;

  const createRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      shippingRecipient: { name: 'Chốt Đơn Đủ Hàng', phone: '0966554433', address: 'HN' },
      items: [{ skuId: String(testSkuInStock._id), orderedQty: 2, unitSalePrice: 150000 }],
    });
  const orderId = createRes.body.data._id;

  const confirmRes = await request(app)
    .post(`/api/orders/${orderId}/confirm`)
    .set('Authorization', `Bearer ${sellerToken}`);

  assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.body));
  assert.equal(confirmRes.body.data.status, 'CONFIRMED_RESERVED');
  assert.equal(confirmRes.body.data.isCustomerConfirmed, true);

  // Kiểm tra reservedQty tăng đúng 2 đơn vị
  const updatedSku = await Sku.findById(testSkuInStock._id);
  assert.equal(updatedSku.reservedQty, initialReserved + 2);

  // Kiểm tra ghi nhận giao dịch ORDER_RESERVE
  const reserveTx = await InventoryTransaction.findOne({
    referenceId: orderId,
    transactionType: 'ORDER_RESERVE',
  });
  assert.ok(reserveTx);
  assert.equal(reserveTx.quantityChange, 2);
});

test('UC-79: Từ chối chốt đơn khi tồn kho khả dụng không đủ', async () => {
  // SKU low stock chỉ có onHand 2, tạo đơn đặt 10 chiếc
  const createRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      shippingRecipient: { name: 'Khách Đặt Quá Tồn', phone: '0933221100', address: 'HN' },
      items: [{ skuId: String(testSkuLowStock._id), orderedQty: 10, unitSalePrice: 160000 }],
    });
  const orderId = createRes.body.data._id;

  const confirmRes = await request(app)
    .post(`/api/orders/${orderId}/confirm`)
    .set('Authorization', `Bearer ${sellerToken}`);

  assert.equal(confirmRes.status, 400);
  assert.match(confirmRes.body.message, /không đủ tồn khả dụng/);

  // Đảm bảo trạng thái vẫn là PENDING và không tăng reservedQty
  const order = await SalesOrder.findById(orderId);
  assert.equal(order.status, 'PENDING');
  const sku = await Sku.findById(testSkuLowStock._id);
  assert.equal(sku.reservedQty, 0);
});

// ============================================================================
// 5. UC-81 & GBR-11: Hủy đơn hàng & Giải phóng tồn kho giữ chỗ
// ============================================================================
test('UC-81: Hủy đơn CONFIRMED_RESERVED giải phóng reservedQty và ghi transaction', async () => {
  // 1. Tạo và chốt đơn 3 chiếc
  const createRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      shippingRecipient: { name: 'Đơn Sẽ Hủy', phone: '0944556677', address: 'HN' },
      items: [{ skuId: String(testSkuInStock._id), orderedQty: 3, unitSalePrice: 150000 }],
    });
  const orderId = createRes.body.data._id;
  await request(app).post(`/api/orders/${orderId}/confirm`).set('Authorization', `Bearer ${sellerToken}`);

  const skuBeforeCancel = await Sku.findById(testSkuInStock._id);
  const reservedBefore = skuBeforeCancel.reservedQty;

  // 2. Hủy đơn kèm lý do
  const cancelRes = await request(app)
    .post(`/api/orders/${orderId}/cancel`)
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({ cancelReason: 'Khách đổi ý không mua nữa' });

  assert.equal(cancelRes.status, 200, JSON.stringify(cancelRes.body));
  assert.equal(cancelRes.body.data.status, 'CANCELLED');
  assert.equal(cancelRes.body.data.cancelReason, 'Khách đổi ý không mua nữa');

  // 3. Kiểm tra reservedQty được nhả về đúng 3 chiếc
  const skuAfterCancel = await Sku.findById(testSkuInStock._id);
  assert.equal(skuAfterCancel.reservedQty, reservedBefore - 3);

  // 4. Kiểm tra có transaction ORDER_CANCEL_RELEASE
  const cancelTx = await InventoryTransaction.findOne({
    referenceId: orderId,
    transactionType: 'ORDER_CANCEL_RELEASE',
  });
  assert.ok(cancelTx);
  assert.equal(cancelTx.quantityChange, -3);
});

test('UC-81: Bắt buộc phải có lý do hủy đơn hàng', async () => {
  const createRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      shippingRecipient: { name: 'Thiếu Lý Do Hủy', phone: '0977112233', address: 'HN' },
      items: [{ skuId: String(testSkuInStock._id), orderedQty: 1, unitSalePrice: 150000 }],
    });
  const orderId = createRes.body.data._id;

  const cancelRes = await request(app)
    .post(`/api/orders/${orderId}/cancel`)
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({ cancelReason: '   ' }); // Lý do rỗng

  assert.equal(cancelRes.status, 400);
  assert.match(cancelRes.body.message, /Vui lòng nhập lý do hủy/);
});

// ============================================================================
// 6. Danh sách & Chi tiết đơn hàng
// ============================================================================
test('Danh sách & Chi tiết đơn hàng: Seller xem được danh sách và chi tiết đơn', async () => {
  const listRes = await request(app)
    .get('/api/orders?status=PENDING&limit=5')
    .set('Authorization', `Bearer ${sellerToken}`);

  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.success, true);
  assert.ok(Array.isArray(listRes.body.data.items), 'listRes.body.data.items should be an array');

  if (listRes.body.data.items.length > 0) {
    const firstOrderId = listRes.body.data.items[0]._id;
    const detailRes = await request(app)
      .get(`/api/orders/${firstOrderId}`)
      .set('Authorization', `Bearer ${sellerToken}`);

    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data._id, firstOrderId);
  }
});

// ============================================================================
// 7. Bảo mật & Phân quyền (RBAC)
// ============================================================================
test('RBAC: Chặn khách chưa đăng nhập (401) và chặn vai trò không hợp lệ (403)', async () => {
  // 1. Khách chưa đăng nhập gọi POST /api/orders
  const guestRes = await request(app)
    .post('/api/orders')
    .send({ items: [] });
  assert.equal(guestRes.status, 401, 'Guest must receive 401');

  // 2. Kỹ thuật may (GARMENT_TECHNICIAN) không có quyền tạo đơn hàng Seller
  const wrongRoleRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${techToken}`)
    .send({ items: [] });
  assert.equal(wrongRoleRes.status, 403, 'Garment technician must receive 403');
});

// ============================================================================
// 8. Chống hồi lùi trạng thái (Status Regression Prevention) & CARRIER_PICKED_UP
// ============================================================================
test('GHN Sync & Webhook: Đơn PACKED hoặc HANDED_OVER_CARRIER không bị GHN kéo lùi về CONFIRMED_RESERVED', async () => {
  // 1. Tạo đơn hàng và giả lập kho đã đóng gói (PACKED)
  const createRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      shippingRecipient: { name: 'Khách Đã Đóng Hàng', phone: '0988001122', address: 'Kho HN' },
      items: [{ skuId: String(testSkuInStock._id), orderedQty: 1, unitSalePrice: 150000 }],
    });
  const orderId = createRes.body.data._id;

  // Cập nhật trạng thái đơn thành PACKED nội bộ kho
  await SalesOrder.findByIdAndUpdate(orderId, {
    status: 'PACKED',
    'warehouseFulfillment.waybillCode': 'GHN-TEST-REGRESSION-1',
    'warehouseFulfillment.ghnStatus': 'ready_to_pick',
  });

  // Mock GHN trả về ready_to_pick
  const originalGetOrderDetail = ghnService.getOrderDetail;
  ghnService.getOrderDetail = async () => ({
    status: 'ready_to_pick',
    statusName: 'Chờ lấy hàng',
  });

  try {
    // Gọi sync GHN (như khi mở OrderDetailModal)
    const syncRes = await request(app)
      .post(`/api/orders/${orderId}/sync-ghn`)
      .set('Authorization', `Bearer ${sellerToken}`);

    assert.equal(syncRes.status, 200);
    // Trạng thái đơn NỘI BỘ phải giữ nguyên là PACKED, KHÔNG bị lùi về CONFIRMED_RESERVED
    assert.equal(syncRes.body.data.status, 'PACKED');

    const dbOrder = await SalesOrder.findById(orderId);
    assert.equal(dbOrder.status, 'PACKED', 'Order status must stay PACKED in database');

    // Chuyển đơn sang HANDED_OVER_CARRIER và thử sync lại
    await SalesOrder.findByIdAndUpdate(orderId, { status: 'HANDED_OVER_CARRIER' });
    const syncRes2 = await request(app)
      .post(`/api/orders/${orderId}/sync-ghn`)
      .set('Authorization', `Bearer ${sellerToken}`);

    assert.equal(syncRes2.status, 200);
    assert.equal(syncRes2.body.data.status, 'HANDED_OVER_CARRIER');

    const dbOrder2 = await SalesOrder.findById(orderId);
    assert.equal(dbOrder2.status, 'HANDED_OVER_CARRIER', 'Order status must stay HANDED_OVER_CARRIER');
  } finally {
    ghnService.getOrderDetail = originalGetOrderDetail;
  }
});

test('GHN Sync: Trạng thái picked nâng cấp đơn hàng thành CARRIER_PICKED_UP (Đã lấy hàng)', async () => {
  const createRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      shippingRecipient: { name: 'Khách Chờ Shipper Lấy', phone: '0988001133', address: 'Kho HN' },
      items: [{ skuId: String(testSkuInStock._id), orderedQty: 1, unitSalePrice: 150000 }],
    });
  const orderId = createRes.body.data._id;

  // Đơn đã bàn giao vận chuyển
  await SalesOrder.findByIdAndUpdate(orderId, {
    status: 'HANDED_OVER_CARRIER',
    'warehouseFulfillment.waybillCode': 'GHN-TEST-PICKED-1',
  });

  // Mock GHN báo shipper đã lấy hàng (status: 'picked')
  const originalGetOrderDetail = ghnService.getOrderDetail;
  ghnService.getOrderDetail = async () => ({
    status: 'picked',
    statusName: 'Đã lấy hàng',
  });

  try {
    const syncRes = await request(app)
      .post(`/api/orders/${orderId}/sync-ghn`)
      .set('Authorization', `Bearer ${sellerToken}`);

    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.body.data.status, 'CARRIER_PICKED_UP');

    const dbOrder = await SalesOrder.findById(orderId);
    assert.equal(dbOrder.status, 'CARRIER_PICKED_UP');
    assert.ok(dbOrder.warehouseFulfillment?.carrierPickedUpAt, 'carrierPickedUpAt timestamp must be recorded');
  } finally {
    ghnService.getOrderDetail = originalGetOrderDetail;
  }
});

test('PATCH /api/orders/:id/status đã được gỡ bỏ để chống nhảy bước kho thủ công', async () => {
  const createRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      shippingRecipient: { name: 'Khách Kiểm Tra Kiến Trúc', phone: '0988001144', address: 'Kho HN' },
      items: [{ skuId: String(testSkuInStock._id), orderedQty: 1, unitSalePrice: 150000 }],
    });
  const orderId = createRes.body.data._id;

  const res = await request(app)
    .patch(`/api/orders/${orderId}/status`)
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({ status: 'PACKED' });

  assert.equal(res.status, 404);
});
