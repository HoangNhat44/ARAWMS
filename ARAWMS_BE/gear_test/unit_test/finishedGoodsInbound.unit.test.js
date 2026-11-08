/*
 * File: finishedGoodsInbound.unit.test.js
 * Author: Duy Anh
 * Date: 2026-10-29
 * Description: Tests finished goods receiving rules and stock writes with an isolated MongoDB replica set.
 */
import { jest, beforeAll, afterAll, beforeEach, afterEach, describe, test, expect } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import Product from '../../src/models/Product.model.js';
import Sku from '../../src/models/Sku.model.js';
import WarehouseLocation from '../../src/models/WarehouseLocation.model.js';
import FinishedGoodsBulkDocument from '../../src/models/FinishedGoodsBulkDocument.model.js';
import FinishedGoodsTicket from '../../src/models/FinishedGoodsTicket.model.js';
import User from '../../src/models/User.model.js';
import FinishedGoodsBatch from '../../src/models/FinishedGoodsBatch.model.js';
import ProductUnit from '../../src/models/ProductUnit.js';
import InventoryTransaction from '../../src/models/InventoryTransaction.model.js';
import PutawayAllocation from '../../src/models/PutawayAllocation.model.js';
import { parseLines } from '../../src/modules/warehouse-management/location-layout/allocation.service.js';

// Receiving schedules a separate Cloudinary job; it is outside these stock tests.
const scheduleBarcodeImages = jest.fn();
jest.unstable_mockModule('../../src/common/services/barcodeImageStorage.js', () => ({
  scheduleBarcodeImages,
}));
const { default: bulkRoutes, receivingQuantityError, receiptAllocationError } =
  await import('../../src/modules/warehouse-management/products/bulkStock.routes.js');

const skuA = '507f1f77bcf86cd799439011';
const skuB = '507f1f77bcf86cd799439012';
const validQuantity = () => ({ expectedQty: 5, receivedQty: 4, quantity: 3, repairQty: 1 });
const lines = () => [{ skuId: skuA, quantity: 3 }, { skuId: skuB, quantity: 2 }];
const allocations = () => [
  { skuId: skuA, allocatedQuantity: 1 },
  { skuId: skuA, allocatedQuantity: 2 },
  { skuId: skuB, allocatedQuantity: 2 },
];

describe('Finished goods receiving quantity rules', () => {
  test('accepts a receipt with a matching repair quantity', () => {
    expect(receivingQuantityError(validQuantity())).toBeNull();
  });

  test('accepts all received units when none need repair', () => {
    expect(receivingQuantityError({ expectedQty: 4, receivedQty: 4, quantity: 4,
      repairQty: 0 })).toBeNull();
  });

  test('accepts zero good units when all received units need repair', () => {
    expect(receivingQuantityError({ expectedQty: 4, receivedQty: 4, quantity: 0,
      repairQty: 4 })).toBeNull();
  });

  test.each([
    ['missing expected quantity', { expectedQty: null }],
    ['zero expected quantity', { expectedQty: 0 }],
    ['expected quantity above the limit', { expectedQty: 501 }],
    ['received quantity above expected', { receivedQty: 6 }],
    ['zero received quantity', { receivedQty: 0 }],
    ['accepted quantity above received', { quantity: 5 }],
    ['negative accepted quantity', { quantity: -1 }],
    ['fractional accepted quantity', { quantity: 1.5 }],
    ['inconsistent repair quantity', { repairQty: 2 }],
  ])('rejects %s', (description, change) => {
    expect(receivingQuantityError({ ...validQuantity(), ...change })).toBeTruthy();
  });
});

describe('Finished goods receipt allocation rules', () => {
  test('accepts a complete allocation split across bins', () => {
    expect(receiptAllocationError(lines(), allocations())).toBeNull();
  });

  test('rejects an incomplete allocation', () => {
    expect(receiptAllocationError(lines(), allocations().slice(0, 2))?.code)
      .toBe('ALLOCATION_INCOMPLETE');
  });

  test('rejects allocation above accepted quantity', () => {
    const plan = allocations();
    plan[1].allocatedQuantity = 3;
    expect(receiptAllocationError(lines(), plan)?.code)
      .toBe('ALLOCATION_EXCEEDS_ACCEPTED');
  });

  test.each([
    ['unknown SKU', { skuId: '507f1f77bcf86cd799439099', allocatedQuantity: 1 }],
    ['zero allocation', { skuId: skuA, allocatedQuantity: 0 }],
    ['fractional allocation', { skuId: skuA, allocatedQuantity: 1.5 }],
  ])('rejects %s', (description, badLine) => {
    expect(receiptAllocationError(lines(), [...allocations(), badLine])?.code)
      .toBe('INVALID_ALLOCATION');
  });

  test('rejects assigning the same SKU to the same bin twice', () => {
    const line = { skuId: skuA, targetLocationId: skuB, allocatedQuantity: 1 };
    expect(() => parseLines([line, line])).toThrow(expect.objectContaining({ code: 'DUPLICATE_BIN' }));
  });

  test('rejects an allocation without a valid bin ID', () => {
    expect(() => parseLines([{ skuId: skuA, targetLocationId: 'unknown', allocatedQuantity: 1 }]))
      .toThrow(expect.objectContaining({ code: 'INVALID_LINES' }));
  });
});

describe('Finished goods receipt stock writes', () => {
  let replicaSet;
  let product;
  let sku;
  let source;
  let bin;

  const actor = { _id: new mongoose.Types.ObjectId(), roleCode: 'WAREHOUSE_MANAGER' };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = actor; next(); });
  app.use('/bulk', bulkRoutes);
  app.use((error, req, res, next) => res.status(error.status || 500).json({
    success: false, error: { code: error.code || 'INTERNAL_ERROR' }, message: error.message,
  }));

  const receipt = (overrides = {}) => ({
    direction: 'IN', documentCode: `FG-${randomUUID().slice(0, 8).toUpperCase()}`,
    confirmationKey: randomUUID(),
    items: [{ productId: String(product._id), skuId: String(sku._id),
      expectedQty: 5, receivedQty: 4, quantity: 3, repairQty: 1 }],
    allocations: [{ skuId: String(sku._id), targetLocationId: String(bin._id), allocatedQuantity: 3 }],
    ...overrides,
  });
  const post = async (body) => {
    if (body.direction === 'IN' && !body.sourceTicketId) {
      const ticketCode = `PNTP-${randomUUID().slice(0, 8).toUpperCase()}`;
      const ticket = await FinishedGoodsTicket.create({ ticketCode,
        ticketType: 'INBOUND_FROM_SEWING', status: 'READY_TO_CONFIRM',
        garmentInspection: { inspectedByTechId: actor._id,
          passedQty: body.items.reduce((sum, item) => sum + Number(item.expectedQty || 0), 0) },
        items: body.items.map((item) => ({ skuId: item.skuId,
          skuBarcode: 'TEST-BARCODE', designatedFifoLocationId: bin._id,
          expectedQty: item.expectedQty })) });
      body.sourceTicketId = String(ticket._id);
      body.documentCode = `NK-${ticketCode}`;
    }
    return request(app).post('/bulk/documents').send(body);
  };
  const extraSku = (code, size) => Sku.create({ skuCode: `TEST-SHIRT-${code}`,
    skuBarcode: `TEST-BARCODE-${code}`, productId: product._id, styleName: 'Shirt',
    color: 'White', size, retailPrice: 1, isActive: true });

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) throw new Error('Refusing to replace an existing MongoDB connection');
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(replicaSet.getUri('arawms_finished_goods_test'));
    await Promise.all([Product.init(), Sku.init(), WarehouseLocation.init(),
      FinishedGoodsBulkDocument.init(), FinishedGoodsTicket.init(), User.init(), FinishedGoodsBatch.init(), ProductUnit.init(),
      InventoryTransaction.init(), PutawayAllocation.init()]);
  });

  afterEach(async () => {
    if (!replicaSet || mongoose.connection.name !== 'arawms_finished_goods_test')
      throw new Error('Refusing to clear a non-test database');
    for (const collection of Object.values(mongoose.connection.collections)) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    if (!replicaSet) return;
    if (mongoose.connection.readyState !== 0) {
      if (mongoose.connection.name !== 'arawms_finished_goods_test')
        throw new Error('Refusing to disconnect a non-test database');
      await mongoose.disconnect();
    }
    await replicaSet.stop();
  });

  beforeEach(async () => {
    scheduleBarcodeImages.mockClear();
    product = await Product.create({ productCode: 'TEST-SHIRT', productName: 'Test shirt',
      category: 'Test', basePrice: 1, isActive: true });
    sku = await Sku.create({ skuCode: 'TEST-SHIRT-M', skuBarcode: 'TEST-BARCODE-M',
      productId: product._id, styleName: 'Shirt', color: 'White', size: 'M',
      retailPrice: 1, isActive: true });
    source = await WarehouseLocation.create({ locationCode: 'TEST-STAGING',
      barcode: 'LOC-TEST-STAGING', warehouseType: 'FINISHED_GOODS',
      zoneCode: 'TEST', rackCode: 'STAGING', shelfCode: 'STAGING',
      maxCapacity: 10, status: 'ACTIVE' });
    bin = await WarehouseLocation.create({ locationCode: 'TEST-BIN', barcode: 'LOC-TEST-BIN',
      warehouseType: 'FINISHED_GOODS', zoneCode: 'TEST', rackCode: 'R1', shelfCode: '1',
      maxCapacity: 10, layoutBin: true, status: 'ACTIVE' });
  });

  test('blocks a warehouse receipt without a technician request', async () => {
    const response = await request(app).post('/bulk/documents').send(receipt());
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TECHNICAL_REQUEST_REQUIRED');
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(0);
    expect((await Sku.findById(sku._id)).onHandQty).toBe(0);
  });

  test('links the receipt to one technician request and shows its completed status', async () => {
    const body = receipt();
    const first = await post(body);
    expect(first.status).toBe(201);
    const confirmed = await request(app).post('/bulk/confirmations/status').send(body);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.document.id).toBe(first.body.data.document.id);
    const changed = await request(app).post('/bulk/confirmations/status')
      .send({ ...body, note: 'different confirmation' });
    expect(changed.status).toBe(409);
    const otherAttempt = await request(app).post('/bulk/confirmations/status')
      .send({ ...body, confirmationKey: randomUUID() });
    expect(otherAttempt.status).toBe(200);
    expect(otherAttempt.body.data).toMatchObject({
      matchType: 'SOURCE_TICKET', document: { id: first.body.data.document.id },
    });
    expect(String((await FinishedGoodsBulkDocument.findOne()).sourceTicketId)).toBe(body.sourceTicketId);
    expect((await FinishedGoodsTicket.findById(body.sourceTicketId)).status).toBe('COMPLETED');
    const queue = await request(app).get('/bulk/technical-requests');
    expect(queue.status).toBe(200);
    expect(queue.body.data.requests[0]).toMatchObject({ id: body.sourceTicketId,
      code: body.documentCode.slice(3), status: 'COMPLETED',
      receiptId: first.body.data.document.id });
    const again = await post({ ...body, confirmationKey: randomUUID() });
    expect(again.status).toBe(409);
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(1);
    expect((await Sku.findById(sku._id)).onHandQty).toBe(3);
  });

  test('records accepted units, repair quantity, stock, allocation and ledger', async () => {
    const response = await post(receipt());
    expect(response.status).toBe(201);
    expect(response.body.data.document.items[0]).toMatchObject({
      expectedQty: 5, receivedQty: 4, acceptedQty: 3, repairQty: 1,
    });
    const document = await FinishedGoodsBulkDocument.findOne();
    const unplaced = await WarehouseLocation.findOne({ locationCode: 'FG-UNPLACED' });
    expect(unplaced?.isSystemUnplaced).toBe(true);
    expect(String(document.locationId)).toBe(String(unplaced._id));
    expect(document.totalQuantity).toBe(3);
    expect(document.items[0].repairStatus).toBe('WAITING_RETURN');
    const units = await ProductUnit.find({ receivingDocumentId: document._id });
    expect(units).toHaveLength(3);
    expect(units.every((unit) => String(unit.warehouseId) === String(unplaced._id) &&
      unit.barcodeFormat === 'CODE_128' && unit.inventoryStatus === 'AVAILABLE')).toBe(true);
    expect(new Set(units.map((unit) => unit.barcode)).size).toBe(3);
    expect(units.map((unit) => unit.barcode).sort()).toEqual([...document.items[0].barcodes].sort());
    expect(await FinishedGoodsBatch.countDocuments({ skuId: sku._id })).toBe(1);
    expect((await Sku.findById(sku._id)).onHandQty).toBe(3);
    expect((await WarehouseLocation.findById(unplaced._id)).currentOccupancy).toBe(3);
    expect((await WarehouseLocation.findById(bin._id)).plannedReservedQty).toBe(3);
    expect(await PutawayAllocation.countDocuments({ status: 'CONFIRMED' })).toBe(1);
    expect(await InventoryTransaction.findOne({ skuId: sku._id })).toMatchObject({
      transactionType: 'MANUAL_INBOUND', quantityChange: 3, onHandBefore: 0, onHandAfter: 3,
    });
    expect(scheduleBarcodeImages).toHaveBeenCalledWith('FINISHED_GOODS', String(document._id));
  });

  test('returns the same receipt for an identical retry', async () => {
    const body = receipt({ locationId: String(source._id) });
    const first = await post(body);
    expect(first.status).toBe(201);
    const retry = await post(body);
    expect(retry.status).toBe(200);
    expect(retry.body.data.document.id).toBe(first.body.data.document.id);
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(1);
    expect(await ProductUnit.countDocuments()).toBe(3);
  });

  test('returns the same outbound document without subtracting stock twice', async () => {
    await Sku.updateOne({ _id: sku._id }, { onHandQty: 5 });
    const body = { direction: 'OUT', documentCode: 'FG-OUT-RETRY', confirmationKey: randomUUID(),
      items: [{ productId: String(product._id), skuId: String(sku._id), quantity: 2 }] };
    const first = await post(body);
    expect(first.status).toBe(201);
    const retry = await post(body);
    expect(retry.status).toBe(200);
    expect(retry.body.data.document.id).toBe(first.body.data.document.id);
    expect((await Sku.findById(sku._id)).onHandQty).toBe(3);
    expect(await InventoryTransaction.countDocuments({ transactionType: 'MANUAL_OUTBOUND' })).toBe(1);
    const changed = await post({ ...body, items: [{ ...body.items[0], quantity: 1 }] });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('CONFIRMATION_REUSED');
    expect((await Sku.findById(sku._id)).onHandQty).toBe(3);
  });

  test('records a full repair return without adding stock or reserving a bin', async () => {
    const body = receipt({ allocations: [] });
    body.items[0] = { ...body.items[0], quantity: 0, repairQty: 4 };
    const response = await post(body);
    expect(response.status).toBe(201);
    expect(response.body.data.document.totalQuantity).toBe(0);
    expect(response.body.data.document.items[0]).toMatchObject({ acceptedQty: 0, repairQty: 4,
      repairStatus: 'WAITING_RETURN', barcodes: [] });
    expect((await Sku.findById(sku._id)).onHandQty).toBe(0);
    expect(await ProductUnit.countDocuments()).toBe(0);
    expect(await FinishedGoodsBatch.countDocuments()).toBe(0);
    expect(await InventoryTransaction.countDocuments()).toBe(0);
    expect(await PutawayAllocation.countDocuments()).toBe(0);
    expect(scheduleBarcodeImages).not.toHaveBeenCalled();
  });

  test('rejects reuse of a confirmation key with different content', async () => {
    const body = receipt({ locationId: String(source._id) });
    expect((await post(body)).status).toBe(201);
    const response = await post({ ...body, note: 'Changed content' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFIRMATION_REUSED');
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(1);
  });

  test('rolls back when allocation does not cover accepted units', async () => {
    const response = await post(receipt({ locationId: String(source._id), allocations: [] }));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ALLOCATION_INCOMPLETE');
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(0);
    expect(await ProductUnit.countDocuments()).toBe(0);
    expect((await Sku.findById(sku._id)).onHandQty).toBe(0);
    expect(await FinishedGoodsBatch.countDocuments()).toBe(0);
    expect(await InventoryTransaction.countDocuments()).toBe(0);
  });

  test('rejects duplicate SKU lines before writing a receipt', async () => {
    const body = receipt();
    body.items.push({ ...body.items[0] });
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DUPLICATE_LINE');
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(0);
  });

  test('rejects more than 500 accepted units in one receipt', async () => {
    const second = await extraSku('L', 'L');
    const body = receipt({ allocations: [] });
    body.items = [sku, second].map((item, index) => ({ productId: String(product._id),
      skuId: String(item._id), expectedQty: 300, receivedQty: 300,
      quantity: index ? 201 : 300, repairQty: index ? 99 : 0 }));
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TOO_MANY_UNITS');
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(0);
  });

  test('rejects more than 1000 received units in one receipt', async () => {
    const second = await extraSku('L', 'L');
    const third = await extraSku('XL', 'XL');
    const body = receipt({ allocations: [] });
    body.items = [sku, second, third].map((item) => ({ productId: String(product._id),
      skuId: String(item._id), expectedQty: 500, receivedQty: 500,
      quantity: 0, repairQty: 500 }));
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TOO_MANY_RECEIVED_UNITS');
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(0);
  });

  test('rejects an inactive product before adding stock', async () => {
    await Product.updateOne({ _id: product._id }, { isActive: false });
    const response = await post(receipt());
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PRODUCT_INACTIVE');
    expect((await Sku.findById(sku._id)).onHandQty).toBe(0);
  });

  test('rejects an inactive SKU before adding stock', async () => {
    await Sku.updateOne({ _id: sku._id }, { isActive: false });
    const response = await post(receipt());
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SKU_INACTIVE');
    expect((await Sku.findById(sku._id)).onHandQty).toBe(0);
  });

  test('rolls back receipt and stock when the destination bin is full', async () => {
    await WarehouseLocation.updateOne({ _id: bin._id }, { maxCapacity: 2 });
    const response = await post(receipt());
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('BIN_CAPACITY');
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(0);
    expect(await ProductUnit.countDocuments()).toBe(0);
    expect(await FinishedGoodsBatch.countDocuments()).toBe(0);
    expect(await InventoryTransaction.countDocuments()).toBe(0);
    expect((await Sku.findById(sku._id)).onHandQty).toBe(0);
    expect((await WarehouseLocation.findById(bin._id)).plannedReservedQty).toBe(0);
    expect(scheduleBarcodeImages).not.toHaveBeenCalled();
  });

  test('rejects inconsistent repair quantity before writing stock', async () => {
    const body = receipt();
    body.items[0].repairQty = 2;
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_RECEIVING_QUANTITY');
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(0);
  });

  test('rejects unknown SKU and rolls back the receipt', async () => {
    const body = receipt();
    body.items[0].skuId = String(new mongoose.Types.ObjectId());
    const response = await post(body);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SKU_NOT_FOUND');
    expect(await FinishedGoodsBulkDocument.countDocuments()).toBe(0);
    expect(await ProductUnit.countDocuments()).toBe(0);
  });

  test('rejects a full source location without changing stock', async () => {
    await WarehouseLocation.updateOne({ _id: source._id }, { maxCapacity: 2 });
    const response = await post(receipt({ locationId: String(source._id) }));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LOCATION_FULL');
    expect((await Sku.findById(sku._id)).onHandQty).toBe(0);
    expect(await ProductUnit.countDocuments()).toBe(0);
  });
});
