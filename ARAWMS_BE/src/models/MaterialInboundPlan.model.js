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
    unitSnapshot: { type: String, default: 'METER' },
    actualVerifiedPassedQty: { type: Number, default: 0 },
    actualDefectiveOrShortQty: { type: Number, default: 0 },
  },
  { _id: false }
);

const deliveryBatchSchema = new Schema(
  {
    batchNumber: { type: Number, default: 1 },
    batchTitle: { type: String, default: '' },
    batchPercentage: { type: Number, default: 50 },
    scheduledDeliveryDate: { type: Date, required: true },
    notes: { type: String, default: '' },
    status: { type: String, enum: PLAN_STATUS, default: 'SCHEDULED' },
    expectedItems: [expectedItemSchema],
    deliveryComplianceStatus: {
      type: String,
      enum: ['PENDING', 'MATCHED', 'MISMATCHED'],
      default: 'PENDING',
    },
    technicianVerification: {
      verifiedByTechId: { type: Schema.Types.ObjectId, ref: 'User' },
      verifiedAt: Date,
      isMatchedWithPlan: Boolean,
      complianceStatus: {
        type: String,
        enum: ['PENDING', 'MATCHED', 'MISMATCHED'],
        default: 'PENDING',
      },
      deviationSummary: String,
      evidenceImages: [String],
    },
    deviationResolution: {
      status: {
        type: String,
        enum: ['NONE', 'UNRESOLVED', 'RESOLVED'],
        default: 'NONE',
      },
      resolutionNotes: { type: String, default: '' },
      resolvedAt: Date,
      resolvedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User' },
      actionTaken: { type: String, default: 'SUPPLIER_RE_DELIVERY' },
    },
  },
  { _id: true }
);

const materialInboundPlanSchema = new Schema(
  {
    planCode: { type: String, required: true, unique: true, index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract', index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    totalBatches: { type: Number, default: 1, min: 1 },
    batches: [deliveryBatchSchema],
    deliveryBatches: [deliveryBatchSchema],
    warehouseLocationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', index: true },
    deliveryVersion: { type: Number, default: 0 },
    deliveryHistory: [{
      batchId: { type: Schema.Types.ObjectId },
      changeType: { type: String, enum: ['WINDOW', 'ITEMS', 'LEGACY_SETUP'] },
      oldStart: Date, oldEnd: Date, newStart: Date, newEnd: Date,
      reason: String, changedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      changedAt: Date, version: Number,
      oldItems: [{ rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial' }, plannedQty: Number }],
      newItems: [{ rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial' }, plannedQty: Number }],
    }],
    deliveryNote: String,
    scheduledDeliveryDate: { type: Date, required: true, index: true },
    status: { type: String, enum: PLAN_STATUS, default: 'SCHEDULED', index: true },
    deliveryComplianceStatus: {
      type: String,
      enum: ['PENDING', 'MATCHED', 'MISMATCHED'],
      default: 'PENDING',
      index: true,
    },
    createdByAccountantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    physicalContractPhotos: [{ type: String }],
    parentSupersededPlanId: { type: Schema.Types.ObjectId, ref: 'MaterialInboundPlan', default: null },
    rootPlanId: { type: Schema.Types.ObjectId, ref: 'MaterialInboundPlan', default: null, index: true },
    versionNumber: { type: Number, default: 1, min: 1, index: true },
    amendmentReason: { type: String, default: '' },
    notes: { type: String, default: '' },
    expectedItems: [expectedItemSchema],
    batchNumber: { type: Number, default: 1, min: 1, index: true },
    batchTitle: { type: String, default: '' },
    batchPercentage: { type: Number, default: 100, min: 0, max: 100 },
    technicianVerification: {
      verifiedByTechId: { type: Schema.Types.ObjectId, ref: 'User' },
      verifiedAt: Date,
      isMatchedWithPlan: Boolean,
      complianceStatus: {
        type: String,
        enum: ['PENDING', 'MATCHED', 'MISMATCHED'],
        default: 'PENDING',
      },
      deviationSummary: String,
      evidenceImages: [String],
    },
    deviationResolution: {
      status: {
        type: String,
        enum: ['NONE', 'UNRESOLVED', 'RESOLVED'],
        default: 'NONE',
        index: true,
      },
      resolutionNotes: { type: String, default: '' },
      resolvedAt: Date,
      resolvedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User' },
      actionTaken: { type: String, default: 'SUPPLIER_RE_DELIVERY' },
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
