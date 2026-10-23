import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../../models/User.model.js';
import { ENV } from '../../../config/env.js';
import { httpError } from '../../../common/utils/httpError.js';
import { accountProfile } from '../account-governance/accountProfile.js';
import { recordAccountActivity } from '../systemAudit.js';

// Match bcrypt work even when the identifier does not exist.
const dummyHash = bcrypt.hashSync('arawms-invalid-credential', 12);

export const login = async ({ identifier, password, rememberMe }, req) => {
  const user = await User.findOne({
    isDeleted: { $ne: true },
    $or: [{ email: identifier.toLowerCase() }, { employeeCode: identifier.toUpperCase() }],
  }).select('+passwordHash +failedLoginAttempts +loginLockedUntil')
    .populate('roleId', 'roleName roleCode isActive isDeleted');
  const validPassword = await bcrypt.compare(password, user?.passwordHash || dummyHash);
  if (!user || user.status !== 'ACTIVE' || !user.roleId?.isActive || user.roleId.isDeleted
    || user.roleId.roleCode !== user.roleCode) {
    throw httpError(401, 'Thông tin đăng nhập không đúng hoặc tài khoản không được phép truy cập.');
  }
  // Owner authentication will be implemented separately through authorized Google accounts.
  if (user.roleCode === 'OWNER') {
    throw httpError(403, 'Đăng nhập dành cho Owner chưa được triển khai. Vui lòng sử dụng tài khoản nhân viên.');
  }
  if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
    throw httpError(429, 'Tài khoản tạm khóa do nhập sai mật khẩu. Vui lòng thử lại sau 30 phút.');
  }
  if (!validPassword) {
    // Pipeline update keeps the counter and temporary lock atomic under concurrent attempts.
    const result = await User.findOneAndUpdate({ _id: user._id, status: 'ACTIVE', isDeleted: { $ne: true } }, [{
      $set: {
        failedLoginAttempts: { $add: [{ $cond: [
          { $lte: [{ $ifNull: ['$loginLockedUntil', new Date(0)] }, '$$NOW'] },
          { $cond: [{ $gt: [{ $ifNull: ['$loginLockedUntil', new Date(0)] }, new Date(0)] }, 0,
            { $ifNull: ['$failedLoginAttempts', 0] }] },
          { $ifNull: ['$failedLoginAttempts', 0] },
        ] }, 1] },
      },
    }, {
      $set: { loginLockedUntil: { $cond: [
        { $gte: ['$failedLoginAttempts', 5] }, { $add: ['$$NOW', 30 * 60 * 1000] }, null,
      ] } },
    }], { new: true }).select('+failedLoginAttempts');
    if (result?.failedLoginAttempts >= 5) {
      throw httpError(429, 'Nhập sai mật khẩu 5 lần. Tài khoản tạm khóa trong 30 phút.');
    }
    throw httpError(401, 'Thông tin đăng nhập không đúng hoặc tài khoản không được phép truy cập.');
  }
  const sessionId = randomUUID();
  const lifetime = rememberMe ? 7 * 24 * 60 * 60 : 8 * 60 * 60;
  const expiresAt = new Date(Date.now() + lifetime * 1000);
  const token = jwt.sign({ sid: sessionId }, ENV.JWT_SECRET, {
    subject: String(user._id), expiresIn: lifetime, algorithm: 'HS256', issuer: 'arawms', audience: 'arawms-web',
  });
  const updated = await User.findOneAndUpdate({
    _id: user._id, status: 'ACTIVE', isDeleted: { $ne: true }, passwordHash: user.passwordHash, roleCode: user.roleCode,
    $or: [{ loginLockedUntil: { $lte: new Date() } }, { loginLockedUntil: null }],
  }, {
    $set: { lastLoginAt: new Date(), failedLoginAttempts: 0, loginLockedUntil: null },
    $push: { sessions: { $each: [{ sessionId, expiresAt }], $slice: -10 } },
  }, { new: true }).populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!updated) throw httpError(401, 'Tài khoản đã thay đổi. Vui lòng đăng nhập lại.');
  await recordAccountActivity(req, updated, 'Authentication', 'LOGIN');
  return { user: accountProfile(updated), token, expiresAt };
};

export const logout = async (req) => {
  await User.updateOne({ _id: req.user._id }, {
    $pull: { sessions: { sessionId: req.auth.sessionId } },
  });
  await recordAccountActivity(req, req.user, 'Authentication', 'LOGOUT');
};
