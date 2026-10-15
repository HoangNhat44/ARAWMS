import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Return Requests collection – FT-11
 */

const returnItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuCode: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    paidUnitPrice: { type: Number, required: true, min: 0 },
    reasonText: { type: String },
  },
  { _id: false }
);

const inspectionItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    quantity: { type: Number, required: true, min: 1 },
    condition: {
      type: String,
      required: true,
      enum: ['LIKE_NEW', 'MISSING_TAG', 'DIRTY', 'DAMAGED', 'WRONG_ITEM', 'MISSING_ITEM'],
    },
    disposition: {
      type: String,
      required: true,
      enum: [
        'RESTOCK_SELLABLE',
        'QUARANTINE_DEFECTIVE',
        'DESTROY',
        'RETURN_TO_CUSTOMER',
      ],
    },
    targetWarehouseId: { type: Schema.Types.ObjectId, ref: 'Config' },
    surchargeReasonCode: { type: String },
    conditionNote: { type: String },
    evidenceUrls: { type: [String], default: [] },
  },
  { _id: false }
);

const inspectionSchema = new Schema(
  {
    inspectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    unboxingVideoUrl: { type: String },
    videoDurationS: { type: Number },
    packageCondition: { type: String },
    note: { type: String },
    items: { type: [inspectionItemSchema], default: [] },
  },
  { _id: false }
);

const exchangeItemSchema = new Schema(
  {
    originalSkuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    replacementSkuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    quantity: { type: Number, required: true, min: 1 },
    originalUnitPrice: { type: Number, min: 0 },
    replacementUnitPrice: { type: Number, min: 0 },
    priceDifference: { type: Number },
    stockValidated: { type: Boolean },
    validatedAvailableQty: { type: Number, min: 0 },
    validatedAt: { type: Date },
    validationNote: { type: String },
  },
  { _id: false }
);

const surchargeLineSchema = new Schema(
  {
    reasonCode: { type: String, required: true },
    baseAmount: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0, max: 1 },
    amount: { type: Number, min: 0 },
  },
  { _id: false }
);

const rrStatusHistorySchema = new Schema(
  {
    from: { type: String },
    to: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const returnRequestSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    requestType: { type: String, required: true, enum: ['RETURN', 'EXCHANGE'] },
    status: {
      type: String,
      required: true,
      enum: [
        'REQUESTED',
        'APPROVED',
        'AWAITING_GOODS',
        'GOODS_RECEIVED',
        'INSPECTED',
        'FINANCE_REVIEW',
        'FINANCE_APPROVED',
        'COMPLETED',
        'REJECTED',
        'CANCELLED',
      ],
    },
    originalOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    originalOrderCode: { type: String },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    policyId: { type: Schema.Types.ObjectId, ref: 'Config' },
    parentRequestId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest' },
    reasonCode: { type: String, required: true },
    reasonText: { type: String },
    evidenceUrls: { type: [String], default: [] },
    withinPolicyWindow: { type: Boolean },
    returnCarrierId: { type: Schema.Types.ObjectId, ref: 'Partner' },
    returnWaybillNo: { type: String },
    items: {
      type: [returnItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'items phải có ít nhất 1 phần tử',
      },
    },
    inspections: { type: [inspectionSchema], default: [] },
    exchange: {
      code: { type: String },
      replacementOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
      status: {
        type: String,
        enum: ['DRAFT', 'VALIDATED', 'CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED'],
      },
      items: { type: [exchangeItemSchema], default: [] },
    },
    financial: {
      itemsValue: { type: Number, min: 0 },
      surchargeAmount: { type: Number, min: 0 },
      shippingFeeDeduction: { type: Number, min: 0 },
      exchangeGoodsValue: { type: Number, min: 0 },
      priceDifference: { type: Number },
      netSettlement: { type: Number },
      status: {
        type: String,
        enum: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SETTLED'],
      },
      settlementMethod: {
        type: String,
        enum: [
          'BANK_REFUND',
          'CASH_REFUND',
          'COD_OFFSET',
          'CUSTOMER_PAYS',
          'NONE',
        ],
      },
      settlementVoucherId: { type: Schema.Types.ObjectId, ref: 'CashVoucher' },
      surchargeLines: { type: [surchargeLineSchema], default: [] },
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      reviewNote: { type: String },
    },
    statusHistory: { type: [rrStatusHistorySchema], default: [] },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectReason: { type: String },
    receivedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: 'return_requests' }
);

// Indexes
returnRequestSchema.index({ code: 1 }, { unique: true });
returnRequestSchema.index({ status: 1, createdAt: -1 });
returnRequestSchema.index({ originalOrderId: 1, createdAt: 1 });
returnRequestSchema.index(
  { parentRequestId: 1 },
  { partialFilterExpression: { parentRequestId: { $type: 'objectId' } } }
);
returnRequestSchema.index({ 'financial.status': 1 });

const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
export default ReturnRequest;
