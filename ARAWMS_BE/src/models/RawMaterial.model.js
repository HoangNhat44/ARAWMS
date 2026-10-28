/*
 * File: RawMaterial.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines raw materials held by the warehouse. Separates received stock awaiting putaway from stock available for use.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const rawMaterialSchema = new Schema(
  {
    materialCode: { type: String, required: true, unique: true, uppercase: true, index: true },
    materialName: { type: String, required: true },
    materialType: { type: String, enum: ['FABRIC', 'AUXILIARY'], required: true, index: true },
    category: {
      type: String,
      enum: ['FABRIC_ROLL', 'BUTTON', 'THREAD', 'ZIPPER', 'CARE_LABEL', 'PACKAGING_BAG'],
      required: true,
    },
    unit: { type: String, enum: ['METER', 'KG', 'PIECE', 'SPOOL', 'BOX'], required: true },
    color: { type: String },
    gsm: { type: Number },
    widthCm: { type: Number },
    unitCost: { type: Number, required: true, min: 0 },
    onHandQty: { type: Number, default: 0, min: 0 },
    pendingPutawayQty: { type: Number, default: 0, min: 0 },
    reservedQty: { type: Number, default: 0, min: 0 },
    safetyStockThreshold: { type: Number, default: 50 },
    fifoAgingThresholdDays: { type: Number, default: 90 },
    isActive: { type: Boolean, default: true },
  },
  {
    collection: 'raw_materials',
    optimisticConcurrency: true,
    versionKey: 'version',
  }
);

rawMaterialSchema.virtual('availableQty').get(function () {
  return (this.onHandQty || 0) - (this.reservedQty || 0) - (this.pendingPutawayQty || 0);
});

rawMaterialSchema.plugin(baseSchemaPlugin);

const RawMaterial = mongoose.model('RawMaterial', rawMaterialSchema);
export default RawMaterial;
