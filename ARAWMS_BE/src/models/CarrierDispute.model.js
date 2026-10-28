/*
 * File: CarrierDispute.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines claims raised against shipping carriers. Tracks waybill evidence, requested compensation, and resolution status.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const disputeStatusLogSchema = new Schema(
  {
    status: String,
    note: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const carrierDisputeSchema = new Schema(
  {
    disputeCode: { type: String, required: true, unique: true, index: true },
    carrierId: { type: Schema.Types.ObjectId, ref: 'ShippingCarrier', required: true, index: true },
    salesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true, index: true },
    waybillCode: { type: String, required: true, index: true },
    reconciliationItemId: { type: Schema.Types.ObjectId, ref: 'CodReconciliationItem' },
    disputeType: {
      type: String,
      enum: ['LOST_PARCEL', 'DAMAGED_PARCEL', 'COD_UNDERPAID', 'OVERCHARGED_FEE'],
      required: true,
    },
    claimedAmount: { type: Number, required: true, min: 0 },
    compensatedAmount: { type: Number, default: 0, min: 0 },
    packagingVideoEvidenceUrl: { type: String },
    status: {
      type: String,
      enum: ['OPEN_SUBMITTED', 'UNDER_CARRIER_REVIEW', 'COMPENSATED', 'REJECTED', 'CLOSED'],
      default: 'OPEN_SUBMITTED',
      index: true,
    },
    filedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    statusLogs: [disputeStatusLogSchema],
  },
  { collection: 'carrier_disputes' }
);

carrierDisputeSchema.plugin(baseSchemaPlugin);

const CarrierDispute = mongoose.model('CarrierDispute', carrierDisputeSchema);
export default CarrierDispute;
