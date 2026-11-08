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
    scheduleId: { type: Schema.Types.ObjectId, ref: 'StocktakeSchedule', index: true },
    occurrenceKey: { type: String, index: true },
    name: { type: String, trim: true },
    warehouseType: { type: String, enum: ['RAW_MATERIAL', 'FINISHED_GOODS', 'ALL'], required: true },
    scopeType: { type: String, enum: ['WAREHOUSE', 'ZONE', 'RACK', 'ITEM'], default: 'WAREHOUSE' },
    zoneCode: String, rackId: Schema.Types.ObjectId, itemType: String, itemId: Schema.Types.ObjectId,
    scheduledAt: Date, dueAt: Date, inspectorId: { type: Schema.Types.ObjectId, ref: 'User' },
    approverId: { type: Schema.Types.ObjectId, ref: 'User' }, instructions: String,
    scopeLocationIds: [{ type: Schema.Types.ObjectId, ref: 'WarehouseLocation' }],
    createdByManagerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['WAITING', 'FROZEN_COUNTING', 'VARIANCE_REVIEW', 'APPROVED_COMPLETED', 'CANCELLED'],
      default: 'WAITING',
      index: true,
    },
    totalItemsExpected: { type: Number, default: 0 },
    totalDiscrepancyCount: { type: Number, default: 0 },
    approvalRevision: { type: Number, default: 0, min: 0 },
    approvalInfo: {
      approvalLevelRequired: { type: String, enum: ['MINOR_MANAGER', 'MAJOR_OWNER'] },
      approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
      adjustmentReason: String,
      agingStockActionPlan: String,
      // GBR-18: Lưu dấu báo cáo đã duyệt để module điều chỉnh đối chiếu trước khi ghi sổ.
      approvedReportHash: String,
    },
  },
  { collection: 'stocktake_sessions' }
);

stocktakeSessionSchema.plugin(baseSchemaPlugin);
stocktakeSessionSchema.index({ scheduleId: 1, occurrenceKey: 1 }, { unique: true, partialFilterExpression: { occurrenceKey: { $type: 'string' } } });

const StocktakeSession = mongoose.model('StocktakeSession', stocktakeSessionSchema);
export default StocktakeSession;
