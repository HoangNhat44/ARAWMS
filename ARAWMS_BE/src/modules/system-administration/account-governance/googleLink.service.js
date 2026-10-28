/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04, UC-05; GBR-01, GBR-23 - Liên kết Google, hủy liên kết và
 * ghi nhật ký. Mọi vai trò đều được liên kết Google với tài khoản của mình.
 */

import User from '../../../models/User.model.js';
import { httpError } from '../../../common/utils/httpError.js';
import { issueChallenge, passwordFingerprint, verifyGoogleIdentity } from '../authentication/googleIdentity.service.js';
import { recordAccountActivity } from '../systemAudit.js';
import { accountProfile } from './accountProfile.js';
import GoogleAuthChallenge from '../../../models/GoogleAuthChallenge.model.js';
import { validEmail } from './accountInput.js';
import { ENV } from '../../../config/env.js';
import { authorizeGoogleChange, createGoogleAuthorization } from './googleLinkAuthorization.js';


// Dữ liệu cũ có thể chưa có googleLinkVersion.
const versionFilter = (version) => version === 0
  ? { $or: [{ googleLinkVersion: 0 }, { googleLinkVersion: { $exists: false } }] }
  : { googleLinkVersion: version };

/*
 * UC-04, UC-05: Tạo yêu cầu liên kết sau khi xác nhận mật khẩu và chưa có
 * Google được gắn.
 */
export const prepareGoogleLink = async (req) => {
  const user = await authorizeGoogleChange(req);
  if (user.googleId) throw httpError(409, 'Tài khoản đã liên kết Google. Hãy hủy liên kết trước khi chọn tài khoản khác.');
  return {
    ...await issueChallenge('LINK', user, req.auth.sessionId),
    managementToken: req.body.managementToken || createGoogleAuthorization(user, req),
  };
};
// UC-04, UC-05: Mọi vai trò có thể liên kết Google với chính tài khoản đang dùng.
export const linkGoogle = async (req) => {
  const identity = await verifyGoogleIdentity(req.body, 'LINK', req);
  if (!validEmail(identity.email)) throw httpError(400, 'Email Google không hợp lệ.');
  if (await User.exists({ _id: { $ne: req.user._id }, $or: [{ email: identity.email }, { googleEmail: identity.email }] })) {
    throw httpError(409, 'Email này đã thuộc tài khoản khác. Vui lòng chọn Google khác.');
  }
  // UC-04: Từ chối nếu mật khẩu đã đổi sau bước xác nhận liên kết.
  const current = await User.findById(req.user._id).select('+passwordHash +sessions');
  if (!current?.passwordHash || passwordFingerprint(current.passwordHash) !== identity.challenge.passwordFingerprint) {
    throw httpError(409, 'Mật khẩu đã thay đổi. Vui lòng xác nhận liên kết lại.');
  }
  const session = current.sessions.find((item) => item.sessionId === req.auth.sessionId && item.expiresAt > new Date());
  if (!session) throw httpError(401, 'Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.');
  let user;
  try {
    /*
     * UC-04, GBR-01: Chỉ liên kết khi tài khoản còn hoạt động, phiên còn hạn và
     * yêu cầu chưa cũ.
     */
    user = await User.findOneAndUpdate({
      _id: req.user._id, roleCode: req.user.roleCode, status: 'ACTIVE', isDeleted: { $ne: true },
      email: current.email,
      passwordHash: current.passwordHash,
      $and: [versionFilter(identity.challenge.linkVersion || 0)],
      $or: [{ googleId: { $exists: false } }, { googleId: null }, { googleId: '' }],
      sessions: { $elemMatch: { sessionId: req.auth.sessionId, expiresAt: { $gt: new Date() } } },
    }, {
      // UC-04: Email đã xác minh trở thành email đăng nhập và nhận thư khôi phục/OTP.
      $set: {
        googleId: identity.googleId, googleEmail: identity.email, googleLinkedAt: new Date(),
        email: identity.email, emailVerifiedAt: new Date(),
        sessions: [{ sessionId: session.sessionId, expiresAt: session.expiresAt }],
      },
      $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '', passwordResetRequestedAt: '' },
      $inc: { googleLinkVersion: 1 },
    },
    { new: true, runValidators: true }).populate('roleId', 'roleName roleCode isActive isDeleted');
  } catch (error) {
    // UC-04: Không cho một Google liên kết đồng thời với nhiều tài khoản.
    if (error.code === 11000) throw httpError(409, 'Email hoặc Google này đã thuộc tài khoản khác.');
    throw error;
  }
  if (!user) throw httpError(409, 'Tài khoản hoặc phiên làm việc đã thay đổi. Vui lòng tải lại trang.');
  // GBR-23: Ghi nhận email Google vừa liên kết để tra lại thao tác.
  await recordAccountActivity(req, user, 'Account Governance', 'LINK_GOOGLE', {
    afterSnapshot: { googleEmail: identity.email },
  });
  return accountProfile(user);
};

/*
 * UC-04: Hủy Google sau khi kiểm tra mật khẩu, giữ phiên hiện tại và thu hồi
 * các phiên khác.
 */
export const unlinkGoogle = async (req) => {
  const user = await authorizeGoogleChange(req);
  if (!user.googleId) throw httpError(409, 'Tài khoản chưa liên kết Google.');
  const version = user.googleLinkVersion || 0;
  const sessionOwner = await User.findById(req.user._id).select('+sessions');
  const session = sessionOwner?.sessions.find((item) => item.sessionId === req.auth.sessionId && item.expiresAt > new Date());
  if (!session) throw httpError(401, 'Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.');
  /*
   * UC-04: Xóa Google và tăng số phiên bản liên kết để yêu cầu cũ không thể
   * khôi phục liên kết.
   */
  const updated = await User.findOneAndUpdate({
    _id: req.user._id, roleCode: req.user.roleCode, status: 'ACTIVE', isDeleted: { $ne: true },
    googleId: user.googleId, passwordHash: user.passwordHash,
    $and: [versionFilter(version)],
    sessions: { $elemMatch: { sessionId: req.auth.sessionId, expiresAt: { $gt: new Date() } } },
  }, {
    $unset: { googleId: '', googleEmail: '', googleLinkedAt: '' },
    $inc: { googleLinkVersion: 1 },
    $set: {
      failedLoginAttempts: 0, loginLockedUntil: null,
      sessions: [{ sessionId: session.sessionId, expiresAt: session.expiresAt }],
    },
  }, { new: true, runValidators: true }).select('+passwordHash +googleLinkVersion')
    .populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!updated) throw httpError(409, 'Tài khoản đã thay đổi. Vui lòng tải lại trang.');
  // UC-04: Xóa các yêu cầu liên kết cũ còn chờ xử lý của tài khoản.
  await GoogleAuthChallenge.deleteMany({
    userId: user._id, purpose: 'LINK',
    $or: [{ linkVersion: { $lte: version } }, { linkVersion: { $exists: false } }],
  });
  // GBR-23: Ghi lại thao tác hủy Google, không ghi mật khẩu xác nhận.
  await recordAccountActivity(req, updated, 'Account Governance', 'UNLINK_GOOGLE', {
    beforeSnapshot: { googleEmail: user.googleEmail || '' },
  });
  // UC-04: Vừa xác nhận mật khẩu để hủy thì được chọn Google khác ngay, không nhập lần hai.
  return {
    user: accountProfile(updated), managementToken: createGoogleAuthorization(updated, req),
    challenge: ENV.GOOGLE_CLIENT_ID ? await issueChallenge('LINK', updated, req.auth.sessionId) : null,
  };
};
