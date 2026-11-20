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
      // APPROVED_PENDING_ADJUSTMENT: đã duyệt, chờ ghi điều chỉnh tồn.
      // RECOUNT_REQUESTED: báo cáo bị trả về vì không hợp lý, đã phát phiên kiểm kê lại.
      enum: ['WAITING', 'FROZEN_COUNTING', 'VARIANCE_REVIEW', 'APPROVED_PENDING_ADJUSTMENT', 'APPROVED_COMPLETED', 'RECOUNT_REQUESTED', 'CANCELLED'],
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
      // Quản lý kho duyệt cả khi báo cáo chưa "đúng hết": lưu lại vấn đề đã chấp nhận lúc duyệt.
      exceededThreshold: Boolean,
      uncountedCount: Number,
      missingCost: Boolean,
    },
    // Điều chỉnh tồn kho theo báo cáo đã duyệt; xong thì phiên chuyển APPROVED_COMPLETED.
    adjustmentInfo: {
      adjustedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      adjustedAt: Date,
      writtenOffUnits: Number,
      quantityAdjustedLines: Number,
      manualLines: Number,
    },
    // Nhân viên kỹ thuật nộp báo cáo; có lệch hoặc còn dòng chưa đếm thì bắt buộc ghi chú lý do.
    submissionInfo: {
      submittedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      submittedAt: Date,
      hasIssues: Boolean,
      note: String,
    },
    // Phiên kiểm lại trỏ về phiên gốc; phiên gốc lưu lý do trả về và phiên kiểm lại đã phát.
    recountOfSessionId: { type: Schema.Types.ObjectId, ref: 'StocktakeSession', index: true },
    recountInfo: {
      requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      requestedAt: Date,
      reason: String,
      recountSessionId: { type: Schema.Types.ObjectId, ref: 'StocktakeSession' },
    },
  },
  { collection: 'stocktake_sessions' }
);

stocktakeSessionSchema.plugin(baseSchemaPlugin);
stocktakeSessionSchema.index({ scheduleId: 1, occurrenceKey: 1 }, { unique: true, partialFilterExpression: { occurrenceKey: { $type: 'string' } } });

const StocktakeSession = mongoose.model('StocktakeSession', stocktakeSessionSchema);
export default StocktakeSession;
