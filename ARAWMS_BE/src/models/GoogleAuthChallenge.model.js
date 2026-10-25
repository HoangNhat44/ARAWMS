import mongoose from 'mongoose';

// Thử thách dùng một lần, tự dọn sau 5 phút; không lưu Google token.
const schema = new mongoose.Schema({
  nonce: { type: String, required: true },
  purpose: { type: String, enum: ['LOGIN', 'LINK'], required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: String,
  passwordFingerprint: String,
  linkVersion: Number,
  expiresAt: { type: Date, required: true },
}, { collection: 'google_auth_challenges' });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('GoogleAuthChallenge', schema);
