/*
 * File: StocktakeSession.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines inventory count sessions. Tracks the scope, status, and participants of a stocktake.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const stocktakeSessionSchema = new Schema(
  {
    sessionCode: { type: String, required: true, unique: true, index: true },
    warehouseType: { type: String, enum: ['RAW_MATERIAL', 'FINISHED_GOODS'], required: true },
    scopeLocationIds: [{ type: Schema.Types.ObjectId, ref: 'WarehouseLocation' }],
    createdByManagerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['FROZEN_COUNTING', 'VARIANCE_REVIEW', 'APPROVED_COMPLETED', 'CANCELLED'],
      default: 'FROZEN_COUNTING',
      index: true,
    },
    totalItemsExpected: { type: Number, default: 0 },
    totalDiscrepancyCount: { type: Number, default: 0 },
    approvalInfo: {
      approvalLevelRequired: { type: String, enum: ['MINOR_MANAGER', 'MAJOR_OWNER'] },
      approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
      adjustmentReason: String,
      agingStockActionPlan: String,
    },
  },
  { collection: 'stocktake_sessions' }
);

stocktakeSessionSchema.plugin(baseSchemaPlugin);

const StocktakeSession = mongoose.model('StocktakeSession', stocktakeSessionSchema);
export default StocktakeSession;
