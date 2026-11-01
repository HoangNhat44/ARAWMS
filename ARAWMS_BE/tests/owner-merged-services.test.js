/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-01..06 - Kiểm tra thay đổi vai trò, cấu hình và phê duyệt với DB giả lập.
 */
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.model.js';
import Role from '../src/models/Role.model.js';
import SystemLog from '../src/models/SystemLog.model.js';
import SystemSetting from '../src/models/SystemSetting.model.js';
import StocktakeSession from '../src/models/StocktakeSession.model.js';
import StocktakeRecord from '../src/models/StocktakeRecord.model.js';
import RawMaterial from '../src/models/RawMaterial.model.js';
import Sku from '../src/models/Sku.model.js';
import FabricRoll from '../src/models/FabricRoll.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import InventoryAlert from '../src/models/InventoryAlert.model.js';
import { assignEmployeeRole } from '../src/modules/user-management/role-assignment/roleAssignment.service.js';
import { updateSettings, runtimeGhnConfig, updateInventoryThreshold } from '../src/modules/system-administration/system-settings/systemSettings.service.js';
import { stocktakeDetail, approveStocktake } from '../src/modules/inventory-auditing/stock-adjustment/stockAdjustment.service.js';
const originals = [];
const replace = (target, key, value) => { if (!originals.some((item) => item.target === target && item.key === key)) originals.push({ target, key, value: target[key] }); target[key] = value; };
const query = (value) => { const q = { select: () => q, sort: () => q, session: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) }; return q; };
const id = new mongoose.Types.ObjectId(); const materialId = new mongoose.Types.ObjectId();
let user; let config; let stocktake; let records; let logs; let saves; let inventoryWrites;
const request = (body, params = {}) => ({ params: { id: String(id), ...params }, body,
  user: { _id: new mongoose.Types.ObjectId(), roleCode: 'OWNER' }, ip: '127.0.0.1', get: () => 'test-owner-merge' });
beforeEach(() => {
  logs = []; saves = 0; inventoryWrites = 0;
  user = { _id: id, fullName: 'Nhân Viên', employeeCode: 'EMP100', email: 'an@example.com', roleCode: 'SELLER', status: 'LOCKED', managementVersion: 0,
    permissionOverrides: [{ code: 'OLD', granted: true }], sessions: [{ sessionId: 'old' }], async save() { saves++; } };
  config = { _id: id, settingKey: 'GLOBAL_CONFIG', revision: 0, defaultFabricLeftoverThresholdMeters: 2,
    returnSurchargePercent: 10, minorStocktakeVarianceLimitQty: 5, minorStocktakeVarianceLimitValue: 1000000, defaultFifoAgingAlertDays: 60,
    integrations: {}, set(key, value) { if (key.startsWith('integrations.')) this.integrations[key.split('.')[1]] = value; else this[key] = value; }, async save() { saves++; } };
  stocktake = { _id: id, sessionCode: 'ST100', status: 'VARIANCE_REVIEW', approvalRevision: 0, approvalInfo: {}, async save() { saves++; } };
  records = [{ _id: new mongoose.Types.ObjectId(), rawMaterialId: materialId, itemType: 'RAW_MATERIAL', barcode: 'RM100', systemSnapshotQty: 10,
    actualScannedQty: 20, scannedAt: new Date('2026-10-30T00:00:00Z'), isAgingThresholdExceeded: false, unitCostSnapshot: 1000 }];
  replace(mongoose.connection, 'transaction', async (work) => work({ test: true }));
  replace(User, 'findOne', () => query(user)); replace(Role, 'findOne', (filter) => query({ _id: materialId, roleCode: filter.roleCode }));
  replace(SystemLog, 'create', async ([entry]) => { logs.push(entry); return [entry]; });
  replace(SystemSetting, 'findOne', () => query(config));
  replace(StocktakeSession, 'findOne', () => query(stocktake)); replace(StocktakeRecord, 'find', () => query(records));
  replace(RawMaterial, 'find', () => query([{ _id: materialId, unitCost: 1000 }]));
  replace(Sku, 'find', () => query([])); replace(FabricRoll, 'find', () => query([]));
  replace(InventoryTransaction, 'exists', () => query(null)); replace(InventoryTransaction, 'create', async () => { inventoryWrites++; throw new Error('Owner approval must not post inventory'); });
});
after(() => { for (const item of originals) item.target[item.key] = item.value; });

test('Role assignment keeps lock, removes old overrides and revokes sessions', async () => {
  const result = await assignEmployeeRole(request({ expectedVersion: 0, roleCode: 'ACCOUNTANT', reason: 'Điều chuyển công việc' }));
  assert.equal(result.roleCode, 'ACCOUNTANT'); assert.equal(result.status, 'LOCKED'); assert.deepEqual(user.permissionOverrides, []); assert.deepEqual(user.sessions, []);
  assert.equal(result.managementVersion, 1); assert.equal(logs[0].action, 'ASSIGN_EMPLOYEE_ROLE');
});
test('Role assignment rejects stale version or unchanged role before saving', async () => {
  await assert.rejects(assignEmployeeRole(request({ expectedVersion: 1, roleCode: 'ACCOUNTANT', reason: 'Điều chuyển công việc' })), { statusCode: 409 });
  await assert.rejects(assignEmployeeRole(request({ expectedVersion: 0, roleCode: 'SELLER', reason: 'Điều chuyển công việc' })), { statusCode: 409 }); assert.equal(saves, 0);
});
test('Settings update saves revision and safe before/after audit', async () => {
  const result = await updateSettings(request({ expectedVersion: 0, defaultFabricLeftoverThresholdMeters: 3 }, { section: 'fabric' }));
  assert.equal(result.revision, 1); assert.equal(config.defaultFabricLeftoverThresholdMeters, 3); assert.equal(logs[0].beforeSnapshot.defaultFabricLeftoverThresholdMeters, 2);
  assert.equal(logs[0].afterSnapshot.defaultFabricLeftoverThresholdMeters, 3);
});
test('Settings stale revision is rejected before write', async () => {
  config.revision = 2; await assert.rejects(updateSettings(request({ expectedVersion: 0, defaultFabricLeftoverThresholdMeters: 3 }, { section: 'fabric' })), { statusCode: 409 }); assert.equal(saves, 0);
});
test('Saved GHN token is encrypted, hidden from audit, and used at runtime', async () => {
  const previous = process.env.SETTINGS_ENCRYPTION_KEY; process.env.SETTINGS_ENCRYPTION_KEY = 'test-owner-merged-service-encryption-key';
  try {
    const result = await updateSettings(request({ expectedVersion: 0, ghnToken: 'private-token-fixture', ghnShopId: 123 }, { section: 'api' }));
    assert.ok(config.integrations.ghnToken.startsWith('enc:v1:')); assert.ok(!JSON.stringify(result).includes('private-token-fixture'));
    assert.ok(!JSON.stringify(logs).includes('private-token-fixture')); assert.ok(!JSON.stringify(logs).includes(config.integrations.ghnToken));
    const runtime = await runtimeGhnConfig(); assert.equal(runtime.TOKEN, 'private-token-fixture'); assert.equal(runtime.SHOP_ID, 123);
    config.integrations.ghnEnabled = false; await assert.rejects(runtimeGhnConfig(), { statusCode: 503 });
  } finally { if (previous === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY; else process.env.SETTINGS_ENCRYPTION_KEY = previous; }
});
test('GBR-18 approval waits for adjustment and never writes stock ledger', async () => {
  const report = await stocktakeDetail(String(id));
  const req = request({ expectedVersion: 0, reportHash: report.reportHash, adjustmentReason: 'Đã đối chiếu kiểm kê đầy đủ', agingStockActionPlan: '' });
  const result = await approveStocktake(req);
  assert.equal(result.stocktake.status, 'APPROVED_PENDING_ADJUSTMENT'); assert.equal(result.stocktake.approvalRevision, 1);
  assert.equal(inventoryWrites, 0); assert.equal(logs[0].action, 'APPROVE_MAJOR_INVENTORY_VARIANCE');
  await assert.rejects(approveStocktake(req), { statusCode: 409 }); assert.equal(saves, 1);
});
test('Approval detects records changed since Owner opened report', async () => {
  const report = await stocktakeDetail(String(id)); records[0].actualScannedQty = 21;
  await assert.rejects(approveStocktake(request({ expectedVersion: 0, reportHash: report.reportHash, adjustmentReason: 'Đã kiểm tra báo cáo đầy đủ' })), { statusCode: 409 }); assert.equal(saves, 0);
});
test('Approval refuses existing adjustment ledger in a supposedly unapproved session', async () => {
  const report = await stocktakeDetail(String(id)); replace(InventoryTransaction, 'exists', () => query({ _id: id }));
  await assert.rejects(approveStocktake(request({ expectedVersion: 0, reportHash: report.reportHash, adjustmentReason: 'Đã kiểm tra báo cáo đầy đủ' })), { statusCode: 409 }); assert.equal(saves, 0);
});
test('GBR-05 changing threshold uses available stock and opens warning inside transaction', async () => {
  const item = { _id: materialId, materialCode: 'RM100', materialName: 'Vải', unit: 'METER', onHandQty: 100, reservedQty: 95,
    safetyStockThreshold: 1, fifoAgingThresholdDays: 60, version: 0, async save() { this.version++; } };
  let alert; replace(RawMaterial, 'findOne', () => query(item));
  replace(InventoryAlert, 'updateOne', async (filter, change, options) => { alert = { filter, change, options }; });
  const result = await updateInventoryThreshold(request({ expectedVersion: 0, safetyStockThreshold: 10, fifoAgingThresholdDays: 90 }, { type: 'materials' }));
  assert.equal(result.availableQty, 5); assert.equal(result.version, 1); assert.equal(alert.change.$set.metadata.currentQty, 5);
  assert.equal(alert.filter.alertType, 'LOW_SAFETY_STOCK'); assert.ok(alert.options.session); assert.equal(logs[0].action, 'CONFIGURE_INVENTORY_THRESHOLD');
});
test('GBR-05 stock equal to threshold resolves existing warning', async () => {
  const item = { _id: materialId, materialCode: 'RM100', onHandQty: 10, reservedQty: 0, safetyStockThreshold: 11, fifoAgingThresholdDays: 60, version: 0, async save() {} };
  let closed; replace(RawMaterial, 'findOne', () => query(item)); replace(InventoryAlert, 'updateMany', async (filter, change) => { closed = change.$set.isResolved; });
  await updateInventoryThreshold(request({ expectedVersion: 0, safetyStockThreshold: 10, fifoAgingThresholdDays: 60 }, { type: 'materials' }));
  assert.equal(closed, true);
});
