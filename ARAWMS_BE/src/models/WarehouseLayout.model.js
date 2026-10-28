/*
 * File: WarehouseLayout.model.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Stores active and draft warehouse diagrams with optimistic versions.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;
const zone = new Schema({ code: String, name: String, type: String,
  status: String, note: String }, { _id: false });
const rack = new Schema({ id: Schema.Types.ObjectId, code: String, name: String, zoneCode: String,
  status: String, note: String,
  floors: Number, binsPerFloor: Number }, { _id: false });
const bin = new Schema({ id: Schema.Types.ObjectId, rackId: Schema.Types.ObjectId,
  locationCode: String, displayName: String, barcode: String, floorNo: Number, binNo: Number,
  capacity: Number, capacityUnit: String, allowedSkuMode: String, allowedSkuIds: [Schema.Types.ObjectId],
  status: String, note: String }, { _id: false });
const snapshot = new Schema({ zones: [zone], racks: [rack], bins: [bin], nearFullThreshold: Number }, { _id: false });

const warehouseLayoutSchema = new Schema({
  warehouseType: { type: String, required: true, unique: true, default: 'FINISHED_GOODS' },
  activeVersion: { type: Number, default: 0 },
  active: { type: snapshot, default: () => ({ zones: [], racks: [], bins: [], nearFullThreshold: 0.8 }) },
  draft: snapshot,
  draftBaseVersion: Number,
  draftVersion: { type: Number, default: 0 },
  updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  publishedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  publishedAt: Date,
}, { timestamps: true, collection: 'warehouse_layouts' });

export default mongoose.model('WarehouseLayout', warehouseLayoutSchema);
