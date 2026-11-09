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
    payload: { productName: 'Áo thử offline', sampleCode: 'OFFLINE-01', category: 'Áo',
      description: '', basePrice: 100000, status: 'ACTIVE',
      variants: [{ color: 'Đen', size: 'M', retailPrice: 100000 }] } };
  const first = await send(body);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await send(body);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(first.body.data.product.id, second.body.data.product.id);
  assert.equal(await Product.countDocuments({ sampleCode: 'OFFLINE-01' }), 1);
  assert.equal(await Sku.countDocuments({ productId: first.body.data.product.id }), 1);
  const changed = await send({ ...body, payload: { ...body.payload, productName: 'Khác' } });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error.code, 'OPERATION_PAYLOAD_CONFLICT');
});

test('stale product version is rejected and does not overwrite the first edit', async () => {
  const created = await Product.findOne({ sampleCode: 'OFFLINE-01' });
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
    stt: '1', productCode: 'IMPORT-01', productName: 'Áo import - Đỏ', category: 'Áo',
    color: 'Đỏ', description: '', basePrice: 120000, rows: [2, 3],
    variants: [
      { skuCode: 'IMPORT-01-M', size: 'M', price: 120000, barcode: 'IMPORT-01-M', threshold: 10 },
      { skuCode: 'IMPORT-01-L', size: 'L', price: 120000, barcode: 'IMPORT-01-L', threshold: 10 },
    ],
  } };
  const first = await send(importBody);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const retry = await send(importBody);
  assert.equal(retry.status, 200);
  assert.equal(first.body.data.product.id, retry.body.data.product.id);
  assert.equal(await Sku.countDocuments({ productId: first.body.data.product.id }), 2);
  const duplicate = await send({ ...importBody, operationId: 'offline-import-0002' });
  assert.equal(duplicate.status, 409);
  assert.equal(await Product.countDocuments({ productCode: 'IMPORT-01' }), 1);
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

test('two devices cannot claim the same sample code', async () => {
  const response = await send({ operationId: 'offline-create-0002', operationType: 'CREATE',
    payload: { productName: 'Mẫu trên máy khác', sampleCode: 'OFFLINE-01', category: 'Áo',
      description: '', basePrice: 100000, status: 'ACTIVE',
      variants: [{ color: 'Trắng', size: 'L', retailPrice: 100000 }] } });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'DUPLICATE_PRODUCT_OR_VARIANT');
  assert.equal(await Product.countDocuments({ sampleCode: 'OFFLINE-01' }), 1);
});

test('the same operation ID belongs to each authenticated account separately', async () => {
  const secondToken = await createTestToken('WAREHOUSE_MANAGER');
  const response = await request(app).post('/api/products/configuration/sync')
    .set('Authorization', `Bearer ${secondToken}`).send({ operationId: 'offline-create-0001',
      operationType: 'CREATE', payload: { productName: 'Mẫu khác tài khoản', sampleCode: 'ACCOUNT-02',
        category: 'Áo', description: '', basePrice: 2000, status: 'ACTIVE',
        variants: [{ color: 'Xanh', size: 'S', retailPrice: 2000 }] } });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(await CatalogOperation.countDocuments({ operationId: 'offline-create-0001' }), 2);
});

test('SKU color and size edits check version and physical stock', async () => {
  const product = await Product.findOne({ sampleCode: 'OFFLINE-01' });
  const before = await Sku.findOne({ productId: product._id });
  const changed = await send({ operationId: 'offline-sku-edit-0001', operationType: 'UPDATE_SKU',
    serverEntityId: String(product._id), baseVersion: before.version ?? 0,
    payload: { skuId: String(before._id), color: 'Trắng', size: 'L', retailPrice: 110000 } });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.data.sku.color, 'Trắng');
  assert.equal(changed.body.data.sku.size, 'L');
  const stale = await send({ operationId: 'offline-sku-edit-0002', operationType: 'UPDATE_SKU',
    serverEntityId: String(product._id), baseVersion: before.version ?? 0,
    payload: { skuId: String(before._id), color: 'Xanh' } });
  assert.equal(stale.status, 409);
  await Sku.updateOne({ _id: before._id }, { $set: { onHandQty: 1 } });
  const stocked = await send({ operationId: 'offline-sku-edit-0003', operationType: 'UPDATE_SKU',
    serverEntityId: String(product._id), baseVersion: changed.body.data.sku.version,
    payload: { skuId: String(before._id), color: 'Xanh' } });
  assert.equal(stocked.status, 409);
  assert.equal(stocked.body.error.code, 'SKU_HAS_STOCK');
});

test('unavailable media storage leaves an Excel product uncommitted for retry', async () => {
  const names = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const previous = names.map((name) => process.env[name]);
  names.forEach((name) => { process.env[name] = ''; });
  try {
    const response = await send({ operationId: 'offline-import-media-0001', operationType: 'IMPORT_PRODUCT',
      payload: { productCode: 'IMPORT-MEDIA', productName: 'Áo - Xanh', category: 'Áo',
        color: 'Xanh', basePrice: 120000, imageUrl: 'https://example.test/image.jpg',
        variants: [{ skuCode: 'IMPORT-MEDIA-M', size: 'M', price: 120000, threshold: 10 }] } });
    assert.equal(response.status, 503);
    assert.equal(await Product.countDocuments({ productCode: 'IMPORT-MEDIA' }), 0);
    assert.equal(await CatalogOperation.countDocuments({ operationId: 'offline-import-media-0001' }), 0);
  } finally { names.forEach((name, index) => {
    if (previous[index] == null) delete process.env[name]; else process.env[name] = previous[index];
  }); }
});

test('retrying an uploaded additional image does not append it twice', async () => {
  const product = await Product.findOne({ sampleCode: 'OFFLINE-01' });
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
