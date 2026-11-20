/*
 * File: stocktakeCreate.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Creating a stocktake from the form: the form always sends rackId/itemId, as "" when the scope
 * does not use them. That must not break saving (it used to fail the ObjectId cast on StocktakeSession.itemId).
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
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

test.before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replicaSet.getUri());
  manager = await createTestToken('WAREHOUSE_MANAGER', { fullName: 'Quản lý kho' });
  await createTestToken('GARMENT_TECHNICIAN', { fullName: 'Kỹ thuật xưởng' });
  managerId = String((await User.findOne({ roleCode: 'WAREHOUSE_MANAGER' }))._id);
  inspectorId = String((await User.findOne({ roleCode: 'GARMENT_TECHNICIAN' }))._id);
  await mongoose.connection.db.collection('warehouse_locations').insertOne({ locationCode: 'B-01-T1-O01',
    warehouseType: 'FINISHED_GOODS', zoneCode: 'B', rackCode: '01', status: 'ACTIVE', layoutBin: true,
    maxCapacity: 100, currentOccupancy: 0, isDeleted: false, createdAt: new Date(), updatedAt: new Date() });
});

test.after(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
});

/** Body as the stocktake form sends it for a whole-warehouse count. */
const form = (fields = {}) => ({
  name: 'Kiểm kê kho thành phẩm', warehouseType: 'FINISHED_GOODS', scopeType: 'WAREHOUSE',
  zoneCode: '', rackId: '', itemId: '', recurrence: 'ONCE', startDate: today, startTime: '23:30',
  durationHours: 2, inspectorId, approverId: managerId, instructions: '', ...fields,
});

test('a whole-warehouse count with empty rackId/itemId from the form is created', async () => {
  const response = await request(app).post('/api/stocktake').set('Authorization', `Bearer ${manager}`).send(form());
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const session = await mongoose.connection.db.collection('stocktake_sessions').findOne({ name: 'Kiểm kê kho thành phẩm' });
  assert.equal(session.status, 'WAITING');
  assert.equal(session.scopeLocationIds.length, 1);
  assert.equal(session.itemId, undefined);
  assert.equal(session.rackId, undefined);
});

test('a weekly schedule with empty rackId/itemId from the form is created', async () => {
  const response = await request(app).post('/api/stocktake').set('Authorization', `Bearer ${manager}`)
    .send(form({ name: 'Kiểm kê hằng tuần', recurrence: 'WEEKLY', weekday: 1 }));
  assert.ok([200, 201].includes(response.status), JSON.stringify(response.body));
  const schedule = await mongoose.connection.db.collection('stocktake_schedules').findOne({ name: 'Kiểm kê hằng tuần' });
  assert.ok(schedule);
  assert.equal(schedule.itemId, undefined);
});

test('an item-scope count still requires a valid item', async () => {
  const response = await request(app).post('/api/stocktake').set('Authorization', `Bearer ${manager}`)
    .send(form({ name: 'Kiểm một mặt hàng', scopeType: 'ITEM', itemId: '' }));
  assert.equal(response.status, 400);
  assert.match(response.body.message, /Chọn mặt hàng/);
});
