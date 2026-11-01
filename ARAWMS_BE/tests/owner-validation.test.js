/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06..UC-20 - Kiểm tra biên validation và công thức; không kết nối DB.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmployee, validateEmployeeAction } from '../src/modules/user-management/employee-management/employeeManagement.validation.js';
import { validatePermissions } from '../src/modules/user-management/employee-permissions/employeePermissions.validation.js';
import { dashboardRange } from '../src/modules/managerial-financial-analytics/executive-dashboard/executiveDashboard.validation.js';
import { summarizeFinance } from '../src/modules/managerial-financial-analytics/financial-reports/financialReports.validation.js';
import { activityFilter, redactActivity } from '../src/modules/user-management/system-activity/systemActivity.validation.js';
import { readQuery, safeUrl } from '../src/common/utils/ownerReadQuery.js';
import { pagination, escapedSearch } from '../src/common/utils/ownerValidation.js';
import { progress } from '../src/modules/production-operations/bom-plan-report/bomPlanReport.service.js';
import { effectivePermissions, authorizePermission, CARRIER_VIEW, CARRIER_CREATE } from '../src/common/middlewares/authorizePermission.js';
const valid = { employeeCode: 'EMP100', fullName: 'Nguyễn Văn An', email: 'an@example.com', password: 'valid12345', confirmPassword: 'valid12345', roleCode: 'SELLER' };
test('UC-06 normalizes identifiers and preserves Unicode name', () => {
  const input = validateEmployee({ ...valid, employeeCode: 'emp100', email: 'AN@EXAMPLE.COM', fullName: '  Nguyễn   Văn An ' });
  assert.equal(input.employeeCode, 'EMP100'); assert.equal(input.email, 'an@example.com'); assert.equal(input.fullName, 'Nguyễn Văn An');
});
for (const [name, patch] of Object.entries({ ownerRole: { roleCode: 'OWNER' }, unknownRole: { roleCode: 'ADMIN' }, noRole: { roleCode: null },
  badEmail: { email: 'a' }, emailObject: { email: { $ne: null } }, blankName: { fullName: '  ' }, numericName: { fullName: '123' },
  longName: { fullName: 'a'.repeat(101) }, shortCode: { employeeCode: 'A' }, badCode: { employeeCode: 'EMP 001' },
  blankPassword: { password: '        ', confirmPassword: '        ' }, shortPassword: { password: '1234567', confirmPassword: '1234567' },
  byteLimit: { password: 'á'.repeat(37), confirmPassword: 'á'.repeat(37) }, wrongConfirmation: { confirmPassword: 'other' },
  badPhone: { phone: '123' }, extraStatus: { status: 'ACTIVE' }, extraPermissions: { permissionOverrides: [] }, prototypeField: { constructor: 'bad' } })) {
  test(`UC-06 rejects ${name}`, () => assert.throws(() => validateEmployee({ ...valid, ...patch }), { statusCode: 400 }));
}
test('UC-06 accepts exactly 72 UTF-8 bytes', () => assert.equal(validateEmployee({ ...valid, password: 'á'.repeat(36), confirmPassword: 'á'.repeat(36) }).password.length, 36));
for (const body of [{ expectedVersion: '0', reason: 'Valid reason' }, { expectedVersion: -1, reason: 'Valid reason' }, { expectedVersion: 0, reason: '    ' }, { expectedVersion: 0, reason: 'Valid reason', status: 'ACTIVE' }]) {
  test(`UC-07/08 rejects invalid action ${JSON.stringify(body)}`, () => assert.throws(() => validateEmployeeAction(body), { statusCode: 400 }));
}
test('UC-09 validates distinct boolean permission overrides', () => {
  assert.equal(validatePermissions({ expectedVersion: 0, reason: 'Điều chuyển công việc', permissionOverrides: [{ code: CARRIER_VIEW, granted: false }] }).permissionOverrides[0].granted, false);
  assert.deepEqual(validatePermissions({ expectedVersion: 0, reason: 'Khôi phục quyền vai trò', permissionOverrides: [] }).permissionOverrides, []);
});
for (const overrides of [null, {}, [{ code: CARRIER_VIEW, granted: 'false' }], [{ code: CARRIER_VIEW, granted: true }, { code: CARRIER_VIEW, granted: false }], [{ code: CARRIER_VIEW, granted: true, roleCode: 'OWNER' }]]) {
  test(`UC-09 rejects invalid overrides ${JSON.stringify(overrides)}`, () => assert.throws(() => validatePermissions({ expectedVersion: 0, reason: 'Valid reason', permissionOverrides: overrides }), { statusCode: 400 }));
}
test('UC-09 deny overrides role, grant adds permission, reset inherits baseline', () => {
  const role = { roleCode: 'WAREHOUSE_STAFF', roleId: { permissions: [] } };
  assert.deepEqual(effectivePermissions(role), [CARRIER_CREATE, CARRIER_VIEW].sort());
  assert.deepEqual(effectivePermissions({ ...role, permissionOverrides: [{ code: CARRIER_CREATE, granted: false }] }), [CARRIER_VIEW]);
  assert.deepEqual(effectivePermissions({ roleCode: 'SELLER', permissionOverrides: [{ code: CARRIER_VIEW, granted: true }] }), [CARRIER_VIEW]);
});
test('UC-09 permission middleware denies missing permission and allows Owner', () => {
  let error; authorizePermission(CARRIER_VIEW)({ user: { roleCode: 'SELLER' } }, {}, (e) => { error = e; }); assert.equal(error.statusCode, 403);
  error = 'not called'; authorizePermission(CARRIER_VIEW)({ user: { roleCode: 'OWNER' } }, {}, (e) => { error = e; }); assert.equal(error, undefined);
});
for (const query of [{ from: '2026-02-30', to: '2026-03-01' }, { from: '2026-11-02', to: '2026-11-01' }, { from: '2024-01-01', to: '2026-11-01' }, { from: { $ne: null }, to: '2026-11-01' }, { unknown: true }]) {
  test(`UC-12/14/17 rejects dates ${JSON.stringify(query)}`, () => assert.throws(() => dashboardRange(query), { statusCode: 400 }));
}
test('UC-12 supports one full local day and leap day', () => {
  const range = dashboardRange({ from: '2024-02-29', to: '2024-02-29' }); assert.equal(range.start.toISOString(), '2024-02-28T17:00:00.000Z'); assert.equal(range.end - range.start, 86400000);
});
test('UC-14/17 profit differs from cash flow and reverses restocked COGS only', () => {
  const totals = summarizeFinance({ revenue: 1000, returnedRevenue: 100, cogs: 600, returnedCogs: 40, cashIn: 200, cashOut: 300, operatingExpenses: 80, otherIncome: 10 });
  assert.equal(totals.netRevenue, 900); assert.equal(totals.netCogs, 560); assert.equal(totals.grossProfit, 340); assert.equal(totals.netProfit, 270); assert.equal(totals.netCashFlow, -100);
  assert.equal(summarizeFinance({}).netProfit, 0);
});
test('UC-10/11 redacts nested credentials and keeps timestamps', () => {
  const data = redactActivity({ fullName: 'An', passwordHash: 'sensitive', nested: { sessions: ['s'], credential: 'secret', status: 'ACTIVE' }, when: new Date('2026-11-01T00:00:00Z') });
  assert.deepEqual(data, { fullName: 'An', nested: { status: 'ACTIVE' }, when: '2026-11-01T00:00:00.000Z' });
});
test('UC-11 requires trace identity and validates IDs', () => {
  assert.throws(() => activityFilter({}, true), { statusCode: 400 }); assert.throws(() => activityFilter({ targetId: 'bad' }, true), { statusCode: 400 });
  assert.equal(activityFilter({ targetCode: 'EMP100' }, true).filter.targetCode, 'EMP100');
});
test('Read-only queries reject injected objects, excessive pages and unknown statuses', () => {
  assert.throws(() => readQuery({ search: { $ne: '' } }), { statusCode: 400 }); assert.throws(() => pagination({ limit: '101' }), { statusCode: 400 });
  assert.throws(() => readQuery({ status: 'DRAFT' }, { statuses: ['SUBMITTED'] }), { statusCode: 400 }); assert.equal(escapedSearch('.*'), '\\.\\*');
});
test('UC-18/20 strips executable and credential-bearing URLs', () => {
  assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl('https://user:pass@example.com/file'), ''); assert.equal(safeUrl('https://example.com/image.png'), 'https://example.com/image.png');
});
test('UC-19 totals progress without treating missing plan as zero-percent complete', () => {
  assert.deepEqual(progress([{ plannedQty: 10, completedQty: 4, defectiveQty: 1, receivedQty: 3 }, { plannedQty: 10, completedQty: 6 }]), { plannedQty: 20, completedQty: 10, defectiveQty: 1, receivedQty: 3, completionPercent: 50 });
  assert.equal(progress([]).completionPercent, null);
});
