/*
 * File: putawayBulk.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-23
 * Description: Xếp thành phẩm hàng loạt: chọn các tem đã in, quét mã ô một lần để xếp cả nhóm.
 * Kiểm tra cập nhật tồn theo ô/lô/tiến độ, sai ô, tem không hợp lệ, ô hết chỗ, thử lại không cộng đôi
 * và SKU được phân bổ vào nhiều ô.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.model.js';
import PutawayAllocation from '../src/models/PutawayAllocation.model.js';
import PutawayScanEvent from '../src/models/PutawayScanEvent.model.js';
import ProductUnit from '../src/models/ProductUnit.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import FinishedGoodsBatch from '../src/models/FinishedGoodsBatch.model.js';
import { createTestToken } from './support/authSession.mjs';

let replicaSet;
let staff;
let staffId;
const oid = () => new mongoose.Types.ObjectId();
let seq = 0;

test.before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replicaSet.getUri());
  staff = await createTestToken('WAREHOUSE_STAFF', { fullName: 'Nhân viên kho' });
  staffId = (await User.findOne({ roleCode: 'WAREHOUSE_STAFF' }))._id;
});

test.after(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
});

const location = async (code, fields = {}) => {
  const _id = oid();
  await WarehouseLocation.collection.insertOne({ _id, locationCode: code, barcode: `QR-${code}`, warehouseType: 'FINISHED_GOODS',
    zoneCode: 'B', rackCode: '01', shelfCode: 'T1', maxCapacity: 100, currentOccupancy: 0, plannedReservedQty: 0,
    status: 'ACTIVE', layoutBin: true, isFrozenForStocktake: false, isDeleted: false, ...fields });
  return _id;
};

/**
 * One receipt with `quantity` units of one SKU waiting in the unplaced area, allocated to the given bins.
 * bins: [{ code, quantity }] — quantity reserved on each bin.
 */
async function seedReceipt(quantity, bins) {
  const n = ++seq;
  const receiptId = oid(); const skuId = oid(); const batchId = oid();
  const staging = await location(`STG-${n}`, { layoutBin: false, isSystemUnplaced: true, currentOccupancy: quantity, maxCapacity: 100000 });
  await FinishedGoodsBatch.collection.insertOne({ _id: batchId, batchCode: `B-${n}`, skuId, skuBarcode: `SKU-${n}`,
    locationId: staging, initialQty: quantity, labeledQty: quantity, currentOnHandQty: quantity, reservedPickQty: 0,
    fifoInboundTimestamp: new Date() });
  const barcodes = Array.from({ length: quantity }, (_, i) => `U${n}-${String(i + 1).padStart(3, '0')}`);
  await ProductUnit.collection.insertMany(barcodes.map((barcode) => ({ barcode, barcodeFormat: 'CODE_128', skuId,
    warehouseId: staging, batchId, receivingDocumentId: receiptId, inventoryStatus: 'AVAILABLE', packedOrderId: null })));
  const binIds = [];
  for (const bin of bins) binIds.push(await location(`${bin.code}-${n}`, { plannedReservedQty: bin.quantity }));
  await PutawayAllocation.collection.insertOne({ allocationCode: `PA-${n}`, warehouseType: 'FINISHED_GOODS',
    sourceReceiptId: receiptId, status: 'CONFIRMED', createdByUserId: staffId, confirmedAt: new Date(), version: 1,
    lines: bins.map((bin, i) => ({ lineId: oid(), skuId, targetLocationId: binIds[i], allocatedQuantity: bin.quantity,
      placedQuantity: 0, shortageQuantity: 0, reportedShortageQuantity: 0 })) });
  return { receiptId: String(receiptId), barcodes, binIds, bins: bins.map((bin) => `${bin.code}-${n}`), staging, batchId };
}

const plan = (receiptId, barcodes) => request(app).post(`/api/warehouse-putaway/receipts/${receiptId}/bulk-plan`)
  .set('Authorization', `Bearer ${staff}`).send({ barcodes });
const place = (receiptId, body) => request(app).post(`/api/warehouse-putaway/receipts/${receiptId}/bulk-place`)
  .set('Authorization', `Bearer ${staff}`).send(body);

test('20 printed labels are placed on the bin with a single bin scan', async () => {
  const r = await seedReceipt(100, [{ code: 'A', quantity: 100 }]);
  const selected = r.barcodes.slice(0, 20);
  const preview = await plan(r.receiptId, selected);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.data.groups.length, 1);
  assert.equal(preview.body.data.groups[0].barcodes.length, 20);
  assert.equal(preview.body.data.invalid.length, 0);

  const res = await place(r.receiptId, { requestId: 'bulk-req-0001', locationBarcode: `qr-${r.bins[0]}`, barcodes: selected });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.result.placed, 20);

  const allocation = await PutawayAllocation.findOne({ sourceReceiptId: r.receiptId }).lean();
  assert.equal(allocation.lines[0].placedQuantity, 20);
  const bin = await WarehouseLocation.findById(r.binIds[0]).lean();
  assert.equal(bin.currentOccupancy, 20);
  assert.equal(bin.plannedReservedQty, 80);
  assert.equal((await WarehouseLocation.findById(r.staging).lean()).currentOccupancy, 80);
  assert.equal(await ProductUnit.countDocuments({ warehouseId: r.binIds[0] }), 20);
  assert.equal((await FinishedGoodsBatch.findById(r.batchId).lean()).currentOnHandQty, 80);
  assert.equal((await FinishedGoodsBatch.findOne({ locationId: r.binIds[0] }).lean()).currentOnHandQty, 20);
  assert.equal(await PutawayScanEvent.countDocuments({ allocationId: allocation._id }), 20);

  // Thử lại cùng requestId (mất mạng): không cộng thêm.
  const retry = await place(r.receiptId, { requestId: 'bulk-req-0001', locationBarcode: `QR-${r.bins[0]}`, barcodes: selected });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.data.result.alreadyAccepted, true);
  assert.equal((await PutawayAllocation.findById(allocation._id).lean()).lines[0].placedQuantity, 20);

  // Đã xếp rồi thì kế hoạch báo không hợp lệ.
  const again = await plan(r.receiptId, selected.slice(0, 2));
  assert.equal(again.body.data.invalid.length, 2);
});

test('a wrong bin scan places nothing', async () => {
  const r = await seedReceipt(5, [{ code: 'C', quantity: 5 }]);
  const other = await location(`OTHER-${seq}`);
  const res = await place(r.receiptId, { requestId: 'bulk-req-wrong', locationBarcode: `QR-OTHER-${seq}`, barcodes: r.barcodes });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.error?.code, 'WRONG_LOCATION');
  assert.equal(await ProductUnit.countDocuments({ warehouseId: { $in: [...r.binIds, other] } }), 0);
});

test('one bad label rolls back the whole group', async () => {
  const r = await seedReceipt(5, [{ code: 'D', quantity: 5 }]);
  const foreign = await seedReceipt(1, [{ code: 'E', quantity: 1 }]);
  const preview = await plan(r.receiptId, [...r.barcodes.slice(0, 3), foreign.barcodes[0]]);
  assert.equal(preview.body.data.invalid.length, 1);
  assert.equal(preview.body.data.groups[0].barcodes.length, 3);

  const res = await place(r.receiptId, { requestId: 'bulk-req-bad1', locationBarcode: `QR-${r.bins[0]}`,
    barcodes: [...r.barcodes.slice(0, 3), foreign.barcodes[0]] });
  assert.equal(res.status >= 400, true, JSON.stringify(res.body));
  assert.equal(await ProductUnit.countDocuments({ warehouseId: r.binIds[0] }), 0);
  assert.equal((await PutawayAllocation.findOne({ sourceReceiptId: r.receiptId }).lean()).lines[0].placedQuantity, 0);
});

test('more labels than the bin still needs are rejected', async () => {
  const r = await seedReceipt(6, [{ code: 'F', quantity: 4 }]);
  const preview = await plan(r.receiptId, r.barcodes);
  assert.equal(preview.body.data.groups[0].barcodes.length, 4);
  assert.equal(preview.body.data.invalid.length, 2);
  const res = await place(r.receiptId, { requestId: 'bulk-req-over', locationBarcode: `QR-${r.bins[0]}`, barcodes: r.barcodes });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(await ProductUnit.countDocuments({ warehouseId: r.binIds[0] }), 0);
});

test('a SKU split over two bins is planned per bin and each bin needs its own scan', async () => {
  const r = await seedReceipt(10, [{ code: 'G', quantity: 6 }, { code: 'H', quantity: 4 }]);
  const preview = await plan(r.receiptId, r.barcodes);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const groups = preview.body.data.groups;
  assert.deepEqual(groups.map((group) => group.barcodes.length).sort(), [4, 6]);
  for (const [i, group] of groups.entries()) {
    const res = await place(r.receiptId, { requestId: `bulk-req-split-${i}`, locationBarcode: `QR-${group.locationCode}`, barcodes: group.barcodes });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  const lines = (await PutawayAllocation.findOne({ sourceReceiptId: r.receiptId }).lean()).lines;
  assert.deepEqual(lines.map((line) => line.placedQuantity), [6, 4]);
});

test('single-unit scanning still works after the refactor', async () => {
  const r = await seedReceipt(2, [{ code: 'S', quantity: 2 }]);
  const allocation = await PutawayAllocation.findOne({ sourceReceiptId: r.receiptId }).lean();
  const res = await request(app).post(`/api/warehouse-putaway/tasks/${allocation._id}/${allocation.lines[0].lineId}/scan`)
    .set('Authorization', `Bearer ${staff}`)
    .send({ requestId: 'single-req-0001', productBarcode: r.barcodes[0], locationBarcode: `QR-${r.bins[0]}` });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.result.task.placedQuantity, 1);
});

test('choosing the second bin of a split SKU sends the selected labels to that bin', async () => {
  // Vd AK002 có 85 chiếc chia 2 ô: chọn ô thứ hai thì đúng số tem của ô đó vào ô đó, không rải về ô đầu.
  const r = await seedReceipt(85, [{ code: 'K1', quantity: 45 }, { code: 'K2', quantity: 40 }]);
  const selected = r.barcodes.slice(0, 40);
  const preview = await request(app).post(`/api/warehouse-putaway/receipts/${r.receiptId}/bulk-plan`)
    .set('Authorization', `Bearer ${staff}`).send({ barcodes: selected, locationCode: r.bins[1] });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.data.groups.length, 1);
  assert.equal(preview.body.data.groups[0].locationCode, r.bins[1].toUpperCase());
  assert.equal(preview.body.data.groups[0].barcodes.length, 40);
  const res = await place(r.receiptId, { requestId: 'bulk-req-k2-001', locationBarcode: `QR-${r.bins[1]}`, barcodes: selected });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const lines = (await PutawayAllocation.findOne({ sourceReceiptId: r.receiptId }).lean()).lines;
  assert.deepEqual(lines.map((line) => line.placedQuantity), [0, 40]);
});
