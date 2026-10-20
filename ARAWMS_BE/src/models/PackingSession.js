import mongoose from 'mongoose';

const { Schema } = mongoose;

const snapshotItemSchema = new Schema({
  lineKey: { type: String, required: true },
  skuId: { type: Schema.Types.ObjectId, ref: 'Sku' },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Config' },
  variantId: { type: String },
  skuCode: { type: String },
  name: { type: String },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const scannedUnitSchema = new Schema({
  barcode: { type: String, required: true },
  lineKey: { type: String, required: true },
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
  version: { type: Number, required: true, default: 0 },
}, { timestamps: true, collection: 'packing_sessions' });

// Một phiên soạn hàng hiện hành cho mỗi đơn; repack sẽ cần revision/attempt riêng.
packingSessionSchema.index({ sourceType: 1, orderKey: 1 }, { unique: true });

export default mongoose.model('PackingSession', packingSessionSchema);
