import test from 'node:test';
import assert from 'node:assert/strict';
import { decideScan } from './packingService.js';
import { canViewOrder, canPackOrder } from './orderAccessService.js';

const demoPacking = () => ({
  sourceType: 'DEMO',
  items: [{ lineKey: 'line-1', variantId: 'DEMO-VAR-01', skuCode: 'DEMO-SKU-01', quantity: 2 }],
  scannedUnits: [],
});
const unit = (barcode, variantId = 'DEMO-VAR-01') => ({
  barcode, variantId, sku: variantId === 'DEMO-VAR-01' ? 'DEMO-SKU-01' : 'DEMO-SKU-02',
  barcodeFormat: 'CODE_128', inventoryStatus: 'AVAILABLE',
});

test('hai barcode vật lý cùng biến thể được nhận đúng số lượng; mã trùng/sai/vượt bị chặn', () => {
  const packing = demoPacking();
  assert.equal(decideScan(packing, unit('DEMU00000001'), 'DEMU00000001').lineKey, 'line-1');
  packing.scannedUnits.push({ barcode: 'DEMU00000001', lineKey: 'line-1' });
  assert.equal(decideScan(packing, unit('DEMU00000001'), 'DEMU00000001').reason, 'BARCODE_ALREADY_SCANNED');
  assert.equal(decideScan(packing, unit('DEMU00000006', 'DEMO-VAR-02'), 'DEMU00000006').reason, 'ITEM_NOT_IN_ORDER');
  assert.equal(decideScan(packing, unit('DEMU00000002'), 'DEMU00000002').lineKey, 'line-1');
  packing.scannedUnits.push({ barcode: 'DEMU00000002', lineKey: 'line-1' });
  assert.equal(decideScan(packing, unit('DEMU00000003'), 'DEMU00000003').reason, 'QTY_EXCEEDED');
});

test('nhân viên kho chỉ xem và đóng đơn thuộc kho được gán', () => {
  const user = { _id: 'user-1', roles: ['WAREHOUSE_STAFF'], warehouseIds: ['wh-1'] };
  const order = { items: [{ reservation: { warehouseId: 'wh-1' } }] };
  assert.equal(canViewOrder(user, order), true);
  assert.equal(canPackOrder(user, order), true);
  assert.equal(canPackOrder(user, { items: [{ reservation: { warehouseId: 'wh-2' } }] }), false);
  assert.equal(canPackOrder(user, { items: [{ reservation: {} }] }), false);
});

test('tem của đơn thật phải đúng SKU và kho đã dành', () => {
  const packing = {
    sourceType: 'REAL',
    items: [{ lineKey: '0', skuId: 'sku-1', warehouseId: 'wh-1', quantity: 1 }],
    scannedUnits: [],
  };
  const physical = { barcode: 'UNIT-1', barcodeFormat: 'CODE_128', inventoryStatus: 'AVAILABLE', skuId: 'sku-1', warehouseId: 'wh-1' };
  assert.equal(decideScan(packing, physical, 'UNIT-1').lineKey, '0');
  assert.equal(decideScan(packing, { ...physical, skuId: 'sku-2' }, 'UNIT-1').reason, 'ITEM_NOT_IN_ORDER');
  assert.equal(decideScan(packing, { ...physical, warehouseId: 'wh-2' }, 'UNIT-1').reason, 'ITEM_NOT_IN_ORDER');
});
