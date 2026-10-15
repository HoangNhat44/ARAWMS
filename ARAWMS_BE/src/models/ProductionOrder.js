import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Production Orders collection – FT-05
 */

const poItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuCode: { type: String },
    bomId: { type: Schema.Types.ObjectId, ref: 'Bom', required: true },
    plannedQty: { type: Number, required: true, min: 1 },
    completedQty: { type: Number, min: 0 },
    defectiveQty: { type: Number, min: 0 },
    receivedQty: { type: Number, min: 0 },
  },
  { _id: false }
);

const materialRequirementSchema = new Schema(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    materialCode: { type: String },
    unitCode: { type: String },
    baseQty: { type: Number, min: 0 },
    wastageQty: { type: Number, min: 0 },
    requiredQty: { type: Number, required: true, min: 0 },
    availableQty: { type: Number, min: 0 },
    reservedQty: { type: Number, min: 0 },
    issuedQty: { type: Number, min: 0 },
    returnedQty: { type: Number, min: 0 },
    consumedQty: { type: Number, min: 0 },
    shortageQty: { type: Number, min: 0 },
    calculatedAt: { type: Date },
  },
  { _id: false }
);

const shortageAlertSchema = new Schema(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    requiredQty: { type: Number, min: 0 },
    availableQty: { type: Number, min: 0 },
    shortageQty: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ['OPEN', 'ESCALATED', 'APPROVED_TO_PROCEED', 'REJECTED', 'RESOLVED'],
    },
    escalatedToOwner: { type: Boolean },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionNote: { type: String },
    createdAt: { type: Date },
    resolvedAt: { type: Date },
  },
  { _id: false }
);

const stageSchema = new Schema(
  {
    stage: {
      type: String,
      required: true,
      enum: ['CUTTING', 'SEWING', 'FINISHING', 'QC', 'PACKING'],
    },
    seq: { type: Number },
    status: {
      type: String,
      required: true,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
    },
    qtyIn: { type: Number, min: 0 },
    qtyOut: { type: Number, min: 0 },
    qtyDefect: { type: Number, min: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    note: { type: String },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const cuttingPlanItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    plannedPieces: { type: Number, required: true },
    cutPieces: { type: Number },
  },
  { _id: false }
);

const cuttingPlanSchema = new Schema(
  {
    code: { type: String, required: true },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    patternFileName: { type: String },
    layers: { type: Number },
    markerLengthM: { type: Number, min: 0 },
    plannedFabricQty: { type: Number, min: 0 },
    actualFabricQty: { type: Number, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ['PLANNED', 'CUTTING', 'DONE', 'CANCELLED'],
    },
    items: { type: [cuttingPlanItemSchema], default: [] },
    note: { type: String },
  },
  { _id: false }
);

const semiFinishedSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    stage: { type: String, required: true },
    qty: { type: Number, required: true, min: 0 },
    locationNote: { type: String },
    updatedAt: { type: Date },
  },
  { _id: false }
);

const reconciliationSchema = new Schema(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    standardQty: { type: Number, min: 0 },
    actualQty: { type: Number, min: 0 },
    varianceQty: { type: Number },
    varianceRate: { type: Number },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'ACCEPTED', 'INVESTIGATING', 'BOM_UPDATE_REQUIRED'],
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    note: { type: String },
  },
  { _id: false }
);

const issueRequestItemSchema = new Schema(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    materialCode: { type: String },
    unitCode: { type: String },
    requestedQty: { type: Number, required: true, min: 0 },
    approvedQty: { type: Number, min: 0 },
    issuedQty: { type: Number, min: 0 },
    note: { type: String },
  },
  { _id: false }
);

const issueRequestSchema = new Schema(
  {
    code: { type: String, required: true },
    requestType: { type: String, required: true, enum: ['INITIAL', 'SUPPLEMENTARY'] },
    parentRequestId: { type: Schema.Types.ObjectId },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PICKING', 'ISSUED', 'CANCELLED'],
    },
    reason: { type: String },
    items: {
      type: [issueRequestItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'issueRequests[].items phải có ít nhất 1 phần tử',
      },
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectReason: { type: String },
  }
);

const productionOrderSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: [
        'DRAFT',
        'PLANNED',
        'MATERIAL_SHORTAGE',
        'RELEASED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ],
    },
    priority: { type: Number, min: 1, max: 5 },
    season: { type: String },
    plannedStart: { type: Date },
    plannedEnd: { type: Date },
    actualStart: { type: Date },
    actualEnd: { type: Date },
    requirements: { type: String },
    items: {
      type: [poItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'items phải có ít nhất 1 phần tử',
      },
    },
    materialRequirements: { type: [materialRequirementSchema], default: [] },
    shortageAlerts: { type: [shortageAlertSchema], default: [] },
    stages: { type: [stageSchema], default: [] },
    cuttingPlans: { type: [cuttingPlanSchema], default: [] },
    semiFinished: { type: [semiFinishedSchema], default: [] },
    reconciliations: { type: [reconciliationSchema], default: [] },
    cost: {
      materialCost: { type: Number, min: 0 },
      wastageCost: { type: Number, min: 0 },
      laborCost: { type: Number, min: 0 },
      overheadCost: { type: Number, min: 0 },
      totalCost: { type: Number, min: 0 },
      producedQty: { type: Number, min: 0 },
      unitCost: { type: Number, min: 0 },
      calculatedAt: { type: Date },
    },
    issueRequests: { type: [issueRequestSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    releasedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    releasedAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelReason: { type: String },
  },
  { timestamps: true, collection: 'production_orders' }
);

// Indexes
productionOrderSchema.index({ code: 1 }, { unique: true });
productionOrderSchema.index({ status: 1, plannedStart: 1 });
productionOrderSchema.index({ 'items.skuId': 1 });
productionOrderSchema.index({ 'materialRequirements.materialId': 1 });
productionOrderSchema.index({ 'shortageAlerts.status': 1 });
productionOrderSchema.index(
  { 'issueRequests.code': 1 },
  { unique: true, partialFilterExpression: { 'issueRequests.code': { $type: 'string' } } }
);
productionOrderSchema.index({ 'issueRequests.status': 1 });

const ProductionOrder = mongoose.model('ProductionOrder', productionOrderSchema);
export default ProductionOrder;
