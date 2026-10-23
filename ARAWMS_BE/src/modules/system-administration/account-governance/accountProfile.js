import { ROLE_LABELS } from '../../../common/constants/enums.js';

// Chỉ trả thông tin hồ sơ, không trả mật khẩu hoặc dữ liệu phiên đăng nhập.
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
  lastLoginAt: user.lastLoginAt || null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
