/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04; GBR-23 - Cập nhật hồ sơ, đổi mật khẩu và ghi lại thay
 * đổi.
 */

import bcrypt from 'bcryptjs';
import User from '../../../models/User.model.js';
import { httpError } from '../../../common/utils/httpError.js';
import { accountProfile } from './accountProfile.js';
import { recordAccountActivity } from '../systemAudit.js';

// UC-04, GBR-01: Chỉ lưu hồ sơ khi tài khoản và phiên hiện tại vẫn hợp lệ.
export const updateProfile = async (req) => {
  // UC-04: Không cho bỏ qua bước xác nhận OTP bằng cách gọi API hồ sơ trực tiếp.
  if (req.profileInput.phone !== undefined && req.profileInput.phone !== (req.user.phone || '')) {
    throw httpError(400, 'Đổi số điện thoại cần xác nhận OTP gửi tới email đã liên kết.');
  }
  const profileInput = { ...req.profileInput };
  delete profileInput.phone;
  const user = await User.findOneAndUpdate({
    _id: req.user._id, status: 'ACTIVE', isDeleted: { $ne: true },
    sessions: { $elemMatch: { sessionId: req.auth.sessionId, expiresAt: { $gt: new Date() } } },
  }, { $set: profileInput }, { new: true, runValidators: true })
    .populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!user) throw httpError(401, 'Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.');
  // UC-04, GBR-23: Lưu họ tên và số điện thoại trước và sau khi sửa.
  await recordAccountActivity(req, user, 'Account Governance', 'UPDATE_OWN_PROFILE', {
    beforeSnapshot: { fullName: req.user.fullName, phone: req.user.phone || '' },
    afterSnapshot: { fullName: user.fullName, phone: user.phone || '' },
  });
  return accountProfile(user);
};

// UC-04: Đối chiếu mật khẩu hiện tại trước khi cho đổi mật khẩu.
export const changePassword = async (req) => {
  const user = await User.findOne({ _id: req.user._id, status: 'ACTIVE', isDeleted: { $ne: true } }).select('+passwordHash');
  if (!user?.passwordHash || !await bcrypt.compare(req.passwordInput.currentPassword, user.passwordHash)) {
    throw httpError(400, 'Mật khẩu hiện tại không đúng.');
  }
  const passwordHash = await bcrypt.hash(req.passwordInput.newPassword, 12);
  /*
   * UC-04, GBR-02: Lưu hash mới, kết thúc các phiên và xóa thông tin khôi phục
   * cũ.
   */
  const result = await User.updateOne({
    _id: user._id, passwordHash: user.passwordHash, status: 'ACTIVE', isDeleted: { $ne: true },
    sessions: { $elemMatch: { sessionId: req.auth.sessionId, expiresAt: { $gt: new Date() } } },
  }, {
    $set: { passwordHash, sessions: [], failedLoginAttempts: 0, loginLockedUntil: null, passwordResetRequired: false },
    $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '', passwordResetRequestedAt: '' },
  });
  if (!result.modifiedCount) throw httpError(409, 'Tài khoản đã thay đổi. Vui lòng đăng nhập lại.');
  // GBR-23: Ghi nhận đổi mật khẩu mà không lưu mật khẩu vào nhật ký.
  await recordAccountActivity(req, req.user, 'Account Governance', 'CHANGE_OWN_PASSWORD');
};
