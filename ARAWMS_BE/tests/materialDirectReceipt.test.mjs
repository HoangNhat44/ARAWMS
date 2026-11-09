/* Verifies direct material purchases share receipt stock while staying independent of delivery plans. */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import supertest from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import { createTestToken } from './support/authSession.mjs';
import RawMaterial from '../src/models/RawMaterial.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import FabricRoll from '../src/models/FabricRoll.model.js';
import MaterialStockLot from '../src/models/MaterialStockLot.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import MaterialTicket from '../src/models/MaterialTicket.model.js';
import WarehouseStockBarcode from '../src/models/WarehouseStockBarcode.model.js';
import { createSupplierReceipt, confirmSupplierReceipt, listSupplierReceipts } from '../src/modules/raw-material-warehousing/inbound-execution/supplierReceipt.service.js';
import { createTechnicianInboundRequest, listTechnicianInboundRequests } from '../src/modules/raw-material-warehousing/inbound-execution/technicianInboundRequest.service.js';
import { confirmMaterialPutaway, getMaterialReceiptLabels, createReceiptLocation } from '../src/modules/raw-material-warehousing/inbound-execution/inboundExecution.service.js';

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
    const catalogCostDraft = await createSupplierReceipt({ ...payload, draftKey: 'direct-catalog-cost-test',
      receiptLines: [line('catalog', 2, undefined)] }, user);
    assert.equal(catalogCostDraft.receiptLines[0].unitCost, material.unitCost);
    await confirmSupplierReceipt(catalogCostDraft._id,
      { expectedVersion: 0, idempotencyKey: 'direct-catalog-cost-confirm' }, user);
    const { labels } = await getMaterialReceiptLabels(String(draft._id), user);
    assert.equal(labels.length, 2);
    assert.equal(new Set(labels.map((label) => label.barcode)).size, 2);
    assert.ok(labels.every((label) => /^NPL-\d{6}$/.test(label.barcode)));
    assert.equal(await WarehouseStockBarcode.countDocuments({ inboundTicketId: draft._id }), 2);
    assert.deepEqual(labels.map((label) => label.unitCost).sort(), [2, 3]);
    assert.deepEqual(labels.map((label) => label.remainingQuantity).sort(), [5, 7]);
    assert.ok(labels.every((label) => label.supplierName === payload.purchaseSourceName && label.receiptCode === draft.ticketCode));
    assert.ok(labels.every((label) => label.stockObjectId && label.sourceLineId));
    const otherSupplierDraft = await createSupplierReceipt({ ...payload, draftKey: 'direct-other-supplier-test',
      purchaseSourceName: 'Cá»­a hÃ ng phá»¥ liá»‡u B', receiptLines: [line('supplier-b', 2, 2)] }, user);
    await confirmSupplierReceipt(otherSupplierDraft._id,
      { expectedVersion: 0, idempotencyKey: 'direct-other-supplier-confirm' }, user);
    const otherSupplierLabels = (await getMaterialReceiptLabels(String(otherSupplierDraft._id), user)).labels;
    assert.equal(otherSupplierLabels.length, 1);
    assert.notEqual(otherSupplierLabels[0].barcode, labels[0].barcode);
    assert.equal(otherSupplierLabels[0].supplierName, 'Cá»­a hÃ ng phá»¥ liá»‡u B');
    await confirmMaterialPutaway(String(draft._id), { objectBarcode: labels[0].barcode,
      locationBarcode: bin.barcode, idempotencyKey: 'direct-putaway-test-001' }, user);
    assert.equal((await getMaterialReceiptLabels(String(draft._id), user)).labels[0].putawayComplete, true);
    const fabric = await RawMaterial.create({ materialCode: 'FABRIC-DIRECT-TEST', materialName: 'Test fabric',
      materialType: 'FABRIC', category: 'FABRIC_ROLL', unit: 'METER', unitCost: 10, widthCm: 150 });
    const meterBin = await WarehouseLocation.create({ locationCode: 'A-DIRECT-METER', barcode: 'LOC-A-DIRECT-METER',
      warehouseType: 'RAW_MATERIAL', layoutBin: true, zoneCode: 'A', rackCode: 'A', shelfCode: 'M1',
      maxCapacity: 1000, capacityUnit: 'METER' });
    const wrongUnitLine = line('wrong-unit', 1, 2);
    wrongUnitLine.lots[0].allocations = [{ locationId: meterBin._id, quantity: 1 }];
    const wrongUnitDraft = await createSupplierReceipt({ ...payload, draftKey: 'direct-wrong-unit-test',
      receiptLines: [wrongUnitLine] }, user);
    await assert.rejects(confirmSupplierReceipt(wrongUnitDraft._id,
      { expectedVersion: 0, idempotencyKey: 'direct-wrong-unit-confirm' }, user),
    (error) => error.code === 'LOCATION_UNIT_MISMATCH');
    const fabricDraft = await createSupplierReceipt({ ...payload, draftKey: 'direct-fabric-rolls-test',
      receiptLines: [{ clientLineId: 'fabric-line-test', rawMaterialId: fabric._id, unitCost: 10,
        actualQty: 12, acceptedQty: 12, rejectedQty: 0, pendingQty: 0, inspectionConclusion: 'ÄÃ£ kiá»ƒm tra',
        rolls: [5, 7].map((lengthMeters, index) => ({ clientLineId: `fabric-roll-${index}`,
          widthCm: 150, lengthMeters, quality: 'ACCEPTED', locationId: meterBin._id })) }] }, user);
    await confirmSupplierReceipt(fabricDraft._id,
      { expectedVersion: 0, idempotencyKey: 'direct-fabric-rolls-confirm' }, user);
    const fabricLabels = (await getMaterialReceiptLabels(String(fabricDraft._id), user)).labels;
    assert.equal(fabricLabels.length, 2);
    assert.equal(new Set(fabricLabels.map((label) => label.barcode)).size, 2);
    assert.ok(fabricLabels.every((label) => label.unit === 'METER'));
    assert.equal(await FabricRoll.countDocuments({ inboundTicketId: fabricDraft._id }), 2);
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
    const newBin = await createReceiptLocation({ locationCode: 'A-DIRECT-PIECE',
      warehouseType: 'RAW_MATERIAL', zoneCode: 'A', rackCode: 'B', shelfCode: '01',
      capacityUnit: 'PIECE', maxCapacity: 100 }, user);
    assert.equal(newBin.layoutBin, true);
  } finally { await mongoose.disconnect(); await repl.stop(); }
});

test('technician request advances only with confirmed accepted quantities', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  try {
    const technician = { _id: new mongoose.Types.ObjectId(), roleCode: 'GARMENT_TECHNICIAN' };
    const manager = { _id: new mongoose.Types.ObjectId(), fullName: 'Warehouse manager',
      roles: ['WAREHOUSE_MANAGER'], warehouseIds: [] };
    const token = await createTestToken('WAREHOUSE_MANAGER', { _id: manager._id });
    const material = await RawMaterial.create({ materialCode: 'BUTTON-REQUEST-TEST',
      materialName: 'Requested buttons', materialType: 'AUXILIARY', category: 'BUTTON',
      unit: 'PIECE', unitCost: 2 });
    const bin = await WarehouseLocation.create({ locationCode: 'A-REQ-01', barcode: 'LOC-A-REQ-01',
      warehouseType: 'RAW_MATERIAL', layoutBin: true, zoneCode: 'A', rackCode: 'A', shelfCode: '01',
      maxCapacity: 100, capacityUnit: 'PIECE' });
    const quarantine = await WarehouseLocation.create({ locationCode: 'DEF-REQ-01', barcode: 'LOC-DEF-REQ-01',
      warehouseType: 'DEFECT_QUARANTINE', zoneCode: 'DEF', rackCode: 'D', shelfCode: '01',
      maxCapacity: 100, capacityUnit: 'PIECE' });
    const request = await createTechnicianInboundRequest({ requestLines: [
      { rawMaterialId: material._id, requestedQty: 10 }], requestNote: 'Supplier delivery' }, technician);
    await MaterialTicket.collection.insertOne({ ticketCode: 'DEMO-PN-TEST-1',
      ticketType: 'INBOUND_FROM_PLAN', status: 'COMPLETED', isDeleted: false,
      items: [{ rawMaterialId: material._id, expectedQty: 8, scannedQty: 8 }] });
    await MaterialTicket.collection.insertOne({ ticketCode: 'LEGACY-ANY-CODE',
      ticketType: 'INBOUND_FROM_PLAN', status: 'DRAFT', isDeleted: false,
      receiptLines: [{ rawMaterialId: material._id, actualQty: 6, acceptedQty: 2 }] });
    assert.equal(request.status, 'WAITING_RECEIPT');
    const visibleRequests = await listTechnicianInboundRequests();
    assert.equal(visibleRequests.find((item) => item.ticketCode === 'DEMO-PN-TEST-1').legacyCompleted, true);
    assert.equal(visibleRequests.find((item) => item.ticketCode === 'DEMO-PN-TEST-1').requestLines[0].receivedQty, 8);
    assert.equal(visibleRequests.find((item) => item.ticketCode === 'LEGACY-ANY-CODE').requestLines[0].remainingQty, 6);
    const legacyId = visibleRequests.find((item) => item.ticketCode === 'LEGACY-ANY-CODE')._id;
    const legacyForm = await supertest(app).get(`/api/raw-material-inbound/legacy-receipts/${legacyId}`).auth(token, { type: 'bearer' });
    assert.equal(legacyForm.status, 200);
    assert.equal(legacyForm.body.data.receipt.ticketCode, 'LEGACY-ANY-CODE');
    await MaterialTicket.collection.insertMany(Array.from({ length: 102 }, (_, index) => ({
      ticketCode: index === 0 ? 'PNNL-000103' : index === 1 ? 'PNNL-000104' : `OTHER-CODE-${index}`,
      ticketType: 'INBOUND_FROM_SUPPLIER', status: index % 2 ? 'DRAFT' : 'COMPLETED',
      isDeleted: false, receiptLines: [{ rawMaterialId: material._id, acceptedQty: index + 1 }],
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, index)),
    })));
    const firstPage = await supertest(app).get('/api/raw-material-inbound/receipts').auth(token, { type: 'bearer' }).query({ page: 1 });
    const secondPage = await supertest(app).get('/api/raw-material-inbound/receipts').auth(token, { type: 'bearer' }).query({ page: 2 });
    assert.equal(firstPage.status, 200);
    assert.equal(secondPage.status, 200);
    assert.equal(firstPage.body.data.receipts.length, 100);
    assert.equal(secondPage.body.data.receipts.length, 2);
    assert.deepEqual(new Set([...firstPage.body.data.receipts, ...secondPage.body.data.receipts]
      .map((item) => item.ticketCode)).has('PNNL-000103'), true);
    assert.deepEqual(new Set([...firstPage.body.data.receipts, ...secondPage.body.data.receipts]
      .map((item) => item.ticketCode)).has('PNNL-000104'), true);
    assert.equal((await supertest(app).post('/api/raw-material-inbound/technician-requests')
      .send({ requestLines: [{ rawMaterialId: material._id, requestedQty: 10 }] })).status, 401);
    assert.equal((await listTechnicianInboundRequests())[0].requestLines[0].remainingQty, 10);
    const listed = await supertest(app).get('/api/raw-material-inbound/technician-requests').auth(token, { type: 'bearer' });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.requests[0].ticketCode, request.ticketCode);
    const payload = (suffix, quantity) => ({ receiptSource: 'DIRECT', inboundRequestId: request._id,
      draftKey: `request-draft-${suffix}`, receivedAt: '2026-10-01', receivingLocationId: bin._id,
      purchaseSourceName: 'Supplier A', purchasedByName: manager.fullName,
      receiptLines: [{ clientLineId: `request-line-${suffix}`, rawMaterialId: material._id,
        unitCost: 2, actualQty: quantity, acceptedQty: quantity, rejectedQty: 0, pendingQty: 0,
        inspectionConclusion: 'Checked', lots: [{ clientLineId: `request-lot-${suffix}`,
          countedQty: quantity, quality: 'ACCEPTED', allocations: [{ locationId: bin._id, quantity }] }] }] });
    const firstPayload = payload('first', 4);
    firstPayload.receiptLines[0] = { ...firstPayload.receiptLines[0], actualQty: 5,
      acceptedQty: 4, rejectedQty: 1, defectReason: 'Damaged button', lots: [
        firstPayload.receiptLines[0].lots[0],
        { clientLineId: 'request-lot-first-rejected', countedQty: 1, quality: 'REJECTED',
          defectReason: 'Damaged button', allocations: [{ locationId: quarantine._id, quantity: 1 }] },
      ] };
    const first = await createSupplierReceipt(firstPayload, manager);
    await confirmSupplierReceipt(first._id, { expectedVersion: 0, idempotencyKey: 'request-confirm-first' }, manager);
    const linkedReceipts = await supertest(app).get('/api/raw-material-inbound/receipts').auth(token, { type: 'bearer' })
      .query({ inboundRequestId: String(request._id) });
    assert.equal(linkedReceipts.status, 200);
    assert.deepEqual(linkedReceipts.body.data.receipts.map((receipt) => receipt.ticketCode), [first.ticketCode]);
    await confirmSupplierReceipt(first._id, { expectedVersion: 0, idempotencyKey: 'request-confirm-first' }, manager);
    let saved = await MaterialTicket.findById(request._id);
    assert.equal(saved.status, 'PARTIALLY_RECEIVED');
    assert.equal(saved.requestLines[0].receivedQty, 4);
    await assert.rejects(createSupplierReceipt(payload('too-much', 7), manager),
      (error) => error.code === 'REQUEST_QUANTITY_EXCEEDED');
    const second = await createSupplierReceipt(payload('second', 6), manager);
    const stale = await createSupplierReceipt(payload('stale', 6), manager);
    await confirmSupplierReceipt(second._id, { expectedVersion: 0, idempotencyKey: 'request-confirm-second' }, manager);
    await assert.rejects(confirmSupplierReceipt(stale._id,
      { expectedVersion: 0, idempotencyKey: 'request-confirm-stale' }, manager),
    (error) => error.code === 'INBOUND_REQUEST_CLOSED');
    saved = await MaterialTicket.findById(request._id);
    assert.equal(saved.status, 'COMPLETED');
    assert.equal(saved.requestLines[0].receivedQty, 10);
    assert.equal((await RawMaterial.findById(material._id)).onHandQty, 10);
    assert.equal(await InventoryTransaction.countDocuments({ referenceModel: 'MaterialTicket',
      transactionType: 'INBOUND_RECEIPT', referenceId: { $in: [first._id, second._id] } }), 2);
    await assert.rejects(createSupplierReceipt(payload('after-full', 1), manager),
      (error) => error.code === 'INBOUND_REQUEST_CLOSED');
    const legacyDraft = await createSupplierReceipt({ ...payload('legacy', 6), inboundRequestId: legacyId }, manager);
    await confirmSupplierReceipt(legacyDraft._id,
      { expectedVersion: 0, idempotencyKey: 'legacy-request-confirm-once' }, manager);
    const fulfilledLegacy = await MaterialTicket.findById(legacyId);
    assert.equal(fulfilledLegacy.status, 'DRAFT');
    assert.equal(fulfilledLegacy.requestStatus, 'COMPLETED');
    assert.equal(fulfilledLegacy.requestLines[0].receivedQty, 6);
    assert.equal((await RawMaterial.findById(material._id)).onHandQty, 16);
    await assert.rejects(createSupplierReceipt({ ...payload('legacy-again', 1), inboundRequestId: legacyId }, manager),
      (error) => error.code === 'INBOUND_REQUEST_CLOSED');
    const stockedSource = await MaterialTicket.collection.insertOne({ ticketCode: 'LEGACY-STOCKED-SOURCE',
      ticketType: 'INBOUND_FROM_PLAN', status: 'READY_TO_CONFIRM', isDeleted: false,
      receiptLines: [{ rawMaterialId: material._id, actualQty: 1, acceptedQty: 1 }] });
    await MaterialStockLot.collection.insertOne({ lotBarcode: 'ML-LEGACY-STOCKED-SOURCE',
      inboundTicketId: stockedSource.insertedId });
    await assert.rejects(createSupplierReceipt({ ...payload('stocked-source', 1),
      inboundRequestId: stockedSource.insertedId }, manager),
    (error) => error.code === 'SOURCE_STOCK_ALREADY_RECORDED');
  } finally { await mongoose.disconnect(); await repl.stop(); }
});
