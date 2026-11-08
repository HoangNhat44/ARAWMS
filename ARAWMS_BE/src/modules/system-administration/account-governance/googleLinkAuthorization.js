/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04, UC-05 - Xác nhận mật khẩu một lần để quản lý liên kết Google.
 */

import jwt from 'jsonwebtoken';
import User from '../../../models/User.model.js';
import { ENV } from '../../../config/env.js';
import { httpError } from '../../../common/utils/httpError.js';
import { verifyCredentials, activeAccountFilter, isActiveAccount } from '../authentication/auth.service.js';
import { passwordFingerprint } from '../authentication/googleIdentity.service.js';

// Quyền này chỉ dùng cho liên kết Google, có hạn 5 phút và không phải token đăng nhập.
export const createGoogleAuthorization = (user, req) => jwt.sign({
  scope: 'GOOGLE_LINK', sid: req.auth.sessionId,
  fingerprint: passwordFingerprint(user.passwordHash), version: user.googleLinkVersion || 0,
}, ENV.JWT_SECRET, {
  subject: String(user._id), expiresIn: '5m', algorithm: 'HS256', issuer: 'arawms', audience: 'arawms-google-link',
});

export const authorizeGoogleChange = async (req) => {
  if (req.body.managementToken) {
    let grant;
    try {
      grant = jwt.verify(req.body.managementToken, ENV.JWT_SECRET, {
        algorithms: ['HS256'], issuer: 'arawms', audience: 'arawms-google-link',
      });
    } catch { throw httpError(403, 'Xác nhận mật khẩu đã hết hạn. Vui lòng nhập lại mật khẩu.'); }
    const user = await User.findOne({ _id: req.user._id, ...activeAccountFilter,
      sessions: { $elemMatch: { sessionId: req.auth.sessionId, expiresAt: { $gt: new Date() } } },
    }).select('+passwordHash +googleLinkVersion').populate('roleId', 'roleCode isActive isDeleted');
    if (!isActiveAccount(user) || !user.passwordHash || grant.scope !== 'GOOGLE_LINK'
      || grant.sub !== String(user._id) || grant.sid !== req.auth.sessionId
      || grant.fingerprint !== passwordFingerprint(user.passwordHash)
      || grant.version !== (user.googleLinkVersion || 0)) {
      throw httpError(403, 'Tài khoản đã thay đổi. Vui lòng xác nhận lại mật khẩu.');
    }
    return user;
  }
  try {
    return await verifyCredentials({ identifier: req.user.employeeCode, password: req.body.currentPassword });
  } catch (error) {
    if (error.statusCode === 401) throw httpError(400, 'Mật khẩu hiện tại không đúng hoặc tài khoản không còn quyền truy cập.');
    throw error;
  }
};
