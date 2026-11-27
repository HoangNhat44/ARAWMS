/*
 * File: sellerOrderAndMarketplace.unit.test.mjs
 * Author: Nguyễn Quang Huy & ARAWMS Team
 * Description: Self-contained Service Unit Tests for Seller Order Fulfillment &
 *              Marketplace Order Import (UC-11 to UC-17).
 *              Each test wipes collections in beforeEach, uses fresh ObjectIds,
 *              and mocks external GHN / Chat notification calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { MongoMemoryServer } from 'mongodb-memory-server';

import Role from '../src/models/Role.model.js';
import User from '../src/models/User.model.js';
import Product from '../src/models/Product.model.js';
import Sku from '../src/models/Sku.model.js';
import Customer from '../src/models/Customer.model.js';
import SalesOrder from '../src/models/SalesOrder.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import { ghnService } from '../src/modules/ghn/ghn.service.js';
import notificationTemplateService from '../src/modules/conversational-commerce/chat-interface/notificationTemplate.service.js';

import orderService, { evaluateStockForItems } from '../src/modules/order-fulfillment/order-management/orderManagement.service.js';
import * as marketplaceService from '../src/modules/order-fulfillment/marketplace-order-import/marketplaceOrderImport.service.js';

let mongoServer;
const origCreateGhn = ghnService.createShippingOrderFromSalesOrder;
const origGetGhn = ghnService.getOrderDetail;
const origSwitchGhn = ghnService.devSwitchStatus;
const origSendNotify = notificationTemplateService.sendOrderNotificationToChat;

async function createUser(roleCode = 'SELLER') {
  const role = await Role.findOneAndUpdate(
    { roleCode },
    { $setOnInsert: { roleName: roleCode, isActive: true } },
    { upsert: true, new: true }
  );
  const uid = randomUUID().slice(0, 8).toUpperCase();
  return User.create({
    employeeCode: `${roleCode.slice(0, 3)}-${uid}`,
    fullName: `User ${uid}`,
    email: `user-${uid}@test.local`,
    roleId: role._id,
    roleCode,
    status: 'ACTIVE',
  });
}

async function seedSku(overrides = {}) {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const product = await Product.create({
    productCode: `SP${suffix}`,
    productName: `Váy ${suffix}`,
    category: 'Váy',
    basePrice: 200000,
    isActive: true,
  });
  const sku = await Sku.create({
    skuCode: `SP${suffix}-DEN-M`,
    skuBarcode: `BAR-${suffix}`,
    productId: product._id,
    styleName: product.productName,
    color: 'Đen',
    size: 'M',
    retailPrice: 200000,
    unitCogs: 100000,
    onHandQty: 50,
    reservedQty: 0,
    safetyStockThreshold: 10,
    isActive: true,
    ...overrides,
  });
  return { product, sku };
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri('arawms_seller_order_unit'));
});

test.beforeEach(async () => {
  ghnService.createShippingOrderFromSalesOrder = async (order) => ({
    waybillCode: `GHN-${order.orderCode}`,
    ghnStatus: 'ready_to_pick',
    ghnStatusName: 'Chờ lấy hàng',
  });
  ghnService.getOrderDetail = async () => ({ status: 'ready_to_pick', statusName: 'Chờ lấy hàng' });
  ghnService.devSwitchStatus = async () => ({ ok: true });
  notificationTemplateService.sendOrderNotificationToChat = async () => ({ deliveryStatus: 'DELIVERED' });

  for (const col of Object.values(mongoose.connection.collections)) {
    await col.deleteMany({});
  }
});

test.after(async () => {
  ghnService.createShippingOrderFromSalesOrder = origCreateGhn;
  ghnService.getOrderDetail = origGetGhn;
  ghnService.devSwitchStatus = origSwitchGhn;
  notificationTemplateService.sendOrderNotificationToChat = origSendNotify;
  await mongoose.disconnect();
  await mongoServer?.stop();
});

// ============================================================================
// 1. ORDER MANAGEMENT SERVICE
// ============================================================================

test('[N][A][B] evaluateStockForItems: detects healthy stock, belowThreshold boundary, shortage, and skips unknown SKU', async () => {
  const { sku: okSku } = await seedSku({ onHandQty: 30, reservedQty: 0, safetyStockThreshold: 10 });
  const { sku: edgeSku } = await seedSku({ onHandQty: 12, reservedQty: 0, safetyStockThreshold: 10 });
  const { sku: shortSku } = await seedSku({ onHandQty: 3, reservedQty: 1, safetyStockThreshold: 10 });

  const results = await evaluateStockForItems([
    { skuId: okSku._id, orderedQty: 20 }, // remaining 10 === threshold -> NOT belowThreshold
    { skuId: edgeSku._id, orderedQty: 3 }, // remaining 9 < threshold -> belowThreshold
    { skuId: shortSku._id, orderedQty: 5 }, // available 2 < 5 -> shortage
    { skuId: new mongoose.Types.ObjectId(), orderedQty: 1 }, // missing -> skipped
  ]);

  assert.equal(results.length, 3);
  assert.equal(results[0].shortage, false);
  assert.equal(results[0].belowThreshold, false);
  assert.equal(results[1].shortage, false);
  assert.equal(results[1].belowThreshold, true);
  assert.equal(results[2].shortage, true);
});

test('[N][A] createDirectOrder: handles PENDING, autoConfirm reservation, BANK_TRANSFER expectedCod=0, and rejects invalid inputs', async () => {
  const seller = await createUser('SELLER');
  const { sku } = await seedSku({ onHandQty: 10, reservedQty: 0 });
  const { sku: inactiveSku } = await seedSku({ isActive: false });

  // 1. PENDING order with BANK_TRANSFER -> expectedCodAmount = 0, does not reserve stock yet
  const pending = await orderService.createDirectOrder(
    {
      shippingRecipient: { name: 'Nguyễn An', phone: '0987654321', address: '12 Cầu Giấy, HN' },
      items: [{ skuId: sku._id, orderedQty: 2, unitSalePrice: 200000 }],
      financialSummary: { discountAmount: 10000 },
      paymentMethod: 'BANK_TRANSFER',
      autoConfirm: false,
    },
    seller
  );
  assert.equal(pending.status, 'PENDING');
  assert.equal(pending.financialSummary.totalOrderAmount, 420000); // 400k + 30k ship - 10k
  assert.equal(pending.financialSummary.expectedCodAmount, 0);
  assert.equal((await Sku.findById(sku._id)).reservedQty, 0);

  // 2. autoConfirm = true reserves stock immediately and generates GHN waybill
  const confirmed = await orderService.createDirectOrder(
    {
      shippingRecipient: { name: 'Nguyễn Bình', phone: '0912345678', address: '20 Xuân Thủy, HN' },
      items: [{ skuId: sku._id, orderedQty: 4, unitSalePrice: 200000 }],
      autoConfirm: true,
    },
    seller
  );
  assert.equal(confirmed.status, 'CONFIRMED_RESERVED');
  assert.equal(confirmed.warehouseFulfillment.waybillCode, `GHN-${confirmed.orderCode}`);
  assert.equal((await Sku.findById(sku._id)).reservedQty, 4);

  // 3. Abnormal: autoConfirm fails when available (6) < orderedQty (8)
  await assert.rejects(
    () =>
      orderService.createDirectOrder(
        {
          shippingRecipient: { name: 'Thiếu Kho', phone: '0933444555', address: 'HN' },
          items: [{ skuId: sku._id, orderedQty: 8, unitSalePrice: 200000 }],
          autoConfirm: true,
        },
        seller
      ),
    /không đủ tồn khả dụng/
  );

  // 4. Abnormal: missing customer, empty items, invalid phone, inactive SKU
  await assert.rejects(() => orderService.createDirectOrder({ items: [{ skuId: sku._id, orderedQty: 1 }] }, seller), /Số điện thoại/);
  await assert.rejects(
    () => orderService.createDirectOrder({ shippingRecipient: { name: 'A', phone: '0987654321' }, items: [] }, seller),
    /ít nhất một sản phẩm/
  );
  await assert.rejects(
    () =>
      orderService.createDirectOrder(
        { shippingRecipient: { name: 'A', phone: '0281234567', address: 'HN' }, items: [{ skuId: sku._id, orderedQty: 1, unitSalePrice: 200000 }] },
        seller
      ),
    /Số điện thoại người nhận không hợp lệ/
  );
  await assert.rejects(
    () =>
      orderService.createDirectOrder(
        { shippingRecipient: { name: 'A', phone: '0987654321', address: 'HN' }, items: [{ skuId: inactiveSku._id, orderedQty: 1, unitSalePrice: 200000 }] },
        seller
      ),
    /ngừng kinh doanh/
  );
});

test('[N][A] updateOrderItemsAndDetails: edits PENDING order items/recipient and rejects non-PENDING orders', async () => {
  const seller = await createUser('SELLER');
  const { sku } = await seedSku({ onHandQty: 20 });

  const order = await orderService.createDirectOrder(
    {
      shippingRecipient: { name: 'Khách A', phone: '0987654321', address: 'HN' },
      items: [{ skuId: sku._id, orderedQty: 1, unitSalePrice: 200000 }],
    },
    seller
  );

  const updated = await orderService.updateOrderItemsAndDetails(
    order._id,
    {
      items: [{ skuId: sku._id, orderedQty: 3, unitSalePrice: 180000 }],
      shippingRecipient: { phone: '0911222333' },
      paymentMethod: 'BANK_TRANSFER',
    },
    seller
  );
  assert.equal(updated.items[0].orderedQty, 3);
  assert.equal(updated.financialSummary.itemsSubtotal, 540000);
  assert.equal(updated.financialSummary.expectedCodAmount, 0);
  assert.equal(updated.shippingRecipient.phone, '0911222333');

  // Abnormal: invalid phone during update
  await assert.rejects(
    () => orderService.updateOrderItemsAndDetails(order._id, { shippingRecipient: { phone: '01234' } }, seller),
    /không hợp lệ/
  );

  // Confirm order -> editing must now be rejected
  await orderService.confirmOrderReserve(order._id, seller);
  await assert.rejects(
    () => orderService.updateOrderItemsAndDetails(order._id, { items: [{ skuId: sku._id, orderedQty: 2, unitSalePrice: 180000 }] }, seller),
    /Chờ xác nhận/
  );
});

test('[N][A] updateOrderRecipient: updates editable order, resets ready_to_pick waybill, merges masked customer, rejects DELIVERED or GHN picked', async () => {
  const seller = await createUser('SELLER');
  const { sku } = await seedSku({ onHandQty: 20 });

  const maskedCust = await Customer.create({ customerCode: 'CUST-MASK', fullName: 'N***n', phone: '0987***321' });
  const realCust = await Customer.create({ customerCode: 'CUST-REAL', fullName: 'Nguyễn Thật', phone: '0977888999' });

  const order = await SalesOrder.create({
    orderCode: 'ORD-REC1',
    customerId: maskedCust._id,
    sellerId: seller._id,
    status: 'CONFIRMED_RESERVED',
    shippingRecipient: { name: 'N***n', phone: '0987***321', address: 'H***' },
    warehouseFulfillment: { waybillCode: 'GHN-DRAFT-1', ghnStatus: 'ready_to_pick' },
    items: [{ skuId: sku._id, skuCode: sku.skuCode, skuBarcode: sku.skuBarcode, orderedQty: 1, unitSalePrice: 200000 }],
    financialSummary: { itemsSubtotal: 200000, shippingFee: 0, totalOrderAmount: 200000, expectedCodAmount: 200000 },
  });

  // Normal: merges customerId to existing real-phone customer & resets ready_to_pick waybill
  const updated = await orderService.updateOrderRecipient(
    order._id,
    { name: 'Nguyễn Thật', phone: '0977888999', address: '123 Cầu Giấy, Hà Nội' },
    seller
  );
  assert.equal(updated.shippingRecipient.phone, '0977888999');
  assert.equal(updated.warehouseFulfillment.waybillCode, '');
  assert.equal(String(updated.customerId._id), String(realCust._id));

  // Abnormal: GHN already picked -> blocked
  await SalesOrder.findByIdAndUpdate(order._id, { 'warehouseFulfillment.ghnStatus': 'delivering' });
  await assert.rejects(
    () => orderService.updateOrderRecipient(order._id, { name: 'A', phone: '0977888999', address: 'Địa chỉ mới' }, seller),
    /GHN tiếp nhận/
  );

  // Abnormal: DELIVERED order -> blocked
  await SalesOrder.findByIdAndUpdate(order._id, { status: 'DELIVERED', 'warehouseFulfillment.ghnStatus': '' });
  await assert.rejects(
    () => orderService.updateOrderRecipient(order._id, { name: 'A', phone: '0977888999', address: 'Địa chỉ mới' }, seller),
    /Không thể sửa thông tin người nhận/
  );
});

test('[N][A] cancelOrder: cancels PENDING without releasing stock, cancels CONFIRMED_RESERVED releasing stock, rejects PACKED/DELIVERED/already CANCELLED', async () => {
  const seller = await createUser('SELLER');
  const { sku } = await seedSku({ onHandQty: 20, reservedQty: 0 });

  // 1. Cancel PENDING: reservedQty stays 0
  const pending = await orderService.createDirectOrder(
    {
      shippingRecipient: { name: 'Hủy Pending', phone: '0987654321', address: 'HN' },
      items: [{ skuId: sku._id, orderedQty: 2, unitSalePrice: 200000 }],
    },
    seller
  );
  const cancelledPending = await orderService.cancelOrder(pending._id, 'Khách đặt nhầm', seller);
  assert.equal(cancelledPending.status, 'CANCELLED');
  assert.equal((await Sku.findById(sku._id)).reservedQty, 0);

  // Abnormal: cancel again -> rejected
  await assert.rejects(() => orderService.cancelOrder(pending._id, 'Hủy lại', seller), /đã bị hủy trước đó/);

  // 2. Cancel CONFIRMED_RESERVED: releases reservedQty and records ORDER_CANCEL_RELEASE
  const confirmed = await orderService.createDirectOrder(
    {
      shippingRecipient: { name: 'Hủy Confirmed', phone: '0912345678', address: 'HN' },
      items: [{ skuId: sku._id, orderedQty: 5, unitSalePrice: 200000 }],
      autoConfirm: true,
    },
    seller
  );
  assert.equal((await Sku.findById(sku._id)).reservedQty, 5);

  await orderService.cancelOrder(confirmed._id, 'Khách đổi mẫu', seller);
  assert.equal((await Sku.findById(sku._id)).reservedQty, 0);
  const releaseTx = await InventoryTransaction.findOne({ referenceId: confirmed._id, transactionType: 'ORDER_CANCEL_RELEASE' });
  assert.ok(releaseTx);
  assert.equal(releaseTx.quantityChange, -5);

  // 3. Abnormal: empty reason & PACKED status rejected
  const packed = await SalesOrder.create({
    orderCode: 'ORD-PACK1',
    customerId: confirmed.customerId,
    sellerId: seller._id,
    status: 'PACKED',
    items: [{ skuId: sku._id, skuCode: sku.skuCode, skuBarcode: sku.skuBarcode, orderedQty: 1, unitSalePrice: 200000 }],
    financialSummary: { itemsSubtotal: 200000, totalOrderAmount: 200000, expectedCodAmount: 200000 },
  });
  await assert.rejects(() => orderService.cancelOrder(packed._id, '   ', seller), /lý do hủy/);
  await assert.rejects(() => orderService.cancelOrder(packed._id, 'Muốn hủy', seller), /Không thể hủy đơn hàng/);
});

test('[N][A] createPosDirectOrder: deducts onHandQty immediately with 0 shipping, creates CUST-WALKIN, rejects insufficient stock', async () => {
  const seller = await createUser('SELLER');
  const { sku } = await seedSku({ onHandQty: 5, reservedQty: 2 }); // available = 3

  const posOrder = await orderService.createPosDirectOrder(
    { items: [{ skuId: sku._id, orderedQty: 3, unitSalePrice: 200000 }] },
    seller
  );
  assert.equal(posOrder.status, 'COMPLETED');
  assert.equal(posOrder.financialSummary.shippingFee, 0);
  assert.equal((await Sku.findById(sku._id)).onHandQty, 2);
  assert.ok(await Customer.findOne({ customerCode: 'CUST-WALKIN' }));

  // Boundary: remaining available is 2 - 2 = 0 -> placing qty 1 fails
  await assert.rejects(
    () => orderService.createPosDirectOrder({ items: [{ skuId: sku._id, orderedQty: 1, unitSalePrice: 200000 }] }, seller),
    /không đủ tồn khả dụng/
  );
});

test('[N][A] Facebook chat order actions & getOrderList: allow FB orders, block Shopee orders, filter and aggregate statusCounts', async () => {
  const sellerA = await createUser('SELLER');
  const sellerB = await createUser('SELLER');
  const { sku } = await seedSku({ onHandQty: 30 });

  const fbOrder = await orderService.createDirectOrder(
    {
      channel: 'FACEBOOK_MESSENGER',
      shippingRecipient: { name: 'Khách FB', phone: '0988111222', address: 'HN' },
      items: [{ skuId: sku._id, orderedQty: 1, unitSalePrice: 200000 }],
    },
    sellerA
  );
  const shopeeOrder = await orderService.createDirectOrder(
    {
      channel: 'SHOPEE',
      shippingRecipient: { name: 'Khách Shopee', phone: '0988333444', address: 'HN' },
      items: [{ skuId: sku._id, orderedQty: 1, unitSalePrice: 200000 }],
    },
    sellerB
  );

  const receiptRes = await orderService.sendOrderConfirmationReceipt(fbOrder._id, sellerA);
  assert.equal(receiptRes.success, true);

  const inquiryRes = await orderService.sendCancelConfirmationInquiry(fbOrder._id, 'Đổi mẫu', sellerA);
  assert.equal(inquiryRes.success, true);

  const simRes = await orderService.simulateCustomerConfirm(fbOrder._id, sellerA);
  assert.equal(simRes.order.status, 'CONFIRMED_RESERVED');

  // Abnormal: non-FB channel blocked
  await assert.rejects(() => orderService.sendOrderConfirmationReceipt(shopeeOrder._id, sellerB), /Facebook/);
  await assert.rejects(() => orderService.simulateCustomerConfirm(shopeeOrder._id, sellerB), /Facebook/);
  await assert.rejects(() => orderService.sendCancelConfirmationInquiry(shopeeOrder._id, 'Lý do', sellerB), /Facebook/);

  // getOrderList filtering & statusCounts
  const ownOnly = await orderService.getOrderList({}, sellerA);
  assert.equal(ownOnly.items.length, 1);
  assert.equal(ownOnly.statusCounts.CONFIRMED_RESERVED, 1);

  const viewAll = await orderService.getOrderList({ viewAll: 'true', channel: 'SHOPEE' }, sellerA);
  assert.equal(viewAll.items.length, 1);
  assert.equal(String(viewAll.items[0]._id), String(shopeeOrder._id));

  await assert.rejects(() => orderService.getOrderById(new mongoose.Types.ObjectId()), /không tồn tại/);
});

// ============================================================================
// 2. MARKETPLACE ORDER IMPORT SERVICE
// ============================================================================

test('[N][A] marketplaceOrderImport.parseExcelFile: groups orders, matches SKUs, flags duplicates/unmatched, rejects empty sheet', async () => {
  const seller = await createUser('SELLER');
  const { sku } = await seedSku({ skuCode: 'AL186-KEM-M', onHandQty: 10, reservedQty: 0 });
  const cust = await Customer.create({ customerCode: 'CUST-DUP', fullName: 'Dup' });

  await SalesOrder.create({
    orderCode: 'ARA-EXIST1',
    customerId: cust._id,
    sellerId: seller._id,
    sourceDetails: { externalOrderCode: 'EXT-DUP-01' },
    items: [{ skuId: sku._id, skuCode: sku.skuCode, skuBarcode: sku.skuBarcode, orderedQty: 1, unitSalePrice: 200000 }],
    financialSummary: { itemsSubtotal: 200000, totalOrderAmount: 200000, expectedCodAmount: 200000 },
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Orders');
  sheet.addRow(['Mã đơn hàng', 'Tên khách hàng', 'Số điện thoại', 'Địa chỉ', 'Mã SKU', 'Số lượng', 'Tiền thu hộ']);
  sheet.addRow(['EXT-VALID-01', 'Khách Hợp Lệ', '0987654321', 'Hà Nội', 'AL186-KEM-M', 2, 400000]);
  sheet.addRow(['EXT-DUP-01', 'Khách Trùng', '0912345678', 'Hà Nội', 'AL186-KEM-M', 1, 200000]);
  sheet.addRow(['EXT-BADSKU-01', 'Khách Sai SKU', '0933222111', 'Hà Nội', 'UNKNOWN-SKU-999', 1, 150000]);
  const buf = await wb.xlsx.writeBuffer();

  const parsed = await marketplaceService.parseExcelFile(buf, 'SHOPEE', 'shopee_mall_01');
  assert.equal(parsed.totalParsedOrders, 3);
  assert.equal(parsed.validOrdersCount, 1);
  assert.equal(parsed.invalidOrdersCount, 2);

  const validOrd = parsed.orders.find((o) => o.externalOrderCode === 'EXT-VALID-01');
  assert.equal(validOrd.isValid, true);
  assert.equal(parsed.orders.find((o) => o.externalOrderCode === 'EXT-DUP-01').isValid, false);
  assert.equal(parsed.orders.find((o) => o.externalOrderCode === 'EXT-BADSKU-01').isValid, false);

  // Abnormal: empty Excel (header only, no data rows)
  const emptyWb = new ExcelJS.Workbook();
  emptyWb.addWorksheet('Empty').addRow(['Mã đơn hàng', 'Mã SKU']);
  const emptyBuf = await emptyWb.xlsx.writeBuffer();
  await assert.rejects(
    () => marketplaceService.parseExcelFile(emptyBuf, 'SHOPEE', 's1'),
    /Không tìm thấy dữ liệu đơn hàng/
  );
});

test('[N][A] marketplaceOrderImport.processImportOrders & approveImportedOrdersBulk: imports valid orders, rejects invalid SKUs, handles masked phone', async () => {
  const seller = await createUser('SELLER');
  const warehouse = await createUser('WAREHOUSE_STAFF');
  const { sku: activeSku } = await seedSku({ onHandQty: 15, reservedQty: 0 });
  const { sku: stoppedSku } = await seedSku({ isActive: false });

  await assert.rejects(() => marketplaceService.processImportOrders({ channel: 'SHOPEE', orders: [] }, {}, seller), /Không có đơn hàng hợp lệ/);

  const importRes = await marketplaceService.processImportOrders(
    {
      channel: 'SHOPEE',
      sourceId: 'shopee_mall_01',
      sourceName: 'Shopee Mall',
      orders: [
        {
          externalOrderCode: 'SHP-OK-1',
          customerName: 'N***n',
          phone: '0987***321',
          address: 'Hà Nội',
          totalAmount: 400000,
          items: [{ skuId: activeSku._id, quantity: 2, unitPrice: 200000 }],
        },
        {
          externalOrderCode: 'SHP-STOPPED-2',
          customerName: 'Khách 2',
          phone: '0912345678',
          address: 'HN',
          items: [{ skuId: stoppedSku._id, quantity: 1, unitPrice: 200000 }],
        },
        {
          externalOrderCode: 'SHP-EMPTY-3',
          customerName: 'Khách 3',
          items: [],
        },
      ],
    },
    { sourceType: 'SHOPEE_STORE' },
    seller
  );

  assert.equal(importRes.totalCreated, 1);
  assert.equal(importRes.rejectedOrders.length, 2);
  assert.equal((await Sku.findById(activeSku._id)).reservedQty, 2);

  // Idempotent approve on already APPROVED imported order & bulk approve empty check
  const approved = await marketplaceService.approveImportedOrder(importRes.orders[0]._id, warehouse);
  assert.equal(approved.status, 'CONFIRMED_RESERVED');

  await assert.rejects(() => marketplaceService.approveImportedOrdersBulk([], warehouse), /ít nhất một đơn hàng/);
});
