/*
 * File: warehouseCollectionMerge.test.mjs
 * Description: Exercises QR compatibility and server-authoritative packing claims after collection consolidation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Writable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import SalesOrder from '../src/models/SalesOrder.model.js';
import OrderQrToken from '../src/models/OrderQrToken.js';
import ProductUnit from '../src/models/ProductUnit.js';
import PackingSession from '../src/models/PackingSession.js';
import PackingScanEvent from '../src/models/PackingScanEvent.js';
import PackingVideo from '../src/models/PackingVideo.js';
import Sku from '../src/models/Sku.model.js';
import FinishedGoodsBatch from '../src/models/FinishedGoodsBatch.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import { listShippingOrders } from '../src/modules/shipping/shipping.service.js';
import { syncPackingVideo } from '../src/modules/order-fulfillment/packing-verification/packingVideo.service.js';
import { issueQr, replaceQr, listOrdersForQr, resolveQr } from '../src/modules/order-fulfillment/order-qr-management/orderQrManagement.service.js';
import { scanProductBarcodeForPacking, removeScannedBarcodeFromPacking,
  discardPackingAttempt } from '../src/modules/order-fulfillment/packing-verification/packingVerification.service.js';

const oid = () => new mongoose.Types.ObjectId();
const makeOrder = async (code, token) => {
  const _id = oid();
  const skuId = oid();
  const batchId = oid();
  const locationId = oid();
  const now = new Date();
  await SalesOrder.collection.insertOne({ _id, orderCode: code, status: 'CONFIRMED_RESERVED',
    sellerId: oid(), customerId: oid(), createdAt: now, updatedAt: now,
    items: [{ skuId, skuCode: `${code}-SKU`, skuBarcode: `${code}-SKU`, orderedQty: 1,
      unitSalePrice: 10, fifoPickList: [{ batchId, locationId, allocatedQty: 1 }] }],
    financialSummary: { itemsSubtotal: 10, totalOrderAmount: 10, expectedCodAmount: 10 },
    ...(token ? { qr: { token, revokedAt: null, issuedBy: oid() } } : {}) });
  return { _id, skuId, batchId, locationId, updatedAt: now };
};

test('embedded QR supersedes a stale legacy token while legacy-only orders remain readable', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  const oldCloudinary = [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY,
    process.env.CLOUDINARY_API_SECRET];
  [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY,
    process.env.CLOUDINARY_API_SECRET] = ['test-cloud', 'test-key', 'test-secret'];
  const originalUpload = cloudinary.uploader.upload_stream;
  const originalDestroy = cloudinary.uploader.destroy;
  cloudinary.uploader.upload_stream = (options, callback) => new Writable({
    write(_chunk, _encoding, done) { done(); },
    final(done) { callback(null, { public_id: options.public_id }); done(); },
  });
  cloudinary.uploader.destroy = async () => ({ result: 'ok' });
  try {
    const currentToken = 'a'.repeat(64);
    const oldToken = 'b'.repeat(64);
    const order = await makeOrder('QR-MERGE-1', currentToken);
    await OrderQrToken.create({ orderId: order._id, token: oldToken, issuedBy: oid() });
    assert.equal((await resolveQr(`PACK:v1:${currentToken}`)).order.orderCode, 'QR-MERGE-1');
    assert.equal((await resolveQr(`PACK:v1:${oldToken}`)).error, 'QR_NOT_FOUND');
    const listed = await listOrdersForQr({ _id: oid(), roles: ['ADMIN'] });
    assert.equal(listed.find((row) => row.orderCode === 'QR-MERGE-1').hasQr, true);
    const oldOnly = await makeOrder('QR-MERGE-2');
    await OrderQrToken.create({ orderId: oldOnly._id, token: 'c'.repeat(64), issuedBy: oid(),
      qrImagePublicId: 'qr/legacy' });
    assert.equal((await resolveQr(`PACK:v1:${'c'.repeat(64)}`)).order.orderCode, 'QR-MERGE-2');
    const issued = await issueQr({ _id: oldOnly._id, orderCode: 'QR-MERGE-2',
      status: 'CONFIRMED_RESERVED' }, oid());
    assert.equal(issued.qrValue, `PACK:v1:${'c'.repeat(64)}`);
    assert.equal((await SalesOrder.findById(oldOnly._id).select('+qr.token')).qr.token, 'c'.repeat(64));
    assert.equal((await SalesOrder.findById(oldOnly._id)).updatedAt.getTime(), oldOnly.updatedAt.getTime());
    const fresh = await makeOrder('QR-MERGE-3');
    const firstQr = await issueQr({ _id: fresh._id, orderCode: 'QR-MERGE-3',
      status: 'CONFIRMED_RESERVED' }, oid());
    assert.equal((await resolveQr(firstQr.qrValue)).order.orderCode, 'QR-MERGE-3');
    const nextQr = await replaceQr({ _id: fresh._id, orderCode: 'QR-MERGE-3',
      status: 'CONFIRMED_RESERVED' }, oid());
    assert.notEqual(nextQr.qrValue, firstQr.qrValue);
    assert.equal((await resolveQr(firstQr.qrValue)).error, 'QR_NOT_FOUND');
    assert.equal((await resolveQr(nextQr.qrValue)).order.orderCode, 'QR-MERGE-3');
    assert.equal((await SalesOrder.findById(fresh._id)).updatedAt.getTime(), fresh.updatedAt.getTime());
  } finally {
    cloudinary.uploader.upload_stream = originalUpload;
    cloudinary.uploader.destroy = originalDestroy;
    [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY,
      process.env.CLOUDINARY_API_SECRET] = oldCloudinary;
    await mongoose.disconnect();
    await repl.stop();
  }
});

test('one physical barcode can be claimed, reversed, and claimed by another session', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  try {
    const first = await makeOrder('PACK-MERGE-1');
    const second = await makeOrder('PACK-MERGE-2');
    await ProductUnit.create({ barcode: 'UNIT-MERGE-001', barcodeFormat: 'CODE_128',
      skuId: first.skuId, warehouseId: first.locationId, batchId: first.batchId });
    const operatorId = oid();
    const stationId = 'station_001';
    const makeSession = async (order, station) => PackingSession.create({ orderKey: String(order._id),
      orderId: order._id, orderVersion: order.updatedAt, operatorId, stationId: station,
      leaseUntil: new Date(Date.now() + 120_000), leaseVersion: 1, items: [{ lineKey: '0',
        skuId: first.skuId, quantity: 1, pickAllocations: [{ batchId: first.batchId,
          locationId: first.locationId, allocatedQty: 1 }] }] });
    const session1 = await makeSession(first, stationId);
    const session2 = await makeSession(second, 'station_002');
    const scan = (session, station, clientEventId) => scanProductBarcodeForPacking({
      sessionId: String(session._id), stationId: station, leaseVersion: 1,
      clientEventId, barcode: 'UNIT-MERGE-001',
    });
    assert.equal((await scan(session1, stationId, 'event_000001')).result, 'ACCEPTED');
    assert.equal((await scan(session1, stationId, 'event_000001')).duplicate, true);
    // A different order's reserved snapshot still cannot take the same physical unit.
    assert.equal((await scan(session2, 'station_002', 'event_000002')).reason, 'BARCODE_ASSIGNED_OTHER_ORDER');
    assert.equal((await ProductUnit.findOne({ barcode: 'UNIT-MERGE-001' })).packingClaim.sessionId.toString(), String(session1._id));
    await removeScannedBarcodeFromPacking({ sessionId: String(session1._id), stationId,
      leaseVersion: 1, barcode: 'UNIT-MERGE-001' });
    assert.equal((await ProductUnit.findOne({ barcode: 'UNIT-MERGE-001' })).packingClaim, undefined);
    assert.equal((await PackingScanEvent.findOne({ sessionId: session1._id, clientEventId: 'event_000001' })).reversedAt instanceof Date, true);
    assert.equal((await scan(session2, 'station_002', 'event_000003')).result, 'ACCEPTED');
    await discardPackingAttempt(String(session2._id), 'station_002', 1);
    assert.equal((await ProductUnit.findOne({ barcode: 'UNIT-MERGE-001' })).packingClaim, undefined);
    const third = await makeOrder('PACK-MERGE-3');
    const session3 = await makeSession(third, 'station_003');
    const raced = await Promise.allSettled([
      scan(session1, stationId, 'event_000004'),
      scan(session3, 'station_003', 'event_000005'),
    ]);
    assert.equal(raced.filter((entry) => entry.status === 'fulfilled' && entry.value.result === 'ACCEPTED').length, 1);
    assert.equal(raced.filter((entry) => entry.status === 'fulfilled' &&
      entry.value.reason === 'BARCODE_ASSIGNED_OTHER_ORDER').length, 1);
    assert.equal(await ProductUnit.countDocuments({ barcode: 'UNIT-MERGE-001',
      'packingClaim.sessionId': { $exists: true } }), 1);
  } finally {
    await mongoose.disconnect();
    await repl.stop();
  }
});

test('shipping sees a completed embedded video and still accepts a completed legacy recording', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  try {
    const first = await makeOrder('VIDEO-MERGE-1');
    const second = await makeOrder('VIDEO-MERGE-2');
    await SalesOrder.updateMany({ _id: { $in: [first._id, second._id] } }, { $set: { status: 'PACKED' } });
    const base = (order) => ({ orderKey: String(order._id), orderId: order._id,
      operatorId: oid(), stationId: `station_${String(order._id).slice(-8)}`,
      leaseUntil: new Date(0), leaseVersion: 1, state: 'READY_TO_RECORD',
      items: [{ lineKey: '0', skuId: order.skuId, skuCode: 'VIDEO-SKU', quantity: 1 }],
      scannedUnits: [{ barcode: `UNIT-${String(order._id).slice(-8)}`, lineKey: '0', scannedAt: new Date() }] });
    const embedded = await PackingSession.create({ ...base(first), recordingId: 'video_merge_001',
      video: { recordingId: 'video_merge_001', publicId: 'video/one', url: 'https://example.com/one',
        status: 'COMPLETED' } });
    const legacy = await PackingSession.create({ ...base(second),
      video: { recordingId: 'video_merge_002', publicId: 'video/two', url: 'https://example.com/two' } });
    await PackingVideo.create({ recordingId: 'video_merge_002', sessionId: legacy._id,
      orderId: String(second._id), cloudinaryPublicId: 'video/two', cloudinaryAssetId: 'asset-two',
      cloudinaryUrl: 'https://example.com/two', mimeType: 'video/mp4', fileSize: 2,
      durationMs: 1000, status: 'COMPLETED', uploadedAt: new Date() });
    let rows = await listShippingOrders();
    assert.deepEqual(new Set(rows.map((row) => row.orderCode)), new Set(['VIDEO-MERGE-1', 'VIDEO-MERGE-2']));
    await PackingSession.updateOne({ _id: embedded._id }, { $unset: { 'video.status': '' } });
    rows = await listShippingOrders();
    assert.deepEqual(rows.map((row) => row.orderCode), ['VIDEO-MERGE-2']);
  } finally {
    await mongoose.disconnect();
    await repl.stop();
  }
});

test('a staged session video completes packing once and remains idempotent on retry', async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  const oldCloudinary = [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY,
    process.env.CLOUDINARY_API_SECRET];
  [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY,
    process.env.CLOUDINARY_API_SECRET] = ['test-cloud', 'test-key', 'test-secret'];
  try {
    const order = await makeOrder('VIDEO-COMPLETE-1');
    const location = await WarehouseLocation.create({ _id: order.locationId,
      locationCode: 'FG-VIDEO-01', barcode: 'LOC-FG-VIDEO-01', warehouseType: 'FINISHED_GOODS',
      zoneCode: 'FG', rackCode: 'A', shelfCode: '01', maxCapacity: 10, currentOccupancy: 1 });
    const sku = await Sku.create({ _id: order.skuId, skuCode: 'VIDEO-COMPLETE-SKU',
      skuBarcode: 'SKU-VIDEO-COMPLETE', productId: oid(), styleName: 'Video test',
      color: 'Black', size: 'M', retailPrice: 10, onHandQty: 1, reservedQty: 1 });
    const batch = await FinishedGoodsBatch.create({ _id: order.batchId, batchCode: 'VIDEO-COMPLETE-BATCH',
      skuId: sku._id, skuBarcode: sku.skuBarcode, locationId: location._id,
      initialQty: 1, currentOnHandQty: 1, reservedPickQty: 1, fifoInboundTimestamp: new Date() });
    await ProductUnit.create({ barcode: 'UNIT-VIDEO-COMPLETE', barcodeFormat: 'CODE_128',
      skuId: sku._id, warehouseId: location._id, batchId: batch._id });
    const session = await PackingSession.create({ orderKey: String(order._id), orderId: order._id,
      orderVersion: order.updatedAt, operatorId: oid(), stationId: 'station_video_01',
      leaseUntil: new Date(Date.now() + 120_000), leaseVersion: 1, state: 'READY_TO_RECORD',
      items: [{ lineKey: '0', skuId: sku._id, skuCode: sku.skuCode, quantity: 1,
        pickAllocations: [{ batchId: batch._id, locationId: location._id, allocatedQty: 1 }] }],
      scannedUnits: [{ barcode: 'UNIT-VIDEO-COMPLETE', lineKey: '0', batchId: batch._id,
        scannedAt: new Date() }], recordingId: 'video_complete_001',
      pendingVideo: { recordingId: 'video_complete_001', cloudinaryPublicId: 'video/complete',
        cloudinaryAssetId: 'asset-complete', cloudinaryUrl: 'https://example.com/complete.mp4',
        mimeType: 'video/mp4', fileSize: 100, durationMs: 1000, uploadedAt: new Date() } });
    assert.equal((await PackingSession.findById(session._id)).pendingVideo.recordingId, 'video_complete_001');
    const first = await syncPackingVideo({ sessionId: String(session._id), recordingId: 'video_complete_001' });
    assert.equal(first.status, 'COMPLETED');
    assert.equal((await SalesOrder.findById(order._id)).status, 'PACKED');
    assert.equal((await PackingSession.findById(session._id)).video.status, 'COMPLETED');
    assert.equal((await ProductUnit.findOne({ barcode: 'UNIT-VIDEO-COMPLETE' })).inventoryStatus, 'UNAVAILABLE');
    assert.equal(await InventoryTransaction.countDocuments({ referenceId: order._id }), 1);
    const retry = await syncPackingVideo({ sessionId: String(session._id), recordingId: 'video_complete_001' });
    assert.equal(retry.status, 'COMPLETED');
    assert.equal(await InventoryTransaction.countDocuments({ referenceId: order._id }), 1);
  } finally {
    [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY,
      process.env.CLOUDINARY_API_SECRET] = oldCloudinary;
    await mongoose.disconnect();
    await repl.stop();
  }
});
