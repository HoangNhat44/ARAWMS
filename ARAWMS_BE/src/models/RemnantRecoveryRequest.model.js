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
    originalRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll', required: true },
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    issuedLengthMeters: { type: Number, required: true },
    consumedCuttingLengthMeters: { type: Number, required: true },
    measuredRemnantLengthMeters: { type: Number, required: true },
    measuredRemnantWeightKg: { type: Number },
    appliedThresholdMeters: { type: Number, required: true },
    generatedRemnantRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' },
    generatedInboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
    status: {
      type: String,
      enum: ['PENDING_RECEIPT_TICKET', 'WAITING_PUTAWAY_SCAN', 'RESTOCKED', 'SCRAPPED_BELOW_THRESHOLD'],
      default: 'PENDING_RECEIPT_TICKET',
    },
  },
  { collection: 'remnant_recovery_requests' }
);

remnantRecoveryRequestSchema.plugin(baseSchemaPlugin);

const RemnantRecoveryRequest = mongoose.model('RemnantRecoveryRequest', remnantRecoveryRequestSchema);
export default RemnantRecoveryRequest;
