/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-107, UC-108. Lưu báo cáo quản lý kho và mốc Owner xác nhận đã xem.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
const { Schema } = mongoose;
/** Lưu nội dung, kỳ báo cáo, người gửi và phần phản hồi của Owner. Chỉ mục trạng thái và thời điểm gửi phục vụ danh sách. */
const schema = new Schema({ code: { type: String, required: true, unique: true },
  reportType: { type: String, enum: ['DAILY_OPERATIONS', 'WEEKLY', 'MONTHLY', 'PRODUCTION', 'INVENTORY', 'SALES', 'EXCEPTION'], required: true },
  title: { type: String, required: true }, periodStart: Date, periodEnd: Date, summary: String,
  // Mixed hỗ trợ cả dữ liệu thống kê có cấu trúc và báo cáo văn bản cũ.
  content: Schema.Types.Mixed, fileUrl: String,
  // Bản nháp chưa được đưa cho Owner; xác nhận đã xem chuyển SUBMITTED sang REVIEWED.
  status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'REVIEWED'], required: true },
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User' }, submittedAt: Date,
  // Người đã xem và ngày xem do BE ghi từ phiên Owner, không lấy từ form.
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reviewedAt: Date, ownerComment: String,
}, { collection: 'manager_reports' });
schema.plugin(baseSchemaPlugin); schema.index({ status: 1, submittedAt: -1 });
export default mongoose.model('ManagerReport', schema);
