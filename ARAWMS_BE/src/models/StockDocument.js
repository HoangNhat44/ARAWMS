import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Stock Documents collection – FT-07/08
 * 5 docType: MATERIAL_RECEIPT | MATERIAL_ISSUE | FG_RECEIPT | DEFECT_DISPOSAL | STOCK_ADJUSTMENT
 */

const commonDocFields = {
  code: { type: String, required: true, trim: true },
  status: {
    type: String,
    required: true,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED'],
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  note: { type: String },
};

// MATERIAL_RECEIPT items
const receiptItemSchema = new Schema(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    code: { type: String },
    name: { type: String },
    unitCode: { type: String },
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    lineAmount: { type: Number, min: 0 },
    lotNo: { type: String },
    rollCount: { type: Number },
    locationCode: { type: String },
    rollIds: { type: [Schema.Types.ObjectId], default: undefined },
  },
  { _id: false }
);

// MATERIAL_ISSUE items
const issueItemSchema = new Schema(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    materialCode: { type: String },
    fabricRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' },
    rollCode: { type: String },
    unitCode: { type: String },
    locationCode: { type: String },
    quantity: { type: Number, required: true, min: 0 },
    pickedQty: { type: Number, min: 0 },
    unitCost: { type: Number, min: 0 },
    note: { type: String },
  },
  { _id: false }
);

// FG_RECEIPT items
const fgReceiptItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuCode: { type: String },
    deliveredQty: { type: Number, required: true, min: 1 },
    acceptedQty: { type: Number, required: true, min: 0 },
    defectiveQty: { type: Number, required: true, min: 0 },
    locationCode: { type: String },
    unitCost: { type: Number, min: 0 },
    note: { type: String },
  },
  { _id: false }
);

// DEFECT_DISPOSAL items
const defectDisposalItemSchema = new Schema(
  {
    defectiveStockId: { type: Schema.Types.ObjectId, ref: 'DefectiveStock', required: true },
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku' },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

// STOCK_ADJUSTMENT items
const adjustmentItemSchema = new Schema(
  {
    itemType: { type: String, required: true, enum: ['SKU', 'MATERIAL'] },
    itemId: { type: Schema.Types.ObjectId, required: true },
    itemCode: { type: String },
    fabricRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' },
    locationCode: { type: String },
    deltaQty: { type: Number, required: true },
    unitCost: { type: Number, min: 0 },
    valueDelta: { type: Number },
    reason: { type: String },
  },
  { _id: false }
);

const stockDocumentSchema = new Schema(
  {
    docType: {
      type: String,
      required: true,
      enum: [
        'MATERIAL_RECEIPT',
        'MATERIAL_ISSUE',
        'FG_RECEIPT',
        'DEFECT_DISPOSAL',
        'STOCK_ADJUSTMENT',
      ],
    },
    ...commonDocFields,

    // --- MATERIAL_RECEIPT ---
    supplierId: { type: Schema.Types.ObjectId, ref: 'Partner' },
    supplier: {
      code: { type: String },
      name: { type: String },
    },
    receiptDate: { type: Date },
    supplierInvoiceNo: { type: String },
    totalAmount: { type: Number, min: 0 },

    // --- MATERIAL_ISSUE ---
    issueType: {
      type: String,
      enum: ['PRODUCTION', 'INTERNAL_TRANSFER', 'RETURN_TO_SUPPLIER', 'SCRAP'],
    },
    issueRequestId: { type: Schema.Types.ObjectId },
    productionOrderId: { type: Schema.Types.ObjectId, ref: 'ProductionOrder' },
    fromWarehouseId: { type: Schema.Types.ObjectId, ref: 'Config' },
    toWarehouseId: { type: Schema.Types.ObjectId, ref: 'Config' },
    pickedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    pickedAt: { type: Date },
    issuedAt: { type: Date },

    // --- FG_RECEIPT ---
    // productionOrderId: same field as MATERIAL_ISSUE
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Config' },
    inspectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    inspectedAt: { type: Date },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receivedAt: { type: Date },

    // --- DEFECT_DISPOSAL ---
    disposition: {
      type: String,
      enum: ['LIQUIDATION', 'REPAIR', 'DESTRUCTION'],
    },
    recoveryAmount: { type: Number, min: 0 },
    buyerInfo: { type: String },

    // --- STOCK_ADJUSTMENT ---
    countId: { type: Schema.Types.ObjectId, ref: 'InventoryCount' },
    reason: { type: String },
    totalValueDelta: { type: Number },
    requiresOwnerApproval: { type: Boolean },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectReason: { type: String },

    // Items (typed per docType)
    items: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, collection: 'stock_documents' }
);

// Indexes
stockDocumentSchema.index({ code: 1 }, { unique: true });
stockDocumentSchema.index({ docType: 1, status: 1, createdAt: -1 });
stockDocumentSchema.index(
  { productionOrderId: 1 },
  { partialFilterExpression: { productionOrderId: { $type: 'objectId' } } }
);
stockDocumentSchema.index(
  { supplierId: 1, receiptDate: -1 },
  { partialFilterExpression: { supplierId: { $type: 'objectId' } } }
);
stockDocumentSchema.index(
  { countId: 1 },
  { partialFilterExpression: { countId: { $type: 'objectId' } } }
);

const StockDocument = mongoose.model('StockDocument', stockDocumentSchema);
export default StockDocument;
