import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * COD Statements collection – FT-12
 * Sao kê COD của hãng vận chuyển
 */

const codStatementLineSchema = new Schema(
  {
    waybillNo: { type: String, required: true },
    shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment' },
    orderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
    statementCodAmount: { type: Number, min: 0 },
    statementShippingFee: { type: Number, min: 0 },
    statementCodFee: { type: Number, min: 0 },
    statementNet: { type: Number },
    expectedCodAmount: { type: Number, min: 0 },
    diffAmount: { type: Number },
    matchStatus: {
      type: String,
      required: true,
      enum: ['UNMATCHED', 'MATCHED', 'AMOUNT_MISMATCH', 'NOT_FOUND', 'DUPLICATE'],
    },
  },
  { _id: false }
);

const codStatementSchema = new Schema(
  {
    carrierId: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    statementNo: { type: String },
    periodFrom: { type: Date },
    periodTo: { type: Date },
    fileName: { type: String },
    fileUrl: { type: String },
    totals: {
      lines: { type: Number },
      codCollected: { type: Number, min: 0 },
      fees: { type: Number, min: 0 },
      netRemittance: { type: Number, min: 0 },
    },
    reconcileStatus: {
      type: String,
      required: true,
      enum: ['PENDING', 'RECONCILING', 'RECONCILED', 'HAS_DISCREPANCY'],
    },
    lines: {
      type: [codStatementLineSchema],
      default: [],
      validate: {
        validator: (v) => v.length <= 30000,
        message: 'lines không được vượt quá 30000 phần tử',
      },
    },
    remittanceVoucherId: { type: Schema.Types.ObjectId, ref: 'CashVoucher' },
    importedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    importedAt: { type: Date, required: true },
    reconciledAt: { type: Date },
  },
  { timestamps: true, collection: 'cod_statements' }
);

// Indexes
codStatementSchema.index(
  { carrierId: 1, statementNo: 1 },
  { unique: true, partialFilterExpression: { statementNo: { $type: 'string' } } }
);
codStatementSchema.index({ reconcileStatus: 1, importedAt: -1 });
codStatementSchema.index({ 'lines.waybillNo': 1 });
codStatementSchema.index(
  { 'lines.shipmentId': 1 },
  { partialFilterExpression: { 'lines.shipmentId': { $type: 'objectId' } } }
);

const CodStatement = mongoose.model('CodStatement', codStatementSchema);
export default CodStatement;
