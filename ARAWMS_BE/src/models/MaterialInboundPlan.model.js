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

/** A delivery period can contain several confirmed receipts without mixing accepted and rejected quantities. */
const deliveryBatchSchema = new Schema({
  batchCode: { type: String, required: true },
  expectedStart: { type: Date, required: true },
  expectedEnd: { type: Date, required: true },
  status: { type: String, enum: ['OPEN', 'CLOSED_SHORT', 'CANCELLED'], default: 'OPEN' },
  items: [{ rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    plannedQty: { type: Number, required: true, min: 0 },
    acceptedQty: { type: Number, default: 0, min: 0 },
    rejectedQty: { type: Number, default: 0, min: 0 } }],
  closedReason: String,
  closedAt: Date,
  closedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

const materialInboundPlanSchema = new Schema(
  {
    planCode: { type: String, required: true, unique: true, index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract', index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    warehouseLocationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', index: true },
    scheduledDeliveryDate: { type: Date, index: true },
    deliveryBatches: [deliveryBatchSchema],
    deliveryVersion: { type: Number, default: 0 },
    deliveryHistory: [{ batchId: { type: Schema.Types.ObjectId }, changeType: { type: String, enum: ['WINDOW', 'ITEMS', 'LEGACY_SETUP'] },
      oldStart: Date, oldEnd: Date,
      newStart: Date, newEnd: Date, reason: String, changedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      changedAt: Date, version: Number,
      oldItems: [{ rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial' }, plannedQty: Number }],
      newItems: [{ rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial' }, plannedQty: Number }] }],
    deliveryNote: String,
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
