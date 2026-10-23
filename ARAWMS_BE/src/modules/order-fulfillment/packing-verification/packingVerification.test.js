import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import PackingSession from '../../../models/PackingSession.js';
import ProductUnitAllocation from '../../../models/ProductUnitAllocation.js';
import PackingScanEvent from '../../../models/PackingScanEvent.js';
import { evaluatePackingBarcodeScan, removeScannedBarcodeFromPacking } from './packingVerification.service.js';
import { canViewOrder, canPackOrder, canIssueQr, canConfirmOrder } from '../../../common/services/orderAccessService.js';
import { findProductUnit } from '../../../common/services/productUnitService.js';

const demoPacking = () => ({
  sourceType: 'DEMO',
  items: [{ lineKey: 'line-1', variantId: 'DEMO-VAR-01', skuCode: 'DEMO-SKU-01', quantity: 2 }],
  scannedUnits: [],
});
const unit = (barcode, variantId = 'DEMO-VAR-01') => ({
  barcode, variantId, sku: variantId === 'DEMO-VAR-01' ? 'DEMO-SKU-01' : 'DEMO-SKU-02',
  barcodeFormat: 'CODE_128', inventoryStatus: 'AVAILABLE',
});

test('barcode mẫu được đọc từ bộ dữ liệu hiện hành', async () => {
  const product = await findProductUnit('DEMO', 'DEMU00000001');
  assert.equal(product.variantId, 'DEMO-VAR-01');
  assert.equal(await findProductUnit('DEMO', 'DEMU99999999'), null);
});

test('hai barcode vật lý cùng biến thể được nhận đúng số lượng; mã trùng/sai/vượt bị chặn', () => {
  const packing = demoPacking();
  assert.equal(evaluatePackingBarcodeScan(packing, unit('DEMU00000001'), 'DEMU00000001').lineKey, 'line-1');
  packing.scannedUnits.push({ barcode: 'DEMU00000001', lineKey: 'line-1' });
  assert.equal(evaluatePackingBarcodeScan(packing, unit('DEMU00000001'), 'DEMU00000001').reason, 'BARCODE_ALREADY_SCANNED');
  assert.equal(evaluatePackingBarcodeScan(packing, unit('DEMU00000006', 'DEMO-VAR-02'), 'DEMU00000006').reason, 'ITEM_NOT_IN_ORDER');
  assert.equal(evaluatePackingBarcodeScan(packing, unit('DEMU00000002'), 'DEMU00000002').lineKey, 'line-1');
  packing.scannedUnits.push({ barcode: 'DEMU00000002', lineKey: 'line-1' });
  assert.equal(evaluatePackingBarcodeScan(packing, unit('DEMU00000003'), 'DEMU00000003').reason, 'QTY_EXCEEDED');
});

test('nhân viên kho chỉ xem và đóng đơn thuộc kho được gán', () => {
  const user = { _id: 'user-1', roles: ['WAREHOUSE_STAFF'], warehouseIds: ['wh-1'] };
  const order = { items: [{ reservation: { warehouseId: 'wh-1' } }] };
  assert.equal(canViewOrder(user, order), true);
  assert.equal(canPackOrder(user, order), true);
  assert.equal(canPackOrder(user, { items: [{ reservation: { warehouseId: 'wh-2' } }] }), false);
  assert.equal(canPackOrder(user, { items: [{ reservation: {} }] }), false);
  assert.equal(canViewOrder(user, { items: [{ fifoPickList: [] }] }), true);
  assert.equal(canViewOrder(user, { items: [{ fifoPickList: [{ locationId: 'wh-1' }] }] }), true);
  assert.equal(canViewOrder(user, { items: [{ fifoPickList: [{ locationId: 'wh-2' }] }] }), false);
  assert.equal(canPackOrder(user, { items: [{ fifoPickList: [{ locationId: 'wh-1' }] }] }), true);
  assert.equal(canPackOrder({ roles: ['WAREHOUSE_MANAGER'], warehouseIds: ['wh-1'] }, order), false);
  assert.equal(canPackOrder({ roles: ['ADMIN'] }, { demoOnly: true }), false);
  assert.equal(canPackOrder(user, { demoOnly: true }), true);
  assert.equal(canIssueQr(user, order), true);
  assert.equal(canIssueQr(user, { demoOnly: true }), true);
  assert.equal(canConfirmOrder(user, order), false);
});

test('tem của đơn thật phải đúng SKU và kho đã dành', () => {
  const packing = {
    sourceType: 'REAL',
    items: [{ lineKey: '0', skuId: 'sku-1', warehouseId: 'wh-1', quantity: 1 }],
    scannedUnits: [],
  };
  const physical = { barcode: 'UNIT-1', barcodeFormat: 'CODE_128', inventoryStatus: 'AVAILABLE', skuId: 'sku-1', warehouseId: 'wh-1' };
  assert.equal(evaluatePackingBarcodeScan(packing, physical, 'UNIT-1').lineKey, '0');
  assert.equal(evaluatePackingBarcodeScan(packing, { ...physical, skuId: 'sku-2' }, 'UNIT-1').reason, 'ITEM_NOT_IN_ORDER');
  assert.equal(evaluatePackingBarcodeScan(packing, { ...physical, warehouseId: 'wh-2' }, 'UNIT-1').reason, 'ITEM_NOT_IN_ORDER');
});

test('gỡ một barcode trả lại chỗ quét và allocation, giữ barcode khác trong đơn', async () => {
  const originals = [
    [mongoose, 'startSession'], [PackingSession, 'findById'],
    [ProductUnitAllocation, 'deleteOne'], [PackingScanEvent, 'updateMany'],
  ].map(([owner, key]) => [owner, key, owner[key]]);
  const sessionId = '507f1f77bcf86cd799439011';
  const packing = {
    _id: sessionId, sourceType: 'DEMO', orderKey: 'DEMO-1', stationId: 'station_12345678',
    leaseVersion: 2, leaseUntil: new Date(Date.now() + 60_000), state: 'READY_TO_RECORD',
    video: {}, version: 3,
    items: [{ lineKey: 'line-1', variantId: 'DEMO-VAR-01', skuCode: 'DEMO-SKU-01', quantity: 2 }],
    scannedUnits: [
      { barcode: 'DEMU00000001', lineKey: 'line-1' },
      { barcode: 'DEMU00000002', lineKey: 'line-1' },
    ],
    async save() {},
  };
  const deleted = [];
  let reversedFilter;
  mongoose.startSession = async () => ({
    withTransaction: async (work) => work(), endSession: async () => {},
  });
  PackingSession.findById = () => ({ session: async () => packing });
  ProductUnitAllocation.deleteOne = async (filter) => { deleted.push(filter); return { deletedCount: 1 }; };
  PackingScanEvent.updateMany = async (filter) => { reversedFilter = filter; return { modifiedCount: 1 }; };
  try {
    const result = await removeScannedBarcodeFromPacking({
      sessionId, stationId: 'station_12345678', leaseVersion: 2, barcode: 'DEMU00000001',
    });
    assert.deepEqual(result.scannedBarcodes, ['DEMU00000002']);
    assert.equal(result.items[0].scanned, 1);
    assert.equal(result.state, 'SCANNING');
    assert.equal(evaluatePackingBarcodeScan(packing, unit('DEMU00000003'), 'DEMU00000003').lineKey, 'line-1');
    assert.equal(deleted[0].barcode, 'DEMU00000001');
    assert.equal(reversedFilter.barcode, 'DEMU00000001');
    assert.equal(packing.version, 4);
  } finally {
    for (const [owner, key, original] of originals) owner[key] = original;
  }
});
