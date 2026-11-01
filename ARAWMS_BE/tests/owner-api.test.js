/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06..UC-20; GBR-01 - HTTP kiểm quyền và dữ liệu lỗi với DB/service giả lập.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
process.env.NODE_ENV = 'production'; process.env.JWT_SECRET = 'owner-test-key-not-used-outside-this-process';
const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.model.js');
const { ghnService } = await import('../src/services/ghn.service.js');
let server; let base; let currentUser; let carrierCalls = 0;
const originalFind = User.findOne; const originalShops = ghnService.getShops;
const id = '507f1f77bcf86cd799439011';
const user = (roleCode = 'OWNER', extra = {}) => ({ _id: id, roleCode, status: 'ACTIVE', isDeleted: false,
  roleId: { roleCode, isActive: true, isDeleted: false, permissions: [] }, ...extra });
const token = (sid = 'test-session') => jwt.sign({ sid }, process.env.JWT_SECRET, { subject: id, issuer: 'arawms', audience: 'arawms-web', algorithm: 'HS256', expiresIn: 60 });
const request = async (path, { method = 'GET', body, authenticated = true } = {}) => {
  const response = await fetch(`${base}/api${path}`, { method, headers: { ...(authenticated ? { Authorization: `Bearer ${token()}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, json: await response.json() };
};
before(async () => {
  User.findOne = (filter) => ({ populate: async () => filter.sessions?.$elemMatch?.sessionId === 'test-session' ? currentUser : null });
  ghnService.getShops = async () => { carrierCalls++; return [{ _id: 123 }]; };
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { User.findOne = originalFind; ghnService.getShops = originalShops; await new Promise((resolve) => server.close(resolve)); });
const routes = ['/owner/employees', '/owner/employee-permissions', '/owner/activity', '/owner/activity/trace', '/owner/dashboard', '/owner/financial-reports', '/owner/financial-reports/cash-vouchers', '/owner/manager-reports', '/owner/material-valuation', '/owner/asset-valuation', '/owner/asset-valuation/summary', '/owner/production-reports', '/owner/product-samples', '/owner/system-settings', '/owner/system-settings/inventory-items/materials', '/owner/stock-adjustments'];
for (const path of routes) {
  test(`GBR-01 anonymous denied ${path}`, async () => assert.equal((await request(path, { authenticated: false })).status, 401));
  test(`Owner scope staff denied ${path}`, async () => { currentUser = user('SELLER'); assert.equal((await request(path)).status, 403); });
}
for (const [path, method, body] of [
  ['/owner/employees', 'POST', { roleCode: 'OWNER' }], ['/owner/employees/bad/lock', 'PATCH', {}],
  [`/owner/employee-permissions/${id}`, 'PATCH', { expectedVersion: 0, reason: 'Valid reason', permissionOverrides: [{ code: 'ADMIN', granted: 'yes' }] }],
  ['/owner/activity/trace', 'GET'], ['/owner/activity?limit=101', 'GET'], ['/owner/dashboard?from=2026-02-30&to=2026-03-01', 'GET'],
  ['/owner/financial-reports?from=2026-11-02&to=2026-11-01', 'GET'], ['/owner/manager-reports?status=DRAFT', 'GET'],
  ['/owner/product-samples/not-id', 'GET'], ['/owner/production-reports?status=INVALID', 'GET'], ['/owner/material-valuation?type=bad', 'GET'],
  [`/owner/employee-roles/${id}`, 'PATCH', { expectedVersion: 0, reason: 'Valid reason', roleCode: 'OWNER' }],
  ['/owner/system-settings/fabric', 'PATCH', { expectedVersion: 0, defaultFabricLeftoverThresholdMeters: 0 }],
  ['/owner/system-settings/returns', 'PATCH', { expectedVersion: 0, returnSurchargePercent: 15 }],
  ['/owner/system-settings/inventory-items/invalid', 'GET'],
  ['/owner/stock-adjustments/bad', 'GET'],
  [`/owner/stock-adjustments/${id}/approve`, 'POST', { expectedVersion: 0, reportHash: 'invalid', adjustmentReason: 'Valid reason' }],
]) test(`Owner validation before DB: ${method} ${path}`, async () => { currentUser = user(); assert.equal((await request(path, { method, body })).status, 400); });
test('OWNER-EXT-01 employees cannot assign their own role', async () => {
  currentUser = user('SELLER'); assert.equal((await request(`/owner/employee-roles/${id}`, { method: 'PATCH', body: { expectedVersion: 0, reason: 'Change role', roleCode: 'ACCOUNTANT' } })).status, 403);
});
test('GBR-01 locked user cannot retain an old session', async () => { currentUser = user('OWNER', { status: 'LOCKED' }); assert.equal((await request('/owner/dashboard')).status, 401); });
test('GBR-01 inactive role invalidates session', async () => { currentUser = user('OWNER', { roleId: { roleCode: 'OWNER', isActive: false } }); assert.equal((await request('/owner/dashboard')).status, 401); });
test('UC-09 employee override cannot open Owner endpoints', async () => { currentUser = user('SELLER', { permissionOverrides: [{ code: 'User Management|Employee Management|CREATE', granted: true }] }); assert.equal((await request('/owner/employees')).status, 403); });
test('UC-09 applies denied permission to actual carrier endpoint', async () => {
  const beforeCalls = carrierCalls; currentUser = user('WAREHOUSE_STAFF', { permissionOverrides: [{ code: 'Order Fulfillment|Carrier Handover|VIEW', granted: false }] });
  assert.equal((await request('/carriers/ghn/shops')).status, 403); assert.equal(carrierCalls, beforeCalls);
});
test('UC-09 explicitly granted permission reaches actual service', async () => {
  currentUser = user('SELLER', { permissionOverrides: [{ code: 'Order Fulfillment|Carrier Handover|VIEW', granted: true }] });
  const result = await request('/carriers/ghn/shops'); assert.equal(result.status, 200); assert.equal(result.json.data[0]._id, 123);
});
