/*
 * File: materialDeliveryPlan.test.mjs
 * Description: Verifies split deliveries, accepted-only progress, timing snapshots, and overage rejection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { createTestToken } from './support/authSession.mjs';
import Supplier from '../src/models/Supplier.model.js';
import RawMaterial from '../src/models/RawMaterial.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import MaterialTicket from '../src/models/MaterialTicket.model.js';
import MaterialInboundPlan from '../src/models/MaterialInboundPlan.model.js';
import { createDeliveryPlan, getDeliveryPlan, listDeliveryPlans, setupLegacyDeliveryPlan, reviseDeliveryWindow, closeDeliveryBatch,
  cancelDeliveryBatch, reviseDeliveryItems } from '../src/modules/raw-material-warehousing/inbound-execution/deliveryPlan.service.js';
import { createSupplierReceipt, confirmSupplierReceipt } from '../src/modules/raw-material-warehousing/inbound-execution/supplierReceipt.service.js';

test('a batch accepts several receipts; rejected stock does not complete it', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  try {
    const user = { _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'), roles: ['OWNER', 'ADMIN'], warehouseIds: [] };
    const token = await createTestToken('OWNER', { _id: user._id });
    const supplier = await Supplier.create({ supplierCode: 'SUP-PLAN-TEST', supplierName: 'Nhà cung cấp thử', phone: '000' });
    const material = await RawMaterial.create({ materialCode: 'BUTTON-PLAN-TEST', materialName: 'Cúc thử',
      materialType: 'AUXILIARY', category: 'BUTTON', unit: 'PIECE', unitCost: 2 });
    const warehouse = await WarehouseLocation.create({ locationCode: 'RAW-PLAN-01', barcode: 'LOC-RAW-PLAN-01',
      warehouseType: 'RAW_MATERIAL', layoutBin: true, zoneCode: 'RAW-PLAN', rackCode: 'A', shelfCode: '01',
      maxCapacity: 1000, capacityUnit: 'PIECE' });
    const oldLocation = await WarehouseLocation.create({ locationCode: 'RAW-OLD-01', barcode: 'LOC-RAW-OLD-01',
      warehouseType: 'RAW_MATERIAL', zoneCode: 'OLD', rackCode: 'A', shelfCode: '01',
      maxCapacity: 1000, capacityUnit: 'PIECE' });
    const quarantine = await WarehouseLocation.create({ locationCode: 'DEF-PLAN-01', barcode: 'LOC-DEF-PLAN-01',
      warehouseType: 'DEFECT_QUARANTINE', zoneCode: 'DEF-PLAN', rackCode: 'D', shelfCode: '01',
      maxCapacity: 100, capacityUnit: 'PIECE' });
    const plan = await createDeliveryPlan({ supplierId: supplier._id, warehouseLocationId: warehouse._id,
      batches: [{ expectedStart: '2026-10-10', expectedEnd: '2026-10-12',
        items: [{ rawMaterialId: material._id, plannedQty: 100 }] },
      { expectedStart: '2026-10-20', expectedEnd: '2026-10-22',
        items: [{ rawMaterialId: material._id, plannedQty: 20 }] }] }, user);
    const batchId = plan.deliveryBatches[0]._id;
    const payload = (actual, accepted, rejected, receivedAt, suffix) => ({ inboundPlanId: plan._id,
      deliveryBatchId: batchId, supplierId: supplier._id, receivingLocationId: warehouse._id, receivedAt,
      draftKey: `draft-key-${suffix}`, supplierDeliveryCode: `DEL-${suffix}`, receiptLines: [{ rawMaterialId: material._id,
        unitCost: 3, actualQty: actual, acceptedQty: accepted, rejectedQty: rejected, pendingQty: 0,
        inspectionConclusion: 'Đã kiểm tra', defectReason: rejected ? 'Lỗi cúc' : '',
        lots: [{ clientLineId: `accepted-${suffix}`, countedQty: accepted, quality: 'ACCEPTED',
          allocations: [{ locationId: warehouse._id, quantity: accepted }] },
        ...(rejected ? [{ clientLineId: `rejected-${suffix}`, countedQty: rejected, quality: 'REJECTED',
          defectReason: 'Lỗi cúc', allocations: [{ locationId: quarantine._id, quantity: rejected }] }] : [])] }] });
    const first = await createSupplierReceipt(payload(60, 50, 10, '2026-10-09', 'A'), user);
    assert.equal(String((await createSupplierReceipt(payload(60, 50, 10, '2026-10-09', 'A'), user))._id), String(first._id));
    assert.equal((await request(app).get('/api/raw-material-inbound/receipts/by-draft-key/draft-key-A')
      .auth(token, { type: 'bearer' })).status, 200);
    await assert.rejects(createSupplierReceipt({ ...payload(60, 50, 10, '2026-10-09', 'A'), receiptNote: 'Đã đổi' }, user),
      { code: 'DRAFT_KEY_REUSED' });
    const competing = await createSupplierReceipt(payload(60, 60, 0, '2026-10-10', 'COMPETING'), user);
    assert.equal(first.status, 'READY_TO_CONFIRM');
    assert.equal((await getDeliveryPlan(plan._id, user)).batches[0].lines[0].remainingQty, 100);
    await confirmSupplierReceipt(first._id, { expectedVersion: 0, idempotencyKey: 'first-receipt-key' }, user);
    await assert.rejects(confirmSupplierReceipt(competing._id,
      { expectedVersion: 0, idempotencyKey: 'competing-receipt-key' }, user), { code: 'BATCH_EXCEEDED' });
    const partial = await getDeliveryPlan(plan._id, user);
    assert.equal(partial.batches[0].progress, 'IN_PROGRESS');
    assert.equal(partial.batches[0].lines[0].remainingQty, 50);
    assert.equal(partial.batches[0].lines[0].rejectedQty, 10);
    await assert.rejects(reviseDeliveryItems(plan._id, batchId, { version: partial.version,
      reason: 'Điều chỉnh quá thấp', items: [{ rawMaterialId: material._id, plannedQty: 40 }] }, user),
      { code: 'PLAN_BELOW_RECEIVED' });
    await assert.rejects(createSupplierReceipt(payload(51, 51, 0, '2026-10-11', 'TOO-MUCH'), user),
      { code: 'BATCH_EXCEEDED' });
    await reviseDeliveryWindow(plan._id, batchId, { expectedStart: '2026-10-10', expectedEnd: '2026-10-13',
      reason: 'Nhà cung cấp xin thêm một ngày', version: partial.version }, user);
    const secondPayload = payload(50, 50, 0, '2026-10-14', 'B');
    delete secondPayload.receiptLines[0].unitCost;
    const second = await createSupplierReceipt(secondPayload, user);
    assert.equal(second.receiptLines[0].unitCost, material.unitCost);
    await confirmSupplierReceipt(second._id, { expectedVersion: 0, idempotencyKey: 'second-receipt-key' }, user);
    const full = await getDeliveryPlan(plan._id, user);
    assert.equal(full.batches[0].progress, 'RECEIVED_FULL');
    assert.equal(full.batches[1].progress, 'NOT_RECEIVED');
    assert.equal(full.progress, 'IN_PROGRESS');
    assert.equal(full.batches[0].deadline.label, 'COMPLETED_LATE');
    assert.equal(full.batches[0].deadline.daysDifference, 1);
    const confirmedHistory = full.batches[0].history.filter((entry) => entry.status === 'COMPLETED');
    assert.equal(confirmedHistory[0].deliveryTimeliness.label, 'EARLY');
    assert.equal(confirmedHistory[0].deliveryTimeliness.daysDifference, 1);
    assert.equal(confirmedHistory[1].deliveryTimeliness.label, 'LATE');
    assert.equal(confirmedHistory[1].deliveryTimeliness.daysDifference, 1);
    assert.equal((await MaterialTicket.findById(first._id)).deliveryTimeliness.expectedEnd.toISOString().slice(0, 10), '2026-10-12');
    assert.equal((await RawMaterial.findById(material._id)).onHandQty, 100);
    assert.equal((await request(app).get('/api/raw-material-inbound/plans')
      .auth(token, { type: 'bearer' })).status, 200);
    const shortPlan = await createDeliveryPlan({ supplierId: supplier._id, warehouseLocationId: warehouse._id,
      batches: [{ expectedStart: '2026-10-20', expectedEnd: '2026-10-22',
        items: [{ rawMaterialId: material._id, plannedQty: 20 }] }] }, user);
    const shortBatchId = shortPlan.deliveryBatches[0]._id;
    const extraMaterial = await RawMaterial.create({ materialCode: 'THREAD-PLAN-TEST', materialName: 'Chỉ thử',
      materialType: 'AUXILIARY', category: 'THREAD', unit: 'SPOOL', unitCost: 2 });
    const revised = await reviseDeliveryItems(shortPlan._id, shortBatchId, { version: 0,
      reason: 'Bổ sung chỉ cho đợt giao', items: [{ rawMaterialId: material._id, plannedQty: 20 },
        { rawMaterialId: extraMaterial._id, plannedQty: 5 }] }, user);
    assert.equal(revised.batches[0].lines.length, 2);
    await closeDeliveryBatch(shortPlan._id, shortBatchId, { version: 1, reason: 'Nhà cung cấp không giao tiếp' }, user);
    assert.equal((await getDeliveryPlan(shortPlan._id, user)).batches[0].progress, 'CLOSED_SHORT');
    await assert.rejects(createSupplierReceipt({ ...payload(1, 1, 0, '2026-10-21', 'C'),
      inboundPlanId: shortPlan._id, deliveryBatchId: shortBatchId }, user), { code: 'BATCH_CLOSED' });
    const cancelPlan = await createDeliveryPlan({ supplierId: supplier._id, warehouseLocationId: warehouse._id,
      batches: [{ expectedStart: '2026-10-25', expectedEnd: '2026-10-26',
        items: [{ rawMaterialId: material._id, plannedQty: 10 }] }] }, user);
    await cancelDeliveryBatch(cancelPlan._id, cancelPlan.deliveryBatches[0]._id,
      { version: 0, reason: 'Ngừng sản xuất mã này' }, user);
    assert.equal((await getDeliveryPlan(cancelPlan._id, user)).batches[0].progress, 'CANCELLED');
    const oldPlan = await MaterialInboundPlan.create({ planCode: 'KH-OLD-TEST', supplierId: supplier._id,
      scheduledDeliveryDate: new Date('2026-11-04'), createdByAccountantId: user._id,
      expectedItems: [{ rawMaterialId: material._id, plannedQty: 10, actualVerifiedPassedQty: 5 },
        { rawMaterialId: material._id, plannedQty: 20, actualVerifiedPassedQty: 5 }] });
    const oldView = await getDeliveryPlan(oldPlan._id, user);
    assert.equal(oldView.needsSetup, true);
    assert.equal(oldView.batches[0].lines[0].plannedQty, 30);
    assert.equal(oldView.batches[0].lines[0].acceptedQty, 10);
    assert.equal((await listDeliveryPlans({}, user)).some((entry) => entry.planCode === 'KH-OLD-TEST'), true);
    await assert.rejects(setupLegacyDeliveryPlan(oldPlan._id, { version: 0,
      warehouseLocationId: oldLocation._id, expectedStart: '2026-11-04', expectedEnd: '2026-11-05' }, user),
    { code: 'PLAN_WAREHOUSE_FORBIDDEN' });
    await assert.rejects(setupLegacyDeliveryPlan(oldPlan._id, { version: 0,
      warehouseLocationId: quarantine._id, expectedStart: '2026-11-04', expectedEnd: '2026-11-05' }, user),
    { code: 'PLAN_WAREHOUSE_FORBIDDEN' });
    const setupResponse = await request(app).post(`/api/raw-material-inbound/plans/${oldPlan._id}/setup-legacy`).auth(token, { type: 'bearer' })
      .send({ version: 0, warehouseLocationId: warehouse._id,
        expectedStart: '2026-11-04', expectedEnd: '2026-11-05' });
    assert.equal(setupResponse.status, 200);
    const converted = setupResponse.body.data.plan;
    assert.equal(converted.needsSetup, false);
    assert.equal(converted.batches[0].lines.length, 1);
    assert.equal(converted.batches[0].lines[0].remainingQty, 20);
    await assert.rejects(setupLegacyDeliveryPlan(oldPlan._id, { version: 0,
      warehouseLocationId: warehouse._id }, user), { code: 'PLAN_ALREADY_SETUP' });
    const oldReceipt = await createSupplierReceipt({ ...payload(20, 20, 0, '2026-11-04', 'OLD'),
      inboundPlanId: oldPlan._id, deliveryBatchId: converted.batches[0].id }, user);
    await confirmSupplierReceipt(oldReceipt._id, { expectedVersion: 0, idempotencyKey: 'old-plan-receipt-key' }, user);
    assert.equal((await getDeliveryPlan(oldPlan._id, user)).batches[0].progress, 'RECEIVED_FULL');
    assert.equal((await MaterialInboundPlan.findById(oldPlan._id)).expectedItems.length, 2);
  } finally { await mongoose.disconnect(); await repl.stop(); }
});
