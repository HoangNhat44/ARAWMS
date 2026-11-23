/*
 * Kiểm tra thông báo nghiệp vụ giữa các role kho:
 * - API /notifications bắt buộc đăng nhập và chỉ trả thông báo của role / user đang đăng nhập.
 * - Thông báo đích danh (vd. phiếu giao cho 1 nhân viên kho) không lộ cho người khác cùng role.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { createTestToken } from './support/authSession.mjs';
import { notifyWorkflow } from '../src/common/services/workflowNotify.js';

const userIdOf = (token) => jwt.decode(token).sub;
const list = async (token) => (await request(app).get('/api/notifications').auth(token, { type: 'bearer' })).body;

test('workflow notifications reach the right role and person only', async () => {
  const database = await MongoMemoryServer.create();
  try {
    await mongoose.connect(database.getUri());
    const manager = await createTestToken('WAREHOUSE_MANAGER');
    const staffA = await createTestToken('WAREHOUSE_STAFF');
    const staffB = await createTestToken('WAREHOUSE_STAFF');
    const technician = await createTestToken('GARMENT_TECHNICIAN');
    const accountant = await createTestToken('ACCOUNTANT');

    assert.equal((await request(app).get('/api/notifications')).status, 401);

    await notifyWorkflow({ roles: { WAREHOUSE_MANAGER: '/warehouse/raw-materials/outbound' },
      title: 'Yêu cầu xuất NPL mới: PXNL000001', message: 'Cần duyệt', type: 'OUTBOUND_REQUEST' });
    await notifyWorkflow({ users: [{ userId: userIdOf(staffA), role: 'WAREHOUSE_STAFF', url: '/warehouse/staff/outbound' }],
      title: 'Nhiệm vụ lấy hàng mới: PXNL000001', message: 'Được giao', type: 'OUTBOUND_REQUEST' });
    // Người thao tác không tự nhận thông báo của chính mình
    await notifyWorkflow({ actor: { _id: userIdOf(technician) },
      users: [{ userId: userIdOf(technician), role: 'GARMENT_TECHNICIAN' }], title: 'Tự gửi', message: 'x' });

    const managerView = await list(manager);
    assert.deepEqual(managerView.data.map((n) => n.title), ['Yêu cầu xuất NPL mới: PXNL000001']);
    assert.equal(managerView.unreadCount, 1);

    assert.deepEqual((await list(staffA)).data.map((n) => n.title), ['Nhiệm vụ lấy hàng mới: PXNL000001']);
    assert.equal((await list(staffB)).data.length, 0, 'nhân viên khác không thấy phiếu không giao cho mình');
    assert.equal((await list(technician)).data.length, 0);
    assert.equal((await list(accountant)).data.length, 0);

    // Không thể xem thông báo role khác bằng cách đổi ?role=
    const spoof = await request(app).get('/api/notifications?role=WAREHOUSE_MANAGER').auth(staffB, { type: 'bearer' });
    assert.equal(spoof.body.data.length, 0);

    // Đọc hết của staffA không ảnh hưởng thông báo của Quản lý kho
    await request(app).patch('/api/notifications/mark-all-read').auth(staffA, { type: 'bearer' }).expect(200);
    assert.equal((await list(staffA)).unreadCount, 0);
    assert.equal((await list(manager)).unreadCount, 1);
  } finally {
    await mongoose.disconnect();
    await database.stop();
  }
});
