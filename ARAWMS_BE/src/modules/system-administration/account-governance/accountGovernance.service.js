import bcrypt from 'bcryptjs';
import User from '../../../models/User.model.js';
import { httpError } from '../../../common/utils/httpError.js';
import { accountProfile } from './accountProfile.js';
import { recordAccountActivity } from '../systemAudit.js';

export const updateProfile = async (req) => {
  const user = await User.findOneAndUpdate({
    _id: req.user._id, status: 'ACTIVE', isDeleted: { $ne: true },
    sessions: { $elemMatch: { sessionId: req.auth.sessionId, expiresAt: { $gt: new Date() } } },
  }, { $set: req.profileInput }, { new: true, runValidators: true })
    .populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!user) throw httpError(401, 'Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.');
  await recordAccountActivity(req, user, 'Account Governance', 'UPDATE_OWN_PROFILE', {
    beforeSnapshot: { fullName: req.user.fullName, phone: req.user.phone || '' },
    afterSnapshot: { fullName: user.fullName, phone: user.phone || '' },
  });
  return accountProfile(user);
};

export const changePassword = async (req) => {
  if (req.user.roleCode === 'OWNER') throw httpError(403, 'Đổi mật khẩu chỉ áp dụng cho tài khoản nhân viên.');
  const user = await User.findOne({ _id: req.user._id, status: 'ACTIVE', isDeleted: { $ne: true } }).select('+passwordHash');
  if (!user?.passwordHash || !await bcrypt.compare(req.passwordInput.currentPassword, user.passwordHash)) {
    throw httpError(400, 'Mật khẩu hiện tại không đúng.');
  }
  const passwordHash = await bcrypt.hash(req.passwordInput.newPassword, 12);
  const result = await User.updateOne({
    _id: user._id, passwordHash: user.passwordHash, status: 'ACTIVE', isDeleted: { $ne: true },
    sessions: { $elemMatch: { sessionId: req.auth.sessionId, expiresAt: { $gt: new Date() } } },
  }, { $set: { passwordHash, sessions: [], failedLoginAttempts: 0, loginLockedUntil: null } });
  if (!result.modifiedCount) throw httpError(409, 'Tài khoản đã thay đổi. Vui lòng đăng nhập lại.');
  await recordAccountActivity(req, req.user, 'Account Governance', 'CHANGE_OWN_PASSWORD');
};
