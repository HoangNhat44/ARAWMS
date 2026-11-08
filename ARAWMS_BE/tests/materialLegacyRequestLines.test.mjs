import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import supertest from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import CounterSequence from '../src/models/CounterSequence.model.js';
import MaterialTicket from '../src/models/MaterialTicket.model.js';
import RawMaterial from '../src/models/RawMaterial.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import { createSupplierReceipt, confirmSupplierReceipt, getSupplierReceipt } from '../src/modules/raw-material-warehousing/inbound-execution/supplierReceipt.service.js';
import { getMaterialReceipt } from '../src/modules/raw-material-warehousing/inbound-execution/inboundExecution.service.js';
import { listMaterialPutawayTasks, verifyMaterialPutawayLocation,
  scanMaterialPutawayTask } from '../src/modules/warehouse-management/location-layout/materialPutaway.service.js';

test('legacy multi-material request keeps material IDs when creating its stock receipt', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  try {
    const user = { _id: new mongoose.Types.ObjectId(), fullName: 'Warehouse manager',
      roles: ['OWNER'], warehouseIds: [] };
    const quantities = [200, 600, 3000];
    const materials = await RawMaterial.create([
      { materialCode: 'LEGACY-REQUEST-A', materialName: 'Needle A', materialType: 'AUXILIARY',
        category: 'NEEDLE', unit: 'BOX', unitCost: 2 },
      { materialCode: 'LEGACY-REQUEST-B', materialName: 'Thread B', materialType: 'AUXILIARY',
        category: 'THREAD', unit: 'SPOOL', unitCost: 3 },
      { materialCode: 'LEGACY-REQUEST-C', materialName: 'Zipper C', materialType: 'AUXILIARY',
        category: 'ZIPPER', unit: 'PIECE', unitCost: 4 },
    ]);
    const bins = await WarehouseLocation.create(materials.map((material, index) => ({
      locationCode: `A-LEGACY-REQUEST-${index + 1}`,
      barcode: `LOC-A-LEGACY-REQUEST-${index + 1}`,
      warehouseType: 'RAW_MATERIAL', layoutBin: true,
      zoneCode: 'A', rackCode: 'A', shelfCode: String(index + 1),
      maxCapacity: quantities[index] + 100, capacityUnit: material.unit,
    })));
    await CounterSequence.create([{ sequenceKey: 'MATERIAL_INBOUND_TICKET', seq: 6 },
      { sequenceKey: 'MATERIAL_SUPPLIER_RECEIPT', seq: 5 }]);
    const source = await MaterialTicket.create({ ticketCode: 'PNNL-000006',
      ticketType: 'INBOUND_FROM_PLAN', status: 'READY_TO_CONFIRM', createdByManagerId: user._id,
      receiptLines: materials.map((material, index) => ({
        clientLineId: `LINE-${index + 1}-LEGACY`, rawMaterialId: material._id,
        actualQty: quantities[index], acceptedQty: quantities[index],
        inspectedByUserId: user._id, inspectedAt: new Date('2026-11-01'),
        inspectionConclusion: 'Checked',
      })) });
    const receipt = await createSupplierReceipt({ receiptSource: 'DIRECT',
      draftKey: 'legacy-multi-material-request', inboundRequestId: source._id,
      receivedAt: '2026-11-01', receivingLocationId: bins[0]._id,
      purchasedByName: user.fullName, receiptLines: materials.map((material, index) => ({
        clientLineId: `LINE-${index + 1}-LEGACY`, requestLineId: `LINE-${index + 1}-LEGACY`,
        rawMaterialId: material._id, actualQty: quantities[index], acceptedQty: quantities[index],
        rejectedQty: 0, pendingQty: 0, inspectionConclusion: 'Checked',
        inspectedByUserId: user._id, inspectedAt: '2026-11-01',
        lots: [{ clientLineId: `LOT-${index + 1}`,
          countedQty: quantities[index], quality: 'ACCEPTED',
          packageCount: 0, unitsPerPackage: 0,
          allocations: [{ locationId: bins[index]._id, quantity: quantities[index] }] }],
      })) }, user);
    assert.equal(receipt.status, 'READY_TO_CONFIRM');
    assert.equal(receipt.ticketCode, 'PNNL-000007');
    assert.deepEqual(receipt.receiptLines.map((line) => String(line.rawMaterialId)),
      materials.map((material) => String(material._id)));
    const details = await getSupplierReceipt(receipt._id, user);
    assert.deepEqual(details.receipt.receiptLines.map((line) => String(line.inspectedByUserId)),
      materials.map(() => String(user._id)));
    // Older detail responses populated missing users to null, then a draft save erased these IDs.
    const damagedDraft = await MaterialTicket.findById(receipt._id);
    damagedDraft.receiptLines.forEach((line) => { line.inspectedByUserId = undefined; });
    await damagedDraft.save();
    await confirmSupplierReceipt(receipt._id,
      { expectedVersion: receipt.receiptVersion, idempotencyKey: 'legacy-request-confirm' }, user);
    const confirmed = await MaterialTicket.findById(receipt._id).lean();
    assert.deepEqual(confirmed.receiptLines.map((line) => String(line.inspectedByUserId)),
      materials.map(() => String(user._id)));
    const updated = await MaterialTicket.findById(source._id).lean();
    assert.equal(updated.requestStatus, 'COMPLETED');
    assert.deepEqual(updated.requestLines.map((line) => line.receivedQty), quantities);
    const tasks = (await listMaterialPutawayTasks(user)).filter((item) => item.receiptId === String(receipt._id));
    assert.equal(tasks.length, 3);
    const queueResponse = await supertest(app).get('/api/warehouse-putaway/material-tasks');
    assert.equal(queueResponse.status, 200);
    assert.equal(queueResponse.body.data.tasks.filter((item) => item.receiptId === String(receipt._id)).length, 3);
    assert.deepEqual(tasks.map((item) => item.remainingQuantity), quantities);
    const first = tasks[0];
    await assert.rejects(verifyMaterialPutawayLocation(user, {
      receiptId: first.receiptId, objectBarcode: first.objectBarcode,
      plannedLocationId: first.locationId, locationId: first.locationId,
      barcode: bins[1].barcode,
    }), { code: 'WRONG_LOCATION' });
    await verifyMaterialPutawayLocation(user, {
      receiptId: first.receiptId, objectBarcode: first.objectBarcode,
      plannedLocationId: first.locationId, locationId: first.locationId,
      barcode: first.locationBarcode,
    });
    const scan = { receiptId: first.receiptId, objectBarcode: first.objectBarcode,
      scannedBarcode: first.objectBarcode, locationId: first.locationId,
      locationBarcode: first.locationBarcode, quantity: first.remainingQuantity,
      idempotencyKey: 'legacy-request-putaway-001' };
    await assert.rejects(scanMaterialPutawayTask(user, { ...scan, scannedBarcode: tasks[1].objectBarcode }),
      { code: 'WRONG_MATERIAL' });
    assert.equal((await scanMaterialPutawayTask(user, scan)).alreadyProcessed, false);
    assert.equal((await scanMaterialPutawayTask(user, scan)).alreadyProcessed, true);
    assert.equal((await listMaterialPutawayTasks(user)).filter((item) => item.receiptId === String(receipt._id)).length, 2);
    const orphan = await MaterialTicket.collection.insertOne({ ticketCode: 'PNNL-ORPHAN-PLAN',
      ticketType: 'INBOUND_FROM_PLAN', status: 'COMPLETED', isDeleted: false,
      inboundPlanId: new mongoose.Types.ObjectId(), items: [] });
    const historical = await getMaterialReceipt(orphan.insertedId);
    assert.equal(historical.receipt.ticketCode, 'PNNL-ORPHAN-PLAN');
    assert.equal(historical.plan, null);
  } finally {
    await mongoose.disconnect();
    await repl.stop();
  }
});
