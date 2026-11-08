import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import MaterialTicket from '../src/models/MaterialTicket.model.js';
import RawMaterial from '../src/models/RawMaterial.model.js';
import FabricRoll from '../src/models/FabricRoll.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import RemnantRecoveryRequest from '../src/models/RemnantRecoveryRequest.model.js';
import { lookupRemnantSources, submitRemnantReturn, confirmRemnantReturn,
  closeRemnantReturn } from '../src/modules/garment-technical/remnant-recovery/remnantReturn.service.js';
import { confirmMaterialPutaway, getMaterialReceiptLabels } from '../src/modules/raw-material-warehousing/inbound-execution/inboundExecution.service.js';

test('confirmed issue limits returns and only warehouse confirmation credits stock', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  try {
    const technician = { _id: new mongoose.Types.ObjectId(), roles: ['GARMENT_TECHNICIAN'] };
    const manager = { _id: new mongoose.Types.ObjectId(), roles: ['WAREHOUSE_MANAGER'], warehouseIds: [] };
    const location = await WarehouseLocation.create({ locationCode: 'RETURN-A-01', barcode: 'LOC-RETURN-A-01',
      warehouseType: 'RAW_MATERIAL', zoneCode: 'A', rackCode: 'A', shelfCode: '01',
      maxCapacity: 1000, currentOccupancy: 0, status: 'ACTIVE' });
    const material = await RawMaterial.create({ materialCode: 'RETURN-FABRIC', materialName: 'Vải trả kiểm thử',
      materialType: 'FABRIC', category: 'FABRIC_ROLL', unit: 'METER', unitCost: 10, onHandQty: 0 });
    const roll = await FabricRoll.create({ rollBarcode: 'CV-001', rawMaterialId: material._id,
      inboundTicketId: new mongoose.Types.ObjectId(), initialLengthMeters: 100,
      currentLengthMeters: 0, unitCostPerMeter: 10, locationId: location._id,
      fifoInboundTimestamp: new Date(), status: 'DEPLETED' });
    const ticket = await MaterialTicket.create({ ticketCode: 'PX-CV-001', ticketType: 'OUTBOUND_WAREHOUSE',
      status: 'COMPLETED', warehouseCode: 'A', issueDate: new Date(),
      createdByManagerId: manager._id, createdByUserId: manager._id,
      lines: [{ rawMaterialId: material._id, materialCode: material.materialCode,
        materialName: material.materialName, unit: 'METER', quantity: 100,
        sources: [{ kind: 'ROLL', objectId: roll._id, barcode: roll.rollBarcode,
          locationId: location._id, quantity: 100 }] }] });
    const secondRoll = await FabricRoll.create({ rollBarcode: 'CV-002', rawMaterialId: material._id,
      inboundTicketId: new mongoose.Types.ObjectId(), initialLengthMeters: 40,
      currentLengthMeters: 0, unitCostPerMeter: 10, locationId: location._id,
      fifoInboundTimestamp: new Date(), status: 'DEPLETED' });
    ticket.lines.push({ rawMaterialId: material._id, materialCode: material.materialCode,
      materialName: material.materialName, unit: 'METER', quantity: 40,
      sources: [{ kind: 'ROLL', objectId: secondRoll._id, barcode: secondRoll.rollBarcode,
        locationId: location._id, quantity: 40 }] });
    await ticket.save();
    const base = { barcode: roll.rollBarcode, outboundTicketId: ticket._id,
      outboundLineIndex: 0, outboundSourceIndex: 0 };
    const source = await lookupRemnantSources('CV-001', ticket._id);
    assert.equal(source.issues[0].issuedLengthMeters, 100);
    assert.equal(source.issues[0].availableLengthMeters, 100);
    assert.equal((await lookupRemnantSources('CV-002', ticket._id)).issues[0].issuedLengthMeters, 40);
    const legacyRoll = await FabricRoll.create({ rollBarcode: 'CV-LEGACY', rawMaterialId: material._id,
      inboundTicketId: new mongoose.Types.ObjectId(), initialLengthMeters: 50,
      currentLengthMeters: 0, unitCostPerMeter: 10, locationId: location._id,
      fifoInboundTimestamp: new Date(), status: 'DEPLETED' });
    const legacyIssue = await MaterialTicket.create({ ticketCode: 'PX-LEGACY-A',
      ticketType: 'OUTBOUND_FOR_CUTTING', status: 'COMPLETED',
      createdByManagerId: manager._id, createdByUserId: manager._id,
      items: [{ rawMaterialId: material._id, fabricRollId: legacyRoll._id,
        rollBarcode: legacyRoll.rollBarcode, designatedFifoLocationId: location._id,
        expectedQty: 50, scannedQty: 7.125, isScannedCompleted: true }] });
    await MaterialTicket.create({ ticketCode: 'PX-LEGACY-B',
      ticketType: 'OUTBOUND_FOR_CUTTING', status: 'COMPLETED',
      createdByManagerId: manager._id, createdByUserId: manager._id,
      items: [{ rawMaterialId: material._id, fabricRollId: legacyRoll._id,
        rollBarcode: legacyRoll.rollBarcode, designatedFifoLocationId: location._id,
        expectedQty: 10, scannedQty: 4, isScannedCompleted: true }] });
    const legacySources = await lookupRemnantSources('CV-LEGACY');
    assert.equal(legacySources.issues.length, 2);
    assert.equal(legacySources.issues.find((issue) => issue.outboundTicketCode === 'PX-LEGACY-A')
      .issuedLengthMeters, 7.125);
    assert.equal((await lookupRemnantSources('CV-LEGACY', legacyIssue._id)).issues.length, 1);
    await assert.rejects(submitRemnantReturn({ barcode: 'CV-LEGACY',
      outboundTicketId: legacyIssue._id, outboundLineIndex: 0, outboundSourceIndex: 0,
      operationKey: 'legacy-over-issued-001', measuredRemnantLengthMeters: 8 }, technician),
    { code: 'RETURN_EXCEEDS_ISSUE' });
    await assert.rejects(lookupRemnantSources('UNKNOWN'), { code: 'ROLL_NOT_FOUND' });
    await assert.rejects(submitRemnantReturn({ ...base, operationKey: 'return-empty-001',
      measuredRemnantLengthMeters: '' }, technician), { code: 'INVALID_RETURN' });
    await assert.rejects(submitRemnantReturn({ ...base, operationKey: 'return-zero-001',
      measuredRemnantLengthMeters: 0 }, technician), { code: 'INVALID_RETURN' });
    await assert.rejects(submitRemnantReturn({ ...base, operationKey: 'return-piece-precision-001',
      measuredRemnantLengthMeters: 3, returnKind: 'SEPARATE_PIECES',
      pieces: [{ lengthMeters: 1.0004 }, { lengthMeters: 1.9996 }] }, technician),
    { code: 'INVALID_RETURN' });
    await assert.rejects(submitRemnantReturn({ ...base, outboundLineIndex: 1,
      operationKey: 'return-wrong-line-001', measuredRemnantLengthMeters: 20 }, technician),
    { code: 'SOURCE_NOT_IN_ISSUE' });
    const first = await submitRemnantReturn({ ...base, operationKey: 'return-original-001',
      measuredRemnantLengthMeters: 20, returnKind: 'ORIGINAL_ROLL' }, technician);
    assert.equal(first.recovery.status, 'WAITING_WAREHOUSE_CONFIRMATION');
    assert.equal((await RawMaterial.findById(material._id)).onHandQty, 0);
    assert.equal((await FabricRoll.findById(roll._id)).currentLengthMeters, 0);
    assert.equal((await submitRemnantReturn({ ...base, operationKey: 'return-original-001',
      measuredRemnantLengthMeters: 20 }, technician)).alreadyProcessed, true);
    await assert.rejects(submitRemnantReturn({ ...base, operationKey: 'return-original-001',
      measuredRemnantLengthMeters: 19 }, technician), { code: 'OPERATION_CONFLICT' });
    await assert.rejects(submitRemnantReturn({ ...base, operationKey: 'return-too-much-001',
      measuredRemnantLengthMeters: 81 }, technician), { code: 'RETURN_EXCEEDS_ISSUE' });
    await assert.rejects(confirmRemnantReturn(first.recovery._id,
      { barcode: 'OTHER', lengthMeters: 20 }, manager), { code: 'BARCODE_MISMATCH' });
    const confirmed = await confirmRemnantReturn(first.recovery._id,
      { barcode: 'CV-001', lengthMeters: 20 }, manager);
    assert.equal((await RawMaterial.findById(material._id)).onHandQty, 20);
    assert.equal((await RawMaterial.findById(material._id)).pendingPutawayQty, 20);
    assert.equal((await FabricRoll.findById(roll._id)).currentLengthMeters, 20);
    assert.equal((await FabricRoll.findById(roll._id)).rollBarcode, 'CV-001');
    assert.deepEqual((await getMaterialReceiptLabels(confirmed.receiptId, manager)).labels
      .map((item) => item.barcode), ['CV-001']);
    assert.equal((await confirmRemnantReturn(first.recovery._id,
      { barcode: 'CV-001', lengthMeters: 20 }, manager)).alreadyProcessed, true);
    await confirmMaterialPutaway(confirmed.receiptId, { objectBarcode: 'CV-001',
      locationBarcode: location.barcode, idempotencyKey: 'return-putaway-001' }, manager);
    assert.equal((await RemnantRecoveryRequest.findById(first.recovery._id)).status, 'RESTOCKED');
    const second = await submitRemnantReturn({ ...base, operationKey: 'return-piece-001',
      measuredRemnantLengthMeters: 20, returnKind: 'SEPARATE_PIECES',
      pieces: [{ lengthMeters: 8 }, { lengthMeters: 12 }] }, technician);
    const doubleConfirm = await Promise.allSettled([1, 2].map(() =>
      confirmRemnantReturn(second.recovery._id,
        { barcode: 'CV-001', lengthMeters: 20 }, manager)));
    const split = doubleConfirm.find((item) => item.status === 'fulfilled' && item.value.rolls)?.value;
    assert.ok(split, 'one confirmation must create the receipt');
    assert.equal(await MaterialTicket.countDocuments({ remnantRequestId: second.recovery._id,
      ticketType: 'INBOUND_FROM_REMNANT' }), 1);
    assert.equal(split.rolls.length, 2);
    assert.notEqual(split.rolls[0].barcode, split.rolls[1].barcode);
    assert.equal((await FabricRoll.findById(roll._id)).currentLengthMeters, 20);
    assert.equal((await RawMaterial.findById(material._id)).onHandQty, 40);
    await confirmMaterialPutaway(split.receiptId, { objectBarcode: split.rolls[0].barcode,
      locationBarcode: location.barcode, idempotencyKey: 'return-piece-putaway-1' }, manager);
    await confirmMaterialPutaway(split.receiptId, { objectBarcode: split.rolls[1].barcode,
      locationBarcode: location.barcode, idempotencyKey: 'return-piece-putaway-2' }, manager);
    assert.equal((await RemnantRecoveryRequest.findById(second.recovery._id)).status, 'RESTOCKED');
    assert.equal((await RawMaterial.findById(material._id)).pendingPutawayQty, 0);
    assert.equal((await FabricRoll.findById(roll._id)).currentLengthMeters, 20);
    const waiting = await submitRemnantReturn({ ...base, operationKey: 'return-pending-001',
      measuredRemnantLengthMeters: 5 }, technician);
    assert.equal((await lookupRemnantSources('CV-001', ticket._id)).issues[0].availableLengthMeters, 55);
    await closeRemnantReturn(waiting.recovery._id, 'CANCELLED', technician);
    assert.equal((await lookupRemnantSources('CV-001', ticket._id)).issues[0].availableLengthMeters, 60);
    const racing = await Promise.allSettled(['return-race-001', 'return-race-002'].map((operationKey) =>
      submitRemnantReturn({ ...base, operationKey,
        measuredRemnantLengthMeters: 40 }, technician)));
    assert.equal(racing.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal((await lookupRemnantSources('CV-001', ticket._id)).issues[0].availableLengthMeters, 20);
    const scrap = await submitRemnantReturn({ ...base, operationKey: 'return-scrap-001',
      measuredRemnantLengthMeters: 1 }, technician);
    assert.equal(scrap.recovery.status, 'SCRAPPED_BELOW_THRESHOLD');
    assert.equal(scrap.recovery.generatedInboundTicketId, undefined);
    await assert.rejects(submitRemnantReturn({ ...base, operationKey: 'return-after-scrap-001',
      measuredRemnantLengthMeters: 5 }, technician), { code: 'SCRAP_FINALIZED' });
  } finally { await mongoose.disconnect(); await repl.stop(); }
});
