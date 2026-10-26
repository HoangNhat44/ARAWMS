/*
 * File: PackingSession.js
 * Author: Duy Anh
 * Date: 2026-10-19
 * Description: Models station leases, scanned units, and packing progress.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const snapshotItemSchema = new Schema({
  lineKey: { type: String, required: true },
  skuId: { type: Schema.Types.ObjectId, ref: 'Sku' },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' },
  pickAllocations: [{
    batchId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBatch' },
    locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' },
    allocatedQty: Number,
  }],
  variantId: { type: String },
  skuCode: { type: String },
  name: { type: String },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const scannedUnitSchema = new Schema({
  barcode: { type: String, required: true },
  lineKey: { type: String, required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBatch' },
  scannedAt: { type: Date, required: true },
}, { _id: false });

const packingSessionSchema = new Schema({
  sourceType: { type: String, required: true, enum: ['DEMO', 'REAL'] },
  orderKey: { type: String, required: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
  orderVersion: { type: Date },
  operatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  stationId: { type: String, required: true },
  leaseUntil: { type: Date, required: true },
  leaseVersion: { type: Number, required: true, default: 1 },
  state: { type: String, required: true, enum: ['SCANNING', 'READY_TO_RECORD'], default: 'SCANNING' },
  items: { type: [snapshotItemSchema], required: true },
  scannedUnits: { type: [scannedUnitSchema], default: [] },
  video: {
    recordingId: { type: String },
    publicId: { type: String },
    assetId: { type: String },
    url: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    durationMs: { type: Number },
    uploadedAt: { type: Date },
  },
  version: { type: Number, required: true, default: 0 },
}, { timestamps: true, collection: 'packing_sessions' });

// Keep one current session per order; repacking will require a separate attempt revision.
packingSessionSchema.index({ sourceType: 1, orderKey: 1 }, { unique: true });

export default mongoose.model('PackingSession', packingSessionSchema);
