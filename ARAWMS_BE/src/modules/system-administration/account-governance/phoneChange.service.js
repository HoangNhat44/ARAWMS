/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04; GBR-01, GBR-23 - Xác nhận OTP trước khi lưu số điện thoại.
 */

import { randomBytes, randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import User from '../../../models/User.model.js';
import PhoneChangeChallenge from '../../../models/PhoneChangeChallenge.model.js';
import { ENV } from '../../../config/env.js';
import { httpError } from '../../../common/utils/httpError.js';
import { activeAccountFilter, isActiveAccount } from '../authentication/auth.service.js';
import { passwordFingerprint } from '../authentication/googleIdentity.service.js';
import { sendPhoneChangeOtp } from './phoneChange.mailer.js';
import { accountProfile } from './accountProfile.js';
import { recordAccountActivity } from '../systemAudit.js';
import { validEmail } from './accountInput.js';

const hashOtp = (challengeId, otp) => createHmac('sha256', ENV.JWT_SECRET)
  .update(challengeId + ':' + otp).digest('hex');
const invalidOtp = () => httpError(400, 'OTP không đúng, đã hết hạn hoặc đã dùng. Mỗi mã được thử tối đa 5 lần.');
const currentAccount = async (req) => {
  const user = await User.findOne({ _id: req.user._id, ...activeAccountFilter,
    sessions: { $elemMatch: { sessionId: req.auth.sessionId, expiresAt: { $gt: new Date() } } },
  }).select('+passwordHash +googleLinkVersion').populate('roleId', 'roleCode isActive isDeleted');
  if (!isActiveAccount(user) || !user.passwordHash) throw httpError(401, 'Tài khoản hoặc phiên làm việc không còn hợp lệ.');
  return user;
};

export const requestPhoneChange = async (req) => {
  const user = await currentAccount(req);
  if (!(user.emailVerifiedAt || (user.googleId && user.googleEmail === user.email)) || !validEmail(user.email)) {
    throw httpError(400, 'Hãy liên kết Google để xác nhận email trước khi đổi số điện thoại.');
  }
  if (req.newPhone === user.phone) throw httpError(400, 'Số điện thoại mới phải khác số hiện tại.');
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const challengeId = randomBytes(32).toString('hex');
  const otp = String(randomInt(0, 1000000)).padStart(6, '0');
  const withinWindow = { $gt: ['$windowStartedAt', windowCutoff] };
  // UC-04: MongoDB giữ giới hạn một phút/lần và tối đa 5 email trong 15 phút cho mỗi tài khoản.
  try {
    await PhoneChangeChallenge.findOneAndUpdate({
      userId: user._id,
      $and: [
        { $or: [{ requestedAt: { $lte: new Date(now.getTime() - 60000) } }, { requestedAt: { $exists: false } }] },
        { $or: [{ windowStartedAt: { $lte: windowCutoff } }, { windowStartedAt: { $exists: false } }, { requestCount: { $lt: 5 } }] },
      ],
    }, [{ $set: {
      challengeId, sessionId: req.auth.sessionId, phone: req.newPhone,
      previousPhone: { $literal: user.phone || '' }, email: { $literal: user.email },
      fullName: { $literal: req.pendingFullName || null },
      previousFullName: { $literal: user.fullName },
      passwordFingerprint: passwordFingerprint(user.passwordHash), linkVersion: user.googleLinkVersion || 0,
      otpHash: hashOtp(challengeId, otp), attempts: 0, used: false, sent: false,
      requestedAt: now, expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      purgeAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      windowStartedAt: { $cond: [withinWindow, '$windowStartedAt', now] },
      requestCount: { $cond: [withinWindow, { $add: ['$requestCount', 1] }, 1] },
    } }], { upsert: true, new: true });
  } catch (error) {
    if (error.code === 11000) throw httpError(429, 'Vui lòng đợi 60 giây giữa các lần gửi OTP; tối đa 5 lần trong 15 phút.');
    throw error;
  }
  try {
    // Không trả OTP cho trình duyệt hoặc ghi OTP vào nhật ký.
    await sendPhoneChangeOtp(user.email, req.newPhone, otp);
    await PhoneChangeChallenge.updateOne({ userId: user._id, challengeId }, { $set: { sent: true } });
  } catch (error) {
    await PhoneChangeChallenge.updateOne({ userId: user._id, challengeId }, { $set: { used: true }, $unset: { otpHash: '' } });
    throw error;
  }
  return { challengeId, email: user.email, phone: req.newPhone, expiresAt: new Date(now.getTime() + 300000), resendAfter: 60 };
};

export const confirmPhoneChange = async (req) => {
  const user = await currentAccount(req);
  // Tăng số lần thử trong DB để nhiều yêu cầu đồng thời không vượt giới hạn.
  const challenge = await PhoneChangeChallenge.findOneAndUpdate({
    userId: user._id, challengeId: req.body.challengeId, sessionId: req.auth.sessionId,
    sent: true, used: false, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 },
  }, { $inc: { attempts: 1 } }, { new: true }).select('+otpHash');
  if (!challenge?.otpHash || !timingSafeEqual(Buffer.from(challenge.otpHash, 'hex'),
    Buffer.from(hashOtp(challenge.challengeId, req.body.otp), 'hex'))) throw invalidOtp();
  if (challenge.email !== user.email || challenge.previousPhone !== (user.phone || '')
    || (challenge.fullName && challenge.previousFullName !== user.fullName)
    || challenge.passwordFingerprint !== passwordFingerprint(user.passwordHash)
    || challenge.linkVersion !== (user.googleLinkVersion || 0)) {
    throw httpError(409, 'Thông tin tài khoản đã thay đổi. Vui lòng gửi OTP mới.');
  }
  // UC-04: Chỉ một yêu cầu được dùng mã; không lưu số điện thoại trước bước này.
  const consumed = await PhoneChangeChallenge.findOneAndUpdate({
    _id: challenge._id, challengeId: challenge.challengeId, used: false,
    otpHash: challenge.otpHash, expiresAt: { $gt: new Date() },
  }, { $set: { used: true }, $unset: { otpHash: '' } });
  if (!consumed) throw invalidOtp();
  const updated = await User.findOneAndUpdate({
    _id: user._id, ...activeAccountFilter, email: challenge.email, passwordHash: user.passwordHash,
    ...(challenge.fullName ? { fullName: challenge.previousFullName } : {}),
    $and: [
      challenge.linkVersion === 0
        ? { $or: [{ googleLinkVersion: 0 }, { googleLinkVersion: { $exists: false } }] }
        : { googleLinkVersion: challenge.linkVersion },
      challenge.previousPhone === ''
        ? { $or: [{ phone: '' }, { phone: null }, { phone: { $exists: false } }] }
        : { phone: challenge.previousPhone },
    ],
    sessions: { $elemMatch: { sessionId: req.auth.sessionId, expiresAt: { $gt: new Date() } } },
  }, { $set: { phone: challenge.phone, ...(challenge.fullName ? { fullName: challenge.fullName } : {}) } }, { new: true, runValidators: true })
    .populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!updated) throw httpError(409, 'Tài khoản đã thay đổi. Vui lòng gửi OTP mới.');
  await recordAccountActivity(req, updated, 'Account Governance', 'CHANGE_OWN_PHONE', {
    beforeSnapshot: { phone: challenge.previousPhone, fullName: user.fullName },
    afterSnapshot: { phone: updated.phone, fullName: updated.fullName },
  });
  return accountProfile(updated);
};
