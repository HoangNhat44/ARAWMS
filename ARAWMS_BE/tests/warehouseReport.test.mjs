/*
 * File: warehouseReport.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Warehouse statistics report for the Owner: figures come from the warehouse data, comments are
 * kept across refreshes, sending freezes the data with a hash, and the Owner reads it as a manager report.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import { createTestToken } from './support/authSession.mjs';

let replicaSet;
let manager;
let owner;
const oid = () => new mongoose.Types.ObjectId();
const DAY = 86400000;
const ago = (days) => new Date(Date.now() - days * DAY);
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;

test.before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replicaSet.getUri());
  manager = await createTestToken('WAREHOUSE_MANAGER', { fullName: 'Nguyễn Thu Trang' });
  owner = await createTestToken('OWNER');
  const db = mongoose.connection.db;
  const base = { isDeleted: false, createdAt: new Date(), updatedAt: new Date() };
  const shelf = oid(); const defectArea = oid(); const unplaced = oid(); const fabricShelf = oid();
  await db.collection('warehouse_locations').insertMany([
    { _id: shelf, locationCode: 'FG-A-01', warehouseType: 'FINISHED_GOODS', status: 'ACTIVE', maxCapacity: 100, currentOccupancy: 60, layoutBin: true, ...base },
    { _id: oid(), locationCode: 'FG-A-02', warehouseType: 'FINISHED_GOODS', status: 'FULL', maxCapacity: 50, currentOccupancy: 50, layoutBin: true, ...base },
    { _id: unplaced, locationCode: 'FG-UNPLACED', warehouseType: 'FINISHED_GOODS', status: 'ACTIVE', isSystemUnplaced: true, maxCapacity: 1000000000, currentOccupancy: 2, ...base },
    { _id: defectArea, locationCode: 'KHU-HANG-LOI-01', warehouseType: 'DEFECT_QUARANTINE', status: 'ACTIVE', maxCapacity: 1000000000, currentOccupancy: 1, ...base },
    { _id: fabricShelf, locationCode: 'RM-A-01', warehouseType: 'RAW_MATERIAL', status: 'MAINTENANCE', maxCapacity: 500, currentOccupancy: 100, ...base },
  ]);
  const product = oid(); const stoppedProduct = oid();
  await db.collection('products').insertMany([
    { _id: product, productCode: 'AL186', productName: 'Áo len', category: 'Áo', isActive: true, codeLockedAt: new Date(), basePrice: 500000, ...base },
    { _id: stoppedProduct, productCode: 'V178', productName: 'Váy xòe', category: 'Váy', isActive: false, codeLockedAt: new Date(), basePrice: 300000, ...base },
  ]);
  const kemM = oid(); const kemL = oid(); const stopped = oid();
  await db.collection('skus').insertMany([
    // Sells 10, reserves 3, below a 20 threshold, with an old lot and 2 unlabeled units.
    { _id: kemM, productId: product, skuCode: 'AL186-KEM-M', color: 'Kem', size: 'M', retailPrice: 500000, onHandQty: 10, reservedQty: 3,
      safetyStockThreshold: 20, fifoAgingThresholdDays: 60, isActive: true, discontinuedAt: null, ...base },
    // Over-reserved: 2 on hand, 5 reserved.
    { _id: kemL, productId: product, skuCode: 'AL186-KEM-L', color: 'Kem', size: 'L', retailPrice: 500000, onHandQty: 2, reservedQty: 5,
      safetyStockThreshold: 0, fifoAgingThresholdDays: 60, isActive: true, discontinuedAt: null, ...base },
    // Stopped color still holding 4.
    { _id: stopped, productId: stoppedProduct, skuCode: 'V178-HONG-S', color: 'Hồng', size: 'S', retailPrice: 300000, onHandQty: 4, reservedQty: 0,
      safetyStockThreshold: 0, isActive: false, discontinuedAt: ago(5), ...base },
  ]);
  await db.collection('finished_goods_batches').insertMany([
    { batchCode: 'LOT-OLD', skuId: kemM, skuBarcode: 'AL186-KEM-M', locationId: shelf, initialQty: 8, currentOnHandQty: 6, labeledQty: 4, fifoInboundTimestamp: ago(90), isDefectQuarantine: false, ...base },
    { batchCode: 'LOT-NEW', skuId: kemM, skuBarcode: 'AL186-KEM-M', locationId: shelf, initialQty: 4, currentOnHandQty: 4, labeledQty: 4, fifoInboundTimestamp: ago(3), isDefectQuarantine: false, ...base },
  ]);
  await db.collection('product_units').insertMany([
    { barcode: 'DEF-1', skuId: kemM, warehouseId: defectArea, inventoryStatus: 'DEFECTIVE', ...base },
    { barcode: 'DEF-2', skuId: kemM, warehouseId: shelf, inventoryStatus: 'DEFECT_PENDING', ...base },
    { barcode: 'UNPLACED-1', skuId: kemM, warehouseId: unplaced, inventoryStatus: 'AVAILABLE', ...base },
  ]);
  await db.collection('return_inspections').insertOne({ inspectionCode: 'KH-1', orderId: oid(), orderCode: 'ARA-1', inspectionResult: 'PARTIAL',
    sessionStatus: 'FINALIZED', inspectedAt: new Date(), inspectedByTechId: oid(), scannedUnits: [
      { unitBarcode: 'U1', skuId: kemM, condition: 'GOOD_INTACT', disposition: 'RESTOCK_SALEABLE' },
      { unitBarcode: 'U2', skuId: kemM, condition: 'DIRTY_OR_DAMAGED', disposition: 'QUARANTINE_DEFECT' },
    ], ...base });
  const silk = oid(); const button = oid();
  await db.collection('raw_materials').insertMany([
    { _id: silk, materialCode: 'VAI-LUA', materialName: 'Vải lụa', materialType: 'FABRIC', unit: 'METER', unitCost: 100000, onHandQty: 120,
      reservedQty: 20, pendingPutawayQty: 30, safetyStockThreshold: 200, fifoAgingThresholdDays: 180, isActive: true, ...base },
    { _id: button, materialCode: 'CUC-01', materialName: 'Cúc áo', materialType: 'AUXILIARY', unit: 'PIECE', unitCost: 500, onHandQty: 1000,
      reservedQty: 0, pendingPutawayQty: 0, safetyStockThreshold: 100, fifoAgingThresholdDays: 180, isActive: true, ...base },
  ]);
  await db.collection('fabric_rolls').insertMany([
    { rollBarcode: 'ROLL-1', rawMaterialId: silk, measuredWidthCm: 150, initialLengthMeters: 100, currentLengthMeters: 80, locationId: fabricShelf,
      status: 'IN_STOCK', putawayConfirmedAt: ago(200), fifoInboundTimestamp: ago(200), ...base },
    { rollBarcode: 'ROLL-2', rawMaterialId: silk, measuredWidthCm: 150, initialLengthMeters: 40, currentLengthMeters: 40, status: 'DEFECTIVE',
      fifoInboundTimestamp: ago(2), ...base },
  ]);
  await db.collection('inventory_transactions').insertMany([
    { transactionCode: 'T1', warehouseType: 'RAW_MATERIAL', itemType: 'RAW_MATERIAL', rawMaterialId: silk, transactionType: 'OUTBOUND_ISSUE_CUTTING',
      referenceId: oid(), quantityChange: -25, onHandBefore: 145, onHandAfter: 120, createdAt: new Date(), updatedAt: new Date() },
    { transactionCode: 'T2', warehouseType: 'FINISHED_GOODS', itemType: 'FINISHED_SKU', skuId: kemM, transactionType: 'ORDER_PACK_DEDUCT',
      referenceId: oid(), quantityChange: -2, onHandBefore: 12, onHandAfter: 10, createdAt: new Date(), updatedAt: new Date() },
  ]);
  const session = oid();
  await db.collection('stocktake_sessions').insertOne({ _id: session, sessionCode: 'KK-1', name: 'Kiểm kê tháng', warehouseType: 'ALL',
    status: 'VARIANCE_REVIEW', createdByManagerId: oid(), scheduledAt: new Date(), ...base });
  await db.collection('stocktake_records').insertMany([
    { sessionId: session, locationId: shelf, itemType: 'SKU_BATCH', skuId: kemM, barcode: 'B1', systemSnapshotQty: 6, actualScannedQty: 6, varianceQty: 0, scannedAt: new Date() },
    { sessionId: session, locationId: shelf, itemType: 'SKU_BATCH', skuId: kemM, barcode: 'B2', systemSnapshotQty: 4, actualScannedQty: 3, varianceQty: -1, scannedAt: new Date() },
    { sessionId: session, locationId: fabricShelf, itemType: 'RAW_MATERIAL', rawMaterialId: button, barcode: 'B3', systemSnapshotQty: 100, actualScannedQty: 102, varianceQty: 2, unitCostSnapshot: 500, scannedAt: new Date() },
  ]);
});
test.after(async () => { await mongoose.disconnect(); await replicaSet?.stop(); });

const api = (method, path, token = manager) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);
let reportId;

test('a draft report is built from the warehouse data', async () => {
  const created = await api('post', '/warehouse-reports').send({ periodStart: monthStart, periodEnd: today, comments: { finishedGoods: 'Ghi chú A' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const report = created.body.data;
  reportId = report.id;
  assert.match(report.code, /^BCK-\d{6}-001$/);
  assert.equal(report.status, 'DRAFT');
  assert.equal(report.content.author.name, 'Nguyễn Thu Trang');
  const fg = report.content.finishedGoods;
  assert.equal(fg.overview.onHand, 16);
  assert.equal(fg.overview.reserved, 8);
  // 7 (KEM-M) + 0 (over-reserved KEM-L) + 4 (stopped color: not sellable, still physically issuable).
  assert.equal(fg.overview.available, 11);
  assert.equal(fg.overview.value, 10 * 500000 + 2 * 500000 + 4 * 300000);
  assert.equal(fg.overview.defect, 1);
  assert.equal(fg.overview.defectPending, 1);
  const groups = fg.attention.groups;
  assert.deepEqual(groups.overReserved.map((row) => [row.skuCode, row.missing]), [['AL186-KEM-L', 3]]);
  assert.deepEqual(groups.belowSafety.map((row) => row.skuCode), ['AL186-KEM-M']);
  assert.deepEqual(groups.aging.map((row) => [row.skuCode, row.quantity]), [['AL186-KEM-M', 6]]);
  assert.deepEqual(groups.stoppedWithStock.map((row) => row.skuCode), ['V178-HONG-S']);
  assert.deepEqual(groups.defective.map((row) => [row.inStock, row.pending]), [[1, 1]]);
  assert.deepEqual(groups.unlabeled.map((row) => [row.skuCode, row.quantity]), [['AL186-KEM-M', 2]]);
  const al186 = fg.products.find((node) => node.productCode === 'AL186');
  assert.equal(al186.colors[0].variants.find((variant) => variant.size === 'M').lots.length, 2);
  assert.equal(fg.returns.total, 2);
  assert.equal(fg.returns.restockedPercent, 50);
  const rm = report.content.materials;
  assert.equal(rm.overview.value, 120 * 100000 + 1000 * 500);
  assert.deepEqual(rm.overview.totals.map((row) => [row.materialType, row.unit, row.onHand, row.quarantine]),
    [['AUXILIARY', 'PIECE', 1000, 0], ['FABRIC', 'METER', 120, 40]]);
  assert.deepEqual(rm.attention.belowSafety.map((row) => row.materialCode), ['VAI-LUA']);
  assert.ok(rm.attention.aging.some((row) => row.code === 'ROLL-1'));
  assert.ok(rm.attention.pendingCheckOrDefect.some((row) => row.code === 'ROLL-2'));
  assert.equal(rm.cutting.byUnit[0].quantity, 25);
  const common = report.content.common;
  assert.equal(common.locations.unplacedFinishedUnits, 1);
  assert.equal(common.locations.fillPercent, Math.round((210 / 650) * 1000) / 10);
  assert.deepEqual([common.stocktake.matched, common.stocktake.over, common.stocktake.short], [1, 1, 1]);
  assert.equal(common.stocktake.shortValue, -500000);
  assert.ok(common.movements.some((row) => row.type === 'OUTBOUND_ISSUE_CUTTING'));
});

test('comments are saved and kept when the data is rebuilt', async () => {
  const saved = await api('patch', `/warehouse-reports/${reportId}`).send({ comments: { finishedGoods: 'Đề xuất thanh lý V178', materials: 'Thiếu vải lụa', common: '' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const refreshed = await api('post', `/warehouse-reports/${reportId}/refresh`).send({});
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.data.content.comments.materials, 'Thiếu vải lụa');
  const bad = await api('post', '/warehouse-reports').send({ periodStart: today, periodEnd: monthStart === today ? '2000-01-01' : monthStart });
  assert.equal(bad.status, 400);
});

test('sending freezes the report and the Owner can read it', async () => {
  const sent = await api('post', `/warehouse-reports/${reportId}/submit`).send({ comments: { finishedGoods: 'Đề xuất thanh lý V178', materials: 'Thiếu vải lụa', common: 'Ổn định' } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.data.status, 'SUBMITTED');
  assert.match(sent.body.data.content.seal.hash, /^[0-9a-f]{64}$/);
  for (const [method, path] of [['post', `/warehouse-reports/${reportId}/refresh`], ['patch', `/warehouse-reports/${reportId}`],
    ['post', `/warehouse-reports/${reportId}/submit`], ['delete', `/warehouse-reports/${reportId}`]]) {
    const locked = await api(method, path).send({ comments: {} });
    assert.equal(locked.status, 409, `${method} ${path}`);
  }
  const ownerView = await api('get', `/owner/manager-reports/${reportId}`, owner);
  assert.equal(ownerView.status, 200, JSON.stringify(ownerView.body).slice(0, 300));
  const data = ownerView.body.data;
  assert.equal(data.reportType, 'INVENTORY');
  assert.equal(data.content.comments.common, 'Ổn định');
  const ownerCannotWrite = await api('post', '/warehouse-reports', owner).send({ periodStart: monthStart, periodEnd: today });
  assert.equal(ownerCannotWrite.status, 403);
});
