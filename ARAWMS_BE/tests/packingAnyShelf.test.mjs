/*
 * File: packingAnyShelf.test.mjs
 * Description: Packing accepts any shelved unit of the ordered SKU and deducts stock from the scanned
 *              unit's own batch/shelf, while never consuming stock another order still holds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import SalesOrder from '../src/models/SalesOrder.model.js';
import ProductUnit from '../src/models/ProductUnit.js';
import PackingSession from '../src/models/PackingSession.js';
import Sku from '../src/models/Sku.model.js';
import FinishedGoodsBatch from '../src/models/FinishedGoodsBatch.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import { scanProductBarcodeForPacking } from '../src/modules/order-fulfillment/packing-verification/packingVerification.service.js';
import { consumePackedStock } from '../src/modules/order-fulfillment/packing-verification/packingStock.service.js';

const oid = () => new mongoose.Types.ObjectId();

test('any shelf of the ordered SKU is accepted and stock leaves that shelf', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  try {
    const skuId = oid();
    const [shelfA, shelfB, unplaced] = [oid(), oid(), oid()];
    const [batchA, batchB, batchU] = [oid(), oid(), oid()];
    const now = new Date();
    await WarehouseLocation.collection.insertMany([
      { _id: shelfA, locationCode: 'B-01-T1-O01', barcode: 'LOC-A', warehouseType: 'FINISHED_GOODS', status: 'ACTIVE', isFrozenForStocktake: false, currentOccupancy: 5, maxCapacity: 100 },
      { _id: shelfB, locationCode: 'B-01-T3-O01', barcode: 'LOC-B', warehouseType: 'FINISHED_GOODS', status: 'ACTIVE', isFrozenForStocktake: false, currentOccupancy: 2, maxCapacity: 100 },
      { _id: unplaced, locationCode: 'FG-UNPLACED', barcode: 'LOC-U', warehouseType: 'FINISHED_GOODS', status: 'ACTIVE', isFrozenForStocktake: false, isSystemUnplaced: true, currentOccupancy: 1, maxCapacity: 100 },
    ]);
    await Sku.collection.insertOne({ _id: skuId, skuCode: 'AL186-L-KEM', onHandQty: 8, reservedQty: 1, isActive: true });
    await FinishedGoodsBatch.collection.insertMany([
      { _id: batchA, batchCode: 'LOT-A', skuId, skuBarcode: 'X', locationId: shelfA, initialQty: 5, currentOnHandQty: 5, reservedPickQty: 1, fifoInboundTimestamp: now, isDefectQuarantine: false, version: 0 },
      { _id: batchB, batchCode: 'LOT-B', skuId, skuBarcode: 'X', locationId: shelfB, initialQty: 2, currentOnHandQty: 2, reservedPickQty: 0, fifoInboundTimestamp: now, isDefectQuarantine: false, version: 0 },
      { _id: batchU, batchCode: 'LOT-U', skuId, skuBarcode: 'X', locationId: unplaced, initialQty: 1, currentOnHandQty: 1, reservedPickQty: 0, fifoInboundTimestamp: now, isDefectQuarantine: false, version: 0 },
    ]);
    await ProductUnit.create([
      { barcode: 'UNIT-B-1', barcodeFormat: 'CODE_128', skuId, warehouseId: shelfB, batchId: batchB },
      { barcode: 'UNIT-U-1', barcodeFormat: 'CODE_128', skuId, warehouseId: unplaced, batchId: batchU },
      { barcode: 'UNIT-OTHER', barcodeFormat: 'CODE_128', skuId: oid(), warehouseId: shelfB, batchId: batchB },
    ]);
    const orderId = oid();
    await SalesOrder.collection.insertOne({ _id: orderId, orderCode: 'ORD-ANY', status: 'CONFIRMED_RESERVED',
      sellerId: oid(), customerId: oid(), createdAt: now, updatedAt: now,
      items: [{ skuId, skuCode: 'AL186-L-KEM', orderedQty: 1, unitSalePrice: 10,
        fifoPickList: [{ batchId: batchA, locationId: shelfA, allocatedQty: 1 }] }],
      financialSummary: { itemsSubtotal: 10, totalOrderAmount: 10, expectedCodAmount: 10 } });
    const packing = await PackingSession.create({ orderKey: String(orderId), orderId, orderVersion: now,
      operatorId: oid(), stationId: 'station_any_1', leaseUntil: new Date(Date.now() + 120_000), leaseVersion: 1,
      items: [{ lineKey: '0', skuId, quantity: 1, pickAllocations: [{ batchId: batchA, locationId: shelfA, allocatedQty: 1 }] }] });
    let n = 0;
    const scan = (barcode) => scanProductBarcodeForPacking({ sessionId: String(packing._id), stationId: 'station_any_1',
      leaseVersion: 1, clientEventId: `event_any_${String(++n).padStart(4, '0')}`, barcode });

    assert.equal((await scan('UNIT-OTHER')).reason, 'ITEM_NOT_IN_ORDER');
    assert.equal((await scan('UNIT-U-1')).reason, 'UNIT_NOT_ON_SHELF');
    // Shelf B's only free unit is now held by another order: it must not be taken.
    await FinishedGoodsBatch.updateOne({ _id: batchB }, { $set: { reservedPickQty: 2 } });
    assert.equal((await scan('UNIT-B-1')).reason, 'UNIT_RESERVED_OTHER_ORDER');
    await FinishedGoodsBatch.updateOne({ _id: batchB }, { $set: { reservedPickQty: 0 } });
    assert.equal((await scan('UNIT-B-1')).result, 'ACCEPTED');

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const fresh = await PackingSession.findById(packing._id).session(session);
      const order = await SalesOrder.findById(orderId).session(session);
      await consumePackedStock(fresh, order, session);
    });
    await session.endSession();
    const [a, b] = await Promise.all([FinishedGoodsBatch.findById(batchA).lean(), FinishedGoodsBatch.findById(batchB).lean()]);
    assert.deepEqual([a.currentOnHandQty, a.reservedPickQty], [5, 0], 'FIFO hold on shelf A released, stock untouched');
    assert.deepEqual([b.currentOnHandQty, b.reservedPickQty], [1, 0], 'stock leaves the scanned shelf B');
    const [locA, locB] = await Promise.all([WarehouseLocation.findById(shelfA).lean(), WarehouseLocation.findById(shelfB).lean()]);
    assert.deepEqual([locA.currentOccupancy, locB.currentOccupancy], [5, 1]);
    const sku = await Sku.findById(skuId).lean();
    assert.deepEqual([sku.onHandQty, sku.reservedQty], [7, 0]);
    assert.equal((await ProductUnit.findOne({ barcode: 'UNIT-B-1' }).lean()).inventoryStatus, 'UNAVAILABLE');
  } finally { await mongoose.disconnect(); await repl.stop(); }
});
