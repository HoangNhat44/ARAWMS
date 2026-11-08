/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-20 - Mẫu sản phẩm mới, theo DATA_DICTIONARY mục 9.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
const { Schema } = mongoose;
const schema = new Schema({ code: { type: String, required: true, unique: true }, name: { type: String, required: true }, productCode: String,
  // UC-20: Owner chỉ xem trạng thái mẫu do nghiệp vụ phát triển sản phẩm ghi nhận.
  status: { type: String, enum: ['IN_DEVELOPMENT', 'SAMPLE_READY', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'], required: true },
  // Chi phí và giá là dự kiến; không tự biến thành giá bán hoặc giá vốn thành phẩm.
  description: String, imageUrls: [String], estimatedCost: { type: Number, min: 0 }, proposedPrice: { type: Number, min: 0 },
  evaluationNote: String, createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reviewedAt: Date,
}, { collection: 'product_samples' });
schema.plugin(baseSchemaPlugin); schema.index({ status: 1, createdAt: -1 });
export default mongoose.model('ProductSample', schema);
