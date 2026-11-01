// Dữ liệu giả lập chỉ cho kiểm thử giao diện. Mọi request API được chặn; không gửi đến DB/GHN thật.
export const id = '507f1f77bcf86cd799439011';
export const employeeId = '507f1f77bcf86cd799439012';
const now = '2026-11-01T03:00:00Z';
export const user = { id, employeeCode: 'OWN001', fullName: 'Nguyễn Minh Anh', email: 'owner@example.test', phone: '0912345678', roleCode: 'OWNER', roleName: 'Chủ cửa hàng', status: 'ACTIVE', googleLinked: false, emailVerified: true, lastLoginAt: now };
export const employee = { id: employeeId, employeeCode: 'NV010', fullName: 'Trần Thị Thanh Hương', email: 'nhanvien@example.test', phone: '0987654321', roleCode: 'SELLER', status: 'ACTIVE', managementVersion: 0, lastLoginAt: now, permissionOverrides: [] };
const permission = 'Order Fulfillment|Carrier Handover|VIEW';
const catalog = { roles: [{ roleCode: 'SELLER', roleName: 'Nhân viên bán hàng', permissions: [] }, { roleCode: 'ACCOUNTANT', roleName: 'Kế toán', permissions: [permission] }], permissions: [{ code: permission, majorFeature: 'Order Fulfillment', subFeature: 'Carrier Handover', action: 'VIEW' }] };
const totals = { revenue: 128500000, returnedRevenue: 2500000, netRevenue: 126000000, cogs: 72000000, returnedCogs: 1200000, netCogs: 70800000, grossProfit: 55200000, operatingExpenses: 12000000, otherIncome: 250000, netProfit: 43450000, cashIn: 90000000, cashOut: 35000000, netCashFlow: 55000000 };
const financial = { period: { from: '2026-11-01', to: '2026-11-01' }, generatedAt: now, totals, orders: 128, approvedReturns: 3,
  daily: [{ date: '2026-10-30', revenue: 40000000, cogs: 24000000, grossProfit: 16000000, orders: 40 }, { date: '2026-10-31', revenue: 48500000, cogs: 26000000, grossProfit: 22500000, orders: 48 }, { date: '2026-11-01', revenue: 40000000, cogs: 22000000, grossProfit: 18000000, orders: 40 }],
  cashCategories: [{ category: 'CARRIER_COD_PAYOUT', flowType: 'CASH_IN', amount: 90000000, count: 12 }, { category: 'OPERATIONAL_EXPENSE', flowType: 'CASH_OUT', amount: 12000000, count: 5 }], dataQuality: { ordersMissingCogsSnapshot: 0 }, basis: 'Dữ liệu giả lập: doanh thu theo kỳ; giá vốn đã chốt trên từng dòng đơn.' };
const settings = { revision: 0, defaultFabricLeftoverThresholdMeters: 2, defaultFifoAgingAlertDays: 60, minorStocktakeVarianceLimitQty: 5, minorStocktakeVarianceLimitValue: 1000000, returnSurchargePercent: 10, returnPolicyNotes: 'Kiểm tra tình trạng sản phẩm trước khi xác nhận đổi trả.', integrations: { ghnEnabled: true, ghnShopId: 123456, facebookPageId: '123456789', ghnTokenConfigured: true, facebookVerifyTokenConfigured: false, facebookPageAccessTokenConfigured: false } };
export const paths = [
  ['/owner/dashboard', 'Tổng quan điều hành'], ['/owner/bi', 'BI Dashboard'], ['/owner/profit', 'Báo cáo lợi nhuận'], ['/owner/cash-flow', 'Dòng tiền vận hành'],
  ['/owner/employees', 'Nhân viên và phân quyền'], ['/owner/employees/new', 'Tạo tài khoản nhân viên'], [`/owner/employees/${employeeId}/permissions`, 'Phân quyền nhân viên'],
  ['/owner/activity', 'Nhật ký và truy vết'], ['/owner/material-valuation', 'Giá trị tồn kho nguyên liệu'], ['/owner/asset-valuation', 'Định giá tài sản kho'],
  ['/owner/manager-reports', 'Báo cáo từ Manager'], [`/owner/manager-reports/${id}`, 'Báo cáo từ Manager'], ['/owner/production', 'Sản xuất theo kế hoạch BOM'], [`/owner/production/${id}`, 'Sản xuất theo kế hoạch BOM'],
  ['/owner/samples', 'Mẫu sản phẩm mới'], [`/owner/samples/${id}`, 'Mẫu sản phẩm mới'], ['/owner/settings/integrations', 'Tích hợp API'], ['/owner/settings/fabric', 'Ngưỡng vải dư'], ['/owner/settings/inventory', 'Ngưỡng tồn kho'], ['/owner/settings/returns', 'Chính sách đổi trả'],
  ['/owner/stock-adjustments', 'Duyệt chênh lệch kiểm kê'], [`/owner/stock-adjustments/${id}`, 'Báo cáo chênh lệch kiểm kê'], ['/owner/account', user.fullName],
];
export async function mockApi(page, options = {}) {
  const calls = []; let failOnce = options.failOnce;
  let employeeState = { ...employee }; let managerState = 'SUBMITTED'; let stocktakeState = 'VARIANCE_REVIEW'; let stocktakeApproval = {};
  if (!options.anonymous) await page.addInitScript(() => sessionStorage.setItem('arawms_auth_token', 'ui-test-token-only'));
  // Từ chối mọi request ngoài máy chủ kiểm thử, kể cả nếu một màn hình gọi nhầm dịch vụ.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) { if (url.hostname === '127.0.0.1' && url.port === '5197') return route.continue(); return route.abort(); }
    const request = route.request(); const resource = url.pathname.slice(5); const method = request.method(); const input = request.postDataJSON();
    calls.push({ resource, method, input });
    const fulfill = (data, message) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, message }) });
    const list = (items, total = items.length) => ({ items: options.empty ? [] : items, total: options.empty ? 0 : total, page: Number(url.searchParams.get('page') || 1), limit: 20 });
    if (failOnce === resource) { failOnce = null; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Kết nối tạm thời gián đoạn. Vui lòng thử lại.' }) }); }
    if (resource === 'accounts/me') return fulfill({ user: { ...user, roleCode: options.role || user.roleCode } });
    if (resource === 'auth/google/config') return fulfill({ enabled: false });
    if (resource === 'auth/login') return fulfill({ user, token: 'ui-test-token-only' }, 'Đăng nhập thành công.');
    if (resource === 'auth/logout') return fulfill({}, 'Đã đăng xuất.');
    if (resource === 'owner/employees') return method === 'POST' ? fulfill({ ...employee, ...input }, 'Đã tạo tài khoản nhân viên.') : fulfill(list([employeeState], 42));
    if (/owner\/employees\/[^/]+\/(un)?lock$/.test(resource)) { employeeState = { ...employeeState, status: resource.endsWith('/unlock') ? 'ACTIVE' : 'LOCKED', managementVersion: employeeState.managementVersion + 1 }; return fulfill(employeeState, 'Đã cập nhật trạng thái nhân viên.'); }
    if (resource === 'owner/employee-permissions') return fulfill(catalog);
    if (resource.startsWith('owner/employee-permissions/')) { if (method === 'PATCH') { employeeState = { ...employeeState, permissionOverrides: input.permissionOverrides, managementVersion: employeeState.managementVersion + 1 }; return fulfill({}, 'Đã lưu quyền nhân viên.'); } return fulfill({ employee: employeeState, effectivePermissions: employeeState.permissionOverrides.filter((p) => p.granted).map((p) => p.code) }); }
    if (resource.startsWith('owner/employee-roles/')) { employeeState = { ...employeeState, roleCode: input.roleCode, permissionOverrides: [], managementVersion: employeeState.managementVersion + 1 }; return fulfill({}, 'Đã đổi vai trò nhân viên.'); }
    if (resource === 'owner/dashboard') return fulfill({ ...financial, inventory: { materialValue: 250000000, finishedGoodsValue: 480000000, quarantineValue: 12000000, lowStockMaterials: 2, lowStockSkus: 5 }, operations: { activeEmployees: 24, unreadManagerReports: 3, activeProductionOrders: 8, codRedFlags: 2 } });
    if (resource === 'owner/financial-reports') return fulfill(financial);
    if (resource === 'owner/financial-reports/cash-vouchers') return fulfill(list([{ id, voucherCode: 'PT001', voucherDate: now, flowType: 'CASH_IN', category: 'CARRIER_COD_PAYOUT', amount: 12000000, salesOrderId: id }]));
    if (resource.startsWith('owner/activity')) return fulfill(list([{ id, createdAt: now, actor: { id, fullName: user.fullName, employeeCode: 'OWN001' }, actorRole: 'OWNER', majorFeature: 'User Management', subFeature: 'Employee Management', action: 'LOCK_EMPLOYEE', targetCode: 'NV010', targetId: employeeId, targetCollection: 'users', ipAddress: '127.0.0.1', beforeSnapshot: { status: 'ACTIVE' }, afterSnapshot: { status: 'LOCKED' } }]));
    if (resource === 'owner/asset-valuation/summary') return fulfill({ materialValue: 250000000, finishedGoodsValue: 480000000, quarantineValue: 12000000, totalValue: 742000000 });
    if (resource === 'owner/material-valuation' || resource === 'owner/asset-valuation') return fulfill({ ...list([{ id, code: 'VAI-COTTON-001', name: 'Vải cotton màu be khổ 160 cm', unit: 'METER', onHandQty: 1500, reservedQty: 250, availableQty: 1250, quarantineQty: 10, unitCost: 150000, totalValue: 226500000 }]), totals: { onHandValue: 225000000, quarantineValue: 1500000, totalValue: 226500000 }, asOf: now, basis: 'Giá trị tồn hiện tại theo số lượng và đơn giá đã ghi nhận.' });
    if (resource === 'owner/manager-reports') return fulfill(list([{ id, code: 'BC001', title: 'Tình hình vận hành kho và sản xuất tháng 11', reportType: 'MONTHLY', status: 'SUBMITTED', submittedAt: now }], 3));
    if (resource.startsWith('owner/manager-reports/')) { if (method === 'PATCH') { managerState = 'REVIEWED'; return fulfill({}, 'Đã xác nhận xem báo cáo.'); } return fulfill({ id, code: 'BC001', title: 'Tình hình vận hành kho và sản xuất tháng 11', reportType: 'MONTHLY', status: managerState, reviewedBy: { fullName: user.fullName }, reviewedAt: now, submittedBy: { fullName: 'Quản lý kho' }, submittedAt: now, periodStart: now, periodEnd: now, summary: 'Kiểm tra năng lực kho, nguyên liệu và tiến độ sản xuất.', content: 'Nội dung báo cáo giả lập để xác minh bố cục và thao tác trên giao diện.' }); }
    if (resource === 'owner/production-reports') return fulfill(list([{ id, code: 'LSX001', status: 'IN_PROGRESS', plannedQty: 1000, completedQty: 650, completionPercent: 65 }]));
    if (resource.startsWith('owner/production-reports/')) return fulfill({ id, code: 'LSX001', status: 'IN_PROGRESS', plannedStart: now, plannedEnd: now, progress: { plannedQty: 1000, completedQty: 650, defectiveQty: 10 }, items: [{ skuId: id, skuCode: 'AO-COTTON-BE-M', plannedQty: 1000, bom: { bomCode: 'BOM001', versionNo: 1, status: 'STANDARD', lines: [{ materialId: id, materialCode: 'VAI001', materialName: 'Vải cotton', qtyPerUnit: 1.5, unitCode: 'METER', wastageRate: 0.05 }] } }], materialRequirements: [{ materialId: id, materialCode: 'VAI001', unitCode: 'METER', requiredQty: 1575, issuedQty: 1500, returnedQty: 20, consumedQty: 1480 }], stages: [{ stage: 'SEWING', status: 'IN_PROGRESS', qtyIn: 1000, qtyOut: 650, qtyDefect: 10 }] });
    if (resource === 'owner/product-samples') return fulfill(list([{ id, code: 'MAU001', name: 'Áo sơ mi cotton mùa thu', status: 'UNDER_REVIEW', proposedPrice: 450000 }]));
    if (resource.startsWith('owner/product-samples/')) return fulfill({ id, code: 'MAU001', name: 'Áo sơ mi cotton mùa thu', status: 'UNDER_REVIEW', productCode: 'SP001', description: 'Mẫu sản phẩm phát triển cho bộ sưu tập mùa thu.', estimatedCost: 180000, proposedPrice: 450000, imageUrls: ['/logo.png'], evaluationNote: 'Đang chờ đánh giá.' });
    if (resource === 'owner/system-settings') return fulfill(settings);
    if (resource.startsWith('owner/system-settings/inventory-items/')) return method === 'PATCH' ? fulfill({}, 'Đã lưu ngưỡng tồn kho.') : fulfill(list([{ id, code: 'VAI001', name: 'Vải cotton', unit: 'METER', availableQty: 45, safetyStockThreshold: 50, fifoAgingThresholdDays: 60, version: 0 }]));
    if (resource.startsWith('owner/system-settings/')) return fulfill({ ...settings, revision: 1 }, 'Đã lưu cấu hình.');
    if (resource === 'owner/stock-adjustments') return fulfill(list([{ id, sessionCode: 'KK001', warehouseType: 'RAW_MATERIAL', status: 'VARIANCE_REVIEW', createdAt: now }]));
    if (resource.startsWith('owner/stock-adjustments/')) { if (method === 'POST') { stocktakeState = 'APPROVED_PENDING_ADJUSTMENT'; stocktakeApproval = { ...input, approvedByUserId: id, approvedAt: now }; return fulfill({}, 'Đã duyệt báo cáo kiểm kê.'); } return fulfill({ stocktake: { id, sessionCode: 'KK001', status: stocktakeState, approvalRevision: 0, approvalInfo: stocktakeApproval }, reportHash: 'a'.repeat(64), thresholds: { quantity: 5, value: 1000000 }, summary: { absoluteQuantity: 10, absoluteValue: 1500000, hasAging: true, requiresOwner: true }, records: [{ id, barcode: 'VAI001-CUON01', systemSnapshotQty: 100, actualScannedQty: 90, varianceQty: -10, unitCost: 150000, costBasis: 'SNAPSHOT', scannedAt: now, isAgingThresholdExceeded: true, agingDaysAtCount: 90 }] }); }
    return route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ message: `UI fixture missing: ${method} ${resource}` }) });
  });
  return calls;
}
