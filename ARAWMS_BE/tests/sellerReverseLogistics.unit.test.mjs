/*
 * File: sellerReverseLogistics.unit.test.mjs
 * Author: Nguyễn Quang Huy & ARAWMS Team
 * Description: Self-contained Service Unit Tests for Seller Reverse Logistics:
 *              - Return Merchandise Authorization (UC-18)
 *              - Submit Return Refund Request (UC-20)
 *              - Customer Exchange Order Processing (UC-19)
 *              Each test clears collections in beforeEach and mocks GHN calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import Role from '../src/models/Role.model.js';
import User from '../src/models/User.model.js';
import Product from '../src/models/Product.model.js';
import Sku from '../src/models/Sku.model.js';
import Customer from '../src/models/Customer.model.js';
import SalesOrder from '../src/models/SalesOrder.model.js';
import ReturnRequest from '../src/models/ReturnRequest.model.js';
import { ghnService } from '../src/modules/ghn/ghn.service.js';

import rmaService from '../src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.service.js';
import exchangeService from '../src/modules/reverse-logistics/customer-exchange-processing/customerExchangeProcessing.service.js';

let mongoServer;
const origCreateGhn = ghnService.createShippingOrderFromSalesOrder;

async function createSeller() {
  const role = await Role.findOneAndUpdate(
    { roleCode: 'SELLER' },
    { $setOnInsert: { roleName: 'Nhân viên bán hàng', isActive: true } },
    { upsert: true, new: true }
  );
  const uid = randomUUID().slice(0, 8).toUpperCase();
  return User.create({
    employeeCode: `SEL-${uid}`,
    fullName: `Seller ${uid}`,
    email: `seller-${uid}@test.local`,
    roleId: role._id,
    roleCode: 'SELLER',
    status: 'ACTIVE',
  });
}

async function seedDeliveredOrder(seller, { status = 'DELIVERED', orderedQty = 2, unitSalePrice = 300000 } = {}) {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const product = await Product.create({
    productCode: `PR${suffix}`,
    productName: `Đầm ${suffix}`,
    category: 'Đầm',
    basePrice: unitSalePrice,
    isActive: true,
  });
  const sku = await Sku.create({
    skuCode: `PR${suffix}-TRANG-M`,
    skuBarcode: `BAR-${suffix}`,
    productId: product._id,
    styleName: product.productName,
    color: 'Trắng',
    size: 'M',
    retailPrice: unitSalePrice,
    unitCogs: 150000,
    onHandQty: 20,
    reservedQty: 0,
    isActive: true,
  });
  const customer = await Customer.create({
    customerCode: `CUST-${suffix}`,
    fullName: 'Khách Đổi Trả',
    phone: '0987654321',
  });
  const order = await SalesOrder.create({
    orderCode: `ORD-${suffix}`,
    customerId: customer._id,
    sellerId: seller._id,
    status,
    shippingRecipient: { name: 'Khách Đổi Trả', phone: '0987654321', address: '15 Duy Tân, HN' },
    items: [
      {
        skuId: sku._id,
        skuCode: sku.skuCode,
        skuBarcode: sku.skuBarcode,
        productName: product.productName,
        orderedQty,
        unitSalePrice,
      },
    ],
    financialSummary: {
      itemsSubtotal: orderedQty * unitSalePrice,
      shippingFee: 30000,
      totalOrderAmount: orderedQty * unitSalePrice + 30000,
      expectedCodAmount: orderedQty * unitSalePrice + 30000,
    },
    warehouseFulfillment: { waybillCode: `GHN-${suffix}` },
  });
  return { product, sku, customer, order };
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri('arawms_seller_rma_unit'));
});

test.beforeEach(async () => {
  ghnService.createShippingOrderFromSalesOrder = async (order) => ({
    waybillCode: `GHN-EX-${order.orderCode}`,
    ghnStatus: 'ready_to_pick',
    ghnStatusName: 'Chờ lấy hàng',
  });
  for (const col of Object.values(mongoose.connection.collections)) {
    await col.deleteMany({});
  }
});

test.after(async () => {
  ghnService.createShippingOrderFromSalesOrder = origCreateGhn;
  await mongoose.disconnect();
  await mongoServer?.stop();
});

// ============================================================================
// 1. CREATE RETURN REQUEST (RMA)
// ============================================================================

test('[N] createReturnRequest: customer-fault refund applies 10% surcharge, uppercases accountHolder, updates order status', async () => {
  const seller = await createSeller();
  const { sku, order } = await seedDeliveredOrder(seller, { orderedQty: 2, unitSalePrice: 300000 });

  const rma = await rmaService.createReturnRequest(
    {
      originalOrderId: order._id,
      returnType: 'RETURN_FOR_REFUND',
      returnWaybillCode: ' ghn-ret-01 ',
      reasonDescription: 'Khách đổi ý không muốn giữ',
      shippingFeeDeduction: 20000,
      refundBanking: { bankName: 'VCB', accountNumber: '0123456789', accountHolder: 'nguyen thi hoa' },
      returnItems: [{ skuId: sku._id, returnedQty: 1 }],
    },
    seller
  );

  assert.match(rma.rmaCode, /^RMA-\d{5}$/);
  assert.equal(rma.returnWaybillCode, 'GHN-RET-01');
  assert.equal(rma.refundBanking.accountHolder, 'NGUYEN THI HOA');
  assert.equal(rma.financialAccounting.apply10PercentSurcharge, true);
  assert.equal(rma.financialAccounting.surcharge10PercentAmount, 30000);
  assert.equal(rma.financialAccounting.finalNetRefundOrCollect, 250000); // 300k - 30k - 20k
  assert.equal(rma.warehouseInspection.items[0].disposition, 'RESTOCK_SALEABLE');

  const updatedOrder = await SalesOrder.findById(order._id);
  assert.equal(updatedOrder.status, 'RETURN_REQUESTED');
  assert.equal(String(updatedOrder.linkedReturnRequestId), String(rma._id));
});

test('[N] createReturnRequest: store-fault refund waives 100% surcharge/shipping and routes item to QUARANTINE_DEFECT', async () => {
  const seller = await createSeller();
  const { sku, order } = await seedDeliveredOrder(seller, { orderedQty: 2, unitSalePrice: 300000 });

  const rma = await rmaService.createReturnRequest(
    {
      originalOrderId: order._id,
      returnType: 'RETURN_FOR_REFUND',
      reasonDescription: 'Áo bị lỗi vải và sút chỉ nặng',
      shippingFeeDeduction: 30000,
      refundBanking: { bankName: 'MB', accountNumber: '99887766', accountHolder: 'TRAN MINH' },
      returnItems: [{ skuId: sku._id, returnedQty: 2 }],
    },
    seller
  );

  assert.equal(rma.financialAccounting.apply10PercentSurcharge, false);
  assert.equal(rma.financialAccounting.surcharge10PercentAmount, 0);
  assert.equal(rma.financialAccounting.shippingFeeDeduction, 0);
  assert.equal(rma.financialAccounting.finalNetRefundOrCollect, 600000);
  assert.equal(rma.warehouseInspection.items[0].disposition, 'QUARANTINE_DEFECT');
});

test('[N] createReturnRequest: EXCHANGE_PRODUCT succeeds without refundBanking and sets order status EXCHANGE_REQUESTED', async () => {
  const seller = await createSeller();
  const { sku, order } = await seedDeliveredOrder(seller);

  const rma = await rmaService.createReturnRequest(
    {
      originalOrderId: order._id,
      returnType: 'EXCHANGE_PRODUCT',
      reasonDescription: 'Khách muốn đổi sang size L',
      returnItems: [{ skuId: sku._id, returnedQty: 1 }],
    },
    seller
  );

  assert.equal(rma.returnType, 'EXCHANGE_PRODUCT');
  assert.equal((await SalesOrder.findById(order._id)).status, 'EXCHANGE_REQUESTED');
});

test('[A][B] createReturnRequest: enforces order eligibility, reason length >= 5, banking info, duplicate active RMA, SKU ownership, and remaining qty', async () => {
  const seller = await createSeller();
  const { sku, order: pendingOrder } = await seedDeliveredOrder(seller, { status: 'PENDING' });
  const { sku: delSku, order: delOrder } = await seedDeliveredOrder(seller, { status: 'DELIVERED', orderedQty: 2 });

  // Non-existent order
  await assert.rejects(
    () => rmaService.createReturnRequest({ originalOrderId: new mongoose.Types.ObjectId(), returnType: 'EXCHANGE_PRODUCT', reasonDescription: 'Đổi size L', returnItems: [{ skuId: sku._id, returnedQty: 1 }] }, seller),
    /Không tìm thấy đơn hàng gốc/
  );

  // Empty returnItems
  await assert.rejects(
    () => rmaService.createReturnRequest({ originalOrderId: delOrder._id, returnType: 'EXCHANGE_PRODUCT', reasonDescription: 'Đổi size L', returnItems: [] }, seller),
    /ít nhất một sản phẩm/
  );

  // Ineligible order status (PENDING)
  await assert.rejects(
    () => rmaService.createReturnRequest({ originalOrderId: pendingOrder._id, returnType: 'EXCHANGE_PRODUCT', reasonDescription: 'Đổi size L', returnItems: [{ skuId: sku._id, returnedQty: 1 }] }, seller),
    /chưa giao thành công/
  );

  // Boundary: reason length 4 chars (< 5) rejected
  await assert.rejects(
    () => rmaService.createReturnRequest({ originalOrderId: delOrder._id, returnType: 'EXCHANGE_PRODUCT', reasonDescription: '1234', returnItems: [{ skuId: delSku._id, returnedQty: 1 }] }, seller),
    /lý do đổi hoặc trả hàng/
  );

  // Missing banking info for RETURN_FOR_REFUND
  await assert.rejects(
    () => rmaService.createReturnRequest({ originalOrderId: delOrder._id, returnType: 'RETURN_FOR_REFUND', reasonDescription: 'Khách đổi ý rồi', returnItems: [{ skuId: delSku._id, returnedQty: 1 }] }, seller),
    /tài khoản nhận hoàn tiền/
  );

  // SKU not in original order
  await assert.rejects(
    () => rmaService.createReturnRequest({ originalOrderId: delOrder._id, returnType: 'EXCHANGE_PRODUCT', reasonDescription: 'Khách muốn đổi size', returnItems: [{ skuId: sku._id, returnedQty: 1 }] }, seller),
    /không thuộc đơn/
  );

  // Boundary: returnedQty > orderedQty (3 > 2)
  await assert.rejects(
    () => rmaService.createReturnRequest({ originalOrderId: delOrder._id, returnType: 'EXCHANGE_PRODUCT', reasonDescription: 'Khách muốn đổi size', returnItems: [{ skuId: delSku._id, returnedQty: 3 }] }, seller),
    /vượt quá số lượng còn được phép trả/
  );

  // Create valid RMA of qty 1 -> duplicate active RMA must be blocked
  const firstRma = await rmaService.createReturnRequest(
    {
      originalOrderId: delOrder._id,
      returnType: 'EXCHANGE_PRODUCT',
      reasonDescription: 'Đổi 1 áo sang size L',
      returnItems: [{ skuId: delSku._id, returnedQty: 1 }],
    },
    seller
  );

  await SalesOrder.findByIdAndUpdate(delOrder._id, { status: 'DELIVERED' });
  await assert.rejects(
    () => rmaService.createReturnRequest({ originalOrderId: delOrder._id, returnType: 'EXCHANGE_PRODUCT', reasonDescription: 'Đổi thêm áo nữa', returnItems: [{ skuId: delSku._id, returnedQty: 1 }] }, seller),
    /đang xử lý/
  );

  // Complete first RMA (returnedQty = 1), so remaining is 1 -> trying qty 2 fails, qty 1 succeeds
  await ReturnRequest.findByIdAndUpdate(firstRma._id, { status: 'COMPLETED' });
  await assert.rejects(
    () => rmaService.createReturnRequest({ originalOrderId: delOrder._id, returnType: 'EXCHANGE_PRODUCT', reasonDescription: 'Đổi 2 chiếc còn lại', returnItems: [{ skuId: delSku._id, returnedQty: 2 }] }, seller),
    /vượt quá số lượng còn được phép trả/
  );
  const secondRma = await rmaService.createReturnRequest(
    {
      originalOrderId: delOrder._id,
      returnType: 'EXCHANGE_PRODUCT',
      reasonDescription: 'Đổi 1 chiếc còn lại',
      returnItems: [{ skuId: delSku._id, returnedQty: 1 }],
    },
    seller
  );
  assert.ok(secondRma._id);
});

// ============================================================================
// 2. GET RMA LIST / DETAIL & SUBMIT REFUND REQUEST
// ============================================================================

test('[N][A][B] submitRefundRequest & getRmaList: submits to accountant, allows resubmit after REJECTED, blocks invalid states', async () => {
  const sellerA = await createSeller();
  const sellerB = await createSeller();
  const { sku, order } = await seedDeliveredOrder(sellerA, { orderedQty: 1, unitSalePrice: 200000 });

  const rma = await rmaService.createReturnRequest(
    {
      originalOrderId: order._id,
      returnType: 'RETURN_FOR_REFUND',
      reasonDescription: 'Khách đổi ý không lấy',
      refundBanking: { bankName: 'TCB', accountNumber: '1900112233', accountHolder: 'le thi mai' },
      returnItems: [{ skuId: sku._id, returnedQty: 1 }],
    },
    sellerA
  );

  // getRmaList seller isolation vs viewAll
  assert.equal((await rmaService.getRmaList({}, sellerA)).items.length, 1);
  assert.equal((await rmaService.getRmaList({}, sellerB)).items.length, 0);
  assert.equal((await rmaService.getRmaList({ viewAll: 'true' }, sellerB)).items.length, 1);
  await assert.rejects(() => rmaService.getRmaById(new mongoose.Types.ObjectId()), /không tồn tại/);

  // Normal submit -> PENDING_ACCOUNTANT
  const submitted = await rmaService.submitRefundRequest(rma._id, { note: 'Gửi kế toán chuyển khoản' }, sellerA);
  assert.equal(submitted.refundRequest.status, 'PENDING_ACCOUNTANT');
  assert.equal(submitted.refundRequest.requestedAmount, 180000);

  // Duplicate submit while PENDING_ACCOUNTANT -> rejected
  await assert.rejects(() => rmaService.submitRefundRequest(rma._id, {}, sellerA), /đang chờ Kế toán duyệt/);

  // Boundary: resubmission after REJECTED succeeds
  await ReturnRequest.findByIdAndUpdate(rma._id, { 'refundRequest.status': 'REJECTED' });
  const resubmitted = await rmaService.submitRefundRequest(rma._id, { note: 'Đã kiểm tra lại STK' }, sellerA);
  assert.equal(resubmitted.refundRequest.status, 'PENDING_ACCOUNTANT');

  // Abnormal: already APPROVED -> rejected
  await ReturnRequest.findByIdAndUpdate(rma._id, { 'refundRequest.status': 'APPROVED' });
  await assert.rejects(() => rmaService.submitRefundRequest(rma._id, {}, sellerA), /đã được Kế toán duyệt/);

  // Abnormal: EXCHANGE_PRODUCT -> rejected
  const { sku: exSku, order: exOrder } = await seedDeliveredOrder(sellerA);
  const exRma = await rmaService.createReturnRequest(
    {
      originalOrderId: exOrder._id,
      returnType: 'EXCHANGE_PRODUCT',
      reasonDescription: 'Đổi sang màu khác',
      returnItems: [{ skuId: exSku._id, returnedQty: 1 }],
    },
    sellerA
  );
  await assert.rejects(() => rmaService.submitRefundRequest(exRma._id, {}, sellerA), /ĐỔI HÀNG/);

  // Abnormal: finalNetRefundOrCollect <= 0 -> rejected
  await ReturnRequest.findByIdAndUpdate(rma._id, {
    'refundRequest.status': 'NONE',
    'financialAccounting.finalNetRefundOrCollect': 0,
  });
  await assert.rejects(() => rmaService.submitRefundRequest(rma._id, {}, sellerA), /bằng 0/);
});

// ============================================================================
// 3. CUSTOMER EXCHANGE ORDER PROCESSING
// ============================================================================

test('[N][B] createExchangeOrder: creates CONFIRMED_RESERVED exchange order, reserves stock, computes positive and negative price variance', async () => {
  const seller = await createSeller();
  const { sku: origSku, order: origOrder } = await seedDeliveredOrder(seller, { orderedQty: 1, unitSalePrice: 300000 });
  const replacementProduct = await Product.create({
    productCode: 'SPEX01',
    productName: 'Áo Khoác Đổi',
    category: 'Áo khoác',
    basePrice: 400000,
    isActive: true,
  });
  const higherSku = await Sku.create({
    skuCode: 'SPEX01-DEN-L',
    skuBarcode: 'BAR-EX-HIGH',
    productId: replacementProduct._id,
    styleName: 'Áo Khoác Đổi',
    color: 'Đen',
    size: 'L',
    retailPrice: 400000,
    unitCogs: 200000,
    onHandQty: 10,
    reservedQty: 0,
    isActive: true,
  });

  const rma = await rmaService.createReturnRequest(
    {
      originalOrderId: origOrder._id,
      returnType: 'EXCHANGE_PRODUCT',
      reasonDescription: 'Khách đổi sang áo khoác giá cao hơn',
      returnItems: [{ skuId: origSku._id, returnedQty: 1 }],
    },
    seller
  );

  const res = await exchangeService.createExchangeOrder(
    rma._id,
    {
      shippingFee: 30000,
      newItems: [{ skuId: higherSku._id, orderedQty: 1, unitSalePrice: 400000 }],
    },
    seller
  );

  assert.equal(res.exchangeOrder.orderType, 'EXCHANGE_ORDER');
  assert.equal(res.exchangeOrder.status, 'CONFIRMED_RESERVED');
  assert.equal(res.varianceAmount, 130000); // 400k + 30k - 300k
  assert.equal(res.exchangeOrder.financialSummary.expectedCodAmount, 130000);
  assert.equal(res.exchangeOrder.warehouseFulfillment.waybillCode, `GHN-EX-${res.exchangeOrder.orderCode}`);
  assert.equal((await Sku.findById(higherSku._id)).reservedQty, 1);

  const refreshedOrig = await SalesOrder.findById(origOrder._id);
  assert.ok(refreshedOrig.exchangeOrderIds.some((id) => String(id) === String(res.exchangeOrder._id)));

  // Boundary: replacement cheaper than returned merchandise -> negative variance, expectedCodAmount clamped to 0
  const { sku: origSku2, order: origOrder2 } = await seedDeliveredOrder(seller, { orderedQty: 1, unitSalePrice: 300000 });
  const rma2 = await rmaService.createReturnRequest(
    {
      originalOrderId: origOrder2._id,
      returnType: 'EXCHANGE_PRODUCT',
      reasonDescription: 'Đổi sang sản phẩm rẻ hơn',
      returnItems: [{ skuId: origSku2._id, returnedQty: 1 }],
    },
    seller
  );
  const resCheap = await exchangeService.createExchangeOrder(
    rma2._id,
    {
      shippingFee: 0,
      newItems: [{ skuId: higherSku._id, orderedQty: 1, unitSalePrice: 200000 }],
    },
    seller
  );
  assert.equal(resCheap.varianceAmount, -100000);
  assert.equal(resCheap.exchangeOrder.financialSummary.expectedCodAmount, 0);
});

test('[A] createExchangeOrder: rejects missing RMA, RETURN_FOR_REFUND RMA, duplicate exchange order, empty items, inactive SKU, and insufficient stock', async () => {
  const seller = await createSeller();
  const { sku, order } = await seedDeliveredOrder(seller);
  const { sku: refundSku, order: refundOrder } = await seedDeliveredOrder(seller);

  const refundRma = await rmaService.createReturnRequest(
    {
      originalOrderId: refundOrder._id,
      returnType: 'RETURN_FOR_REFUND',
      reasonDescription: 'Khách muốn trả hoàn tiền',
      refundBanking: { bankName: 'ACB', accountNumber: '11223344', accountHolder: 'NGUYEN A' },
      returnItems: [{ skuId: refundSku._id, returnedQty: 1 }],
    },
    seller
  );
  const exRma = await rmaService.createReturnRequest(
    {
      originalOrderId: order._id,
      returnType: 'EXCHANGE_PRODUCT',
      reasonDescription: 'Khách đổi size',
      returnItems: [{ skuId: sku._id, returnedQty: 1 }],
    },
    seller
  );

  const lowStockSku = await Sku.create({
    skuCode: 'LOW-EX-S',
    skuBarcode: 'BAR-LOW-EX',
    productId: sku.productId,
    styleName: 'Áo Ít Tồn',
    color: 'Đen',
    size: 'S',
    retailPrice: 200000,
    onHandQty: 1,
    reservedQty: 0,
    isActive: true,
  });
  const inactiveSku = await Sku.create({
    skuCode: 'STOP-EX-XL',
    skuBarcode: 'BAR-STOP-EX',
    productId: sku.productId,
    styleName: 'Áo Ngừng Bán',
    color: 'Đen',
    size: 'XL',
    retailPrice: 200000,
    onHandQty: 10,
    reservedQty: 0,
    isActive: false,
  });

  await assert.rejects(() => exchangeService.createExchangeOrder(new mongoose.Types.ObjectId(), { newItems: [{ skuId: sku._id, orderedQty: 1, unitSalePrice: 300000 }] }, seller), /không tồn tại/);
  await assert.rejects(() => exchangeService.createExchangeOrder(refundRma._id, { newItems: [{ skuId: sku._id, orderedQty: 1, unitSalePrice: 300000 }] }, seller), /Trả hàng hoàn tiền/);
  await assert.rejects(() => exchangeService.createExchangeOrder(exRma._id, { newItems: [] }, seller), /ít nhất một sản phẩm/);
  await assert.rejects(() => exchangeService.createExchangeOrder(exRma._id, { newItems: [{ skuId: inactiveSku._id, orderedQty: 1, unitSalePrice: 200000 }] }, seller), /ngừng kinh doanh/);
  await assert.rejects(() => exchangeService.createExchangeOrder(exRma._id, { newItems: [{ skuId: lowStockSku._id, orderedQty: 3, unitSalePrice: 200000 }] }, seller), /không đủ tồn khả dụng/);

  // Create once -> second creation for same RMA rejected
  await exchangeService.createExchangeOrder(exRma._id, { newItems: [{ skuId: sku._id, orderedQty: 1, unitSalePrice: 300000 }] }, seller);
  await assert.rejects(() => exchangeService.createExchangeOrder(exRma._id, { newItems: [{ skuId: sku._id, orderedQty: 1, unitSalePrice: 300000 }] }, seller), /đã được tạo đơn hàng đổi mới trước đó/);
});

