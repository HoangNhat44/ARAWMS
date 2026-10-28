/*
 * File: MaterialInboundPlan.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines scheduled raw-material receipts. Records verification results and decisions about delivery differences.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { PLAN_STATUS } from '../common/constants/enums.js';

const { Schema } = mongoose;

const expectedItemSchema = new Schema(
  {
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    plannedQty: { type: Number, required: true },
    actualVerifiedPassedQty: { type: Number, default: 0 },
    actualDefectiveOrShortQty: { type: Number, default: 0 },
  },
  { _id: false }
);

const materialInboundPlanSchema = new Schema(
  {
    planCode: { type: String, required: true, unique: true, index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract', required: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    scheduledDeliveryDate: { type: Date, required: true, index: true },
    status: { type: String, enum: PLAN_STATUS, default: 'SCHEDULED', index: true },
    createdByAccountantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expectedItems: [expectedItemSchema],
    technicianVerification: {
      verifiedByTechId: { type: Schema.Types.ObjectId, ref: 'User' },
      verifiedAt: Date,
      isMatchedWithPlan: Boolean,
      deviationSummary: String,
      evidenceImages: [String],
    },
    deviationResolution: {
      ownerDecision: {
        type: String,
        enum: ['NONE', 'PENALIZE_AND_NEW_CONTRACT', 'ACCEPT_PARTIAL_AND_REPLAN', 'REJECT_ENTIRE_BATCH'],
        default: 'NONE',
      },
      decidedByOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
      decidedAt: Date,
      executedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User' },
      replacementContractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract' },
      replacementPlanId: { type: Schema.Types.ObjectId, ref: 'MaterialInboundPlan' },
    },
  },
  { collection: 'material_inbound_plans' }
);

materialInboundPlanSchema.plugin(baseSchemaPlugin);

const MaterialInboundPlan = mongoose.model('MaterialInboundPlan', materialInboundPlanSchema);
export default MaterialInboundPlan;
