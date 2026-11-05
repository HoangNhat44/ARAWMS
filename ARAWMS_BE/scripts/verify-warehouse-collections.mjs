/*
 * File: verify-warehouse-collections.mjs
 * Description: Checks migrated warehouse records, unique indexes, and unchanged order versions.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import MaterialOutbound from '../src/models/MaterialOutbound.model.js';
import MaterialTicket from '../src/models/MaterialTicket.model.js';
import OrderQrToken from '../src/models/OrderQrToken.js';
import SalesOrder from '../src/models/SalesOrder.model.js';
import ProductUnitAllocation from '../src/models/ProductUnitAllocation.js';
import ProductUnit from '../src/models/ProductUnit.js';
import PackingVideo from '../src/models/PackingVideo.js';
import PackingSession from '../src/models/PackingSession.js';

const backupDirectory = process.argv[2];
if (!backupDirectory || !process.env.MONGODB_URI) throw new Error('Backup directory and MONGODB_URI are required');
const id = (value) => String(value || '');
const check = (condition, message) => { if (!condition) throw new Error(message); };
await mongoose.connect(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false,
  serverSelectionTimeoutMS: 10_000 });
try {
  const counts = {};
  const outbounds = await MaterialOutbound.find().lean();
  counts.materialOutbounds = outbounds.length;
  for (const row of outbounds) {
    const target = await MaterialTicket.findById(row._id).lean();
    check(target?.ticketType === 'OUTBOUND_WAREHOUSE' && target.ticketCode === row.ticketCode &&
      target.status === row.status && target.lines.length === row.lines.length,
    `Outbound mismatch: ${row._id}`);
  }
  const qrTokens = await OrderQrToken.find().select('+token').lean();
  counts.orderQrTokens = qrTokens.length;
  for (const row of qrTokens) {
    const target = await SalesOrder.findById(row.orderId).select('+qr.token').lean();
    check(target?.qr?.token === row.token && id(target.qr.issuedBy) === id(row.issuedBy) &&
      id(target.qr.qrImagePublicId) === id(row.qrImagePublicId), `QR mismatch: ${row._id}`);
  }
  const allocations = await ProductUnitAllocation.find().lean();
  counts.productUnitAllocations = allocations.length;
  for (const row of allocations) {
    const unit = await ProductUnit.findOne({ barcode: row.barcode }).lean();
    check(id(unit?.packingClaim?.sessionId) === id(row.sessionId) &&
      unit.packingClaim.lineKey === row.lineKey, `Claim mismatch: ${row.barcode}`);
  }
  const videos = await PackingVideo.find().lean();
  counts.packingVideos = videos.length;
  for (const row of videos) {
    const session = await PackingSession.findById(row.sessionId).lean();
    check(session?.recordingId === row.recordingId, `Recording mismatch: ${row.recordingId}`);
    if (row.status === 'COMPLETED') check(session.video?.status === 'COMPLETED' &&
      session.video.publicId === row.cloudinaryPublicId, `Completed video mismatch: ${row.recordingId}`);
    else check(session.pendingVideo?.recordingId === row.recordingId ||
      session.video?.status === 'COMPLETED', `Pending video mismatch: ${row.recordingId}`);
  }
  const originalOrders = (await readFile(path.join(backupDirectory, 'sales_orders.ejsonl'), 'utf8'))
    .split(/\r?\n/).filter(Boolean).map((line) => mongoose.mongo.BSON.EJSON.parse(line));
  for (const row of originalOrders) {
    const current = await SalesOrder.findById(row._id).select('updatedAt').lean();
    check(new Date(current?.updatedAt).getTime() === new Date(row.updatedAt).getTime(),
      `Order version changed: ${row._id}`);
  }
  const indexes = await Promise.all([MaterialTicket, SalesOrder, PackingSession]
    .map((model) => model.collection.listIndexes().toArray()));
  check(indexes[0].some((index) => index.unique && index.key?.confirmationKey === 1 &&
    index.partialFilterExpression?.ticketType === 'OUTBOUND_WAREHOUSE'), 'Outbound confirmation index missing');
  check(indexes[1].some((index) => index.unique && index.key?.['qr.token'] === 1), 'QR token index missing');
  check(indexes[2].some((index) => index.unique && index.key?.recordingId === 1), 'Recording ID index missing');
  console.log(JSON.stringify({ verified: true, sourceCounts: counts, orderVersionsUnchanged: originalOrders.length,
    uniqueIndexesPresent: true }));
} finally {
  await mongoose.disconnect();
}
