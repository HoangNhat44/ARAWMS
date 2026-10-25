import { randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import GoogleAuthChallenge from '../../../models/GoogleAuthChallenge.model.js';
import { ENV } from '../../../config/env.js';
import { httpError } from '../../../common/utils/httpError.js';

const client = new OAuth2Client();
export const passwordFingerprint = (hash) => createHash('sha256').update(hash).digest('hex');
export const googleConfig = () => ({ enabled: Boolean(ENV.GOOGLE_CLIENT_ID), clientId: ENV.GOOGLE_CLIENT_ID });

export const issueChallenge = async (purpose, user, sessionId) => {
  if (!ENV.GOOGLE_CLIENT_ID) throw httpError(503, 'Đăng nhập Google chưa được cấu hình. Vui lòng dùng tài khoản và mật khẩu.');
  const challenge = await GoogleAuthChallenge.create({
    nonce: randomBytes(32).toString('hex'), purpose,
    userId: user?._id, sessionId,
    passwordFingerprint: user ? passwordFingerprint(user.passwordHash) : undefined,
    linkVersion: user ? (user.googleLinkVersion || 0) : undefined,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  return { challengeId: String(challenge._id), nonce: challenge.nonce, clientId: ENV.GOOGLE_CLIENT_ID };
};

export const verifyGoogleIdentity = async (body, purpose, req) => {
  if (!ENV.GOOGLE_CLIENT_ID) throw httpError(503, 'Đăng nhập Google chưa được cấu hình.');
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.challengeId !== 'string' || !/^[a-f0-9]{24}$/i.test(body.challengeId)
    || !mongoose.isValidObjectId(body.challengeId)
    || typeof body.credential !== 'string' || !body.credential || body.credential.length > 8192
    || (body.rememberMe !== undefined && typeof body.rememberMe !== 'boolean')) {
    throw httpError(400, 'Thông tin xác thực Google không hợp lệ.');
  }
  const filter = {
    _id: body.challengeId, purpose, expiresAt: { $gt: new Date() },
    ...(purpose === 'LINK' ? { userId: req.user._id, sessionId: req.auth.sessionId } : {}),
  };
  const challenge = await GoogleAuthChallenge.findOne(filter);
  if (!challenge) throw httpError(400, 'Yêu cầu Google đã hết hạn hoặc đã sử dụng. Vui lòng thử lại.');
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: body.credential, audience: ENV.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw httpError(400, 'Không xác minh được tài khoản Google. Vui lòng thử lại.');
  }
  if (!payload?.sub || !payload.email || payload.email_verified !== true || payload.nonce !== challenge.nonce) {
    throw httpError(400, 'Danh tính Google hoặc mã xác thực không hợp lệ.');
  }
  // Điều kiện hết hạn được kiểm tra lại; chỉ một request được sử dụng thử thách.
  filter.expiresAt = { $gt: new Date() };
  if (!await GoogleAuthChallenge.findOneAndDelete(filter)) {
    throw httpError(400, 'Yêu cầu Google đã hết hạn hoặc đã sử dụng. Vui lòng thử lại.');
  }
  return { googleId: payload.sub, email: payload.email.toLowerCase(), challenge };
};
