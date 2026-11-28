/*
 * File: SystemLog.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines audit records for system activity. Stores event details and references needed to trace an action.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { ROLES } from '../common/constants/enums.js';

const { Schema } = mongoose;

/** Lưu nhật ký cho UC-017. Thông tin người thực hiện và mã đối tượng cho phép truy vết lại thay đổi qua các module. */
const systemLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: { type: String, enum: ROLES, index: true },
    majorFeature: { type: String, required: true, index: true },
    subFeature: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetCollection: { type: String },
    targetId: { type: Schema.Types.ObjectId, index: true },
    targetCode: { type: String, index: true },
    // Ảnh chụp trước và sau có cấu trúc tùy đối tượng nghiệp vụ. API nhật ký lọc trường cần bảo mật trước khi trả kết quả.
    beforeSnapshot: { type: Schema.Types.Mixed },
    afterSnapshot: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { collection: 'system_logs' }
);

systemLogSchema.plugin(baseSchemaPlugin);

systemLogSchema.index({ createdAt: -1, majorFeature: 1, actorId: 1 });

const SystemLog = mongoose.model('SystemLog', systemLogSchema);
export default SystemLog;
