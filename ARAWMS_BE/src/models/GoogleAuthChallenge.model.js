/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04, UC-05 - Lưu mã xác thực Google có thời hạn và chỉ dùng
 * một lần.
 */

import mongoose from 'mongoose';

// Thử thách dùng một lần, tự dọn sau 5 phút; không lưu Google token.
// UC-04, UC-05: Lưu mã xác thực, loại yêu cầu và tài khoản/phiên khi liên kết.
const schema = new mongoose.Schema({
  nonce: { type: String, required: true },
  purpose: { type: String, enum: ['LOGIN', 'LINK'], required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: String,
  passwordFingerprint: String,
  linkVersion: Number,
  expiresAt: { type: Date, required: true },
}, { collection: 'google_auth_challenges' });
// Tự dọn mã đã hết hạn; phần xác thực vẫn kiểm tra hạn trước khi cho dùng.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('GoogleAuthChallenge', schema);
