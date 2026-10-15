import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Supplier Debts collection – FT-12
 * Công nợ nhà cung cấp
 */

const paymentSlipSchema = new Schema(
  {
    code: { type: String, required: true },
    slipType: {
      type: String,
      required: true,
      enum: ['DEPOSIT', 'INSTALLMENT', 'FULL_PAYMENT'],
    },
    installmentNo: { type: Number },
    contractRef: { type: String },
    amount: { type: Number, required: true, min: 0 },
    plannedPayDate: { type: Date },
    paidAt: { type: Date },
    voucherId: { type: Schema.Types.ObjectId, ref: 'CashVoucher' },
    status: { type: String, required: true, enum: ['PLANNED', 'PAID', 'CANCELLED'] },
    note: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const supplierDebtSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['RECEIPT', 'OPENING_BALANCE', 'CONTRACT_DEPOSIT'] },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    supplier: {
      code: { type: String },
      name: { type: String },
    },
    receiptId: { type: Schema.Types.ObjectId, ref: 'StockDocument' },
    originalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0, default: 0 },
    outstandingAmount: { type: Number, min: 0 },
    issueDate: { type: Date },
    dueDate: { type: Date },
    status: {
      type: String,
      required: true,
      enum: ['OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'],
    },
    payments: { type: [paymentSlipSchema], default: [] },
    note: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'supplier_debts' }
);

// Indexes
supplierDebtSchema.index({ code: 1 }, { unique: true });
supplierDebtSchema.index({ supplierId: 1, status: 1 });
supplierDebtSchema.index({ status: 1, dueDate: 1 });

const SupplierDebt = mongoose.model('SupplierDebt', supplierDebtSchema);
export default SupplierDebt;
