/*
 * File: PutawayIncident.model.js
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Stores staff-reported putaway mistakes for manager review. Reporting never reverses a confirmed unit move or changes inventory counters.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;
const schema = new Schema({
  allocationId: { type: Schema.Types.ObjectId, ref: 'PutawayAllocation', required: true, index: true },
  lineId: { type: Schema.Types.ObjectId, required: true },
  barcode: String,
  reason: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['OPEN', 'REVIEWED'], default: 'OPEN', index: true },
  reportedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: String,
}, { timestamps: true, collection: 'putaway_incidents' });

schema.index({ allocationId: 1, lineId: 1, createdAt: -1 });
export default mongoose.model('PutawayIncident', schema);
