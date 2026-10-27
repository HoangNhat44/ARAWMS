/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-05; GBR-01 - Đăng nhập bằng Google đã liên kết với Owner
 * đang hoạt động.
 */

import User from '../../../models/User.model.js';
import { httpError } from '../../../common/utils/httpError.js';
import { verifyGoogleIdentity } from './googleIdentity.service.js';
import { createSession, activeAccountFilter, isActiveAccount } from './auth.service.js';

// UC-05, GBR-01: Chỉ cho Google đã liên kết với Owner đang hoạt động đăng nhập.
export const loginWithGoogle = async (req) => {
  const identity = await verifyGoogleIdentity(req.body, 'LOGIN', req);
  /*
   * UC-05: Tìm theo Google ID đã lưu, không tự cấp quyền Owner theo email
   * Google.
   */
  const user = await User.findOne({
    googleId: identity.googleId, roleCode: 'OWNER', ...activeAccountFilter,
  }).populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!isActiveAccount(user)) {
    throw httpError(403, 'Tài khoản Google chưa được liên kết với Owner đang hoạt động. Hãy đăng nhập bằng mật khẩu và liên kết trong trang tài khoản.');
  }
  return createSession(user, req.body.rememberMe === true, req, 'GOOGLE');
};
