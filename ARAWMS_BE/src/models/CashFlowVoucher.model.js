/*
 * File: CashFlowVoucher.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines cash receipt and payment vouchers. Links financial entries to suppliers, orders, returns, or COD batches.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { VOUCHER_STATUS, PAYMENT_EXPENSE_CATEGORIES } from '../common/constants/enums.js';

const { Schema } = mongoose;

const supportingDocSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    fileSize: { type: Number },
    mimeType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const cashFlowVoucherSchema = new Schema(
  {
    voucherCode: { type: String, required: true, unique: true, index: true },
    flowType: {
      type: String,
      enum: ['CASH_IN', 'CASH_OUT'],
      default: 'CASH_OUT',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: PAYMENT_EXPENSE_CATEGORIES,
      required: true,
      index: true,
    },
    paymentReason: { type: String, required: true, trim: true },
    recipient: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      recipientType: {
        type: String,
        enum: ['SUPPLIER', 'CUSTOMER', 'CARRIER', 'PARTNER', 'EMPLOYEE', 'OTHER'],
        default: 'OTHER',
      },
    },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: {
      type: String,
      enum: ['BANK_TRANSFER', 'CASH', 'COD_BALANCE_OFFSET'],
      default: 'BANK_TRANSFER',
      required: true,
    },
    bankInfo: {
      bankName: { type: String, trim: true, default: '' },
      accountNo: { type: String, trim: true, default: '' },
      accountHolder: { type: String, trim: true, default: '' },
      branchName: { type: String, trim: true, default: '' },
    },
    status: {
      type: String,
      enum: VOUCHER_STATUS,
      default: 'DRAFT',
      index: true,
    },
    // Related business documents
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract', index: true },
    installmentNumber: { type: Number, default: null }, // 0: Đặt cọc (Deposit), 1, 2, 3...: Đợt thanh toán theo HĐ
    installmentNumbers: [{ type: Number }], // Danh sách các đợt thanh toán gộp liên tiếp (nếu chi nhiều đợt cùng lúc)
    installmentLabel: { type: String, trim: true, default: '' }, // e.g. "Đặt cọc (30%)", "Đợt 1 + Đợt 2 (70%)"
    salesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', index: true },
    returnRequestId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest', index: true },
    carrierId: { type: Schema.Types.ObjectId, ref: 'ShippingCarrier', index: true },
    reconciliationBatchId: { type: Schema.Types.ObjectId, ref: 'CodReconciliationBatch' },

    // Supporting documents (files/invoices/UNC)
    supportingDocuments: [supportingDocSchema],
    attachmentUrl: { type: String }, // Legacy single-URL compatibility

    // Audit and execution details (Kế toán tự duyệt/xác nhận & chi tiền)
    createdByAccountantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: { type: Date },
    paidByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    paidAt: { type: Date },
    transactionReference: { type: String, trim: true, default: '' },
    cancelledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, default: '' },

    voucherDate: { type: Date, default: Date.now, index: true },
    notes: { type: String, default: '' },
  },
  {
    collection: 'cash_flow_vouchers',
    timestamps: true,
  }
);

cashFlowVoucherSchema.plugin(baseSchemaPlugin);

// Compound indexes for performant query
cashFlowVoucherSchema.index({ flowType: 1, status: 1, voucherDate: -1 });
cashFlowVoucherSchema.index({ supplierId: 1, status: 1 });
cashFlowVoucherSchema.index({ returnRequestId: 1, status: 1 });

const CashFlowVoucher = mongoose.model('CashFlowVoucher', cashFlowVoucherSchema);
export default CashFlowVoucher;
