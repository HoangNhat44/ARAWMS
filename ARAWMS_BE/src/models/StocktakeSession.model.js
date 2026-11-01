/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157 (bổ sung Owner)
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-06; GBR-18/19 - Trạng thái kiểm kê và quyết định duyệt Owner.
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
      enum: ['FROZEN_COUNTING', 'VARIANCE_REVIEW', 'APPROVED_PENDING_ADJUSTMENT', 'APPROVED_COMPLETED', 'CANCELLED'],
      default: 'FROZEN_COUNTING',
      index: true,
    },
    totalItemsExpected: { type: Number, default: 0 },
    totalDiscrepancyCount: { type: Number, default: 0 },
    // Nguyễn Ngọc Huy-HE171157, 30-10-2026: OWNER-EXT-06 - Phát hiện yêu cầu duyệt dựa trên phiên bản cũ.
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

const StocktakeSession = mongoose.model('StocktakeSession', stocktakeSessionSchema);
export default StocktakeSession;
