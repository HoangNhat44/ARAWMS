import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import router from './productConfiguration.routes.js';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';

test('cấu hình mới sinh mã và SKU, không phát sinh tồn kho', async () => {
  const original = {
    findOne: Product.findOne, createProduct: Product.create, createSku: Sku.create, findSku: Sku.find,
    sequence: CounterSequence.getNextSequence, session: mongoose.startSession,
  };
  let productCreated = 0;
  let skuPayload;
  let createdProduct;
  let createdSkus;
  let server;
  try {
    Product.findOne = async () => createdProduct || null;
    CounterSequence.getNextSequence = async () => 'SP-2026-00001';
    Product.create = async (items) => {
      productCreated++;
      createdProduct = { ...items[0], _id: new mongoose.Types.ObjectId() };
      return [createdProduct];
    };
    Sku.create = async (items) => {
      skuPayload = items;
      createdSkus = items.map((item) => ({ ...item, _id: new mongoose.Types.ObjectId() }));
      return createdSkus;
    };
    Sku.find = async () => createdSkus;
    mongoose.startSession = async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} });
    const app = express();
    app.use(express.json());
    app.use(router);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/new`;
    const base = { requestId: 'config-request-123456', productName: 'Áo thun', sampleCode: 'AT01',
      category: 'Áo thun', basePrice: 150000, status: 'ACTIVE' };
    const invalid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      ...base, variants: [{ color: 'Trắng', size: 'M' }, { color: ' trắng ', size: 'M' }],
    }) });
    assert.equal(invalid.status, 400);
    assert.equal(productCreated, 0);

    const valid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      ...base, variants: [{ color: 'Trắng', size: 'M' }, { color: 'Trắng', size: 'L', retailPrice: 160000 }],
    }) });
    assert.equal(valid.status, 201);
    assert.equal(productCreated, 1);
    assert.equal(skuPayload.length, 2);
    assert.equal(skuPayload[0].retailPrice, 150000);
    assert.equal(skuPayload[1].retailPrice, 160000);
    assert.ok(skuPayload.every((sku) => sku.skuCode.startsWith('SP-2026-00001-V') && sku.onHandQty === undefined));
    const repeated = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      ...base, variants: [{ color: 'Trắng', size: 'M' }, { color: 'Trắng', size: 'L', retailPrice: 160000 }],
    }) });
    assert.equal(repeated.status, 200);
    assert.equal(productCreated, 1);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    Product.findOne = original.findOne;
    Product.create = original.createProduct;
    Sku.create = original.createSku;
    Sku.find = original.findSku;
    CounterSequence.getNextSequence = original.sequence;
    mongoose.startSession = original.session;
  }
});

test('cập nhật giá chỉ cho SKU thuộc đúng sản phẩm', async () => {
  const original = Sku.findOneAndUpdate;
  const productId = new mongoose.Types.ObjectId();
  const skuId = new mongoose.Types.ObjectId();
  let server;
  try {
    Sku.findOneAndUpdate = async (filter, update) => {
      assert.equal(String(filter.productId), String(productId));
      assert.equal(String(filter._id), String(skuId));
      assert.equal(update.$set.retailPrice, 175000);
      return { _id: skuId, retailPrice: 175000 };
    };
    const app = express();
    app.use(express.json());
    app.use(router);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/${productId}/variants/${skuId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retailPrice: 175000 }),
    });
    assert.equal(response.status, 200);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    Sku.findOneAndUpdate = original;
  }
});

test('không thêm lại biến thể màu và size đã có', async () => {
  const original = { productFind: Product.findOne, skuFind: Sku.find, skuCreate: Sku.create, session: mongoose.startSession };
  const productId = new mongoose.Types.ObjectId();
  let created = false;
  let server;
  try {
    Product.findOne = () => ({ session: async () => ({ _id: productId, basePrice: 150000 }) });
    Sku.find = () => ({ session: async () => [{ color: 'Trắng', size: 'M' }] });
    Sku.create = async () => { created = true; return []; };
    mongoose.startSession = async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} });
    const app = express();
    app.use(express.json());
    app.use(router);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/${productId}/variants`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variants: [{ color: ' trắng ', size: 'M' }] }),
    });
    assert.equal(response.status, 409);
    assert.equal(created, false);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    Product.findOne = original.productFind;
    Sku.find = original.skuFind;
    Sku.create = original.skuCreate;
    mongoose.startSession = original.session;
  }
});
