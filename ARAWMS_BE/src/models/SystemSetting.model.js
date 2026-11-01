/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157 (bổ sung Owner)
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-02..05 - Cấu hình hệ thống dùng chung và khóa tích hợp.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const systemSettingSchema = new Schema(
  {
    settingKey: { type: String, default: 'GLOBAL_CONFIG', unique: true },
    // Nguyễn Ngọc Huy-HE171157, 30-10-2026: OWNER-EXT-02..05 - Phiên bản chặn ghi đè cấu hình vừa được người khác sửa.
    revision: { type: Number, default: 0, min: 0 },
    // GBR-06: Chiều dài bằng ngưỡng cũng phải thu hồi; ngưỡng mặc định là 2 mét.
    defaultFabricLeftoverThresholdMeters: { type: Number, default: 2.0, min: 0.01, max: 10000 },
    // GBR-11/12: Phụ phí lỗi khách là 10%; lỗi cửa hàng miễn phụ phí và phí vận chuyển.
    returnSurchargePercent: { type: Number, default: 10, enum: [10] },
    returnPolicyNotes: { type: String, default: '', maxlength: 2000 },
    // GBR-19: Chênh lệch vượt một trong hai ngưỡng phải chuyển Owner duyệt.
    minorStocktakeVarianceLimitQty: { type: Number, default: 5, min: 0, max: 1e9 },
    minorStocktakeVarianceLimitValue: { type: Number, default: 1000000, min: 0, max: 1e12 },
    defaultFifoAgingAlertDays: { type: Number, default: 60, min: 1, max: 3650 },
    integrations: {
      facebookPageId: String,
      // OWNER-EXT-02: Khóa được mã hóa và không được lấy theo truy vấn thông thường.
      facebookVerifyToken: { type: String, select: false },
      facebookPageAccessToken: { type: String, select: false },
      ghnToken: { type: String, select: false },
      ghnShopId: { type: Number, min: 1, max: 2147483647 },
      ghnEnabled: { type: Boolean, default: true },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { collection: 'system_settings' }
);

systemSettingSchema.plugin(baseSchemaPlugin);

const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);
export default SystemSetting;
