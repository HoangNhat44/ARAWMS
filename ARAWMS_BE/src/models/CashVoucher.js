import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Cash Vouchers collection – FT-12
 * Phiếu thu / chi
 */

const cashVoucherSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['RECEIPT', 'PAYMENT'] },
    categoryCode: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    voucherDate: { type: Date, required: true },
    paymentMethod: { type: String, enum: ['CASH', 'BANK_TRANSFER', 'E_WALLET'] },
    counterparty: {
      type: {
        type: String,
        enum: ['CUSTOMER', 'SUPPLIER', 'CARRIER', 'EMPLOYEE', 'MARKETPLACE', 'OTHER'],
      },
      id: { type: Schema.Types.ObjectId },
      name: { type: String },
    },
    ref: {
      type: { type: String },
      id: { type: Schema.Types.ObjectId },
    },
    description: { type: String },
    attachmentUrl: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'POSTED', 'CANCELLED'],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    postedAt: { type: Date },
    cancelReason: { type: String },
  },
  { timestamps: true, collection: 'cash_vouchers' }
);

// Indexes
cashVoucherSchema.index({ code: 1 }, { unique: true });
cashVoucherSchema.index({ voucherDate: -1 });
cashVoucherSchema.index({ categoryCode: 1, voucherDate: 1 });
cashVoucherSchema.index({ 'ref.type': 1, 'ref.id': 1 });

const CashVoucher = mongoose.model('CashVoucher', cashVoucherSchema);
export default CashVoucher;
