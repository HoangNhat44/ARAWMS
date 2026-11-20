/*
 * File: stocktakePackingLock.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: Khung giờ kiểm kê kho thành phẩm khóa đóng hàng; lần đóng dở khi bắt đầu kiểm kê bị hủy (đơn chưa đóng)
 * và phải đóng lại từ đầu. Lịch kiểm kê được báo cho nhân viên kỹ thuật được giao và nhân viên kho.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import User from '../src/models/User.model.js';
import { guardPacking } from '../src/modules/order-fulfillment/packing-verification/packingStocktakeLock.js';
import { createTestToken } from './support/authSession.mjs';

let replicaSet; let manager; let staff; let technician; let managerId; let inspectorId;
const db = () => mongoose.connection.db;
const oid = () => new mongoose.Types.ObjectId();
const minutes = (n) => new Date(Date.now() + n * 60000);

test.before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replicaSet.getUri());
  manager = await createTestToken('WAREHOUSE_MANAGER', { fullName: 'Quản lý kho' });
  staff = await createTestToken('WAREHOUSE_STAFF', { fullName: 'Nhân viên kho' });
  technician = await createTestToken('GARMENT_TECHNICIAN', { fullName: 'Kỹ thuật xưởng' });
  managerId = (await User.findOne({ roleCode: 'WAREHOUSE_MANAGER' }))._id;
  inspectorId = (await User.findOne({ roleCode: 'GARMENT_TECHNICIAN' }))._id;
  await db().collection('warehouse_locations').insertOne({ locationCode: 'B-09-T1-O01', warehouseType: 'FINISHED_GOODS', zoneCode: 'B',
    rackCode: '09', status: 'ACTIVE', layoutBin: true, maxCapacity: 100, currentOccupancy: 0, isDeleted: false, createdAt: new Date(), updatedAt: new Date() });
});
test.after(async () => { await mongoose.disconnect(); await replicaSet?.stop(); });

async function seedStocktake(code, from, to, { warehouseType = 'FINISHED_GOODS', status = 'WAITING' } = {}) {
  await db().collection('stocktake_sessions').insertOne({ sessionCode: code, warehouseType, scopeType: 'WAREHOUSE', status,
    scheduledAt: from, dueAt: to, createdByManagerId: managerId, inspectorId, isDeleted: false, createdAt: new Date(), updatedAt: new Date() });
}
async function seedPacking(scannedAt) {
  const id = oid();
  await db().collection('packing_sessions').insertOne({ _id: id, orderKey: String(oid()), orderId: oid(), operatorId: managerId, stationId: 'station-0001',
    leaseUntil: minutes(2), leaseVersion: 1, state: 'SCANNING', version: 0, items: [{ lineKey: '0', skuId: oid(), quantity: 2, skuCode: 'X' }],
    scannedUnits: [{ barcode: 'ARATESTPACK0001', lineKey: '0', scannedAt }], createdAt: scannedAt, updatedAt: scannedAt });
  await db().collection('product_units').insertOne({ barcode: 'ARATESTPACK' + String(id).slice(-6), barcodeFormat: 'CODE_128', skuId: oid(), warehouseId: oid(),
    inventoryStatus: 'AVAILABLE', packingClaim: { orderKey: 'k', sessionId: id, lineKey: '0', claimedAt: scannedAt } });
  return id;
}
const clear = () => Promise.all([db().collection('stocktake_sessions').deleteMany({}), db().collection('packing_sessions').deleteMany({})]);

test('during a finished-goods stocktake window packing is locked and the half-packed order is dropped', async () => {
  await clear();
  const packingId = await seedPacking(minutes(-10));
  await seedStocktake('KK-LOCK', minutes(-1), minutes(60));
  await assert.rejects(guardPacking({ packingId }), (error) => error.code === 'STOCKTAKE_LOCK' && error.status === 423);
  const packing = await db().collection('packing_sessions').findOne({ _id: packingId });
  assert.equal(packing.scannedUnits.length, 0);
  assert.equal(await db().collection('product_units').countDocuments({ 'packingClaim.sessionId': packingId }), 0);
  // Mở phiên đóng mới cũng bị chặn trong khung giờ.
  await assert.rejects(guardPacking({}), (error) => error.code === 'STOCKTAKE_LOCK');
});

test('a raw-material stocktake does not lock packing', async () => {
  await clear();
  await seedStocktake('KK-NL', minutes(-1), minutes(60), { warehouseType: 'RAW_MATERIAL' });
  assert.deepEqual(await guardPacking({}), { restarted: false });
});

test('after the window, a packing started before the stocktake is not recorded and restarts from scratch', async () => {
  await clear();
  const packingId = await seedPacking(minutes(-90));
  await seedStocktake('KK-PAST', minutes(-60), minutes(-5), { status: 'VARIANCE_REVIEW' });
  await assert.rejects(guardPacking({ packingId }), (error) => error.code === 'PACKING_RESTARTED_AFTER_STOCKTAKE');
  assert.equal((await db().collection('packing_sessions').findOne({ _id: packingId })).scannedUnits.length, 0);

  const resumed = await seedPacking(minutes(-90));
  const orderKey = (await db().collection('packing_sessions').findOne({ _id: resumed })).orderKey;
  assert.deepEqual(await guardPacking({ orderKey, resumeSilently: true }), { restarted: true });
});

test('a packing started after the stocktake is untouched', async () => {
  await clear();
  await seedStocktake('KK-OLD', minutes(-120), minutes(-60), { status: 'VARIANCE_REVIEW' });
  const packingId = await seedPacking(minutes(-30));
  assert.deepEqual(await guardPacking({ packingId }), { restarted: false });
  assert.equal((await db().collection('packing_sessions').findOne({ _id: packingId })).scannedUnits.length, 1);
});

test('creating a stocktake notifies the assigned technician and warehouse staff, who see it in announcements', async () => {
  await clear();
  const date = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
  const created = await request(app).post('/api/stocktake').set('Authorization', `Bearer ${manager}`).send({
    name: 'Kiểm kho thành phẩm', warehouseType: 'FINISHED_GOODS', scopeType: 'WAREHOUSE', recurrence: 'ONCE',
    startDate: date, startTime: '07:30', endTime: '09:30', inspectorId: String(inspectorId), approverId: String(managerId) });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const notes = await db().collection('notifications').find({ type: 'STOCKTAKE_SCHEDULED' }).toArray();
  assert.ok(notes.some((n) => String(n.recipientUserId) === String(inspectorId) && n.recipientRole === 'GARMENT_TECHNICIAN'));
  assert.ok(notes.some((n) => n.recipientRole === 'WAREHOUSE_STAFF' && /đóng hàng bị khóa/.test(n.message)));
  assert.ok(notes.every((n) => /07:30 – 09:30/.test(n.title)));

  for (const token of [staff, technician]) {
    const response = await request(app).get('/api/stocktake/announcements').set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const item = response.body.data.items.find((x) => x.sessionCode === created.body.data.session.sessionCode);
    assert.ok(item);
    assert.equal(item.locksPacking, true);
  }
  // Nhân viên kho không vào được phần quản lý kiểm kê.
  assert.equal((await request(app).get('/api/stocktake').set('Authorization', `Bearer ${staff}`)).status, 403);
});

test('a past time window is rejected', async () => {
  const yesterdayOrToday = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const response = await request(app).post('/api/stocktake').set('Authorization', `Bearer ${manager}`).send({
    name: 'Đã qua', warehouseType: 'FINISHED_GOODS', scopeType: 'WAREHOUSE', recurrence: 'ONCE',
    startDate: yesterdayOrToday, startTime: '00:00', endTime: '00:15', inspectorId: String(inspectorId), approverId: String(managerId) });
  assert.equal(response.status, 400);
});
