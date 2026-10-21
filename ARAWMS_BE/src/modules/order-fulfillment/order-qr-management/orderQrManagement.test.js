import test from 'node:test';
import assert from 'node:assert/strict';
import { newQrValue, parseQrValue, publicOrderDetail } from './orderQrService.js';
import { findDemoOrder, listDemoOrders } from './demoOrderService.js';

test('danh sách đơn mẫu hiển thị đủ đơn để chọn cấp QR hàng loạt', async () => {
  const orders = await listDemoOrders();
  assert.equal(orders.length, 5);
  assert.equal(new Set(orders.map((order) => order.id)).size, orders.length);
  assert.ok(orders.every((order) => order.demoOnly && order.items.length > 0));
});

test('QR dùng token ngẫu nhiên 256 bit, có prefix riêng và không lặp trong một đợt cấp', () => {
  const values = Array.from({ length: 100 }, newQrValue);
  assert.equal(new Set(values).size, values.length);
  for (const value of values) {
    assert.match(value, /^PACK:v1:[a-f0-9]{64}$/);
    assert.equal(parseQrValue(value), value.slice('PACK:v1:'.length));
  }
  assert.equal(parseQrValue('https://example.com/unsafe'), null);
  assert.equal(parseQrValue('PACK:v1:short'), null);
});

test('mã và ID của đơn mẫu tra được từ fixture và hiện rõ là demo', async () => {
  const byId = await findDemoOrder('DEMO-ORD-001');
  const byCode = await findDemoOrder(byId.orderCode);
  assert.equal(byCode.id, byId.id);
  assert.equal(publicOrderDetail(byId).demoOnly, true);
  assert.equal(publicOrderDetail(byId).items[0].skuCode, 'DEMO-SKU-01');
  assert.equal(await findDemoOrder('DEMO-ORD-999'), null);
});

test('QR không chứa PII, chi tiết được cấp quyền có đủ dữ liệu in tem đơn', () => {
  const result = publicOrderDetail({
    _id: 'order-id', orderCode: 'A-1', status: 'CONFIRMED',
    channel: 'SHOPEE', externalOrderNo: 'SP-1',
    customer: { code: 'C-1', name: 'Khách hàng', phone: 'customer-phone' },
    recipient: { name: 'Người nhận', phone: 'secret-phone', addressLine: 'secret-address' },
    shipping: { carrierCode: 'GHN', feeCustomer: 20000, feeActual: 15000 },
    paymentMethod: 'COD', paymentStatus: 'UNPAID',
    amounts: { subtotal: 200000, discount: 10000, total: 210000, codAmount: 210000 },
    items: [{ skuId: 'sku-id', skuCode: 'SKU-1', name: 'Áo', quantity: 2,
      unitPrice: 100000, discountAmount: 10000, lineTotal: 190000, unitCost: 40000 }],
    variantDetails: { 'sku-id': { productName: 'Áo', color: { name: 'Trắng' }, size: { name: 'M' } } },
    note: 'Giữ khô',
  });
  assert.equal(result.recipientName, 'Người nhận');
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].color, 'Trắng');
  assert.equal(result.items[0].size, 'M');
  assert.equal(result.recipient.phone, 'secret-phone');
  assert.equal(result.recipient.address, 'secret-address');
  assert.equal(result.customer.name, 'Khách hàng');
  assert.equal(result.shipping.carrierCode, 'GHN');
  assert.equal(result.paymentMethod, 'COD');
  assert.equal(result.amounts.codAmount, 210000);
  assert.equal(result.items[0].unitPrice, 100000);
  assert.equal(result.items[0].lineTotal, 190000);
  assert.equal(JSON.stringify(result).includes('unitCost'), false);
  assert.equal(JSON.stringify(result).includes('feeActual'), false);
});
