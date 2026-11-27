/*
 * File: sellerPureValidationAndRules.unit.test.mjs
 * Author: Nguyễn Quang Huy & ARAWMS Team
 * Description: Pure Unit Tests (zero DB) for all Seller validators, business rules,
 *              upload helpers, notification templates, webhook verification, and
 *              marketplace Excel helpers across Conversational Commerce, Order Fulfillment,
 *              and Reverse Logistics.
 *              Tagged by test type: [N] Normal, [A] Abnormal, [B] Boundary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';

import { validateSendMessage } from '../src/modules/conversational-commerce/chat-interface/chatInterface.validation.js';
import { validateWebhookQuery } from '../src/modules/conversational-commerce/chat-routing/chatRouting.validation.js';
import { verifyWebhook } from '../src/modules/conversational-commerce/chat-routing/chatRouting.controller.js';
import { validateCreateCustomer } from '../src/modules/conversational-commerce/crm-profile/crmProfile.validation.js';
import { resolveAttachmentType } from '../src/common/middlewares/chatUpload.js';
import {
  buildOrderConfirmationText,
  buildOrderConfirmedSuccessText,
  buildOrderCancelInquiryText,
  buildOrderCancelledText,
  buildPackingCompletedText,
  buildGhnStatusUpdateText,
} from '../src/modules/conversational-commerce/chat-interface/notificationTemplate.service.js';
import {
  validateCreateOrder,
  validateUpdateOrderItems,
  validateCancelOrder,
  validateUpdateOrderRecipient,
} from '../src/modules/order-fulfillment/order-management/orderManagement.validation.js';
import {
  splitOrderItemsFromCell,
  getSalesChannels,
  generateExcelTemplate,
} from '../src/modules/order-fulfillment/marketplace-order-import/marketplaceOrderImport.service.js';
import { validateCreateRma } from '../src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.validation.js';
import {
  classifyReturnFaultByBR,
  calculateRefundFinancialsByBR,
} from '../src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.rules.js';
import { validateCreateExchangeOrder } from '../src/modules/reverse-logistics/customer-exchange-processing/customerExchangeProcessing.validation.js';

/** Creates an isolated mock Express req/res/next harness for middleware unit tests. */
function runMiddleware(middleware, reqOverrides = {}) {
  const req = {
    body: {},
    query: {},
    params: {},
    path: '',
    originalUrl: '',
    ...reqOverrides,
  };
  let nextCalled = false;
  let statusCode = null;
  let jsonBody = null;
  let sentBody = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
    send(payload) {
      sentBody = payload;
      return this;
    },
    sendStatus(code) {
      statusCode = code;
      return this;
    },
  };

  middleware(req, res, () => {
    nextCalled = true;
  });

  return { req, nextCalled, statusCode, jsonBody, sentBody };
}

const oid = () => String(new mongoose.Types.ObjectId());

// ============================================================================
// 1. CONVERSATIONAL COMMERCE — VALIDATIONS, WEBHOOK & TEMPLATES
// ============================================================================

test('[N] validateSendMessage: accepts text-only, attachment-only, and referencedSkuId-only payloads', () => {
  assert.equal(runMiddleware(validateSendMessage, { body: { messageText: 'Xin chào shop' } }).nextCalled, true);
  assert.equal(runMiddleware(validateSendMessage, { body: { attachments: [{ url: '/a.png', type: 'image' }] } }).nextCalled, true);
  assert.equal(runMiddleware(validateSendMessage, { body: { referencedSkuId: oid() } }).nextCalled, true);
});

test('[A] validateSendMessage: rejects empty body or empty attachments without text/sku', () => {
  const r1 = runMiddleware(validateSendMessage, { body: {} });
  assert.equal(r1.nextCalled, false);
  assert.equal(r1.statusCode, 400);
  assert.equal(r1.jsonBody.success, false);

  const r2 = runMiddleware(validateSendMessage, { body: { messageText: '', attachments: [] } });
  assert.equal(r2.nextCalled, false);
  assert.equal(r2.statusCode, 400);
});

test('[N] validateWebhookQuery: accepts complete Meta webhook handshake query params', () => {
  const r = runMiddleware(validateWebhookQuery, {
    query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' },
  });
  assert.equal(r.nextCalled, true);
});

test('[A] validateWebhookQuery: rejects when any required hub.* param is missing', () => {
  for (const query of [
    { 'hub.verify_token': 'tok', 'hub.challenge': '123' },
    { 'hub.mode': 'subscribe', 'hub.challenge': '123' },
    { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok' },
  ]) {
    const r = runMiddleware(validateWebhookQuery, { query });
    assert.equal(r.nextCalled, false);
    assert.equal(r.statusCode, 400);
  }
});

test('[N][A] verifyWebhook: returns 200 challenge on valid token, 403 on wrong token, 400 on missing params', () => {
  const token = process.env.FB_VERIFY_TOKEN || 'arawms_fb_verify_token_2026';

  const ok = runMiddleware(verifyWebhook, {
    query: { 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': 'CHALLENGE_OK' },
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.sentBody, 'CHALLENGE_OK');

  const wrong = runMiddleware(verifyWebhook, {
    query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong_token', 'hub.challenge': 'X' },
  });
  assert.equal(wrong.statusCode, 403);

  const missing = runMiddleware(verifyWebhook, { query: {} });
  assert.equal(missing.statusCode, 400);
});

test('[N][A][B] validateCreateCustomer: accepts trimmed fullName and rejects missing or whitespace-only', () => {
  assert.equal(runMiddleware(validateCreateCustomer, { body: { fullName: 'Nguyễn Minh Anh' } }).nextCalled, true);

  for (const fullName of [undefined, null, '', '   ']) {
    const r = runMiddleware(validateCreateCustomer, { body: { fullName } });
    assert.equal(r.nextCalled, false);
    assert.equal(r.statusCode, 400);
  }
});

test('[N][B] resolveAttachmentType: maps image, video, audio, generic files, and empty MIME', () => {
  assert.equal(resolveAttachmentType('image/jpeg'), 'image');
  assert.equal(resolveAttachmentType('video/mp4'), 'video');
  assert.equal(resolveAttachmentType('audio/mpeg'), 'audio');
  assert.equal(resolveAttachmentType('application/pdf'), 'file');
  assert.equal(resolveAttachmentType(''), 'file');
  assert.equal(resolveAttachmentType(), 'file');
});

test('[N][B] notificationTemplate builders: format confirmation, confirmed, cancel inquiry, cancelled, packing, and GHN status texts', () => {
  const sampleOrder = {
    orderCode: 'ORD-00088',
    shippingRecipient: { name: 'Lê Thu Hà', phone: '0987654321', address: '12 Cầu Giấy, Hà Nội' },
    items: [
      { productName: 'Áo Len Cổ Lọ', color: 'Kem', size: 'M', orderedQty: 2, unitSalePrice: 200000 },
    ],
    financialSummary: {
      itemsSubtotal: 400000,
      shippingFee: 30000,
      discountAmount: 20000,
      totalOrderAmount: 410000,
      expectedCodAmount: 410000,
    },
    warehouseFulfillment: { waybillCode: 'GHN-8899' },
  };

  const confirmText = buildOrderConfirmationText(sampleOrder);
  assert.match(confirmText, /#ORD-00088/);
  assert.match(confirmText, /Giảm giá/);
  assert.match(confirmText, /Size: M/);

  const noDiscountText = buildOrderConfirmationText({
    orderCode: 'ORD-00089',
    items: [{ skuCode: 'SKU-1', orderedQty: 1, unitSalePrice: 100000 }],
    financialSummary: { itemsSubtotal: 100000, shippingFee: 0, discountAmount: 0, totalOrderAmount: 100000 },
  });
  assert.doesNotMatch(noDiscountText, /Giảm giá/);
  assert.match(noDiscountText, /Quý khách/);

  assert.match(buildOrderConfirmedSuccessText(sampleOrder, 'GHN-NEW1'), /GHN-NEW1/);
  assert.match(buildOrderCancelInquiryText(sampleOrder, 'Đổi size'), /Đổi size/);
  assert.match(buildOrderCancelledText(sampleOrder, 'Khách hủy'), /Khách hủy/);
  assert.match(buildPackingCompletedText(sampleOrder), /ĐÃ ĐƯỢC ĐÓNG GÓI XONG/);

  for (const status of ['ready_to_pick', 'picking', 'picked', 'delivering', 'delivered', 'delivery_fail', 'returning', 'returned', 'cancel', 'unknown_status']) {
    const txt = buildGhnStatusUpdateText(sampleOrder, status, 'GHN-8899');
    assert.match(txt, /ORD-00088/);
    assert.match(txt, /GHN-8899/);
  }
});

// ============================================================================
// 2. ORDER FULFILLMENT — VALIDATIONS & MARKETPLACE HELPERS
// ============================================================================

test('[N] validateCreateOrder: accepts valid online order, customerId-linked order, and POS direct order', () => {
  const validOnline = runMiddleware(validateCreateOrder, {
    body: {
      shippingRecipient: { name: 'Trần An', phone: '0912345678', address: '10 Kim Mã, Hà Nội' },
      items: [{ skuId: oid(), orderedQty: 1 }],
    },
  });
  assert.equal(validOnline.nextCalled, true);

  const validWithCustomerId = runMiddleware(validateCreateOrder, {
    body: {
      customerId: oid(),
      shippingRecipient: { address: '10 Kim Mã, Hà Nội' },
      items: [{ skuId: oid(), orderedQty: 2 }],
    },
  });
  assert.equal(validWithCustomerId.nextCalled, true);

  const validPos = runMiddleware(validateCreateOrder, {
    originalUrl: '/api/orders/pos-direct',
    body: { items: [{ skuId: oid(), orderedQty: 1 }] },
  });
  assert.equal(validPos.nextCalled, true);
});

test('[A][B] validateCreateOrder: rejects empty items, invalid qty/skuId, missing recipient fields, and bad VN phone formats', () => {
  // Empty items
  assert.equal(runMiddleware(validateCreateOrder, { body: { items: [] } }).statusCode, 400);

  // Boundary orderedQty = 0, -1, NaN, missing skuId
  for (const badItem of [
    { skuId: '', orderedQty: 1 },
    { skuId: oid(), orderedQty: 0 },
    { skuId: oid(), orderedQty: -1 },
    { skuId: oid(), orderedQty: 'abc' },
  ]) {
    const r = runMiddleware(validateCreateOrder, {
      body: {
        shippingRecipient: { name: 'A', phone: '0987654321', address: 'Hà Nội' },
        items: [badItem],
      },
    });
    assert.equal(r.statusCode, 400);
  }

  // Missing phone without customerId
  assert.equal(
    runMiddleware(validateCreateOrder, {
      body: { shippingRecipient: { name: 'A', address: 'Hà Nội' }, items: [{ skuId: oid(), orderedQty: 1 }] },
    }).statusCode,
    400
  );

  // Invalid VN phone numbers
  for (const badPhone of ['0123456789', '0281234567', '098765432', '09876543210']) {
    const r = runMiddleware(validateCreateOrder, {
      body: {
        shippingRecipient: { name: 'A', phone: badPhone, address: 'Hà Nội' },
        items: [{ skuId: oid(), orderedQty: 1 }],
      },
    });
    assert.equal(r.statusCode, 400, `Expected phone ${badPhone} to be rejected`);
  }

  // Boundary: valid VN prefixes 03/05/07/08/09 and special fallback 0900000000
  for (const goodPhone of ['0312345678', '0512345678', '0712345678', '0812345678', '0912345678', '0900000000']) {
    const r = runMiddleware(validateCreateOrder, {
      body: {
        shippingRecipient: { name: 'A', phone: goodPhone, address: 'Hà Nội' },
        items: [{ skuId: oid(), orderedQty: 1 }],
      },
    });
    assert.equal(r.nextCalled, true, `Expected phone ${goodPhone} to be accepted`);
  }

  // Missing name without customerId / missing address
  assert.equal(
    runMiddleware(validateCreateOrder, {
      body: { shippingRecipient: { phone: '0987654321', address: 'Hà Nội' }, items: [{ skuId: oid(), orderedQty: 1 }] },
    }).statusCode,
    400
  );
  assert.equal(
    runMiddleware(validateCreateOrder, {
      body: { shippingRecipient: { name: 'A', phone: '0987654321' }, items: [{ skuId: oid(), orderedQty: 1 }] },
    }).statusCode,
    400
  );
});

test('[N][A][B] validateUpdateOrderItems: enforces non-empty items, integer qty >= 1, and unitSalePrice >= 0', () => {
  assert.equal(
    runMiddleware(validateUpdateOrderItems, {
      body: { items: [{ skuId: oid(), orderedQty: 1, unitSalePrice: 0 }] },
    }).nextCalled,
    true
  );

  for (const body of [
    { items: [] },
    { items: [{ orderedQty: 1 }] },
    { items: [{ skuId: oid(), orderedQty: 0 }] },
    { items: [{ skuId: oid(), orderedQty: 1.5 }] },
    { items: [{ skuId: oid(), orderedQty: -2 }] },
    { items: [{ skuId: oid(), orderedQty: 1, unitSalePrice: -1 }] },
    { items: [{ skuId: oid(), orderedQty: 1, unitSalePrice: 'bad' }] },
  ]) {
    assert.equal(runMiddleware(validateUpdateOrderItems, { body }).statusCode, 400);
  }
});

test('[N][A][B] validateCancelOrder: rejects empty or < 3 chars and accepts boundary 3 chars', () => {
  assert.equal(runMiddleware(validateCancelOrder, { body: { cancelReason: 'Khách đổi ý' } }).nextCalled, true);
  assert.equal(runMiddleware(validateCancelOrder, { body: { cancelReason: 'Hủy' } }).nextCalled, true);

  for (const cancelReason of [undefined, '', '   ', 'ab', ' a ']) {
    assert.equal(runMiddleware(validateCancelOrder, { body: { cancelReason } }).statusCode, 400);
  }
});

test('[N][A][B] validateUpdateOrderRecipient: normalizes +84 phone, rejects masked * fields, and enforces address >= 5 chars', () => {
  const ok = runMiddleware(validateUpdateOrderRecipient, {
    body: { name: '  Nguyễn Hoa  ', phone: '+84 987 654 321', address: 'Số 5A' },
  });
  assert.equal(ok.nextCalled, true);
  assert.equal(ok.req.body.name, 'Nguyễn Hoa');
  assert.equal(ok.req.body.phone, '0987654321');
  assert.equal(ok.req.body.address, 'Số 5A');

  // Abnormal & Boundary cases
  for (const body of [
    { name: 'N***n', phone: '0987654321', address: '12 Cầu Giấy' },
    { name: 'Nguyễn Hoa', phone: '0987***321', address: '12 Cầu Giấy' },
    { name: 'Nguyễn Hoa', phone: '0281234567', address: '12 Cầu Giấy' },
    { name: 'Nguyễn Hoa', phone: '0987654321', address: '1234' }, // Boundary: 4 chars (< 5)
    { name: 'Nguyễn Hoa', phone: '0987654321', address: '123* Cầu Giấy' },
  ]) {
    assert.equal(runMiddleware(validateUpdateOrderRecipient, { body }).statusCode, 400);
  }
});

test('[N][A][B] splitOrderItemsFromCell: parses single, newline-separated, comma-separated items, and empty input', () => {
  assert.deepEqual(splitOrderItemsFromCell(''), []);
  assert.deepEqual(splitOrderItemsFromCell(null), []);
  assert.deepEqual(splitOrderItemsFromCell(123), []);

  const single = splitOrderItemsFromCell('AL186-KEM-M', 2, 250000);
  assert.equal(single.length, 1);
  assert.equal(single[0].quantity, 2);
  assert.equal(single[0].unitPrice, 250000);

  const multiComma = splitOrderItemsFromCell('AL186 - KEM SIZE: S x 2, CV68 - DEN SIZE: M x 3', 1, 500000);
  assert.equal(multiComma.length, 2);
  assert.equal(multiComma[0].quantity, 2);
  assert.equal(multiComma[1].quantity, 3);
  assert.equal(multiComma[0].unitPrice, 0);

  const multiLine = splitOrderItemsFromCell('AL186-KEM-S x 1\nCV68-DEN-M x 0');
  assert.equal(multiLine.length, 2);
  assert.equal(multiLine[1].quantity, 1); // Boundary: x 0 clamped to 1
});

test('[N] getSalesChannels & generateExcelTemplate: returns channels and builds valid Excel workbooks', async () => {
  const channels = getSalesChannels();
  assert.ok(Array.isArray(channels) && channels.length >= 4);
  assert.ok(channels.some((c) => c.channel === 'SHOPEE'));
  assert.ok(channels.some((c) => c.channel === 'TIKTOK'));

  for (const type of ['SHOPEE', 'TIKTOK', 'EXCEL_IMPORT']) {
    const buffer = await generateExcelTemplate(type);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    assert.equal(wb.worksheets.length, 1);
    assert.ok(wb.worksheets[0].rowCount >= 2, `Template ${type} must have header + sample row`);
  }
});

// ============================================================================
// 3. REVERSE LOGISTICS — RMA VALIDATION, FAULT CLASSIFICATION & SURCHARGE MATH
// ============================================================================

test('[N][A] validateCreateRma: normalizes populated skuId objects and rejects malformed payloads', () => {
  const orderId = oid();
  const skuId = oid();

  const ok = runMiddleware(validateCreateRma, {
    body: {
      originalOrderId: orderId,
      returnType: 'RETURN_FOR_REFUND',
      returnItems: [{ skuId: { _id: skuId, skuCode: 'SKU-1' }, returnedQty: 1 }],
    },
  });
  assert.equal(ok.nextCalled, true);
  assert.equal(ok.req.body.returnItems[0].skuId, skuId);

  for (const body of [
    { returnType: 'RETURN_FOR_REFUND', returnItems: [{ skuId }] },
    { originalOrderId: 'ORD-00001', returnType: 'RETURN_FOR_REFUND', returnItems: [{ skuId }] },
    { originalOrderId: orderId, returnType: 'INVALID_TYPE', returnItems: [{ skuId }] },
    { originalOrderId: orderId, returnType: 'EXCHANGE_PRODUCT', returnItems: [] },
    { originalOrderId: orderId, returnType: 'EXCHANGE_PRODUCT', returnItems: [{ skuId: 'not-an-id' }] },
  ]) {
    const r = runMiddleware(validateCreateRma, { body });
    assert.equal(r.nextCalled, false);
    assert.equal(r.statusCode, 400);
  }
});

test('[N][B] classifyReturnFaultByBR: distinguishes explicit faultType, Vietnamese store-fault keywords, and customer-fault fallback', () => {
  assert.equal(classifyReturnFaultByBR('Đổi ý', 'STORE_FAULT').isStoreFault, true);
  assert.equal(classifyReturnFaultByBR('', 'MANUFACTURING_DEFECT').isStoreFault, true);
  assert.equal(classifyReturnFaultByBR('', 'WRONG_ITEM_DELIVERED').isStoreFault, true);
  assert.equal(classifyReturnFaultByBR('Lỗi vải', 'CUSTOMER_FAULT').isStoreFault, false);

  assert.equal(classifyReturnFaultByBR('Áo bị sút chỉ và lỗi vải').isStoreFault, true);
  assert.equal(classifyReturnFaultByBR('Shop giao nhầm màu trắng sang đen').isStoreFault, true);
  assert.equal(classifyReturnFaultByBR('Khách mặc chật muốn đổi size L').isStoreFault, false);
  assert.equal(classifyReturnFaultByBR('').isStoreFault, false);
});

test('[N][B] calculateRefundFinancialsByBR: computes 100% store-fault refund, 10% customer-fault surcharge, rounding, and zero clamping', () => {
  // Store fault: 100% refund, ignores shipping fee deduction
  const storeFault = calculateRefundFinancialsByBR({
    returnedMerchandiseValue: 300000,
    isStoreFault: true,
    shippingFeeDeduction: 30000,
  });
  assert.equal(storeFault.apply10PercentSurcharge, false);
  assert.equal(storeFault.surcharge10PercentAmount, 0);
  assert.equal(storeFault.shippingFeeDeduction, 0);
  assert.equal(storeFault.finalNetRefundOrCollect, 300000);

  // Customer fault: 90% - shippingFee
  const custFault = calculateRefundFinancialsByBR({
    returnedMerchandiseValue: 300000,
    isStoreFault: false,
    shippingFeeDeduction: 30000,
  });
  assert.equal(custFault.apply10PercentSurcharge, true);
  assert.equal(custFault.surcharge10PercentAmount, 30000);
  assert.equal(custFault.shippingFeeDeduction, 30000);
  assert.equal(custFault.finalNetRefundOrCollect, 240000);

  // Boundary: odd rounding
  const odd = calculateRefundFinancialsByBR({ returnedMerchandiseValue: 155555, isStoreFault: false });
  assert.equal(odd.surcharge10PercentAmount, 15556);
  assert.equal(odd.finalNetRefundOrCollect, 139999);

  // Boundary: zero / negative merchandise value and excessive shipping fee clamped to 0
  const neg = calculateRefundFinancialsByBR({ returnedMerchandiseValue: -50000, isStoreFault: false });
  assert.equal(neg.returnedMerchandiseValue, 0);
  assert.equal(neg.finalNetRefundOrCollect, 0);

  const clamped = calculateRefundFinancialsByBR({
    returnedMerchandiseValue: 50000,
    isStoreFault: false,
    shippingFeeDeduction: 80000,
  });
  assert.equal(clamped.finalNetRefundOrCollect, 0);
});

test('[N][A] validateCreateExchangeOrder: accepts non-empty newItems and rejects empty or missing arrays', () => {
  assert.equal(
    runMiddleware(validateCreateExchangeOrder, { body: { newItems: [{ skuId: oid(), orderedQty: 1 }] } }).nextCalled,
    true
  );

  for (const body of [{}, { newItems: [] }, { newItems: 'invalid' }]) {
    const r = runMiddleware(validateCreateExchangeOrder, { body });
    assert.equal(r.nextCalled, false);
    assert.equal(r.statusCode, 400);
  }
});

