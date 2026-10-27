/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-02; GBR-01, GBR-02 - Đăng nhập, đăng xuất và kiểm tra
 * trạng thái tài khoản.
 */

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../../models/User.model.js';
import { ENV } from '../../../config/env.js';
import { httpError } from '../../../common/utils/httpError.js';
import { accountProfile } from '../account-governance/accountProfile.js';
import { recordAccountActivity } from '../systemAudit.js';

// GBR-01: Chỉ lấy tài khoản đang hoạt động và chưa bị xóa.
export const activeAccountFilter = { status: 'ACTIVE', isDeleted: { $ne: true } };
// GBR-01: Kiểm tra thêm role còn hoạt động và đúng với role của tài khoản.
export const isActiveAccount = (user) => Boolean(user && user.status === 'ACTIVE' && !user.isDeleted
  && user.roleId?.isActive && !user.roleId.isDeleted && user.roleId.roleCode === user.roleCode);

const dummyHash = bcrypt.hashSync('arawms-invalid-credential', 12);
const credentialsError = () => httpError(401, 'Thông tin đăng nhập không đúng hoặc tài khoản không được phép truy cập.');
const recoveryError = () => Object.assign(httpError(403,
  'Bạn đã nhập sai mật khẩu 5 lần liên tiếp. Chọn Quên mật khẩu để đặt lại mật khẩu qua email.'), {
  details: { code: 'PASSWORD_RESET_REQUIRED' },
});
// GBR-02: Tài khoản đã sai 5 lần cần đặt lại mật khẩu qua Quên mật khẩu.
export const passwordAccessFilter = {
  passwordResetRequired: { $ne: true },
  $or: [{ failedLoginAttempts: { $lt: 5 } }, { failedLoginAttempts: { $exists: false } }],
};

// UC-01: Kiểm tra email hoặc mã nhân viên, mật khẩu và quyền truy cập.
export const verifyCredentials = async ({ identifier, password }) => {
  /*
   * UC-01, GBR-01: Tìm tài khoản được phép đăng nhập theo email hoặc mã nhân
   * viên.
   */
  const user = await User.findOne({
    ...activeAccountFilter,
    $or: [{ email: identifier.toLowerCase() }, { employeeCode: identifier.toUpperCase() }],
  }).select('+passwordHash +failedLoginAttempts +passwordResetRequired +googleLinkVersion')
    .populate('roleId', 'roleName roleCode isActive isDeleted');
  // UC-01: Đối chiếu mật khẩu nhập vào với hash đang lưu trong DB.
  const validPassword = await bcrypt.compare(password, user?.passwordHash || dummyHash);
  if (!isActiveAccount(user)) throw credentialsError();
  // GBR-02: Hướng người dùng sang Quên mật khẩu khi đã sai 5 lần liên tiếp.
  if (user.passwordResetRequired || user.failedLoginAttempts >= 5) throw recoveryError();
  /*
   * GBR-02: Tăng số lần nhập sai trong một lần cập nhật để tránh đếm lệch khi
   * gửi nhiều yêu cầu.
   */
  if (!validPassword) {
    // Bỏ yêu cầu dùng mật khẩu cũ nếu mật khẩu trong DB đã được đổi.
    const result = await User.findOneAndUpdate({
      _id: user._id, ...activeAccountFilter, passwordHash: user.passwordHash,
      passwordResetRequired: { $ne: true },
    }, [{
      $set: { failedLoginAttempts: { $min: [5, { $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 1] }] } },
    }, {
      $set: { passwordResetRequired: { $gte: ['$failedLoginAttempts', 5] }, loginLockedUntil: null },
    }], { new: true }).select('+failedLoginAttempts');
    if (result?.failedLoginAttempts >= 5) throw recoveryError();
    throw credentialsError();
  }
  // UC-01, GBR-02: Nhập đúng trước lần sai thứ 5 thì đưa bộ đếm về 0.
  const confirmed = await User.findOneAndUpdate({
    _id: user._id, ...activeAccountFilter, passwordHash: user.passwordHash, ...passwordAccessFilter,
  }, { $set: { failedLoginAttempts: 0, loginLockedUntil: null } }, { new: true })
    .select('+passwordHash +googleLinkVersion').populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!isActiveAccount(confirmed)) throw credentialsError();
  return confirmed;
};

// UC-01, UC-05: Tạo phiên đăng nhập sau khi xác thực tài khoản hoặc Google.
export const createSession = async (user, rememberMe, req, method = 'PASSWORD') => {
  const sessionId = randomUUID();
  // UC-01: Phiên thường kéo dài 8 giờ; chọn ghi nhớ thì kéo dài 7 ngày.
  const lifetime = rememberMe ? 7 * 24 * 60 * 60 : 8 * 60 * 60;
  const expiresAt = new Date(Date.now() + lifetime * 1000);
  const token = jwt.sign({ sid: sessionId }, ENV.JWT_SECRET, {
    subject: String(user._id), expiresIn: lifetime, algorithm: 'HS256', issuer: 'arawms', audience: 'arawms-web',
  });
  /*
   * GBR-01: Kiểm tra lại trạng thái trước khi lưu phiên để tránh cấp quyền cho
   * tài khoản vừa bị khóa.
   */
  const updated = await User.findOneAndUpdate({
    _id: user._id, ...activeAccountFilter, roleCode: user.roleCode,
    ...(method === 'GOOGLE' ? { googleId: user.googleId } : { passwordHash: user.passwordHash, ...passwordAccessFilter }),
  }, {
    $set: { lastLoginAt: new Date(), failedLoginAttempts: 0, loginLockedUntil: null },
    $push: { sessions: { $each: [{ sessionId, expiresAt }], $slice: -10 } },
  }, { new: true }).populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!isActiveAccount(updated)) throw credentialsError();
  // GBR-23: Ghi nhận tài khoản đã đăng nhập và cách đăng nhập.
  await recordAccountActivity(req, updated, 'Authentication', method === 'GOOGLE' ? 'GOOGLE_LOGIN' : 'LOGIN');
  return { user: accountProfile(updated), token, expiresAt };
};

export const login = async (input, req) => createSession(await verifyCredentials(input), input.rememberMe, req);

// UC-02: Xóa đúng phiên hiện tại khỏi DB và ghi nhận lần đăng xuất.
export const logout = async (req) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { sessions: { sessionId: req.auth.sessionId } } });
  await recordAccountActivity(req, req.user, 'Authentication', 'LOGOUT');
};
