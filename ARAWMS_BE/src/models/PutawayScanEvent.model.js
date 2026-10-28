/*
 * File: PutawayScanEvent.model.js
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Records each accepted finished-goods putaway scan with a stable request ID. Unique request and unit IDs prevent retries or concurrent devices from placing a unit twice.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema({
  requestId: { type: String, required: true, unique: true },
  allocationId: { type: Schema.Types.ObjectId, ref: 'PutawayAllocation', required: true, index: true },
  lineId: { type: Schema.Types.ObjectId, required: true },
  productUnitId: { type: Schema.Types.ObjectId, ref: 'ProductUnit', required: true, unique: true },
  barcode: { type: String, required: true },
  sourceLocationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
  targetLocationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'putaway_scan_events' });

schema.index({ allocationId: 1, lineId: 1, createdAt: -1 });

export default mongoose.model('PutawayScanEvent', schema);
