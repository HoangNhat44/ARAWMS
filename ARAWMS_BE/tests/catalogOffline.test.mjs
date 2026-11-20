/*
 * File: catalogOffline.test.mjs
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Checks catalog sync replay, payload identity, and concurrent edit protection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import { createTestToken } from './support/authSession.mjs';
import User from '../src/models/User.model.js';
import Product from '../src/models/Product.model.js';
import Sku from '../src/models/Sku.model.js';
import CatalogOperation from '../src/models/CatalogOperation.model.js';

let replicaSet;
let token;
test.before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([Product.init(), Sku.init(), CatalogOperation.init(), User.init()]);
  token = await createTestToken('WAREHOUSE_MANAGER');
});
test.after(async () => { await mongoose.disconnect(); await replicaSet?.stop(); });

const send = (body) => request(app).post('/api/products/configuration/sync')
  .set('Authorization', `Bearer ${token}`).send(body);

test('retry returns one product and rejects payload changes under the same operation ID', async () => {
  const body = { operationId: 'offline-create-0001', operationType: 'CREATE',
    payload: { productName: 'Áo thử offline', productCode: 'OFFLINE01', category: 'Áo',
      description: '', basePrice: 100000, status: 'ACTIVE',
      variants: [{ color: 'Đen', size: 'M', retailPrice: 100000 }] } };
  const first = await send(body);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await send(body);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(first.body.data.product.id, second.body.data.product.id);
  assert.equal(await Product.countDocuments({ productCode: 'OFFLINE01' }), 1);
  assert.equal(await Sku.countDocuments({ productId: first.body.data.product.id }), 1);
  const changed = await send({ ...body, payload: { ...body.payload, productName: 'Khác' } });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error.code, 'OPERATION_PAYLOAD_CONFLICT');
});

test('stale product version is rejected and does not overwrite the first edit', async () => {
  const created = await Product.findOne({ productCode: 'OFFLINE01' });
  const baseVersion = created.version ?? 0;
  const first = await send({ operationId: 'offline-update-0001', operationType: 'UPDATE_PRODUCT',
    serverEntityId: String(created._id), baseVersion, payload: { productName: 'Tên mới' } });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const stale = await send({ operationId: 'offline-update-0002', operationType: 'UPDATE_PRODUCT',
    serverEntityId: String(created._id), baseVersion, payload: { productName: 'Ghi đè' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'VERSION_CONFLICT');
  assert.equal((await Product.findById(created._id)).productName, 'Tên mới');
});

test('Excel product row group replays once and duplicate codes require review', async () => {
  const importBody = { operationId: 'offline-import-0001', operationType: 'IMPORT_PRODUCT', payload: {
    stt: '1', productCode: 'IMPORT01', productName: 'Áo import', category: 'Áo',
    description: '', basePrice: 120000, rows: [2, 3, 4],
    variants: [
      { color: 'Đỏ', size: 'M', price: 120000, barcode: 'BC-IMPORT-DO-M', threshold: 5 },
      { color: 'Đỏ', size: 'L', price: 125000, threshold: 10 },
      { color: 'Trắng', size: 'M', price: 120000, threshold: 10 },
    ],
  } };
  const first = await send(importBody);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const retry = await send(importBody);
  assert.equal(retry.status, 200);
  assert.equal(first.body.data.product.id, retry.body.data.product.id);
  assert.ok(first.body.data.product.codeLockedAt);
  const skus = await Sku.find({ productId: first.body.data.product.id }).sort({ skuCode: 1 });
  assert.deepEqual(skus.map((sku) => sku.skuCode), ['IMPORT01-DO-L', 'IMPORT01-DO-M', 'IMPORT01-TRANG-M']);
  assert.equal(skus.find((sku) => sku.skuCode === 'IMPORT01-DO-M').skuBarcode, 'BC-IMPORT-DO-M');
  assert.equal(skus.find((sku) => sku.skuCode === 'IMPORT01-DO-M').safetyStockThreshold, 5);
  assert.equal(skus.find((sku) => sku.skuCode === 'IMPORT01-DO-L').skuBarcode, 'IMPORT01-DO-L');
  const duplicate = await send({ ...importBody, operationId: 'offline-import-0002' });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'DUPLICATE_PRODUCT_CODE');
  assert.equal(await Product.countDocuments({ productCode: 'IMPORT01' }), 1);
});

test('Excel import rejects old per-color codes and accepts queued single-color payloads', async () => {
  const oldCode = await send({ operationId: 'offline-import-old-0001', operationType: 'IMPORT_PRODUCT', payload: {
    stt: '1', productCode: 'AL186-KEM', productName: 'Áo len', category: 'Áo', basePrice: 1000,
    variants: [{ color: 'Kem', size: 'M', price: 1000, threshold: 10 }] } });
  assert.equal(oldCode.status, 400);
  assert.equal(oldCode.body.error.code, 'INVALID_PRODUCT_CODE');
  // Operations queued before this change carry one product-level color and an unused skuCode.
  const queued = await send({ operationId: 'offline-import-old-0002', operationType: 'IMPORT_PRODUCT', payload: {
    stt: '2', productCode: 'QUEUED01', productName: 'Áo cũ - Xanh', category: 'Áo', color: 'Xanh', basePrice: 1000,
    variants: [{ skuCode: 'QUEUED01-XANH-S', size: 'S', price: 1000, threshold: 10 }] } });
  assert.equal(queued.status, 201, JSON.stringify(queued.body));
  assert.equal(queued.body.data.skus[0].skuCode, 'QUEUED01-XANH-S');
});

test('an existing product without a version can be edited once from base version zero', async () => {
  const inserted = await Product.collection.insertOne({ productCode: 'LEGACY-01', productName: 'Mẫu cũ',
    sampleCode: 'LEGACY-01', category: 'Áo', basePrice: 1000, isActive: true, isDeleted: false });
  const response = await send({ operationId: 'offline-legacy-0001', operationType: 'UPDATE_PRODUCT',
    serverEntityId: String(inserted.insertedId), baseVersion: 0, payload: { productName: 'Mẫu đã sửa' } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const changed = await Product.findById(inserted.insertedId);
  assert.equal(changed.productName, 'Mẫu đã sửa');
  assert.equal(changed.version, 1);
});

test('two devices cannot claim the same product code', async () => {
  const response = await send({ operationId: 'offline-create-0002', operationType: 'CREATE',
    payload: { productName: 'Mẫu trên máy khác', productCode: 'OFFLINE01', category: 'Áo',
      description: '', basePrice: 100000, status: 'ACTIVE',
      variants: [{ color: 'Trắng', size: 'L', retailPrice: 100000 }] } });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'DUPLICATE_PRODUCT_CODE');
  assert.equal(await Product.countDocuments({ productCode: 'OFFLINE01' }), 1);
});

test('the same operation ID belongs to each authenticated account separately', async () => {
  const secondToken = await createTestToken('WAREHOUSE_MANAGER');
  const response = await request(app).post('/api/products/configuration/sync')
    .set('Authorization', `Bearer ${secondToken}`).send({ operationId: 'offline-create-0001',
      operationType: 'CREATE', payload: { productName: 'Mẫu khác tài khoản', productCode: 'ACCOUNT02',
        category: 'Áo', description: '', basePrice: 2000, status: 'ACTIVE',
        variants: [{ color: 'Xanh', size: 'S', retailPrice: 2000 }] } });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(await CatalogOperation.countDocuments({ operationId: 'offline-create-0001' }), 2);
});

test('SKU codes are PRODUCTCODE-COLOR-SIZE', async () => {
  const product = await Product.findOne({ productCode: 'OFFLINE01' });
  const sku = await Sku.findOne({ productId: product._id });
  assert.equal(sku.skuCode, 'OFFLINE01-DEN-M');
  assert.equal(sku.skuBarcode, 'OFFLINE01-DEN-M');
  assert.ok(product.codeLockedAt, 'ACTIVE product must have its code locked');
  const raw = await Product.collection.findOne({ _id: product._id });
  assert.equal('sampleCode' in raw, false, 'productCode is the only code field; sampleCode is never written');
});

test('invalid product codes are rejected', async () => {
  for (const [index, productCode] of ['AL-186', 'ÁO01', 'A'].entries()) {
    const response = await send({ operationId: `offline-bad-code-000${index}`, operationType: 'CREATE',
      payload: { productName: 'Mã sai', productCode, category: 'Áo', description: '', basePrice: 1000,
        status: 'DRAFT', variants: [{ color: 'Đen', size: 'M' }] } });
    assert.equal(response.status, 400, productCode);
    assert.equal(response.body.error.code, 'INVALID_PRODUCT_CODE');
  }
});

test('SKU edits change only the price; color and size are immutable', async () => {
  const product = await Product.findOne({ productCode: 'OFFLINE01' });
  const before = await Sku.findOne({ productId: product._id });
  const price = await send({ operationId: 'offline-sku-edit-0001', operationType: 'UPDATE_SKU',
    serverEntityId: String(product._id), baseVersion: before.version ?? 0,
    payload: { skuId: String(before._id), retailPrice: 110000 } });
  assert.equal(price.status, 200, JSON.stringify(price.body));
  assert.equal(price.body.data.sku.retailPrice, 110000);
  const stale = await send({ operationId: 'offline-sku-edit-0002', operationType: 'UPDATE_SKU',
    serverEntityId: String(product._id), baseVersion: before.version ?? 0,
    payload: { skuId: String(before._id), retailPrice: 120000 } });
  assert.equal(stale.status, 409);
  const color = await send({ operationId: 'offline-sku-edit-0003', operationType: 'UPDATE_SKU',
    serverEntityId: String(product._id), baseVersion: price.body.data.sku.version,
    payload: { skuId: String(before._id), color: 'Xanh' } });
  assert.equal(color.status, 400);
  assert.equal(color.body.error.code, 'SKU_ATTRIBUTE_IMMUTABLE');
  assert.equal((await Sku.findById(before._id)).color, 'Đen');
});

test('a product sells and its code is locked as soon as it is added, even from an old queued draft', async () => {
  // An operation queued by an older client that still sends status DRAFT.
  const created = await send({ operationId: 'offline-draft-code-0001', operationType: 'CREATE',
    payload: { productName: 'Mẫu cũ', productCode: 'DRAFT01', category: 'Áo', description: '',
      basePrice: 5000, status: 'DRAFT', variants: [{ color: 'Trắng', size: 'S' }, { color: 'Đỏ đô', size: 'M' }] } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const productId = created.body.data.product.id;
  assert.equal(created.body.data.product.isActive, true);
  assert.ok(created.body.data.product.codeLockedAt);
  assert.ok((await Sku.find({ productId })).every((sku) => sku.isActive));
  const renamed = await send({ operationId: 'offline-draft-code-0002', operationType: 'UPDATE_PRODUCT',
    serverEntityId: productId, baseVersion: 0, payload: { productCode: 'DRAFT02' } });
  assert.equal(renamed.status, 409);
  assert.equal(renamed.body.error.code, 'PRODUCT_CODE_LOCKED');
  // A status sent by an older client no longer turns a product back into a draft.
  const draft = await send({ operationId: 'offline-draft-code-0003', operationType: 'UPDATE_PRODUCT',
    serverEntityId: productId, baseVersion: 0, payload: { productName: 'Mẫu cũ đã sửa', status: 'DRAFT' } });
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  assert.equal(draft.body.data.product.isActive, true);
  assert.equal(draft.body.data.product.productName, 'Mẫu cũ đã sửa');
});

test('a draft saved by an older version can still be activated', async () => {
  const inserted = await Product.collection.insertOne({ productCode: 'OLDDRAFT', productName: 'Nháp cũ', category: 'Áo',
    basePrice: 1000, isActive: false, isDeleted: false, version: 0 });
  await Sku.create({ productId: inserted.insertedId, skuCode: 'OLDDRAFT-DEN-M', skuBarcode: 'OLDDRAFT-DEN-M', styleName: 'OLDDRAFT',
    color: 'Đen', size: 'M', retailPrice: 1000, isActive: false, variantKey: `${inserted.insertedId}:đen:M` });
  const activated = await send({ operationId: 'offline-old-draft-0001', operationType: 'UPDATE_PRODUCT',
    serverEntityId: String(inserted.insertedId), baseVersion: 0, payload: { status: 'ACTIVE' } });
  assert.equal(activated.status, 200, JSON.stringify(activated.body));
  assert.equal(activated.body.data.product.isActive, true);
  assert.ok(activated.body.data.product.codeLockedAt);
  assert.equal((await Sku.findOne({ skuCode: 'OLDDRAFT-DEN-M' })).isActive, true);
});

test('stopping a color keeps its SKUs; adding it again re-enables the same SKUs', async () => {
  const created = await send({ operationId: 'offline-color-0001', operationType: 'CREATE',
    payload: { productName: 'Áo len', productCode: 'AL186', category: 'Áo', description: '', basePrice: 9000,
      status: 'ACTIVE', variants: [{ color: 'Trắng', size: 'M' }, { color: 'Đỏ', size: 'M' }, { color: 'Đỏ', size: 'L' }] } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const productId = created.body.data.product.id;
  const redIds = (await Sku.find({ productId, color: 'Đỏ' })).map((sku) => String(sku._id)).sort();
  await Sku.updateOne({ productId, color: 'Đỏ', size: 'M' }, { $set: { onHandQty: 3 } });
  const stopped = await send({ operationId: 'offline-color-0002', operationType: 'SET_COLOR_ACTIVE',
    serverEntityId: productId, baseVersion: created.body.data.product.version, payload: { color: 'đỏ', isActive: false } });
  assert.equal(stopped.status, 200, JSON.stringify(stopped.body));
  assert.equal(stopped.body.data.stock.onHand, 3);
  const red = await Sku.find({ productId, color: 'Đỏ' });
  assert.ok(red.every((sku) => !sku.isActive && sku.discontinuedAt));
  assert.equal((await Sku.findOne({ productId, color: 'Trắng' })).isActive, true);
  assert.equal(stopped.body.data.product.isActive, true, 'one color still sells, so the product still sells');
  // Stopping the last color stops the whole product.
  const allStopped = await send({ operationId: 'offline-color-0003', operationType: 'SET_COLOR_ACTIVE',
    serverEntityId: productId, baseVersion: stopped.body.data.product.version, payload: { color: 'Trắng', isActive: false } });
  assert.equal(allStopped.status, 200, JSON.stringify(allStopped.body));
  assert.equal(allStopped.body.data.product.isActive, false);
  // Adding a stopped color again re-enables the same SKU and the product sells again.
  const readded = await send({ operationId: 'offline-color-0005', operationType: 'ADD_VARIANTS', serverEntityId: productId,
    baseVersion: allStopped.body.data.product.version, payload: { variants: [{ color: 'Đỏ', size: 'M' }] } });
  assert.equal(readded.status, 200, JSON.stringify(readded.body));
  assert.equal(readded.body.data.skus[0].skuCode, 'AL186-DO-M');
  assert.equal(readded.body.data.skus[0].isActive, true);
  assert.ok(redIds.includes(String(readded.body.data.skus[0].id)), 'must reuse the stopped SKU');
  assert.equal(readded.body.data.product.isActive, true);
  assert.equal(await Sku.countDocuments({ productId }), 3);
  // Resuming a color the same way also makes the product sell.
  const resumed = await send({ operationId: 'offline-color-0006', operationType: 'SET_COLOR_ACTIVE',
    serverEntityId: productId, baseVersion: readded.body.data.product.version, payload: { color: 'Trắng', isActive: true } });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
  assert.equal((await Sku.findOne({ productId, color: 'Trắng' })).isActive, true);
  assert.equal(resumed.body.data.product.isActive, true);
});

test('two color names that collapse to the same code are rejected', async () => {
  const response = await send({ operationId: 'offline-color-code-0001', operationType: 'CREATE',
    payload: { productName: 'Trùng mã màu', productCode: 'COLOR01', category: 'Áo', description: '', basePrice: 1000,
      status: 'DRAFT', variants: [{ color: 'Đỏ', size: 'M' }, { color: 'Do', size: 'M' }] } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'DUPLICATE_COLOR_CODE');
});

test('stopped SKUs that still hold stock are listed for the owner', async () => {
  const product = await Product.findOne({ productCode: 'AL186' });
  await send({ operationId: 'offline-color-stock-0001', operationType: 'SET_COLOR_ACTIVE', serverEntityId: String(product._id),
    baseVersion: product.version, payload: { color: 'Đỏ', isActive: false } });
  const response = await request(app).get('/api/products/configuration/discontinued-stock').set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const codes = response.body.data.items.map((item) => item.skuCode);
  assert.ok(codes.includes('AL186-DO-M'), 'stopped SKU with 3 on hand must be listed');
  assert.ok(!codes.includes('AL186-DO-L'), 'stopped SKU without stock is not listed');
  assert.equal(response.body.data.items.find((item) => item.skuCode === 'AL186-DO-M').productCode, 'AL186');
});

test('unavailable media storage leaves an Excel product uncommitted for retry', async () => {
  const names = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const previous = names.map((name) => process.env[name]);
  names.forEach((name) => { process.env[name] = ''; });
  try {
    const response = await send({ operationId: 'offline-import-media-0001', operationType: 'IMPORT_PRODUCT',
      payload: { productCode: 'IMPORTMEDIA', productName: 'Áo - Xanh', category: 'Áo',
        color: 'Xanh', basePrice: 120000, imageUrl: 'https://example.test/image.jpg',
        variants: [{ size: 'M', price: 120000, threshold: 10 }] } });
    assert.equal(response.status, 503);
    assert.equal(await Product.countDocuments({ productCode: 'IMPORTMEDIA' }), 0);
    assert.equal(await CatalogOperation.countDocuments({ operationId: 'offline-import-media-0001' }), 0);
  } finally { names.forEach((name, index) => {
    if (previous[index] == null) delete process.env[name]; else process.env[name] = previous[index];
  }); }
});

test('retrying an uploaded additional image does not append it twice', async () => {
  const product = await Product.findOne({ productCode: 'OFFLINE01' });
  const fileId = 'offline-image-file-0001';
  const bytes = Buffer.from('test-image-bytes');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const previousEnv = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
    .map((name) => process.env[name]);
  const originalUpload = cloudinary.uploader.upload_stream;
  let uploads = 0;
  ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
    .forEach((name) => { process.env[name] = 'test-only'; });
  cloudinary.uploader.upload_stream = (options, callback) => {
    uploads += 1;
    return new Writable({ write(chunk, encoding, done) { done(); },
      final(done) { callback(null, { secure_url: `https://example.test/${options.public_id}`,
        public_id: options.public_id }); done(); } });
  };
  const sendFile = (body, hash) => request(app).post(`/api/products/${product._id}/additional-image`)
    .set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png')
    .set('X-Catalog-File-Id', fileId).set('X-Content-SHA256', hash).send(body);
  try {
    const first = await sendFile(bytes, sha256);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const retry = await sendFile(bytes, sha256);
    assert.equal(retry.status, 200);
    assert.equal(uploads, 1);
    const changed = await sendFile(Buffer.from('different-image'), createHash('sha256').update('different-image').digest('hex'));
    assert.equal(changed.status, 409);
    const saved = await Product.findById(product._id);
    assert.equal(saved.additionalImageUrls.length, 1);
    assert.equal(saved.mediaOperations.length, 1);
  } finally {
    cloudinary.uploader.upload_stream = originalUpload;
    ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
      .forEach((name, index) => { if (previousEnv[index] == null) delete process.env[name];
        else process.env[name] = previousEnv[index]; });
  }
});
