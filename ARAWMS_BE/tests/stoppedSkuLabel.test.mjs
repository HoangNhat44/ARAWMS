/*
 * File: stoppedSkuLabel.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-14
 * Description: A SKU stopped from sale can still get unit labels for stock already in its batch
 *              (restocked returns); a deleted SKU cannot.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Sku from '../src/models/Sku.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import FinishedGoodsBatch from '../src/models/FinishedGoodsBatch.model.js';
import ProductUnit from '../src/models/ProductUnit.js';
import { registerProductUnitBarcode } from '../src/modules/order-fulfillment/packing-verification/packingVerification.service.js';

let replicaSet;
let location;
test.before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([Sku.init(), WarehouseLocation.init(), FinishedGoodsBatch.init(), ProductUnit.init()]);
  location = await WarehouseLocation.create({ locationCode: 'FG-A-01', barcode: 'LOC-FG-A-01', warehouseType: 'FINISHED_GOODS',
    zoneCode: 'A', rackCode: 'A1', shelfCode: 'S1', maxCapacity: 100 });
});
test.after(async () => { await mongoose.disconnect(); await replicaSet?.stop(); });

const stockedSku = async (skuCode, extra) => {
  const sku = await Sku.create({ productId: new mongoose.Types.ObjectId(), skuCode, skuBarcode: skuCode, styleName: 'AL186',
    color: 'Đỏ', size: 'M', retailPrice: 1000, onHandQty: 1, variantKey: `${skuCode}:key`, ...extra });
  const batch = await FinishedGoodsBatch.create({ batchCode: `B-${skuCode}`, skuId: sku._id, skuBarcode: skuCode,
    locationId: location._id, initialQty: 1, currentOnHandQty: 1, fifoInboundTimestamp: new Date() });
  return { sku, batch };
};

test('a stopped SKU can label units already on hand in its batch', async () => {
  const { sku, batch } = await stockedSku('AL186-DO-M', { isActive: false, discontinuedAt: new Date() });
  const unit = await registerProductUnitBarcode({ barcode: 'ARARETURN0001', skuId: String(sku._id),
    warehouseId: String(location._id), batchId: String(batch._id) });
  assert.equal(unit.barcode, 'ARARETURN0001');
  // The label limit still applies: only units that physically exist can be labeled.
  await assert.rejects(registerProductUnitBarcode({ barcode: 'ARARETURN0002', skuId: String(sku._id),
    warehouseId: String(location._id), batchId: String(batch._id) }));
});

test('a deleted SKU cannot be labeled', async () => {
  const { sku, batch } = await stockedSku('AL186-DO-L', { isActive: false, isDeleted: true });
  await assert.rejects(registerProductUnitBarcode({ barcode: 'ARADELETED01', skuId: String(sku._id),
    warehouseId: String(location._id), batchId: String(batch._id) }));
});
