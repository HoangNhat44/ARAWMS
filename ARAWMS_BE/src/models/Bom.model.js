/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-19 - Projection chỉ đọc BOM dùng đối chiếu lệnh sản xuất, mục 8 DATA_DICTIONARY.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
const schema = new mongoose.Schema({ bomCode: String, skuId: mongoose.Schema.Types.ObjectId, skuCode: String,
  // UC-19: Giữ phiên bản và định mức BOM liên kết; không thay bằng BOM mới nhất khi xem báo cáo.
  versionNo: Number, status: String, lines: [mongoose.Schema.Types.Mixed], techNotes: String,
}, { collection: 'boms', strict: false });
schema.plugin(baseSchemaPlugin);
export default mongoose.model('Bom', schema);
