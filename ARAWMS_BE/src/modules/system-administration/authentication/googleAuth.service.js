/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-05; GBR-01 - Đăng nhập bằng Google đã liên kết với tài khoản
 * đang hoạt động.
 */

import User from '../../../models/User.model.js';
import { httpError } from '../../../common/utils/httpError.js';
import { verifyGoogleIdentity } from './googleIdentity.service.js';
import { createSession, activeAccountFilter, isActiveAccount } from './auth.service.js';

// UC-05, GBR-01: Mọi vai trò đang hoạt động được dùng Google đã liên kết.
export const loginWithGoogle = async (req) => {
  const identity = await verifyGoogleIdentity(req.body, 'LOGIN', req);
  /*
   * UC-05: Tìm theo Google ID đã lưu, không tự cấp quyền theo email
   * Google.
   */
  const user = await User.findOne({
    googleId: identity.googleId, ...activeAccountFilter,
  }).populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!isActiveAccount(user)) {
    throw httpError(403, 'Google này chưa liên kết với tài khoản đang hoạt động. Đăng nhập bằng mật khẩu để liên kết trong trang tài khoản.');
  }
  return createSession(user, req.body.rememberMe === true, req, 'GOOGLE');
};
