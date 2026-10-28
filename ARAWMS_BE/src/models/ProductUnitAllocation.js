/*
 * File: ProductUnitAllocation.js
 * Author: Duy Anh
 * Date: 2026-10-19
 * Description: Tracks the order assignment of each physical barcode.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const allocationSchema = new Schema({
  barcode: { type: String, required: true },
  orderKey: { type: String, required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'PackingSession', required: true },
  lineKey: { type: String, required: true },
}, { timestamps: true, collection: 'product_unit_allocations' });

allocationSchema.index({ barcode: 1 }, { unique: true });
allocationSchema.index({ orderKey: 1 });

export default mongoose.model('ProductUnitAllocation', allocationSchema);
