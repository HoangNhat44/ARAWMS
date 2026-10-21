import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const codReconciliationItemSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'CodReconciliationBatch', required: true, index: true },
    carrierId: { type: Schema.Types.ObjectId, ref: 'ShippingCarrier', required: true },
    waybillCode: { type: String, required: true, index: true },
    salesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', index: true },
    orderCode: { type: String, index: true },
    systemExpectedCod: { type: Number, required: true },
    carrierReportedCod: { type: Number, required: true },
    carrierShippingFee: { type: Number, default: 0 },
    varianceAmount: { type: Number, required: true },
    isRedFlag: { type: Boolean, default: false, index: true },
    redFlagReason: {
      type: String,
      enum: ['NONE', 'COD_AMOUNT_MISMATCH', 'ORDER_NOT_FOUND', 'DUPLICATE_SETTLEMENT', 'UNEXPECTED_FEE'],
    },
    redFlagStatus: {
      type: String,
      enum: ['NONE', 'PENDING_INVESTIGATION', 'ESCALATED_TO_DISPUTE', 'RESOLVED_ADJUSTED'],
      default: 'NONE',
      index: true,
    },
    investigationNote: { type: String },
    updatedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { collection: 'cod_reconciliation_items' }
);

codReconciliationItemSchema.plugin(baseSchemaPlugin);

const CodReconciliationItem = mongoose.model('CodReconciliationItem', codReconciliationItemSchema);
export default CodReconciliationItem;
