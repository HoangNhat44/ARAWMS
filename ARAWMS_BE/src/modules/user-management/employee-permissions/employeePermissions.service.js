/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-09; GBR-01 - Gán/hủy quyền ngoại lệ, thu hồi phiên và ghi nhật ký.
 */
import User from '../../../models/User.model.js';
import Role from '../../../models/Role.model.js';
import { httpError } from '../../../common/utils/httpError.js';
import { objectId } from '../../../common/utils/ownerValidation.js';
import { ownerAudit, ownerTransaction } from '../../../common/utils/ownerOperation.js';
import { permissionCode, effectivePermissions, basePermissionCodes, CARRIER_VIEW, CARRIER_CREATE } from '../../../common/middlewares/authorizePermission.js';
import { employeeRoles } from '../employee-management/employeeManagement.validation.js';
import { employeeProfile } from '../employee-management/employeeManagement.service.js';
import { validatePermissions } from './employeePermissions.validation.js';

// UC-09: Gom quyền của các vai trò nhân viên thành một danh mục để Owner lựa chọn.
export const permissionCatalog = async (session = null) => {
  const roles = await Role.find({ roleCode: { $in: employeeRoles }, isActive: true, isDeleted: { $ne: true } }).select('roleCode roleName permissions').session(session);
  // Mỗi mã quyền chỉ xuất hiện một lần dù nhiều vai trò cùng sử dụng.
  const catalog = new Map();
  for (const code of [CARRIER_VIEW, CARRIER_CREATE]) {
    const [majorFeature, subFeature, action] = code.split('|'); catalog.set(code, { code, majorFeature, subFeature, action });
  }
  for (const role of roles) for (const permission of role.permissions) for (const action of permission.allowedActions) {
    // UC-09: Không cấp các chức năng Owner thông qua vai trò nhân viên cấu hình sai.
    if (['User Management', 'System Administration', 'Managerial Financial Analytics'].includes(permission.majorFeature)) continue;
    const code = permissionCode(permission, action);
    catalog.set(code, { code, majorFeature: permission.majorFeature, subFeature: permission.subFeature, action });
  }
  return { roles: roles.map((role) => ({ roleCode: role.roleCode, roleName: role.roleName,
    permissions: basePermissionCodes(role.roleCode, role.permissions) })),
    permissions: [...catalog.values()].sort((a, b) => a.code.localeCompare(b.code)) };
};
// UC-09: Đọc cả quyền theo vai trò và quyền cấp/thu hồi riêng của nhân viên.
export const getPermissions = async (id) => {
  objectId(id);
  const user = await User.findOne({ _id: id, roleCode: { $in: employeeRoles }, isDeleted: { $ne: true } }).populate('roleId');
  if (!user) throw httpError(404, 'Không tìm thấy nhân viên.');
  return { employee: employeeProfile(user), effectivePermissions: effectivePermissions(user) };
};
// UC-09: Kiểm tra ID, phiên bản và toàn bộ danh sách quyền trước khi ghi thay đổi.
export const assignPermissions = async (req) => {
  objectId(req.params.id); const input = validatePermissions(req.body);
  return ownerTransaction(async (session) => {
    const user = await User.findOne({ _id: req.params.id, roleCode: { $in: employeeRoles }, isDeleted: { $ne: true } }).populate('roleId').session(session);
    if (!user) throw httpError(404, 'Không tìm thấy nhân viên.');
    if ((user.managementVersion || 0) !== input.expectedVersion) throw httpError(409, 'Tài khoản đã thay đổi. Vui lòng tải lại.');
    // Mã quyền phải thuộc danh mục đang hoạt động; không nhận quyền quản trị do FE tự đặt.
    const catalog = await permissionCatalog(session);
    const allowed = new Set(catalog.permissions.map((item) => item.code));
    if (input.permissionOverrides.some((entry) => !allowed.has(entry.code))) throw httpError(400, 'Có quyền không thuộc danh mục quyền nhân viên đang hoạt động.');
    const before = employeeProfile(user);
    // Gắn người cấp và thời điểm để truy được nguồn của từng quyền ngoại lệ.
    user.permissionOverrides = input.permissionOverrides.map((entry) => ({ ...entry, by: req.user._id, at: new Date() }));
    // UC-09, GBR-01: Yêu cầu đăng nhập mới để nhận quyền thay đổi; không mở khóa nhân viên.
    user.sessions = []; user.isOnlineForChat = false; user.managementVersion = input.expectedVersion + 1;
    await user.save({ session });
    const after = employeeProfile(user);
    // UC-10/11: Lưu danh sách quyền trước/sau và lý do trong cùng giao dịch cập nhật.
    await ownerAudit(req, session, 'User Management', 'Employee Permissions', 'ASSIGN_EMPLOYEE_PERMISSIONS',
      { collection: 'users', id: user._id, code: user.employeeCode }, before, { ...after, reason: input.reason });
    return { employee: after, effectivePermissions: effectivePermissions(user) };
  });
};
