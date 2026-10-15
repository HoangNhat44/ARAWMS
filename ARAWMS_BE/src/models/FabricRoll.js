import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Fabric Rolls collection – FT-07
 */

const rollEventSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'RECEIVED',
        'REMEASURED',
        'RESERVED',
        'UNRESERVED',
        'ISSUED',
        'CUT',
        'LEFTOVER_RETURNED',
        'MOVED',
        'ADJUSTED',
        'SCRAPPED',
        'LABEL_PRINTED',
      ],
    },
    lengthBefore: { type: Number, min: 0 },
    lengthAfter: { type: Number, min: 0 },
    fromLocation: { type: String },
    toLocation: { type: String },
    ref: {
      type: { type: String },
      id: { type: Schema.Types.ObjectId },
    },
    note: { type: String },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const fabricRollSchema = new Schema(
  {
    rollCode: { type: String, required: true, trim: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    material: {
      code: { type: String },
      name: { type: String },
      color: { type: String },
    },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Partner' },
    receiptId: { type: Schema.Types.ObjectId, ref: 'StockDocument' },
    lotNo: { type: String },
    dyeLot: { type: String },
    initialLength: { type: Number, required: true, min: 0 },
    currentLength: { type: Number, required: true, min: 0 },
    widthCm: { type: Number, min: 0 },
    weightKg: { type: Number, min: 0 },
    unitCost: { type: Number, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ['IN_STOCK', 'RESERVED', 'IN_PRODUCTION', 'PARTIALLY_USED', 'DEPLETED', 'SCRAPPED'],
    },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Config' },
    locationCode: { type: String },
    reservedForPoId: { type: Schema.Types.ObjectId, ref: 'ProductionOrder' },
    receivedAt: { type: Date },
    lastMeasuredAt: { type: Date },
    note: { type: String },
    events: { type: [rollEventSchema], default: [] },
  },
  { timestamps: true, collection: 'fabric_rolls' }
);

// Indexes
fabricRollSchema.index({ rollCode: 1 }, { unique: true });
fabricRollSchema.index({ materialId: 1, status: 1 });
fabricRollSchema.index({ warehouseId: 1, locationCode: 1 });
fabricRollSchema.index(
  { reservedForPoId: 1 },
  { partialFilterExpression: { status: 'RESERVED' } }
);

const FabricRoll = mongoose.model('FabricRoll', fabricRollSchema);
export default FabricRoll;
