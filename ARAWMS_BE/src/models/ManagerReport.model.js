/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-18 - Báo cáo Manager gửi Owner, theo DATA_DICTIONARY mục 31.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
const { Schema } = mongoose;
const schema = new Schema({ code: { type: String, required: true, unique: true },
  reportType: { type: String, enum: ['DAILY_OPERATIONS', 'WEEKLY', 'MONTHLY', 'PRODUCTION', 'INVENTORY', 'SALES', 'EXCEPTION'], required: true },
  title: { type: String, required: true }, periodStart: Date, periodEnd: Date, summary: String,
  // UC-18: Nội dung do Manager gửi chỉ được đọc như văn bản hoặc dữ liệu, không chạy HTML.
  content: Schema.Types.Mixed, fileUrl: String,
  // Bản nháp chưa được đưa cho Owner; xác nhận đã xem chuyển SUBMITTED sang REVIEWED.
  status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'REVIEWED'], required: true },
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User' }, submittedAt: Date,
  // Người đã xem và ngày xem do BE ghi từ phiên Owner, không lấy từ form.
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reviewedAt: Date, ownerComment: String,
}, { collection: 'manager_reports' });
schema.plugin(baseSchemaPlugin); schema.index({ status: 1, submittedAt: -1 });
export default mongoose.model('ManagerReport', schema);
