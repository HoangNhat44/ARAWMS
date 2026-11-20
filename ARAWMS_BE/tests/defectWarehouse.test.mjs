/*
 * File: defectWarehouse.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Defective unit lifecycle in the finished-goods warehouse:
 *   DEFECT_PENDING (garment technician judged it defective) -> DEFECTIVE (warehouse confirmed the defect
 *   inbound) -> DEFECT_OUT (taken out with a reason). Defective units never count in Sku.onHandQty and
 *   the defect quantity per SKU is counted from the units.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import { createTestToken } from './support/authSession.mjs';
import Product from '../src/models/Product.model.js';
import Sku from '../src/models/Sku.model.js';
import ProductUnit from '../src/models/ProductUnit.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import FinishedGoodsTicket from '../src/models/FinishedGoodsTicket.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import { defectQtyBySku } from '../src/common/services/defectStock.js';
import { getBarcodeTimeline } from '../src/modules/warehouse-management/products/barcodeTracking.service.js';
import { getValuationSummary, getValuationList } from '../src/modules/financial-intelligence/product-inventory-valuation/productValuation.service.js';
import { valuationReport } from '../src/modules/raw-material-inventory/inventory-valuation/inventoryValuation.service.js';

let replicaSet;
let manager;
let staff;
let product;
let sku;
let ticket;
test.before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([Product.init(), Sku.init(), ProductUnit.init(), WarehouseLocation.init(), FinishedGoodsTicket.init(),
    InventoryTransaction.init()]);
  manager = await createTestToken('WAREHOUSE_MANAGER');
  staff = await createTestToken('WAREHOUSE_STAFF');
  product = await Product.create({ productCode: 'AL186', productName: 'Áo len', category: 'Áo', basePrice: 1000, isActive: true });
  // The color has stopped selling: its returned units must still be received into the defect warehouse.
  sku = await Sku.create({ productId: product._id, skuCode: 'AL186-KEM-M', skuBarcode: 'AL186-KEM-M', styleName: 'AL186',
    color: 'Kem', size: 'M', retailPrice: 1000, onHandQty: 4, variantKey: `${product._id}:kem:M`,
    isActive: false, discontinuedAt: new Date() });
  const shelf = await WarehouseLocation.create({ locationCode: 'FG-A-01', barcode: 'LOC-FG-A-01', warehouseType: 'FINISHED_GOODS',
    zoneCode: 'A', rackCode: 'A1', shelfCode: 'S1', maxCapacity: 100 });
  // What the garment return inspection leaves behind: the shipped unit is marked DEFECT_PENDING and a defect inbound ticket waits.
  await ProductUnit.create({ barcode: 'ARARETURNDEF01', barcodeFormat: 'CODE_128', skuId: sku._id, warehouseId: shelf._id,
    inventoryStatus: 'DEFECT_PENDING', packedOrderId: new mongoose.Types.ObjectId(), returnedFromOrderId: new mongoose.Types.ObjectId(),
    defectReason: 'DIRTY_OR_DAMAGED', inspectedAt: new Date() });
  ticket = await FinishedGoodsTicket.create({ ticketCode: 'TK-DEF-0001', ticketType: 'DEFECT_QUARANTINE_INBOUND', status: 'READY_TO_CONFIRM',
    items: [{ skuId: sku._id, skuBarcode: sku.skuBarcode, designatedFifoLocationId: shelf._id, expectedQty: 1, totalQty: 1,
      unitBarcodes: ['ARARETURNDEF01'] }] });
});
test.after(async () => { await mongoose.disconnect(); await replicaSet?.stop(); });

const api = (method, path, token = manager) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);

test('a defective unit waiting for the warehouse is listed as pending and counted for its SKU', async () => {
  const response = await api('get', '/products/defects', staff);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.data.summary, { pending: 1, inStock: 0 });
  assert.equal(response.body.data.units[0].skuCode, 'AL186-KEM-M');
  assert.equal((await defectQtyBySku([sku._id])).get(String(sku._id)), 1);
  assert.equal((await getBarcodeTimeline('ARARETURNDEF01')).current.code, 'DEFECT_PENDING');
  // A pending unit is not inside the defect warehouse yet, so it cannot be taken out.
  const early = await api('post', '/products/defects/outbound').send({ barcodes: ['ARARETURNDEF01'], reason: 'Tiêu hủy' });
  assert.equal(early.status, 409);
  assert.equal(early.body.error.code, 'UNIT_NOT_IN_DEFECT_WAREHOUSE');
});

test('stock reports count defective goods from the units, not from a SKU field', async () => {
  const summary = await getValuationSummary();
  assert.equal(summary.summary?.totalQuarantineQty ?? summary.totalQuarantineQty ?? summary.kpis?.totalQuarantineQty, 1, JSON.stringify(summary).slice(0, 300));
  const list = await getValuationList({ stockStatus: 'QUARANTINE' });
  const rows = list.items || list.data || list.rows;
  assert.deepEqual(rows.map((row) => [row.skuCode, row.defectQty]), [['AL186-KEM-M', 1]]);
  const owner = await valuationReport({ type: 'skus' });
  assert.equal(owner.items.find((item) => item.code === 'AL186-KEM-M').quarantineQty, 1);
});

test('confirming the defect inbound moves the unit to DEFECTIVE without touching sellable stock', async () => {
  const response = await api('post', '/products/bulk/documents').send({ direction: 'IN', documentCode: 'NK-TK-DEF-0001',
    sourceTicketId: String(ticket._id), confirmationKey: 'defect-inbound-0001', allocations: [],
    items: [{ productId: String(product._id), skuId: String(sku._id), quantity: 1, expectedQty: 1, receivedQty: 1 }] });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const unit = await ProductUnit.findOne({ barcode: 'ARARETURNDEF01' });
  assert.equal(unit.inventoryStatus, 'DEFECTIVE');
  assert.ok(unit.defectReceivedAt);
  assert.equal((await WarehouseLocation.findById(unit.warehouseId)).warehouseType, 'DEFECT_QUARANTINE');
  assert.equal((await Sku.findById(sku._id)).onHandQty, 4, 'defective units are not sellable stock');
  const list = await api('get', '/products/defects');
  assert.deepEqual(list.body.data.summary, { pending: 0, inStock: 1 });
  assert.match((await getBarcodeTimeline('ARARETURNDEF01')).current.label, /Trong kho hàng lỗi/);
});

test('taking defective units out needs a reason and a manager, then marks them DEFECT_OUT', async () => {
  const noReason = await api('post', '/products/defects/outbound').send({ barcodes: ['ARARETURNDEF01'], reason: '  ' });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.error.code, 'REASON_REQUIRED');
  const byStaff = await api('post', '/products/defects/outbound', staff).send({ barcodes: ['ARARETURNDEF01'], reason: 'Thanh lý' });
  assert.equal(byStaff.status, 403);
  const unknown = await api('post', '/products/defects/outbound').send({ barcodes: ['ARANOTEXIST01'], reason: 'Thanh lý' });
  assert.equal(unknown.status, 404);

  const done = await api('post', '/products/defects/outbound').send({ barcodes: ['ARARETURNDEF01'], reason: 'Thanh lý cho đối tác' });
  assert.equal(done.status, 201, JSON.stringify(done.body));
  assert.equal(done.body.data.quantity, 1);
  const unit = await ProductUnit.findOne({ barcode: 'ARARETURNDEF01' });
  assert.equal(unit.inventoryStatus, 'DEFECT_OUT');
  assert.equal(unit.defectOutReason, 'Thanh lý cho đối tác');
  const outTicket = await FinishedGoodsTicket.findOne({ ticketType: 'DEFECT_DISPOSAL_OUTBOUND' });
  assert.equal(outTicket.ticketCode, done.body.data.ticketCode);
  assert.equal(outTicket.items[0].defectNote, 'Thanh lý cho đối tác');
  const movement = await InventoryTransaction.findOne({ transactionType: 'DEFECT_DISPOSAL' });
  assert.equal(movement.quantityChange, -1);
  assert.equal((await Sku.findById(sku._id)).onHandQty, 4);
  assert.equal((await defectQtyBySku([sku._id])).get(String(sku._id)), undefined, 'no defective unit left for the SKU');
  const again = await api('post', '/products/defects/outbound').send({ barcodes: ['ARARETURNDEF01'], reason: 'Thanh lý' });
  assert.equal(again.status, 409, 'a unit already taken out cannot be taken out twice');
  const timeline = await getBarcodeTimeline('ARARETURNDEF01');
  assert.equal(timeline.current.code, 'DEFECT_OUT');
  assert.ok(timeline.segments.at(-1).events.some((event) => event.title === 'Xuất kho hàng lỗi'));
});
