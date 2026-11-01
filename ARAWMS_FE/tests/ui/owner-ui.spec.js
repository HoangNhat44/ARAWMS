import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi, paths, id, employeeId } from './fixtures.js';

for (const [name, width, height] of [['desktop', 1440, 1000], ['laptop', 1280, 900], ['tablet', 768, 1024], ['mobile', 390, 844], ['reflow', 320, 800]]) {
  test(`Owner screens render without overflow at ${name} ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height }); const errors = []; page.on('pageerror', (error) => errors.push(error.message)); await mockApi(page);
    for (const [path, title] of paths) {
      await page.goto(path); await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect(page.locator('.owner-main .owner-loading')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${path} overflows at ${width}px`).toBe(false);
    }
    expect(errors).toEqual([]);
  });
}

test('Desktop and mobile key screens meet automated WCAG checks', async ({ page }) => {
  test.setTimeout(180000);
  await mockApi(page);
  const violations = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path] of paths) {
      await page.goto(path); await expect(page.locator('.owner-main h1')).toBeVisible(); await expect(page.locator('.owner-main .owner-loading')).toHaveCount(0);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      if (result.violations.length) violations.push({ path, width, violations: result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })) });
    }
  }
  expect(violations).toEqual([]);
});

test('Mobile drawer supports keyboard navigation and closes after choosing page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockApi(page); await page.goto('/owner/dashboard');
  const open = page.getByRole('button', { name: 'Mở điều hướng', exact: true }); await expect(open).toBeVisible(); await open.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('menuitem', { name: 'Nhân viên', exact: true }).click();
  await expect(page).toHaveURL(/\/owner\/employees$/); await expect(page.getByRole('heading', { level: 1, name: 'Nhân viên và phân quyền' })).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Employee creation keeps validation and sends one expected payload', async ({ page }) => {
  const calls = await mockApi(page); await page.goto('/owner/employees/new');
  await page.getByLabel('Mã nhân viên', { exact: true }).fill('NV100'); await page.getByLabel('Họ tên', { exact: true }).fill('Nguyễn Văn An');
  await page.getByLabel('Email', { exact: true }).fill('an@example.test'); await page.getByLabel('Mật khẩu ban đầu', { exact: true }).fill('Valid12345'); await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('Different123');
  await page.getByRole('combobox', { name: 'Vai trò', exact: true }).click(); await page.locator('.ant-select-item-option[title="Nhân viên bán hàng"]').click();
  await page.getByRole('button', { name: 'Xác nhận tạo tài khoản', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Xác nhận mật khẩu không khớp');
  expect(calls.filter((c) => c.resource === 'owner/employees' && c.method === 'POST')).toHaveLength(0);
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('Valid12345'); await page.getByRole('button', { name: 'Xác nhận tạo tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/owner\/employees$/);
  const creates = calls.filter((c) => c.resource === 'owner/employees' && c.method === 'POST'); expect(creates).toHaveLength(1); expect(creates[0].input).toMatchObject({ employeeCode: 'NV100', roleCode: 'SELLER' });
});

test('Permissions page keeps expectedVersion and grant/deny choices', async ({ page }) => {
  const calls = await mockApi(page); await page.goto(`/owner/employees/${employeeId}/permissions`);
  await page.getByRole('combobox').click(); await page.locator('.ant-select-item-option[title="Cấp riêng"]').click();
  await page.getByLabel('Lý do thay đổi', { exact: true }).fill('Phân công nhiệm vụ vận chuyển'); await page.getByRole('button', { name: 'Xác nhận lưu quyền', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu quyền');
  const payload = calls.find((c) => c.method === 'PATCH' && c.resource.startsWith('owner/employee-permissions/'))?.input;
  expect(payload.expectedVersion).toBe(0); expect(payload.permissionOverrides).toEqual([{ code: 'Order Fulfillment|Carrier Handover|VIEW', granted: true }]);
});

test('Inventory approval requires a final confirmation before sending API', async ({ page }) => {
  const calls = await mockApi(page); await page.goto(`/owner/stock-adjustments/${id}`);
  await page.getByLabel('Lý do duyệt điều chỉnh', { exact: true }).fill('Đã đối chiếu đầy đủ với báo cáo kiểm đếm');
  await page.getByLabel(/Kế hoạch xử lý hàng tồn lâu/).fill('Phân loại và xử lý hàng tồn quá thời gian quy định');
  await page.getByRole('button', { name: 'Xác nhận duyệt báo cáo', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible();
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  await page.getByRole('button', { name: 'Xác nhận duyệt', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã duyệt báo cáo');
  const approval = calls.find((c) => c.method === 'POST' && c.resource.endsWith('/approve')); expect(approval.input.reportHash).toBe('a'.repeat(64)); expect(approval.input.expectedVersion).toBe(0);
});

test('List filters survive opening detail and returning', async ({ page }) => {
  await mockApi(page); await page.goto('/owner/production?page=2&status=IN_PROGRESS&search=LSX');
  await page.getByRole('link', { name: 'Xem chi tiết LSX001', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/owner/production/${id}$`));
  await page.getByRole('link', { name: 'Quay lại danh sách', exact: true }).click();
  await expect(page).toHaveURL(/page=2/); await expect(page).toHaveURL(/status=IN_PROGRESS/); await expect(page.getByLabel('Tìm theo mã hoặc tên', { exact: true })).toHaveValue('LSX');
});

test('Empty and network failure states are distinct and retry works', async ({ page }) => {
  await mockApi(page, { empty: true, failOnce: 'owner/employees' }); await page.goto('/owner/employees');
  await expect(page.getByRole('alert')).toContainText('Không tải được dữ liệu'); await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByText('Chưa có dữ liệu phù hợp.', { exact: true })).toBeVisible();
});

test('Non-owner is still blocked after the UI redesign', async ({ page }) => {
  await mockApi(page, { role: 'SELLER' }); await page.goto('/owner/employees'); await expect(page.getByText('Không có quyền truy cập', { exact: true })).toBeVisible(); await expect(page.locator('.owner-shell')).toHaveCount(0);
});

test('Account locking requires reason and confirmation, then updates status', async ({ page }) => {
  const calls = await mockApi(page); await page.goto('/owner/employees'); await page.getByRole('button', { name: 'Khóa', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  await dialog.getByLabel('Lý do', { exact: true }).fill('Tạm ngưng phân công công việc'); await dialog.getByRole('button', { name: 'Xác nhận khóa tài khoản', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Đã khóa', exact: true })).toBeVisible();
  const call = calls.find((c) => c.method === 'PATCH'); expect(call.resource).toBe(`owner/employees/${employeeId}/lock`); expect(call.input.expectedVersion).toBe(0);
});

test('Role assignment keeps the explicit impact warning and expectedVersion', async ({ page }) => {
  const calls = await mockApi(page); await page.goto('/owner/employees'); await page.getByRole('button', { name: 'Gán vai trò', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Quyền cấp/thu hồi riêng cũ sẽ được bỏ');
  await dialog.getByRole('combobox', { name: 'Vai trò mới', exact: true }).click(); await page.locator('.ant-select-item-option[title="Kế toán"]').click();
  await dialog.getByLabel('Lý do thay đổi', { exact: true }).fill('Điều chuyển sang nghiệp vụ kế toán'); await dialog.getByRole('button', { name: 'Xác nhận đổi vai trò', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Kế toán', exact: true })).toBeVisible(); const call = calls.find((c) => c.resource.startsWith('owner/employee-roles/')); expect(call.input).toMatchObject({ expectedVersion: 0, roleCode: 'ACCOUNTANT' });
});

test('API config never pre-fills a saved secret and sends only the selected group', async ({ page }) => {
  const calls = await mockApi(page); await page.goto('/owner/settings/integrations'); const token = page.getByLabel(/GHN Token/); await expect(token).toHaveValue('');
  await token.fill('replacement-key-fixture'); await page.getByRole('button', { name: 'Lưu nhóm cấu hình', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Đã lưu cấu hình');
  const call = calls.find((c) => c.method === 'PATCH'); expect(call.resource).toBe('owner/system-settings/api'); expect(call.input).toMatchObject({ expectedVersion: 0, ghnToken: 'replacement-key-fixture' });
  expect(call.input.defaultFabricLeftoverThresholdMeters).toBeUndefined(); await expect(token).toHaveValue('');
});

test('Per-item threshold form preserves version and numeric payload', async ({ page }) => {
  const calls = await mockApi(page); await page.goto('/owner/settings/inventory'); await page.getByRole('button', { name: 'Sửa ngưỡng', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Tồn an toàn/).fill('25'); await dialog.getByLabel('Ngày cảnh báo tồn lâu', { exact: true }).fill('90'); await dialog.getByRole('button', { name: 'Xác nhận lưu ngưỡng', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu ngưỡng'); const call = calls.find((c) => c.method === 'PATCH'); expect(call.input).toEqual({ expectedVersion: 0, safetyStockThreshold: 25, fifoAgingThresholdDays: 90 });
});

test('Manager report acknowledgement stays on its detail page', async ({ page }) => {
  const calls = await mockApi(page); await page.goto(`/owner/manager-reports/${id}`); await page.getByLabel('Ghi chú khi xem', { exact: true }).fill('Đã đối chiếu thông tin vận hành');
  await page.getByRole('button', { name: 'Xác nhận đã xem báo cáo', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Đã xác nhận xem báo cáo'); await expect(page.getByRole('button', { name: 'Xác nhận đã xem báo cáo', exact: true })).toHaveCount(0);
  expect(calls.find((c) => c.method === 'PATCH')?.input.comment).toBe('Đã đối chiếu thông tin vận hành'); await expect(page).toHaveURL(new RegExp(`/owner/manager-reports/${id}$`));
});

test('Login is responsive and keyboard-accessible without external Google calls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockApi(page, { anonymous: true }); await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập hệ thống' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze(); expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
});

test('Shared account and recovery screens reflow and pass automated accessibility checks', async ({ page }) => {
  test.setTimeout(90000);
  await mockApi(page, { role: 'SELLER' });
  for (const width of [768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/account', '/reset-password', '/reset-password#token=' + 'a'.repeat(64), '/missing-page']) {
      await page.goto(path); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path} at ${width}px`).toBe(true);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), `${path} at ${width}px`).toEqual([]);
    }
  }
});

test('Forgot password screen reflows with accessible fields', async ({ page }) => {
  await mockApi(page, { anonymous: true }); await page.setViewportSize({ width: 320, height: 800 }); await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
});

test('Screenshots for review', async ({ page }, testInfo) => {
  await mockApi(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto('/owner/dashboard'); await expect(page.locator('.owner-main .owner-loading')).toHaveCount(0); await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan điều hành' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`owner-dashboard-${width}.png`), fullPage: true });
    for (const [path, name] of [['/owner/employees', 'employees'], ['/owner/settings/inventory', 'inventory-settings'], [`/owner/stock-adjustments/${id}`, 'stocktake']]) {
      await page.goto(path); await expect(page.locator('.owner-main h1')).toBeVisible(); await expect(page.locator('.owner-main .owner-loading')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`owner-${name}-${width}.png`), fullPage: true });
    }
  }
});
