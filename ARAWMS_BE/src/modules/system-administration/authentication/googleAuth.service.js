import User from '../../../models/User.model.js';
import { httpError } from '../../../common/utils/httpError.js';
import { verifyGoogleIdentity } from './googleIdentity.service.js';
import { createSession } from './auth.service.js';

export const loginWithGoogle = async (req) => {
  const identity = await verifyGoogleIdentity(req.body, 'LOGIN', req);
  const user = await User.findOne({
    googleId: identity.googleId, roleCode: 'OWNER', status: 'ACTIVE', isDeleted: { $ne: true },
  }).select('+loginLockedUntil').populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!user || !user.roleId?.isActive || user.roleId.isDeleted || user.roleId.roleCode !== 'OWNER') {
    throw httpError(403, 'Tài khoản Google chưa được liên kết với Owner đang hoạt động. Hãy đăng nhập bằng mật khẩu và liên kết trong trang tài khoản.');
  }
  if (user.loginLockedUntil > new Date()) throw httpError(429, 'Tài khoản đang tạm khóa. Vui lòng thử lại sau.');
  return createSession(user, req.body.rememberMe === true, req, 'GOOGLE');
};
