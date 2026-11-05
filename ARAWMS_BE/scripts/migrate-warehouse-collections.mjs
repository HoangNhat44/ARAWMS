/*
 * File: migrate-warehouse-collections.mjs
 * Description: Copies four legacy warehouse collections into their owning documents without deleting source data.
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

const apply = process.argv.includes('--apply');
const backupOption = process.argv.indexOf('--backup-dir');
const backupDirectory = backupOption >= 0 ? process.argv[backupOption + 1] : null;
if (apply && !backupDirectory) throw new Error('--apply requires --backup-dir pointing to a verified snapshot');
const id = (value) => String(value || '');
const fail = (message) => { throw new Error(message); };
const counts = {};

const migrateOutbounds = async () => {
  const rows = await MaterialOutbound.find().lean();
  counts.materialOutbounds = rows.length;
  for (const row of rows) {
    const current = await MaterialTicket.findById(row._id).lean();
    const codeOwner = await MaterialTicket.findOne({ ticketCode: row.ticketCode }).select('_id').lean();
    if (codeOwner && id(codeOwner._id) !== id(row._id)) fail(`Ticket code collision: ${row.ticketCode}`);
    if (current) {
      if (current.ticketType !== 'OUTBOUND_WAREHOUSE' || current.ticketCode !== row.ticketCode)
        fail(`Outbound ID conflict: ${row._id}`);
      continue;
    }
    if (!row.createdByUserId) fail(`Outbound missing creator: ${row._id}`);
    if (apply) await MaterialTicket.create({ ...row, ticketType: 'OUTBOUND_WAREHOUSE',
      createdByManagerId: row.createdByUserId });
  }
};

const migrateQr = async () => {
  const rows = await OrderQrToken.find().select('+token').lean();
  counts.orderQrTokens = rows.length;
  for (const row of rows) {
    const order = await SalesOrder.findById(row.orderId).select('+qr.token').lean();
    if (!order) fail(`QR without order: ${row._id}`);
    // A newer embedded token wins; old printed labels must not become valid again.
    if (order.qr?.token) continue;
    const owner = await SalesOrder.findOne({ 'qr.token': row.token }).select('_id').lean();
    if (owner && id(owner._id) !== id(order._id)) fail(`QR token collision: ${row._id}`);
    if (apply) await SalesOrder.updateOne({ _id: order._id, 'qr.token': { $exists: false } },
      { $set: { qr: { token: row.token, revokedAt: row.revokedAt,
        issuedBy: row.issuedBy, qrImagePublicId: row.qrImagePublicId } } }, { timestamps: false });
  }
};

const migrateClaims = async () => {
  const rows = await ProductUnitAllocation.find().lean();
  counts.productUnitAllocations = rows.length;
  for (const row of rows) {
    const unit = await ProductUnit.findOne({ barcode: row.barcode }).lean();
    if (!unit) fail(`Allocation without physical unit: ${row.barcode}`);
    if (unit.packingClaim) {
      if (id(unit.packingClaim.sessionId) !== id(row.sessionId) || unit.packingClaim.lineKey !== row.lineKey)
        fail(`Conflicting packing claim: ${row.barcode}`);
      continue;
    }
    if (!await PackingSession.exists({ _id: row.sessionId })) fail(`Claim without packing session: ${row.barcode}`);
    if (apply) await ProductUnit.updateOne({ _id: unit._id, 'packingClaim.sessionId': { $exists: false } },
      { $set: { packingClaim: { orderKey: row.orderKey, sessionId: row.sessionId,
        lineKey: row.lineKey, claimedAt: row.createdAt || new Date() } } });
  }
};

const migrateVideos = async () => {
  const rows = await PackingVideo.find().lean();
  counts.packingVideos = rows.length;
  for (const row of rows) {
    const session = await PackingSession.findById(row.sessionId).lean();
    if (!session) fail(`Video without packing session: ${row.recordingId}`);
    if (session.recordingId && session.recordingId !== row.recordingId)
      fail(`Conflicting recording ID on session: ${row.sessionId}`);
    const other = await PackingSession.findOne({ recordingId: row.recordingId, _id: { $ne: row.sessionId } })
      .select('_id').lean();
    if (other) fail(`Recording ID used by another session: ${row.recordingId}`);
    if (row.status === 'COMPLETED') {
      if (session.video?.recordingId !== row.recordingId || !session.video.publicId)
        fail(`Completed video lacks final session link: ${row.recordingId}`);
      if (apply) await PackingSession.updateOne({ _id: row.sessionId },
        { $set: { recordingId: row.recordingId, 'video.status': 'COMPLETED' },
          $unset: { pendingVideo: '' } });
      continue;
    }
    if (session.video?.publicId) {
      if (session.video.recordingId === row.recordingId && session.video.status === 'COMPLETED') continue;
      fail(`Pending video conflicts with final session video: ${row.recordingId}`);
    }
    if (apply) await PackingSession.updateOne({ _id: row.sessionId,
      $or: [{ recordingId: { $exists: false } }, { recordingId: row.recordingId }] },
    { $set: { recordingId: row.recordingId, pendingVideo: {
      recordingId: row.recordingId, cloudinaryPublicId: row.cloudinaryPublicId,
      cloudinaryAssetId: row.cloudinaryAssetId, cloudinaryUrl: row.cloudinaryUrl,
      mimeType: row.mimeType, fileSize: row.fileSize, durationMs: row.durationMs,
      uploadedAt: row.uploadedAt,
    } } });
  }
};

if (!process.env.MONGODB_URI) fail('MONGODB_URI is required');
await mongoose.connect(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false,
  serverSelectionTimeoutMS: 10_000 });
try {
  if (apply) {
    const manifest = mongoose.mongo.BSON.EJSON.parse(await readFile(
      path.join(backupDirectory, 'manifest.ejson'), 'utf8'));
    for (const [name, model] of [['material_outbounds', MaterialOutbound],
      ['order_qr_tokens', OrderQrToken], ['product_unit_allocations', ProductUnitAllocation],
      ['packing_videos', PackingVideo]]) {
      const currentCount = await model.countDocuments();
      if (currentCount !== manifest.collections?.[name]?.count)
        fail(`Source changed since backup: ${name}`);
    }
    await MaterialTicket.collection.createIndex({ confirmationKey: 1 }, { unique: true,
      partialFilterExpression: { ticketType: 'OUTBOUND_WAREHOUSE', confirmationKey: { $type: 'string' } } });
    await SalesOrder.collection.createIndex({ 'qr.token': 1 }, { unique: true,
      partialFilterExpression: { 'qr.token': { $type: 'string' } } });
    await PackingSession.collection.createIndex({ recordingId: 1 }, { unique: true,
      partialFilterExpression: { recordingId: { $type: 'string' } } });
  }
  await migrateOutbounds();
  await migrateQr();
  await migrateClaims();
  await migrateVideos();
  if (apply) {
    for (const row of await MaterialOutbound.find().select('_id').lean()) {
      if (!await MaterialTicket.exists({ _id: row._id, ticketType: 'OUTBOUND_WAREHOUSE' }))
        fail(`Outbound copy missing: ${row._id}`);
    }
    for (const row of await ProductUnitAllocation.find().lean()) {
      if (!await ProductUnit.exists({ barcode: row.barcode,
        'packingClaim.sessionId': row.sessionId, 'packingClaim.lineKey': row.lineKey }))
        fail(`Packing claim copy missing: ${row.barcode}`);
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'copied-and-checked' : 'dry-run', sourceCounts: counts,
    sourcesRetained: true }, null, 2));
} finally {
  await mongoose.disconnect();
}
