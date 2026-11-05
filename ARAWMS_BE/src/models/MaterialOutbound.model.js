/*
 * File: MaterialOutbound.model.js
 * Description: Persists raw-material issue drafts, physical source checks, and immutable confirmation snapshots.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;
const source = new Schema({
  kind: { type: String, enum: ['ROLL', 'LOT'], required: true },
  objectId: { type: Schema.Types.ObjectId, required: true },
  barcode: { type: String, required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
  locationCode: String,
  inboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
  quantity: { type: Number, required: true, min: 0 },
  checkedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  checkedAt: Date,
  checkedQuantity: Number,
}, { _id: false });
const line = new Schema({
  rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  materialCode: String, materialName: String, color: String, unit: String,
  quantity: { type: Number, required: true, min: 0 },
  sources: [source],
}, { _id: false });
const schema = new Schema({
  ticketCode: { type: String, required: true, unique: true },
  warehouseCode: { type: String, required: true, index: true },
  issueDate: { type: Date, required: true },
  department: String,
  recipient: String,
  purpose: String,
  status: { type: String, enum: ['DRAFT', 'COMPLETED', 'CANCELLED'], default: 'DRAFT', index: true },
  lines: [line],
  version: { type: Number, default: 0 },
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  confirmedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  confirmedAt: Date,
  cancelledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  confirmationKey: { type: String },
}, { collection: 'material_outbounds', autoCreate: false, autoIndex: false });
schema.index({ confirmationKey: 1 }, { unique: true, partialFilterExpression: { confirmationKey: { $type: 'string' } } });
schema.plugin(baseSchemaPlugin);
export default mongoose.model('MaterialOutbound', schema);
