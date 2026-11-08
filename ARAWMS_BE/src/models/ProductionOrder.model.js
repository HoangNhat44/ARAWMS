/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-19 - Projection chỉ đọc lệnh sản xuất theo DATA_DICTIONARY mục 10.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
const { Schema } = mongoose;
// UC-19: Không có API ghi lệnh sản xuất trong phạm vi Owner; giữ các trường khác của module sản xuất.
const schema = new Schema({ code: String, status: String, plannedStart: Date, plannedEnd: Date, actualStart: Date, actualEnd: Date,
  // UC-19: Mỗi SKU giữ BOM được dùng và kế hoạch/thực hiện để đối chiếu tiến độ.
  items: [{ _id: false, skuId: Schema.Types.ObjectId, skuCode: String, bomId: Schema.Types.ObjectId,
    plannedQty: Number, completedQty: Number, defectiveQty: Number, receivedQty: Number }],
  // Nhu cầu vật tư và công đoạn là dữ liệu nguồn; trang Owner không sửa các dữ liệu này.
  materialRequirements: [Schema.Types.Mixed], stages: [Schema.Types.Mixed], cost: Schema.Types.Mixed,
}, { collection: 'production_orders', strict: false });
schema.plugin(baseSchemaPlugin);
export default mongoose.model('ProductionOrder', schema);
