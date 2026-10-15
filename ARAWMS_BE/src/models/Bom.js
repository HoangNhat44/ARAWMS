import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * BOMs collection – FT-04
 */

const bomLineSchema = new Schema(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    materialCode: { type: String },
    materialName: { type: String },
    usagePart: { type: String },
    qtyPerUnit: { type: Number, required: true, min: 0 },
    unitCode: { type: String, required: true },
    wastageRate: { type: Number, min: 0, max: 0.99 },
    unitCostSnapshot: { type: Number, min: 0 },
    lineCost: { type: Number, min: 0 },
    note: { type: String },
  },
  { _id: false }
);

const techSpecSchema = new Schema(
  {
    group: { type: String },
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const sizeSpecSchema = new Schema(
  {
    sizeCode: { type: String, required: true },
    measurement: { type: String, required: true },
    valueCm: { type: Number, required: true, min: 0 },
    toleranceCm: { type: Number, min: 0 },
  },
  { _id: false }
);

const patternFileSchema = new Schema(
  {
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String },
    sizeBytes: { type: Number, min: 0 },
    versionNo: { type: Number },
    status: { type: String, required: true, enum: ['ACTIVE', 'REPLACED', 'DELETED'] },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { _id: false }
);

const approvalSchema = new Schema(
  {
    action: {
      type: String,
      required: true,
      enum: ['SUBMIT', 'APPROVE', 'REJECT', 'FINALIZE', 'ARCHIVE'],
    },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const changeLogSchema = new Schema(
  {
    fromBomId: { type: Schema.Types.ObjectId, ref: 'Bom' },
    changeType: { type: String, required: true, enum: ['ADD', 'UPDATE', 'REMOVE'] },
    target: { type: String },
    field: { type: String },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, required: true },
  },
  { _id: false }
);

const bomSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuCode: { type: String },
    bomCode: { type: String, required: true },
    versionNo: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'STANDARD', 'ARCHIVED'],
    },
    basedOnBomId: { type: Schema.Types.ObjectId, ref: 'Bom' },
    changeReason: { type: String },
    techNotes: { type: String },
    lines: {
      type: [bomLineSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'lines phải có ít nhất 1 phần tử',
      },
    },
    techSpecs: { type: [techSpecSchema], default: [] },
    sizeSpecs: { type: [sizeSpecSchema], default: [] },
    patternFiles: { type: [patternFileSchema], default: [] },
    approvals: { type: [approvalSchema], default: [] },
    cost: {
      material: { type: Number, min: 0 },
      labor: { type: Number, min: 0 },
      overhead: { type: Number, min: 0 },
      standard: { type: Number, min: 0 },
    },
    changeLog: {
      type: [changeLogSchema],
      default: [],
      validate: {
        validator: (v) => v.length <= 1000,
        message: 'changeLog không được vượt quá 1000 phần tử',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    finalizedAt: { type: Date },
  },
  { timestamps: true, collection: 'boms' }
);

// Indexes
bomSchema.index({ bomCode: 1 }, { unique: true });
bomSchema.index({ skuId: 1, versionNo: 1 }, { unique: true });
bomSchema.index(
  { skuId: 1 },
  { unique: true, partialFilterExpression: { status: 'STANDARD' } }
);
bomSchema.index({ status: 1 });
bomSchema.index({ 'lines.materialId': 1 });

const Bom = mongoose.model('Bom', bomSchema);
export default Bom;
