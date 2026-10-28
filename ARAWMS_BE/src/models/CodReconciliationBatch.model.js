/*
 * File: CodReconciliationBatch.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines imported carrier COD statements. Tracks reconciliation totals, discrepancies, and processing status.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const codReconciliationBatchSchema = new Schema(
  {
    batchCode: { type: String, required: true, unique: true, index: true },
    carrierId: { type: Schema.Types.ObjectId, ref: 'ShippingCarrier', required: true, index: true },
    uploadedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    statementFileUrl: { type: String, required: true },
    status: { type: String, enum: ['UPLOADED', 'RECONCILING', 'COMPLETED'], default: 'UPLOADED' },
    totalWaybillsCount: { type: Number, default: 0 },
    matchedCount: { type: Number, default: 0 },
    redFlagCount: { type: Number, default: 0 },
    totalExpectedCodAmount: { type: Number, default: 0 },
    totalCarrierReportedCodAmount: { type: Number, default: 0 },
    totalDiscrepancyAmount: { type: Number, default: 0 },
  },
  { collection: 'cod_reconciliation_batches' }
);

codReconciliationBatchSchema.plugin(baseSchemaPlugin);

const CodReconciliationBatch = mongoose.model('CodReconciliationBatch', codReconciliationBatchSchema);
export default CodReconciliationBatch;
