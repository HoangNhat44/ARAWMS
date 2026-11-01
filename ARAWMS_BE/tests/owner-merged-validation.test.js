/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-01..06 - Kiểm tra các chức năng sau khi hợp nhất hai danh sách Owner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRoleAssignment } from '../src/modules/user-management/role-assignment/roleAssignment.service.js';
import { validateSettings, validateInventoryThreshold } from '../src/modules/system-administration/system-settings/systemSettings.validation.js';
import { publicSettings } from '../src/modules/system-administration/system-settings/systemSettings.service.js';
import { encryptSecret, decryptSecret } from '../src/modules/system-administration/system-settings/integrationSecrets.js';
import { classifyFabricRemnant, computeReturnRefund } from '../src/modules/system-administration/system-settings/systemPolicies.js';
import { validateApproval, varianceSummary, assertApprovalAllowed } from '../src/modules/inventory-auditing/stock-adjustment/stockAdjustment.validation.js';

test('OWNER-EXT-01 rejects Owner role and accepts known employee role', () => {
  assert.throws(() => validateRoleAssignment({ expectedVersion: 0, reason: 'Điều chuyển nhân viên', roleCode: 'OWNER' }), { statusCode: 400 });
  assert.equal(validateRoleAssignment({ expectedVersion: 0, reason: 'Điều chuyển nhân viên', roleCode: 'ACCOUNTANT' }).roleCode, 'ACCOUNTANT');
});
for (const [section, patch] of [
  ['fabric', { defaultFabricLeftoverThresholdMeters: 0 }], ['fabric', { defaultFabricLeftoverThresholdMeters: '2' }],
  ['fabric', { defaultFabricLeftoverThresholdMeters: Infinity }], ['fabric', { ghnToken: 'bad field' }],
  ['inventory', { defaultFifoAgingAlertDays: 1.5 }], ['inventory', { minorStocktakeVarianceLimitQty: -1 }],
  ['api', { ghnToken: { $ne: null } }], ['api', { ghnEnabled: 'true' }], ['api', { ghnShopId: 1.5 }],
  ['api', { facebookPageId: 123 }], ['returns', { returnSurchargePercent: 9 }],
]) test(`Settings reject invalid ${section}: ${Object.keys(patch)[0]}`, () => assert.throws(() => validateSettings(section, { expectedVersion: 0, ...patch }), { statusCode: 400 }));
test('Settings do not clear secrets when an input is blank', () => {
  assert.deepEqual(validateSettings('api', { expectedVersion: 0, ghnEnabled: true, ghnToken: '' }).data, { ghnEnabled: true });
  assert.deepEqual(validateSettings('api', { expectedVersion: 0, ghnToken: null }).data, { ghnToken: null });
});
test('Inventory threshold accepts zero and rejects fractional aging days', () => {
  assert.equal(validateInventoryThreshold({ expectedVersion: 0, safetyStockThreshold: 0, fifoAgingThresholdDays: 1 }).safetyStockThreshold, 0);
  assert.throws(() => validateInventoryThreshold({ expectedVersion: 0, safetyStockThreshold: 1, fifoAgingThresholdDays: 1.5 }), { statusCode: 400 });
});
test('Public settings never return saved API secrets', () => {
  const value = publicSettings({ integrations: { ghnToken: 'SENSITIVE', facebookVerifyToken: 'VERIFY', facebookPageAccessToken: 'ACCESS' } });
  assert.equal(value.integrations.ghnTokenConfigured, true);
  for (const secret of ['SENSITIVE', 'VERIFY', 'ACCESS']) assert.ok(!JSON.stringify(value).includes(secret));
});
test('API secrets use a new IV per save and detect tampering', () => {
  const previous = process.env.SETTINGS_ENCRYPTION_KEY; process.env.SETTINGS_ENCRYPTION_KEY = 'test-key-only-for-owner-config-validation';
  try {
    const first = encryptSecret('private-api-token'); const second = encryptSecret('private-api-token');
    assert.notEqual(first, second); assert.equal(decryptSecret(first), 'private-api-token'); assert.ok(!first.includes('private-api-token'));
    const parts = first.split(':'); const data = Buffer.from(parts[4], 'base64url'); data[0] ^= 1; parts[4] = data.toString('base64url');
    assert.throws(() => decryptSecret(parts.join(':')), { statusCode: 503 });
  } finally { if (previous === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY; else process.env.SETTINGS_ENCRYPTION_KEY = previous; }
});
test('GBR-06 equality belongs to recovery, lower length belongs to scrap', () => {
  assert.equal(classifyFabricRemnant(2), 'RECOVER_WITH_NEW_BARCODE'); assert.equal(classifyFabricRemnant(1.99), 'SCRAP');
  assert.equal(classifyFabricRemnant(3, 3), 'RECOVER_WITH_NEW_BARCODE'); assert.throws(() => classifyFabricRemnant(-1), { statusCode: 400 });
});
test('GBR-11/12 customer surcharge and store-fault fee exemption', () => {
  assert.deepEqual(computeReturnRefund({ merchandiseValue: 100000, shippingFee: 20000, fault: 'CUSTOMER' }), { surcharge: 10000, shippingDeduction: 20000, netRefund: 70000 });
  assert.deepEqual(computeReturnRefund({ merchandiseValue: 100000, shippingFee: 20000, fault: 'STORE' }), { surcharge: 0, shippingDeduction: 0, netRefund: 100000 });
  assert.throws(() => computeReturnRefund({ merchandiseValue: 100000, fault: 'UNKNOWN' }), { statusCode: 400 });
});
const settings = { minorStocktakeVarianceLimitQty: 5, minorStocktakeVarianceLimitValue: 1000000 };
const rows = [{ systemSnapshotQty: 10, actualScannedQty: 13, unitCost: 1, scannedAt: new Date() }, { systemSnapshotQty: 10, actualScannedQty: 7, unitCost: 1, scannedAt: new Date() }];
const hash = 'a'.repeat(64); const input = { expectedVersion: 0, reportHash: hash, adjustmentReason: 'Đã kiểm tra báo cáo', agingStockActionPlan: '' };
test('GBR-19 uses absolute differences, not their net total', () => { const summary = varianceSummary(rows, settings); assert.equal(summary.absoluteQuantity, 6); assert.equal(summary.requiresOwner, true); });
test('GBR-19 quantity equality is minor, value excess or aging requires Owner', () => {
  assert.equal(varianceSummary([{ ...rows[0], actualScannedQty: 15 }], settings).requiresOwner, false);
  assert.equal(varianceSummary([{ ...rows[0], unitCost: 1000000 }], settings).requiresOwner, true);
  assert.equal(varianceSummary([{ ...rows[0], actualScannedQty: 10, isAgingThresholdExceeded: true }], settings).requiresOwner, true);
  assert.equal(varianceSummary([], settings, 'Kế hoạch thanh lý hàng tồn').requiresOwner, true);
});
test('Approval rejects empty records, unfinished count, repeat and stale report', () => {
  const stocktake = { status: 'VARIANCE_REVIEW' }; const summary = varianceSummary(rows, settings);
  assert.throws(() => assertApprovalAllowed(stocktake, [], summary, input, hash), { statusCode: 409 });
  assert.throws(() => assertApprovalAllowed(stocktake, [{ ...rows[0], scannedAt: null }], summary, input, hash), { statusCode: 409 });
  assert.throws(() => assertApprovalAllowed({ status: 'APPROVED_PENDING_ADJUSTMENT' }, rows, summary, input, hash), { statusCode: 409 });
  assert.throws(() => assertApprovalAllowed(stocktake, rows, summary, input, 'b'.repeat(64)), { statusCode: 409 });
  assert.throws(() => assertApprovalAllowed({ ...stocktake, approvalRevision: 1 }, rows, summary, input, hash), { statusCode: 409 });
});
test('GBR-19 requires explicit aging plan and permits valid major report', () => {
  const stocktake = { status: 'VARIANCE_REVIEW' }; const summary = { ...varianceSummary(rows, settings), hasAging: true };
  assert.throws(() => assertApprovalAllowed(stocktake, rows, summary, input, hash), { statusCode: 400 });
  assert.doesNotThrow(() => assertApprovalAllowed(stocktake, rows, summary, { ...input, agingStockActionPlan: 'Kiểm tra và xử lý hàng tồn lâu' }, hash));
});
test('Approval rejects unknown fields and fractional finished-goods counts', () => {
  assert.throws(() => validateApproval({ ...input, approvedByUserId: 'spoof' }), { statusCode: 400 });
  assert.throws(() => varianceSummary([{ ...rows[0], itemType: 'SKU_BATCH', actualScannedQty: 1.5 }], settings), { statusCode: 409 });
});
