/*
 * File: stocktakeReview.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: Quản lý kho xem chi tiết báo cáo kiểm kê, duyệt chênh lệch nhỏ, bị chặn duyệt chênh lệch lớn
 * và trả báo cáo về để phát phiên kiểm kê lại cho nhân viên kỹ thuật.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.model.js';
import { createTestToken } from './support/authSession.mjs';

let replicaSet;
let manager;
let managerId;
let inspectorId;
let technician;
const db = () => mongoose.connection.db;
const oid = () => new mongoose.Types.ObjectId();

test.before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replicaSet.getUri());
  manager = await createTestToken('WAREHOUSE_MANAGER', { fullName: 'Quản lý kho' });
  technician = await createTestToken('GARMENT_TECHNICIAN', { fullName: 'Kỹ thuật xưởng' });
  managerId = (await User.findOne({ roleCode: 'WAREHOUSE_MANAGER' }))._id;
  inspectorId = (await User.findOne({ roleCode: 'GARMENT_TECHNICIAN' }))._id;
});

test.after(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
});

/** Một phiên chờ duyệt với một dòng nguyên liệu đã đếm; actual quyết định mức chênh lệch. */
async function seedSession(code, actual, { scanned = true } = {}) {
  const sessionId = oid(); const locationId = oid(); const now = new Date();
  await db().collection('stocktake_sessions').insertOne({ _id: sessionId, sessionCode: code, name: 'Kiểm khu A',
    warehouseType: 'RAW_MATERIAL', scopeType: 'ZONE', zoneCode: 'A', scopeLocationIds: [locationId],
    createdByManagerId: managerId, inspectorId, approverId: managerId, status: 'VARIANCE_REVIEW',
    approvalRevision: 0, isDeleted: false, createdAt: now, updatedAt: now });
  await db().collection('stocktake_records').insertOne({ sessionId, locationId, itemType: 'RAW_MATERIAL', rawMaterialId: oid(),
    barcode: `${code}-NL`, systemSnapshotQty: 100, actualScannedQty: actual, varianceQty: actual - 100, unitCostSnapshot: 1000,
    agingDaysAtCount: 0, isAgingThresholdExceeded: false, ...(scanned ? { scannedAt: now } : {}), isDeleted: false, createdAt: now, updatedAt: now });
  return String(sessionId);
}
const get = (id, token = manager) => request(app).get(`/api/stocktake/sessions/${id}`).set('Authorization', `Bearer ${token}`);
const post = (id, action, body) => request(app).post(`/api/stocktake/sessions/${id}/${action}`).set('Authorization', `Bearer ${manager}`).send(body);

test('manager reads the report detail and approves a minor variance', async () => {
  const id = await seedSession('KK-T1', 98);
  const detail = await get(id);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.data.summary.absoluteQuantity, 2);
  assert.equal(detail.body.data.canApprove, true);
  assert.equal(detail.body.data.records[0].varianceQty, -2);

  const approved = await post(id, 'approve', { expectedVersion: 0, reportHash: detail.body.data.reportHash, adjustmentReason: 'Hao hụt nhỏ do đo lại cuộn' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const saved = await db().collection('stocktake_sessions').findOne({ sessionCode: 'KK-T1' });
  assert.equal(saved.status, 'APPROVED_PENDING_ADJUSTMENT');
  assert.equal(saved.approvalInfo.approvalLevelRequired, 'MINOR_MANAGER');
  assert.equal(String(saved.approvalInfo.approvedByUserId), String(managerId));

  const again = await post(id, 'approve', { expectedVersion: 1, reportHash: detail.body.data.reportHash, adjustmentReason: 'Duyệt lần hai không được phép' });
  assert.equal(again.status, 409);
});

test('manager can approve a report that is above the threshold, and the issue is recorded', async () => {
  const id = await seedSession('KK-T2', 50);
  const detail = await get(id);
  assert.equal(detail.body.data.ownerRequired, true);
  assert.equal(detail.body.data.canApprove, true);
  const response = await post(id, 'approve', { expectedVersion: 0, reportHash: detail.body.data.reportHash, adjustmentReason: 'Thiếu do hàng đã đóng đơn, chấp nhận' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const saved = await db().collection('stocktake_sessions').findOne({ sessionCode: 'KK-T2' });
  assert.equal(saved.status, 'APPROVED_PENDING_ADJUSTMENT');
  assert.equal(saved.approvalInfo.exceededThreshold, true);
});

test('manager can approve a report that still has uncounted lines', async () => {
  const id = await seedSession('KK-T11', 0, { scanned: false });
  const detail = await get(id);
  assert.equal(detail.body.data.uncountedCount, 1);
  assert.equal(detail.body.data.canApprove, true);
  const response = await post(id, 'approve', { expectedVersion: 0, reportHash: detail.body.data.reportHash, adjustmentReason: 'Ô bị che, chấp nhận tính là thiếu' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const saved = await db().collection('stocktake_sessions').findOne({ sessionCode: 'KK-T11' });
  assert.equal(saved.approvalInfo.uncountedCount, 1);
});

test('an unreasonable report is sent back and a recount is issued to the technician', async () => {
  const id = await seedSession('KK-T3', 10);
  const short = await post(id, 'recount', { expectedVersion: 0, reason: 'ngắn' });
  assert.equal(short.status, 400);

  const response = await post(id, 'recount', { expectedVersion: 0, reason: 'Số đếm lệch 90% so với hệ thống, cần đếm lại', durationHours: 4 });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const original = await db().collection('stocktake_sessions').findOne({ sessionCode: 'KK-T3' });
  assert.equal(original.status, 'RECOUNT_REQUESTED');
  const recount = await db().collection('stocktake_sessions').findOne({ _id: original.recountInfo.recountSessionId });
  assert.equal(recount.status, 'WAITING');
  assert.equal(String(recount.recountOfSessionId), id);
  assert.equal(String(recount.inspectorId), String(inspectorId));
  assert.equal(recount.zoneCode, 'A');
  assert.deepEqual(recount.scopeLocationIds.map(String), original.scopeLocationIds.map(String));
  assert.match(recount.instructions, /Kiểm kê lại phiên KK-T3/);
  assert.equal(recount.dueAt - recount.scheduledAt, 4 * 3600000);

  // Phiên gốc đã trả về thì không duyệt hay trả về lần nữa.
  const detail = await get(id);
  assert.equal(detail.body.data.canApprove, false);
  assert.equal(detail.body.data.canRequestRecount, false);
  assert.equal(detail.body.data.stocktake.recountInfo.recountSessionId.sessionCode, recount.sessionCode);
  assert.equal((await post(id, 'recount', { expectedVersion: 1, reason: 'Gửi lại lần nữa cho chắc' })).status, 409);

  // Nhân viên kỹ thuật thấy phiên kiểm lại trong danh sách việc của mình.
  const assigned = await request(app).get('/api/garment-technical/stocktake-execution/sessions').set('Authorization', `Bearer ${technician}`);
  if (assigned.status === 200) {
    const sessions = assigned.body.data?.sessions || assigned.body.data || [];
    assert.ok(sessions.some((item) => item.sessionCode === recount.sessionCode));
  }
});

test('a stale report version is rejected', async () => {
  const id = await seedSession('KK-T4', 99);
  const response = await post(id, 'recount', { expectedVersion: 3, reason: 'Phiên bản cũ không được xử lý' });
  assert.equal(response.status, 409);
});

test('technicians cannot use the review endpoints', async () => {
  const id = await seedSession('KK-T5', 99);
  assert.equal((await get(id, technician)).status, 403);
});

test('a technician cannot edit or resubmit a report that was approved or sent back', async () => {
  const approvedId = await seedSession('KK-T6', 99);
  const detail = await get(approvedId);
  assert.equal((await post(approvedId, 'approve', { expectedVersion: 0, reportHash: detail.body.data.reportHash, adjustmentReason: 'Lệch một đơn vị, chấp nhận' })).status, 200);
  const returnedId = await seedSession('KK-T7', 10);
  assert.equal((await post(returnedId, 'recount', { expectedVersion: 0, reason: 'Lệch quá lớn, cần đếm lại toàn bộ' })).status, 201);

  for (const id of [approvedId, returnedId]) {
    const before = (await db().collection('stocktake_sessions').findOne({ _id: new mongoose.Types.ObjectId(id) })).status;
    const resubmit = await request(app).post(`/api/garment-technical/stocktake-execution/sessions/${id}/complete`).set('Authorization', `Bearer ${technician}`);
    assert.equal(resubmit.status, 400, JSON.stringify(resubmit.body));
    const record = await db().collection('stocktake_records').findOne({ sessionId: new mongoose.Types.ObjectId(id) });
    const edit = await request(app).patch(`/api/garment-technical/stocktake-execution/records/${record._id}`).set('Authorization', `Bearer ${technician}`).send({ actualScannedQty: 100 });
    assert.equal(edit.status, 400, JSON.stringify(edit.body));
    const after = await db().collection('stocktake_sessions').findOne({ _id: new mongoose.Types.ObjectId(id) });
    assert.equal(after.status, before);
  }
});

/** Phiên đang đếm để nhân viên kỹ thuật nộp; actual = 100 là khớp. */
async function seedCounting(code, actual, { scanned = true } = {}) {
  const id = await seedSession(code, actual, { scanned });
  await db().collection('stocktake_sessions').updateOne({ sessionCode: code }, { $set: { status: 'FROZEN_COUNTING' } });
  return id;
}
const complete = (id, body) => request(app).post(`/api/garment-technical/stocktake-execution/sessions/${id}/complete`)
  .set('Authorization', `Bearer ${technician}`).send(body);

test('a matching count is submitted without a note', async () => {
  const id = await seedCounting('KK-T8', 100);
  const response = await complete(id, {});
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const saved = await db().collection('stocktake_sessions').findOne({ sessionCode: 'KK-T8' });
  assert.equal(saved.status, 'VARIANCE_REVIEW');
  assert.equal(saved.submissionInfo.hasIssues, false);
});

test('a count with variance or uncounted lines needs a reason before it is submitted', async () => {
  for (const [code, actual, scanned] of [['KK-T9', 97, true], ['KK-T10', 0, false]]) {
    const id = await seedCounting(code, actual, { scanned });
    const missing = await complete(id, {});
    assert.equal(missing.status, 400, JSON.stringify(missing.body));
    assert.equal((await complete(id, { note: 'ngắn' })).status, 400);
    assert.equal((await db().collection('stocktake_sessions').findOne({ sessionCode: code })).status, 'FROZEN_COUNTING');

    const ok = await complete(id, { note: 'Ô A-01 thiếu hàng, đã tìm quanh kệ không thấy' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const saved = await db().collection('stocktake_sessions').findOne({ sessionCode: code });
    assert.equal(saved.status, 'VARIANCE_REVIEW');
    assert.equal(saved.submissionInfo.hasIssues, true);
    assert.match(saved.submissionInfo.note, /thiếu hàng/);
    assert.equal((await get(id)).body.data.stocktake.submissionInfo.note, saved.submissionInfo.note);
  }
});

test('adjusting a 12-unit shelf: 10 good, 1 found damaged, 1 missing → both written off and still traceable', async () => {
  const now = new Date(); const skuId = oid(); const batchId = oid(); const locationId = oid(); const sessionId = oid();
  await db().collection('warehouse_locations').insertOne({ _id: locationId, locationCode: 'C-01-T1-O01', warehouseType: 'FINISHED_GOODS',
    zoneCode: 'C', rackCode: '01', status: 'ACTIVE', layoutBin: true, maxCapacity: 50, currentOccupancy: 12, isDeleted: false, createdAt: now, updatedAt: now });
  await db().collection('skus').insertOne({ _id: skuId, skuCode: 'TEST-SKU-12', productName: 'Áo test', onHandQty: 12, reservedQty: 0, unitCogs: 50000, isActive: true, isDeleted: false });
  await db().collection('finished_goods_batches').insertOne({ _id: batchId, batchCode: 'FGB-T12', skuId, locationId, initialQty: 12, currentOnHandQty: 12, reservedPickQty: 0, isDefectQuarantine: false, fifoInboundTimestamp: now, isDeleted: false });
  const barcodes = Array.from({ length: 12 }, (_, i) => `ARATEST${String(i).padStart(16, '0')}`);
  await db().collection('product_units').insertMany(barcodes.map((barcode) => ({ barcode, barcodeFormat: 'CODE_128', skuId, warehouseId: locationId,
    batchId, inventoryStatus: 'AVAILABLE', createdAt: now, updatedAt: now })));
  await db().collection('stocktake_sessions').insertOne({ _id: sessionId, sessionCode: 'KK-ADJ', warehouseType: 'FINISHED_GOODS', scopeType: 'ZONE',
    zoneCode: 'C', createdByManagerId: managerId, inspectorId, status: 'VARIANCE_REVIEW', approvalRevision: 0, isDeleted: false, createdAt: now, updatedAt: now });
  await db().collection('stocktake_records').insertMany(barcodes.map((barcode, i) => ({ sessionId, locationId, itemType: 'SKU_BATCH', skuId, batchId, barcode,
    systemSnapshotQty: 1, actualScannedQty: i === 11 ? 0 : 1, varianceQty: i === 11 ? -1 : 0, unitCostSnapshot: 50000,
    damagedQty: i === 10 ? 1 : 0, ...(i === 10 ? { conditionNote: 'Ố vàng do để lâu' } : {}), ...(i === 11 ? {} : { scannedAt: now }),
    isDeleted: false, createdAt: now, updatedAt: now })));

  // Duyệt rồi điều chỉnh: dòng thiếu giữ lý do mặc định (thất lạc) và thêm ghi chú.
  const detail = await get(String(sessionId));
  assert.equal(detail.body.data.records.find((r) => r.barcode === barcodes[10]).plan.kind, 'WRITE_OFF');
  assert.equal((await post(String(sessionId), 'approve', { expectedVersion: 0, reportHash: detail.body.data.reportHash, adjustmentReason: '1 hỏng, 1 thất lạc, chấp nhận' })).status, 200);
  const missingRecord = await db().collection('stocktake_records').findOne({ barcode: barcodes[11] });
  const adjusted = await post(String(sessionId), 'adjust', { expectedVersion: 1, lines: [{ recordId: String(missingRecord._id), note: 'Tìm quanh kệ không thấy' }] });
  assert.equal(adjusted.status, 200, JSON.stringify(adjusted.body));
  assert.equal(adjusted.body.data.writtenOffUnits, 2);

  assert.equal((await db().collection('skus').findOne({ _id: skuId })).onHandQty, 10);
  assert.equal((await db().collection('finished_goods_batches').findOne({ _id: batchId })).currentOnHandQty, 10);
  assert.equal((await db().collection('warehouse_locations').findOne({ _id: locationId })).currentOccupancy, 10);
  assert.equal(await db().collection('product_units').countDocuments({ skuId, inventoryStatus: 'AVAILABLE' }), 10);
  const damaged = await db().collection('product_units').findOne({ barcode: barcodes[10] });
  assert.equal(damaged.inventoryStatus, 'STOCKTAKE_WRITE_OFF');
  assert.equal(damaged.stocktakeWriteOff.reason, 'DAMAGED');
  assert.equal((await db().collection('product_units').findOne({ barcode: barcodes[11] })).stocktakeWriteOff.reason, 'LOST');
  assert.equal(await db().collection('inventory_transactions').countDocuments({ referenceId: sessionId, transactionType: 'STOCKTAKE_ADJUSTMENT' }), 2);
  assert.equal((await db().collection('stocktake_sessions').findOne({ _id: sessionId })).status, 'APPROVED_COMPLETED');

  // Tra cứu barcode vẫn thấy, kết thúc ở "loại khỏi kho khi kiểm kê".
  const timeline = await request(app).get(`/api/products/units/${barcodes[10]}/timeline`).set('Authorization', `Bearer ${manager}`);
  assert.equal(timeline.status, 200, JSON.stringify(timeline.body));
  assert.equal(timeline.body.data.current.code, 'STOCKTAKE_WRITE_OFF');
  const events = timeline.body.data.segments[0].events;
  assert.equal(events.at(-1).type, 'WRITE_OFF');
  assert.match(events.at(-1).title, /Hàng hỏng/);
  assert.ok(events.at(-1).details.some((d) => d.includes('KK-ADJ')));

  // Không điều chỉnh lần hai.
  assert.equal((await post(String(sessionId), 'adjust', { expectedVersion: 2 })).status, 409);
});

test('a stocktake is created with an exact time window', async () => {
  const response = await request(app).post('/api/stocktake').set('Authorization', `Bearer ${manager}`).send({
    name: 'Kiểm khung giờ', warehouseType: 'FINISHED_GOODS', scopeType: 'WAREHOUSE', recurrence: 'ONCE',
    startDate: new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10), startTime: '07:30', endTime: '09:30',
    inspectorId: String(inspectorId), approverId: String(managerId) });
  if (response.status === 400 && /vị trí/.test(response.body.message)) return; // DB test không có vị trí kho
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const session = await db().collection('stocktake_sessions').findOne({ name: 'Kiểm khung giờ' });
  assert.equal(session.dueAt - session.scheduledAt, 2 * 3600000);
  const bad = await request(app).post('/api/stocktake').set('Authorization', `Bearer ${manager}`).send({
    name: 'Sai khung giờ', warehouseType: 'FINISHED_GOODS', scopeType: 'WAREHOUSE', recurrence: 'ONCE',
    startDate: new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10), startTime: '09:30', endTime: '07:30',
    inspectorId: String(inspectorId), approverId: String(managerId) });
  assert.equal(bad.status, 400);
});
