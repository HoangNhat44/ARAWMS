/*
 * File: materialOutbound.test.mjs
 * Description: Verifies draft isolation and atomic raw-material issue across a roll and accessory lot.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import RawMaterial from '../src/models/RawMaterial.model.js';
import FabricRoll from '../src/models/FabricRoll.model.js';
import MaterialStockLot from '../src/models/MaterialStockLot.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import { saveOutbound, checkOutboundSource, confirmOutbound } from '../src/modules/raw-material-warehousing/outbound-execution/outboundExecution.service.js';

test('a checked roll and lot deduct once; a draft does not reserve stock', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  try {
    const user = { _id: new mongoose.Types.ObjectId(), roles: ['WAREHOUSE_MANAGER'], warehouseIds: [] };
    const location = await WarehouseLocation.create({ locationCode: 'RAW-A-01', barcode: 'LOC-RAW-A-01',
      warehouseType: 'RAW_MATERIAL', zoneCode: 'RAW-A', rackCode: 'A', shelfCode: '01', maxCapacity: 1000,
      currentOccupancy: 150, status: 'ACTIVE' });
    const fabric = await RawMaterial.create({ materialCode: 'TEST-FABRIC', materialName: 'Vải kiểm thử',
      materialType: 'FABRIC', category: 'FABRIC_ROLL', unit: 'METER', unitCost: 20, onHandQty: 50 });
    const buttons = await RawMaterial.create({ materialCode: 'TEST-BUTTON', materialName: 'Cúc kiểm thử',
      materialType: 'AUXILIARY', category: 'BUTTON', unit: 'PIECE', unitCost: 2, onHandQty: 100 });
    const inboundTicketId = new mongoose.Types.ObjectId();
    const supplierId = new mongoose.Types.ObjectId();
    const roll = await FabricRoll.create({ rollBarcode: 'FR-OUTBOUND-TEST', rawMaterialId: fabric._id,
      inboundTicketId, initialLengthMeters: 50, currentLengthMeters: 50, unitCostPerMeter: 20,
      locationId: location._id, fifoInboundTimestamp: new Date('2026-01-01'), status: 'IN_STOCK' });
    const lot = await MaterialStockLot.create({ lotBarcode: 'ML-OUTBOUND-TEST', rawMaterialId: buttons._id,
      supplierId, inboundTicketId, clientLineId: 'test-lot', initialQty: 100, currentQty: 100,
      quality: 'ACCEPTED', status: 'IN_STOCK', fifoInboundTimestamp: new Date('2026-01-02'),
      allocations: [{ locationId: location._id, quantity: 100, putawayQty: 100 }] });
    const openLink = await request(app).get('/api/raw-material-outbound/options');
    assert.equal(openLink.status, 200);
    assert.equal(openLink.body.data.sources.length, 2);
    const draft = await saveOutbound(null, { warehouseCode: 'RAW-A', issueDate: '2026-11-04',
      department: 'Xưởng cắt', recipient: 'Nhân viên', purpose: 'Kiểm thử', lines: [
        { rawMaterialId: fabric._id, quantity: 20, sources: [{ objectId: roll._id, locationId: location._id, quantity: 20 }] },
        { rawMaterialId: buttons._id, quantity: 30, sources: [{ objectId: lot._id, locationId: location._id, quantity: 30 }] },
      ] }, user);
    assert.equal((await RawMaterial.findById(fabric._id)).onHandQty, 50);
    assert.equal((await FabricRoll.findById(roll._id)).currentLengthMeters, 50);
    await assert.rejects(confirmOutbound(draft._id, { confirmationKey: 'outbound-test-key', version: 0, reviewed: true }, user),
      { code: 'UNCHECKED_SOURCE' });
    await checkOutboundSource(draft._id, { barcode: roll.rollBarcode, quantity: 20 }, user);
    await checkOutboundSource(draft._id, { barcode: lot.lotBarcode, quantity: 30 }, user);
    await MaterialStockLot.updateOne({ _id: lot._id }, { $set: { currentQty: 10 } });
    await assert.rejects(confirmOutbound(draft._id, { confirmationKey: 'outbound-test-key', version: 2, reviewed: true }, user),
      { code: 'SOURCE_UNAVAILABLE' });
    assert.equal((await FabricRoll.findById(roll._id)).currentLengthMeters, 50);
    assert.equal((await RawMaterial.findById(fabric._id)).onHandQty, 50);
    await MaterialStockLot.updateOne({ _id: lot._id }, { $set: { currentQty: 100 } });
    const result = await confirmOutbound(draft._id, { confirmationKey: 'outbound-test-key', version: 2, reviewed: true }, user);
    assert.equal(result.status, 'COMPLETED');
    assert.equal((await FabricRoll.findById(roll._id)).currentLengthMeters, 30);
    assert.equal((await MaterialStockLot.findById(lot._id)).currentQty, 70);
    assert.equal((await RawMaterial.findById(fabric._id)).onHandQty, 30);
    assert.equal((await RawMaterial.findById(buttons._id)).onHandQty, 70);
    assert.equal((await WarehouseLocation.findById(location._id)).currentOccupancy, 100);
    assert.equal(await InventoryTransaction.countDocuments({ referenceId: draft._id }), 2);
    await confirmOutbound(draft._id, { confirmationKey: 'outbound-test-key', version: 2, reviewed: true }, user);
    assert.equal((await RawMaterial.findById(fabric._id)).onHandQty, 30);
    assert.equal(await InventoryTransaction.countDocuments({ referenceId: draft._id }), 2);
  } finally {
    await mongoose.disconnect();
    await repl.stop();
  }
});
