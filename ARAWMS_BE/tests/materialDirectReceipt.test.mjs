/* Verifies direct material purchases share receipt stock while staying independent of delivery plans. */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import RawMaterial from '../src/models/RawMaterial.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import MaterialStockLot from '../src/models/MaterialStockLot.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import { createSupplierReceipt, confirmSupplierReceipt, listSupplierReceipts } from '../src/modules/raw-material-warehousing/inbound-execution/supplierReceipt.service.js';
import { confirmMaterialPutaway, getMaterialReceiptLabels } from '../src/modules/raw-material-warehousing/inbound-execution/inboundExecution.service.js';

test('direct purchase stores separate prices and confirms stock once without a plan', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  try {
    const user = { _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      fullName: 'Người mua thử', roles: ['OWNER'], warehouseIds: [] };
    const material = await RawMaterial.create({ materialCode: 'BUTTON-DIRECT-TEST', materialName: 'Cúc mua trực tiếp',
      materialType: 'AUXILIARY', category: 'BUTTON', unit: 'PIECE', unitCost: 1 });
    const bin = await WarehouseLocation.create({ locationCode: 'A-DIRECT-01', barcode: 'LOC-A-DIRECT-01',
      warehouseType: 'RAW_MATERIAL', layoutBin: true, zoneCode: 'A', rackCode: 'A', shelfCode: '01',
      maxCapacity: 1000, capacityUnit: 'PIECE' });
    const line = (suffix, amount, cost) => ({ clientLineId: `direct-line-${suffix}`, rawMaterialId: material._id,
      unitCost: cost, actualQty: amount, acceptedQty: amount, rejectedQty: 0, pendingQty: 0,
      inspectionConclusion: 'Đã kiểm tra', lots: [{ clientLineId: `direct-lot-${suffix}`,
        countedQty: amount, quality: 'ACCEPTED', allocations: [{ locationId: bin._id, quantity: amount }] }] });
    const payload = { receiptSource: 'DIRECT', draftKey: 'direct-draft-test-001',
      receivedAt: '2026-10-01', receivingLocationId: bin._id,
      purchaseSourceName: 'Cửa hàng phụ liệu A', purchasedByName: user.fullName,
      receiptLines: [line('a', 5, 2), line('b', 7, 3)] };
    const draft = await createSupplierReceipt(payload, user);
    assert.equal(draft.status, 'READY_TO_CONFIRM');
    assert.equal(draft.inboundPlanId, undefined);
    assert.equal(draft.receiptLines[0].unitCost, 2);
    assert.equal(draft.receiptLines[1].unitCost, 3);
    const confirmed = await confirmSupplierReceipt(draft._id,
      { expectedVersion: 0, idempotencyKey: 'direct-confirm-test-001' }, user);
    assert.equal(confirmed.status, 'COMPLETED');
    await confirmSupplierReceipt(draft._id, { expectedVersion: 0, idempotencyKey: 'direct-confirm-test-001' }, user);
    assert.equal((await RawMaterial.findById(material._id)).onHandQty, 12);
    assert.deepEqual((await MaterialStockLot.find({ inboundTicketId: draft._id }).sort({ unitCost: 1 }))
      .map((lot) => lot.unitCost), [2, 3]);
    assert.equal(await InventoryTransaction.countDocuments({ referenceId: draft._id, transactionType: 'INBOUND_RECEIPT' }), 2);
    assert.equal((await listSupplierReceipts({ source: 'DIRECT' }, user)).length, 1);
    assert.equal((await listSupplierReceipts({ source: 'PLAN' }, user)).length, 0);
    const { labels } = await getMaterialReceiptLabels(String(draft._id), user);
    assert.equal(labels.length, 2);
    await confirmMaterialPutaway(String(draft._id), { objectBarcode: labels[0].barcode,
      locationBarcode: bin.barcode, idempotencyKey: 'direct-putaway-test-001' }, user);
    assert.equal((await getMaterialReceiptLabels(String(draft._id), user)).labels[0].putawayComplete, true);
    const quarantine = await WarehouseLocation.create({ locationCode: 'DEF-DIRECT-01', barcode: 'LOC-DEF-DIRECT-01',
      warehouseType: 'DEFECT_QUARANTINE', zoneCode: 'DEF', rackCode: 'D', shelfCode: '01',
      maxCapacity: 100, capacityUnit: 'PIECE' });
    const rejected = await createSupplierReceipt({ ...payload, draftKey: 'direct-draft-test-002',
      receiptLines: [{ ...line('c', 4, 5), acceptedQty: 3, rejectedQty: 1, defectReason: 'Cúc lỗi',
        lots: [{ clientLineId: 'direct-lot-c-accepted', countedQty: 3, quality: 'ACCEPTED',
          allocations: [{ locationId: bin._id, quantity: 3 }] },
        { clientLineId: 'direct-lot-c-rejected', countedQty: 1, quality: 'REJECTED', defectReason: 'Cúc lỗi',
          allocations: [{ locationId: quarantine._id, quantity: 1 }] }] }] }, user);
    const confirmedRejected = await confirmSupplierReceipt(rejected._id,
      { expectedVersion: 0, idempotencyKey: 'direct-confirm-test-002' }, user);
    assert.equal(confirmedRejected.supplierReturns.length, 0);
  } finally { await mongoose.disconnect(); await repl.stop(); }
});
