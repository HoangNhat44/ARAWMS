/*
 * File: CashFlowVoucher.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines cash receipt and payment vouchers. Links financial entries to suppliers, orders, returns, or COD batches.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const cashFlowVoucherSchema = new Schema(
  {
    voucherCode: { type: String, required: true, unique: true, index: true },
    flowType: { type: String, enum: ['CASH_IN', 'CASH_OUT'], required: true, index: true },
    category: {
      type: String,
      enum: [
        'SUPPLIER_DEPOSIT',
        'SUPPLIER_INSTALLMENT',
        'CARRIER_COD_PAYOUT',
        'CUSTOMER_RETURN_REFUND',
        'SURCHARGE_REVENUE',
        'CARRIER_DISPUTE_COMPENSATION',
        'OPERATIONAL_EXPENSE',
      ],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['BANK_TRANSFER', 'CASH', 'COD_BALANCE_OFFSET'],
      default: 'BANK_TRANSFER',
    },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract' },
    salesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
    returnRequestId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest' },
    reconciliationBatchId: { type: Schema.Types.ObjectId, ref: 'CodReconciliationBatch' },
    createdByAccountantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    voucherDate: { type: Date, default: Date.now, index: true },
    attachmentUrl: { type: String },
    note: { type: String },
  },
  { collection: 'cash_flow_vouchers' }
);

cashFlowVoucherSchema.plugin(baseSchemaPlugin);

const CashFlowVoucher = mongoose.model('CashFlowVoucher', cashFlowVoucherSchema);
export default CashFlowVoucher;
