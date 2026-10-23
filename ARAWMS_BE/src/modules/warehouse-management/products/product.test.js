import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import routes from './product.routes.js';
import User from '../../../models/User.model.js';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import FinishedGoodsBulkDocument from '../../../models/FinishedGoodsBulkDocument.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';

test('xuất kho chặn phần đã giữ và ghi giao dịch khi số lượng khả dụng đủ', async () => {
  const original = {
    secret: process.env.JWT_SECRET, userFind: User.findOne, productFind: Product.findOne,
    skuFind: Sku.findOne, skuUpdate: Sku.findOneAndUpdate,
    transactionCreate: InventoryTransaction.create, startSession: mongoose.startSession,
  };
  const productId = new mongoose.Types.ObjectId();
  const skuId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const records = [];
  let onHandQty = 5;
  let server;
  try {
    process.env.JWT_SECRET = 'test-secret';
    User.findOne = () => ({ lean: async () => ({ _id: userId, roleCode: 'WAREHOUSE_MANAGER' }) });
    Product.findOne = () => ({ session: async () => ({ _id: productId, isActive: true }) });
    Sku.findOne = () => ({ session: async () => ({ _id: skuId, skuCode: 'SKU-1', isActive: true, onHandQty, reservedQty: 3, unitCogs: 0 }) });
    Sku.findOneAndUpdate = async (filter, update) => {
      assert.ok(filter.$expr, 'xuất kho phải kiểm tra tồn khả dụng ngay trong lệnh cập nhật');
      onHandQty += update.$inc.onHandQty;
      return { onHandQty };
    };
    InventoryTransaction.create = async (items) => { records.push(...items); };
    mongoose.startSession = async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} });
    const app = express();
    app.use(express.json());
    app.use('/products', routes);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/products/${productId}/stock`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: String(userId) }, process.env.JWT_SECRET)}` };
    const request = (quantity) => fetch(url, { method: 'POST', headers, body: JSON.stringify({ direction: 'OUT', skuId: String(skuId), quantity }) });

    const blocked = await request(3);
    assert.equal(blocked.status, 409);
    assert.equal(onHandQty, 5);
    assert.equal(records.length, 0);

    const accepted = await request(2);
    assert.equal(accepted.status, 200);
    assert.equal(onHandQty, 3);
    assert.equal(records.length, 1);
    assert.equal(records[0].transactionType, 'MANUAL_OUTBOUND');
    assert.equal(records[0].quantityChange, -2);
    assert.equal(records[0].onHandBefore, 5);
    assert.equal(records[0].onHandAfter, 3);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    User.findOne = original.userFind;
    Product.findOne = original.productFind;
    Sku.findOne = original.skuFind;
    Sku.findOneAndUpdate = original.skuUpdate;
    InventoryTransaction.create = original.transactionCreate;
    mongoose.startSession = original.startSession;
    if (original.secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original.secret;
  }
});

test('phiếu nhập nhiều SKU ghi các dòng tồn kho cùng một chứng từ', async () => {
  const original = {
    secret: process.env.JWT_SECRET, userFind: User.findOne, productFind: Product.findOne,
    skuFind: Sku.findOne, skuUpdate: Sku.findOneAndUpdate,
    transactionCreate: InventoryTransaction.create, documentCreate: FinishedGoodsBulkDocument.create,
    locationFind: WarehouseLocation.findOne, locationUpdate: WarehouseLocation.findOneAndUpdate,
    insertUnits: ProductUnit.insertMany, batchCreate: FinishedGoodsBatch.create,
    startSession: mongoose.startSession,
  };
  const userId = new mongoose.Types.ObjectId();
  const productIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const skuIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const locationId = new mongoose.Types.ObjectId();
  const stocks = new Map(skuIds.map((id) => [String(id), 0]));
  const transactions = [];
  const units = [];
  let document;
  let server;
  try {
    process.env.JWT_SECRET = 'test-secret';
    User.findOne = () => ({ lean: async () => ({ _id: userId, roleCode: 'WAREHOUSE_MANAGER' }) });
    Product.findOne = (filter) => ({ session: async () => ({ _id: filter._id, productCode: 'TEST', isActive: true }) });
    Sku.findOne = (filter) => ({ session: async () => ({
      _id: filter._id, skuCode: `SKU-${filter._id}`, isActive: true, onHandQty: stocks.get(String(filter._id)), reservedQty: 0,
    }) });
    Sku.findOneAndUpdate = async (filter, update, options) => {
      assert.ok(options.session);
      const key = String(filter._id);
      stocks.set(key, stocks.get(key) + update.$inc.onHandQty);
      return { onHandQty: stocks.get(key) };
    };
    InventoryTransaction.create = async (items, options) => {
      assert.ok(options.session);
      transactions.push(...items);
    };
    WarehouseLocation.findOne = () => ({ session: async () => ({ _id: locationId }) });
    WarehouseLocation.findOneAndUpdate = async () => ({ _id: locationId });
    ProductUnit.insertMany = async (items) => { units.push(...items); return items; };
    FinishedGoodsBatch.create = async (items) => items;
    FinishedGoodsBulkDocument.create = async (items, options) => {
      assert.ok(options.session);
      [document] = items;
      return items;
    };
    mongoose.startSession = async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} });
    const app = express();
    app.use(express.json());
    app.use('/products', routes);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const invalid = await fetch(`http://127.0.0.1:${server.address().port}/products/bulk/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: String(userId) }, process.env.JWT_SECRET)}` },
      body: JSON.stringify({ direction: 'IN', documentCode: 'NK-INVALID', locationId: String(locationId), items: [
        { productId: String(productIds[0]), skuId: String(skuIds[0]), receivedQty: 3, quantity: 2, repairQty: 0 },
      ] }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(units.length, 0);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/products/bulk/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: String(userId) }, process.env.JWT_SECRET)}` },
      body: JSON.stringify({ direction: 'IN', documentCode: 'NK-2026-001', locationId: String(locationId), items: [
        { productId: String(productIds[0]), skuId: String(skuIds[0]), receivedQty: 3, quantity: 2, repairQty: 1 },
        { productId: String(productIds[1]), skuId: String(skuIds[1]), receivedQty: 4, quantity: 3, repairQty: 1 },
      ] }),
    });
    assert.equal(response.status, 201);
    assert.equal(document.documentCode, 'NK-2026-001');
    assert.equal(document.totalQuantity, 5);
    assert.equal(document.items.length, 2);
    assert.equal(units.length, 5);
    assert.equal(new Set(units.map((unit) => unit.barcode)).size, 5);
    assert.ok(units.every((unit) => String(unit.receivingDocumentId) === String(document._id)));
    assert.deepEqual(transactions.map((item) => item.quantityChange), [2, 3]);
    assert.ok(transactions.every((item) => item.referenceModel === 'FinishedGoodsBulkDocument' && String(item.referenceId) === String(document._id)));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    User.findOne = original.userFind;
    Product.findOne = original.productFind;
    Sku.findOne = original.skuFind;
    Sku.findOneAndUpdate = original.skuUpdate;
    InventoryTransaction.create = original.transactionCreate;
    FinishedGoodsBulkDocument.create = original.documentCreate;
    WarehouseLocation.findOne = original.locationFind;
    WarehouseLocation.findOneAndUpdate = original.locationUpdate;
    ProductUnit.insertMany = original.insertUnits;
    FinishedGoodsBatch.create = original.batchCreate;
    mongoose.startSession = original.startSession;
    if (original.secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original.secret;
  }
});
