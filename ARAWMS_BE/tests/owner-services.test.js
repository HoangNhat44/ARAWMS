/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06..09, UC-18 - Kiểm thử service với persistence giả lập, không ghi DB thật.
 */
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.model.js';
import Role from '../src/models/Role.model.js';
import SystemLog from '../src/models/SystemLog.model.js';
import ManagerReport from '../src/models/ManagerReport.model.js';
import { createEmployee, changeEmployeeStatus } from '../src/modules/user-management/employee-management/employeeManagement.service.js';
import { assignPermissions } from '../src/modules/user-management/employee-permissions/employeePermissions.service.js';
import { acknowledgeReport } from '../src/modules/managerial-financial-analytics/manager-reports/managerReports.service.js';
import { CARRIER_VIEW } from '../src/common/middlewares/authorizePermission.js';
const originals = { transaction: mongoose.connection.transaction, findUser: User.findOne, existsUser: User.exists, createUser: User.create,
  findRole: Role.findOne, existsRole: Role.exists, listRoles: Role.find, audit: SystemLog.create, findReport: ManagerReport.findOne };
const chain = (value) => ({ session: async () => value, populate: () => chain(value), select: () => chain(value) });
const id = new mongoose.Types.ObjectId(); const roleId = new mongoose.Types.ObjectId(); let fixture; let logs; let saves; let roleAvailable; let report;
const request = (body) => ({ params: { id: String(id) }, body, user: { _id: new mongoose.Types.ObjectId(), roleCode: 'OWNER' }, ip: '127.0.0.1', get: () => 'owner-test' });
beforeEach(() => {
  logs = []; saves = 0; roleAvailable = true;
  fixture = { _id: id, employeeCode: 'EMP100', fullName: 'Nguyễn Văn An', email: 'an@example.com', roleCode: 'SELLER', roleId,
    status: 'ACTIVE', managementVersion: 0, permissionOverrides: [], sessions: [{ sessionId: 'old' }], failedLoginAttempts: 5,
    passwordResetRequired: true, async save() { saves++; return this; } };
  report = { _id: id, code: 'MR100', status: 'SUBMITTED', async save() { saves++; return this; } };
  mongoose.connection.transaction = async (work) => work({ testSession: true });
  User.findOne = () => chain(fixture); User.exists = () => chain(null);
  Role.findOne = () => chain(roleAvailable ? { _id: roleId, roleCode: 'SELLER' } : null);
  Role.exists = () => chain(roleAvailable ? { _id: roleId } : null);
  Role.find = () => chain([{ roleCode: 'SELLER', roleName: 'Bán hàng', permissions: [] }]);
  SystemLog.create = async ([entry]) => { logs.push(entry); return [entry]; };
  ManagerReport.findOne = () => chain(report);
});
after(() => {
  mongoose.connection.transaction = originals.transaction; User.findOne = originals.findUser; User.exists = originals.existsUser; User.create = originals.createUser;
  Role.findOne = originals.findRole; Role.exists = originals.existsRole; Role.find = originals.listRoles; SystemLog.create = originals.audit; ManagerReport.findOne = originals.findReport;
});
test('UC-06 hashes password, excludes sensitive values from response/audit', async () => {
  let stored; User.create = async ([doc]) => { stored = { ...doc, _id: id }; return [stored]; };
  const response = await createEmployee(request({ employeeCode: 'EMP100', fullName: 'Nguyễn Văn An', email: 'an@example.com', password: 'Valid12345', confirmPassword: 'Valid12345', roleCode: 'SELLER' }));
  assert.ok(await bcrypt.compare('Valid12345', stored.passwordHash)); assert.equal(stored.password, undefined);
  assert.equal(response.passwordHash, undefined); assert.equal(response.password, undefined); assert.equal(logs[0].majorFeature, 'User Management');
  assert.ok(!JSON.stringify(logs).includes('Valid12345')); assert.ok(!JSON.stringify(logs).includes(stored.passwordHash));
});
test('UC-06 duplicate employee rejected without creating or logging', async () => {
  User.exists = () => chain({ _id: id }); let creates = 0; User.create = async () => { creates++; };
  await assert.rejects(createEmployee(request({ employeeCode: 'EMP100', fullName: 'Nguyễn Văn An', email: 'an@example.com', password: 'Valid12345', confirmPassword: 'Valid12345', roleCode: 'SELLER' })), { statusCode: 409 });
  assert.equal(creates, 0); assert.equal(logs.length, 0);
});
test('UC-07 locks employee and revokes all sessions', async () => {
  const result = await changeEmployeeStatus(request({ expectedVersion: 0, reason: 'Tạm dừng công việc' }), 'LOCKED');
  assert.equal(result.status, 'LOCKED'); assert.deepEqual(fixture.sessions, []); assert.equal(result.managementVersion, 1); assert.equal(saves, 1); assert.equal(logs[0].action, 'LOCK_EMPLOYEE');
});
test('UC-08 unlock does not bypass GBR-02 password reset', async () => {
  fixture.status = 'LOCKED'; await changeEmployeeStatus(request({ expectedVersion: 0, reason: 'Cho phép làm việc trở lại' }), 'ACTIVE');
  assert.equal(fixture.status, 'ACTIVE'); assert.equal(fixture.failedLoginAttempts, 5); assert.equal(fixture.passwordResetRequired, true); assert.deepEqual(fixture.sessions, []);
});
test('UC-07 stale admin version rejected before write', async () => {
  fixture.managementVersion = 2; await assert.rejects(changeEmployeeStatus(request({ expectedVersion: 0, reason: 'Tạm dừng công việc' }), 'LOCKED'), { statusCode: 409 });
  assert.equal(saves, 0); assert.equal(logs.length, 0);
});
test('UC-08 inactive role cannot be unlocked', async () => {
  fixture.status = 'LOCKED'; roleAvailable = false;
  await assert.rejects(changeEmployeeStatus(request({ expectedVersion: 0, reason: 'Cho phép trở lại' }), 'ACTIVE'), { statusCode: 409 }); assert.equal(saves, 0);
});
test('UC-07 already locked employee cannot be locked twice', async () => {
  fixture.status = 'LOCKED'; await assert.rejects(changeEmployeeStatus(request({ expectedVersion: 0, reason: 'Tạm dừng công việc' }), 'LOCKED'), { statusCode: 409 }); assert.equal(saves, 0);
});
test('UC-09 rejects permission outside active employee catalog', async () => {
  await assert.rejects(assignPermissions(request({ expectedVersion: 0, reason: 'Điều chỉnh quyền', permissionOverrides: [{ code: 'User Management|Employee Management|CREATE', granted: true }] })), { statusCode: 400 }); assert.equal(saves, 0);
});
test('UC-09 saves grant, keeps locked status and revokes sessions', async () => {
  fixture.status = 'LOCKED'; const result = await assignPermissions(request({ expectedVersion: 0, reason: 'Bổ sung công việc', permissionOverrides: [{ code: CARRIER_VIEW, granted: true }] }));
  assert.equal(result.employee.status, 'LOCKED'); assert.deepEqual(result.effectivePermissions, [CARRIER_VIEW]); assert.deepEqual(fixture.sessions, []); assert.equal(logs[0].action, 'ASSIGN_EMPLOYEE_PERMISSIONS');
});
test('UC-18 hides draft reports from review', async () => {
  report.status = 'DRAFT'; await assert.rejects(acknowledgeReport(request({ comment: 'Đã xem' })), { statusCode: 404 }); assert.equal(saves, 0);
});
test('UC-18 review records actor/time/comment and cannot repeat', async () => {
  const req = request({ comment: 'Đã đối chiếu thông tin' }); const result = await acknowledgeReport(req);
  assert.equal(result.status, 'REVIEWED'); assert.equal(String(report.reviewedBy), String(req.user._id)); assert.ok(report.reviewedAt instanceof Date); assert.equal(logs[0].action, 'REVIEW_MANAGER_REPORT');
  await assert.rejects(acknowledgeReport(req), { statusCode: 409 }); assert.equal(saves, 1);
});
