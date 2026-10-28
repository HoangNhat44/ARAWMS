/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01 đến UC-05; GBR-01, GBR-02 - Lưu tài khoản, phiên và thông
 * tin khôi phục.
 */

import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { ROLES } from '../common/constants/enums.js';
import './Role.model.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    employeeCode: { type: String, required: true, unique: true, uppercase: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    phone: { type: String, trim: true },
    /*
     * UC-01: Chỉ lưu hash mật khẩu và mặc định không lấy trường này khi đọc hồ
     * sơ.
     */
    passwordHash: { type: String, select: false },
    /*
     * UC-04, UC-05: Lưu Google đã liên kết và số phiên bản để kiểm tra yêu cầu
     * cũ.
     */
    googleId: { type: String, sparse: true, index: true },
    googleEmail: { type: String, lowercase: true, trim: true },
    googleLinkedAt: { type: Date },
    emailVerifiedAt: { type: Date },
    googleLinkVersion: { type: Number, default: 0, select: false },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    roleCode: { type: String, enum: ROLES, required: true, index: true },
    // GBR-01: ACTIVE được truy cập; INACTIVE và LOCKED đều bị từ chối.
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'LOCKED'], default: 'ACTIVE', index: true },
    isOnlineForChat: { type: Boolean, default: false, index: true },
    activeChatCount: { type: Number, default: 0 },
    avatarUrl: { type: String },
    lastLoginAt: { type: Date },
    /*
     * GBR-02: Lưu số lần sai và trạng thái cần đặt lại mật khẩu qua Quên mật
     * khẩu.
     */
    failedLoginAttempts: { type: Number, default: 0, select: false },
    loginLockedUntil: { type: Date, select: false },
    passwordResetRequired: { type: Boolean, default: false, select: false },
    /*
     * GBR-02: Chỉ lưu hash mã khôi phục cùng hạn dùng và thời điểm gửi gần
     * nhất.
     */
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordResetRequestedAt: { type: Date, select: false },
    /*
     * UC-01, UC-02: Lưu các phiên còn được phép sử dụng để kiểm tra và thu hồi
     * khi cần.
     */
    sessions: {
      type: [{
        _id: false,
        sessionId: { type: String, required: true },
        expiresAt: { type: Date, required: true },
      }],
      default: [],
      select: false,
    },
  },
  { collection: 'users' }
);

userSchema.plugin(baseSchemaPlugin);
// UC-04, UC-05: Một Google ID chỉ được gắn với một tài khoản.
userSchema.index({ googleId: 1 }, {
  name: 'linked_google_identity_unique', unique: true,
  partialFilterExpression: { googleId: { $type: 'string' } },
});

const User = mongoose.model('User', userSchema);
export default User;
