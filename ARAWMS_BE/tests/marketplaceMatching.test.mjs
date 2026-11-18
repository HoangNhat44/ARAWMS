/*
 * File: marketplaceMatching.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-14
 * Description: Checks exact SKU matching for marketplace order lines and that orders with an
 *              unmatched or stopped SKU are never created with missing lines.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Product from '../src/models/Product.model.js';
import Sku from '../src/models/Sku.model.js';
import SalesOrder from '../src/models/SalesOrder.model.js';
import Customer from '../src/models/Customer.model.js';
import { findMatchingSku, processImportOrders } from '../src/modules/order-fulfillment/marketplace-order-import/marketplaceOrderImport.service.js';

let server;
const skus = {};
test.before(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  await Promise.all([Product.init(), Sku.init(), SalesOrder.init(), Customer.init()]);
  const make = async (productCode, variants) => {
    const product = await Product.create({ productCode, productName: productCode,
      category: 'Áo', basePrice: 100000, isActive: true });
    for (const [color, colorCode, size, extra = {}] of variants) {
      const skuCode = `${productCode}-${colorCode}-${size}`;
      skus[skuCode] = await Sku.create({ productId: product._id, skuCode, skuBarcode: skuCode, styleName: productCode,
        color, size, retailPrice: 100000, onHandQty: 10, variantKey: `${product._id}:${color}:${size}`, ...extra });
    }
  };
  await make('AL18', [['Đen', 'DEN', 'M']]);
  await make('AL186', [['Kem', 'KEM', 'M'], ['Kem', 'KEM', 'L'], ['Đỏ', 'DO', 'M', { isActive: false, discontinuedAt: new Date() }]]);
});
test.after(async () => { await mongoose.disconnect(); await server?.stop(); });

const codeOf = async (text) => (await findMatchingSku(text))?.skuCode ?? null;

test('exact SKU code, barcode, or SKU code inside a longer title', async () => {
  assert.equal(await codeOf('al186-kem-m'), 'AL186-KEM-M');
  assert.equal(await codeOf('AL186-KEM-L Áo len dáng rộng x 1'), 'AL186-KEM-L');
});

test('product code is matched exactly, never by prefix', async () => {
  // "AL18" must not fall into AL186's SKUs, and AL186's title must not fall into AL18.
  assert.equal(await codeOf('AL18 ÁO THUN - ĐEN size: M x 1'), 'AL18-DEN-M');
  assert.equal(await codeOf('AL186 ÁO LEN - KEM size: M x 1'), 'AL186-KEM-M');
  assert.equal(await codeOf('AL1 ÁO - KEM size: M x 1'), null);
});

test('color and size must identify exactly one active variant', async () => {
  assert.equal(await codeOf('AL186 ÁO LEN - KEM x 1'), null, 'two sizes of KEM: ambiguous');
  assert.equal(await codeOf('AL186 ÁO LEN - XANH size: M x 1'), null, 'color does not exist');
  assert.equal(await codeOf('AL186 ÁO LEN - ĐỎ size: M x 1'), null, 'stopped color is not sellable');
  assert.equal(await codeOf('AL186-DO-M'), null, 'stopped SKU code is not sellable');
});

test('orders with an unmatched or stopped SKU are rejected whole, others are created', async () => {
  const user = { _id: new mongoose.Types.ObjectId(), fullName: 'Seller test', roleCode: 'SELLER' };
  const line = (sku, qty = 1) => ({ skuId: sku ? String(sku._id) : null, rawProductName: sku?.skuCode || 'Hàng lạ', quantity: qty, unitPrice: 100000 });
  const result = await processImportOrders({ channel: 'SHOPEE', sourceId: 'test', sourceName: 'Test', orders: [
    { externalOrderCode: 'OK-1', customerName: 'A', phone: '0912345678', address: 'HN', items: [line(skus['AL186-KEM-M'])] },
    { externalOrderCode: 'MISSING-1', customerName: 'B', phone: '0912345679', address: 'HN',
      items: [line(skus['AL186-KEM-L']), line(null)] },
    { externalOrderCode: 'STOPPED-1', customerName: 'C', phone: '0912345670', address: 'HN', items: [line(skus['AL186-DO-M'])] },
  ] }, {}, user, null);
  assert.equal(result.totalCreated, 1);
  assert.deepEqual(result.rejectedOrders.map((item) => item.externalOrderCode), ['MISSING-1', 'STOPPED-1']);
  assert.match(result.rejectedOrders[1].reason, /ngừng bán/);
  assert.equal(await SalesOrder.countDocuments({ 'sourceDetails.externalOrderCode': 'MISSING-1' }), 0);
  assert.equal(await Customer.countDocuments({ phone: '0912345679' }), 0, 'no customer for a rejected order');
  assert.equal((await Sku.findById(skus['AL186-KEM-L']._id)).reservedQty, 0, 'nothing reserved for a rejected order');
  assert.equal((await Sku.findById(skus['AL186-KEM-M']._id)).reservedQty, 1);
});
