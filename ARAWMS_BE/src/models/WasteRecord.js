import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Waste Records collection – FT-06
 * 2 recordType: CONSUMPTION | LEFTOVER
 */

const wasteRecordSchema = new Schema(
  {
    recordType: { type: String, required: true, enum: ['CONSUMPTION', 'LEFTOVER'] },

    productionOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionOrder',
      required: true,
    },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    fabricRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    recordedAt: { type: Date, required: true },
    note: { type: String },

    // --- CONSUMPTION ---
    cuttingPlanCode: { type: String },
    standardQty: { type: Number, min: 0 },
    actualQty: { type: Number, min: 0 },
    thresholdRate: { type: Number, min: 0, max: 1 },
    varianceQty: { type: Number },
    varianceRate: { type: Number },
    isOverThreshold: { type: Boolean },
    wastageReason: { type: String },

    // --- LEFTOVER ---
    leftoverQty: { type: Number, min: 0 },
    thresholdQty: { type: Number, min: 0 },
    disposition: {
      type: String,
      enum: ['RETURN_TO_STOCK', 'REUSE_NEXT_ORDER', 'SCRAP'],
    },
    status: { type: String, enum: ['RECORDED', 'CONFIRMED'] },
    confirmedQty: { type: Number, min: 0 },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: { type: Date },
  },
  { collection: 'waste_records' }
);

// Indexes
wasteRecordSchema.index({ productionOrderId: 1, recordType: 1, materialId: 1 });
wasteRecordSchema.index(
  { productionOrderId: 1 },
  { partialFilterExpression: { isOverThreshold: true } }
);
wasteRecordSchema.index({ recordType: 1, status: 1, recordedAt: -1 });

const WasteRecord = mongoose.model('WasteRecord', wasteRecordSchema);
export default WasteRecord;
