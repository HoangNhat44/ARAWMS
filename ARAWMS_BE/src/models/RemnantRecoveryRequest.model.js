/*
 * File: RemnantRecoveryRequest.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines requests to recover leftover fabric. Tracks source material, requested quantity, and approval state.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const remnantRecoveryRequestSchema = new Schema(
  {
    requestCode: { type: String, required: true, unique: true, index: true },
    outboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket', required: true },
    outboundTicketCodeSnapshot: String,
    outboundLineIndex: Number,
    outboundSourceIndex: Number,
    sourceBarcode: String,
    originalRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll', required: true },
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    issuedLengthMeters: { type: Number, required: true },
    consumedCuttingLengthMeters: { type: Number, required: true },
    measuredRemnantLengthMeters: { type: Number, required: true },
    measuredRemnantWeightKg: { type: Number },
    appliedThresholdMeters: { type: Number, required: true },
    returnKind: { type: String, enum: ['ORIGINAL_ROLL', 'SEPARATE_PIECES'] },
    pieces: [{ lengthMeters: Number, barcode: String, rollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' } }],
    conditionNote: { type: String, maxlength: 500 },
    operationKey: { type: String },
    requestedAt: Date,
    confirmedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: Date,
    discrepancyReason: String,
    discrepancyAt: Date,
    cancelledAt: Date,
    cancelledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    generatedRemnantRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' },
    generatedInboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
    status: {
      type: String,
      enum: ['PENDING_RECEIPT_TICKET', 'WAITING_WAREHOUSE_CONFIRMATION',
        'DISCREPANCY_REPORTED', 'REJECTED', 'CANCELLED',
        'WAITING_PUTAWAY_SCAN', 'RESTOCKED', 'SCRAPPED_BELOW_THRESHOLD'],
      default: 'PENDING_RECEIPT_TICKET',
    },
  },
  { collection: 'remnant_recovery_requests' }
);

remnantRecoveryRequestSchema.plugin(baseSchemaPlugin);
remnantRecoveryRequestSchema.index({ operationKey: 1 }, { unique: true,
  partialFilterExpression: { operationKey: { $type: 'string' } } });
remnantRecoveryRequestSchema.index({ outboundTicketId: 1, outboundLineIndex: 1, outboundSourceIndex: 1 });

const RemnantRecoveryRequest = mongoose.model('RemnantRecoveryRequest', remnantRecoveryRequestSchema);
export default RemnantRecoveryRequest;
