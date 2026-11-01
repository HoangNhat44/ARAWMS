async (page) => {
  const user = { id: 'ui-preview', fullName: 'Kiểm tra giao diện', roles: ['WAREHOUSE_MANAGER'] };
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { user } }) }));
  await page.route('**/api/products*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { products: [] } }) }));
  await page.evaluate((value) => {
    localStorage.setItem('arawms_auth_token', 'ui-preview');
    localStorage.setItem('arawms_user_info', JSON.stringify(value));
  }, user);
  await page.goto('http://localhost:5173/warehouse/products/new');
}
