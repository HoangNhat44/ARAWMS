import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Shipments collection – FT-10/12
 */

const trackingEventSchema = new Schema(
  {
    status: { type: String, required: true },
    description: { type: String },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const codFlagSchema = new Schema(
  {
    statementId: { type: Schema.Types.ObjectId, ref: 'CodStatement' },
    flagType: {
      type: String,
      required: true,
      enum: [
        'AMOUNT_MISMATCH',
        'MISSING_IN_STATEMENT',
        'NOT_COLLECTED',
        'LATE_REMITTANCE',
        'DUPLICATE_LINE',
      ],
    },
    expectedAmount: { type: Number, min: 0 },
    actualAmount: { type: Number, min: 0 },
    diffAmount: { type: Number },
    status: {
      type: String,
      required: true,
      enum: ['OPEN', 'INVESTIGATING', 'DISPUTED', 'RESOLVED', 'WRITTEN_OFF'],
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    resolutionNote: { type: String },
    createdAt: { type: Date },
    resolvedAt: { type: Date },
  }
);

const disputeUpdateSchema = new Schema(
  {
    status: { type: String, required: true },
    note: { type: String },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const disputeSchema = new Schema(
  {
    code: { type: String, required: true },
    flagId: { type: Schema.Types.ObjectId },
    disputeType: {
      type: String,
      required: true,
      enum: ['LOST', 'DAMAGED', 'MISMATCHED_ITEM', 'COD_MISMATCH', 'DELAYED'],
    },
    claimedAmount: { type: Number, required: true, min: 0 },
    approvedCompensation: { type: Number, min: 0 },
    status: {
      type: String,
      required: true,
      enum: [
        'DRAFT',
        'FILED',
        'UNDER_REVIEW',
        'ACCEPTED',
        'REJECTED',
        'COMPENSATED',
        'CLOSED',
      ],
    },
    evidenceUrls: { type: [String], default: [] },
    description: { type: String },
    compensationVoucherId: { type: Schema.Types.ObjectId, ref: 'CashVoucher' },
    updates: { type: [disputeUpdateSchema], default: [] },
    filedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    filedAt: { type: Date },
    resolvedAt: { type: Date },
  }
);

const shipmentSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    orderCode: { type: String },
    carrierId: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    carrierCode: { type: String },
    waybillNo: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: [
        'CREATED',
        'PICKED_UP',
        'IN_TRANSIT',
        'DELIVERED',
        'DELIVERY_FAILED',
        'RETURNING',
        'RETURNED',
        'LOST',
        'DAMAGED',
      ],
    },
    weightG: { type: Number, min: 0 },
    shippingFee: { type: Number, min: 0 },
    codAmount: { type: Number, min: 0 },
    labelPrintedAt: { type: Date },
    handedOverAt: { type: Date },
    deliveredAt: { type: Date },
    tracking: { type: [trackingEventSchema], default: [] },
    handover: {
      code: { type: String, required: true },
      handoverDate: { type: Date, required: true },
      status: { type: String, enum: ['DRAFT', 'EXPORTED', 'SIGNED'] },
      handedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      carrierReceiver: { type: String },
      fileUrl: { type: String },
      note: { type: String },
    },
    codFlags: { type: [codFlagSchema], default: [] },
    disputes: { type: [disputeSchema], default: [] },
  },
  { timestamps: true, collection: 'shipments' }
);

// Indexes
shipmentSchema.index({ carrierId: 1, waybillNo: 1 }, { unique: true });
shipmentSchema.index({ orderId: 1 });
shipmentSchema.index({ status: 1, createdAt: -1 });
shipmentSchema.index(
  { 'handover.code': 1 },
  { partialFilterExpression: { 'handover.code': { $type: 'string' } } }
);
shipmentSchema.index(
  { carrierId: 1, 'handover.handoverDate': -1 },
  { partialFilterExpression: { 'handover.handoverDate': { $type: 'date' } } }
);
shipmentSchema.index({ 'codFlags.status': 1 });
shipmentSchema.index(
  { 'disputes.code': 1 },
  { unique: true, partialFilterExpression: { 'disputes.code': { $type: 'string' } } }
);
shipmentSchema.index({ 'disputes.status': 1 });

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
