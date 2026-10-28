/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-03 - Chọn thông tin hồ sơ được phép trả về giao diện.
 */

import { ROLE_LABELS } from '../../../common/constants/enums.js';

// Chỉ trả thông tin hồ sơ, không trả mật khẩu hoặc dữ liệu phiên đăng nhập.
/*
 * UC-03: Chọn thông tin được hiển thị; không trả hash mật khẩu, token hoặc danh
 * sách phiên.
 */
export const accountProfile = (user) => ({
  id: String(user._id),
  employeeCode: user.employeeCode,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone || '',
  avatarUrl: user.avatarUrl || '',
  roleCode: user.roleCode,
  roleName: user.roleId?.roleName || ROLE_LABELS[user.roleCode] || user.roleCode,
  status: user.status,
  googleLinked: Boolean(user.googleId),
  googleEmail: user.googleEmail || '',
  googleLinkedAt: user.googleLinkedAt || null,
  emailVerified: Boolean(user.emailVerifiedAt || (user.googleId && user.googleEmail === user.email)),
  lastLoginAt: user.lastLoginAt || null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
