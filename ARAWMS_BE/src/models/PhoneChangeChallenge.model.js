/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04 - Lưu hash OTP đổi số điện thoại và giới hạn gửi/thử mã.
 */

import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  challengeId: { type: String, required: true },
  sessionId: { type: String, required: true },
  phone: { type: String, required: true },
  previousPhone: { type: String, default: '' },
  fullName: { type: String },
  previousFullName: { type: String },
  email: { type: String, required: true },
  passwordFingerprint: { type: String, required: true },
  linkVersion: { type: Number, required: true },
  otpHash: { type: String, select: false },
  attempts: { type: Number, default: 0 },
  used: { type: Boolean, default: false },
  sent: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  requestedAt: { type: Date, required: true },
  windowStartedAt: { type: Date, required: true },
  requestCount: { type: Number, default: 0 },
  // Giữ bộ đếm lâu hơn hạn OTP để TTL không làm mất giới hạn gửi lại.
  purgeAt: { type: Date, required: true, expires: 0 },
}, { collection: 'phone_change_challenges', timestamps: true });

export default mongoose.model('PhoneChangeChallenge', schema);
