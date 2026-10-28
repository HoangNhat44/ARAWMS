/*
 * File: PutawayAllocation.model.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Records planned finished goods putaway, confirmed scans, and manager-reviewed shortages for each destination bin.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;
const line = new Schema({ lineId: { type: Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
  skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
  targetLocationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
  allocatedQuantity: { type: Number, required: true, min: 1 },
  placedQuantity: { type: Number, default: 0, min: 0 },
  shortageQuantity: { type: Number, default: 0, min: 0 },
  reportedShortageQuantity: { type: Number, default: 0, min: 0 },
  shortageReason: String,
  shortageReportedAt: Date,
  shortageReportedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  shortageResolvedAt: Date,
  shortageResolvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });
const schema = new Schema({
  allocationCode: { type: String, required: true, unique: true },
  warehouseType: { type: String, default: 'FINISHED_GOODS' },
  sourceReceiptId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBulkDocument', required: true, index: true },
  status: { type: String, enum: ['DRAFT', 'CONFIRMED', 'CANCELLED'], default: 'DRAFT', index: true },
  lines: [line],
  note: { type: String, maxlength: 500 },
  cancelReason: String,
  adjustmentReason: String,
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  confirmedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  confirmedAt: Date,
  cancelledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  version: { type: Number, default: 1 },
  idempotencyKey: { type: String },
  confirmationHash: String,
}, { timestamps: true, collection: 'putaway_allocations' });
schema.index({ sourceReceiptId: 1, status: 1 });
schema.index({ 'lines.targetLocationId': 1, status: 1 });
schema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
export default mongoose.model('PutawayAllocation', schema);
