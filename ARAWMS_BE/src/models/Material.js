import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Materials collection – FT-03
 */

const supplierLineSchema = new Schema(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    supplierSku: { type: String },
    lastPrice: { type: Number, min: 0 },
    leadTimeDays: { type: Number },
    isPreferred: { type: Boolean },
  },
  { _id: false }
);

const fabricSchema = new Schema(
  {
    composition: { type: String },
    widthCm: { type: Number, min: 0 },
    weightGsm: { type: Number, min: 0 },
  },
  { _id: false }
);

const limitsSchema = new Schema(
  {
    min: { type: Number, min: 0 },
    safety: { type: Number, min: 0 },
    max: { type: Number, min: 0 },
  },
  { _id: false }
);

const costHistorySchema = new Schema(
  {
    unitCost: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    source: { type: String, enum: ['MANUAL', 'GOODS_RECEIPT', 'SUPPLIER_QUOTE'] },
    note: { type: String },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const wastageStandardSchema = new Schema(
  {
    rate: { type: Number, min: 0, max: 0.99 },
    effectiveFrom: { type: Date },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const wastageHistorySchema = new Schema(
  {
    rate: { type: Number, min: 0, max: 1 },
    effectiveFrom: { type: Date },
    effectiveTo: { type: Date },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const materialSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['FABRIC', 'ACCESSORY', 'PACKAGING'] },
    unitCode: { type: String, required: true },
    color: { type: String },
    defaultSupplierId: { type: Schema.Types.ObjectId, ref: 'Partner' },
    suppliers: { type: [supplierLineSchema], default: [] },
    fabric: { type: fabricSchema },
    isRollTracked: { type: Boolean, required: true, default: false },
    limits: { type: limitsSchema },
    standardUnitCost: { type: Number, min: 0 },
    costHistory: { type: [costHistorySchema], default: [] },
    wastageStandard: { type: wastageStandardSchema },
    wastageHistory: { type: [wastageHistorySchema], default: [] },
    barcode: { type: String },
    imageUrl: { type: String },
    description: { type: String },
    isActive: { type: Boolean, required: true, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'materials' }
);

// Indexes
materialSchema.index({ code: 1 }, { unique: true });
materialSchema.index({ type: 1, isActive: 1 });
materialSchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } }
);
materialSchema.index({ 'suppliers.supplierId': 1 });

const Material = mongoose.model('Material', materialSchema);
export default Material;
