/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-01; GBR-01 - Gán vai trò nhân viên theo danh sách Word.
 */
import User from '../../../models/User.model.js';
import Role from '../../../models/Role.model.js';
import { objectId } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';
import { ownerTransaction, ownerAudit } from '../../../common/utils/ownerOperation.js';
import { validateEmployeeAction, employeeRoles } from '../employee-management/employeeManagement.validation.js';
import { employeeProfile } from '../employee-management/employeeManagement.service.js';

// OWNER-EXT-01: Khác UC-09; thao tác này đổi vai trò, còn UC-09 sửa quyền cấp/thu hồi riêng.
export const validateRoleAssignment = (body) => {
  const input = validateEmployeeAction(body, ['roleCode']);
  if (!employeeRoles.includes(body.roleCode)) throw httpError(400, 'Chỉ được gán vai trò nhân viên, không được cấp Owner.');
  return { ...input, roleCode: body.roleCode };
};
export const assignEmployeeRole = async (req) => {
  objectId(req.params.id); const input = validateRoleAssignment(req.body);
  return ownerTransaction(async (session) => {
    // Chỉ tìm nhân viên còn tồn tại; không dùng API này để sửa Owner hoặc chính tài khoản quản trị.
    const user = await User.findOne({ _id: req.params.id, roleCode: { $in: employeeRoles }, isDeleted: { $ne: true } }).session(session);
    if (!user) throw httpError(404, 'Không tìm thấy nhân viên.');
    if ((user.managementVersion || 0) !== input.expectedVersion) throw httpError(409, 'Tài khoản đã thay đổi. Vui lòng tải lại.');
    if (user.roleCode === input.roleCode) throw httpError(409, 'Nhân viên đã có vai trò này.');
    const role = await Role.findOne({ roleCode: input.roleCode, isActive: true, isDeleted: { $ne: true } }).session(session);
    if (!role) throw httpError(400, 'Vai trò đã ngừng hoạt động hoặc chưa được thiết lập.');
    const before = employeeProfile(user);
    // GBR-01: Quyền cũ và phiên cũ không được đi theo vai trò mới; tài khoản đang khóa vẫn giữ khóa.
    user.roleCode = role.roleCode; user.roleId = role._id; user.permissionOverrides = [];
    user.sessions = []; user.isOnlineForChat = false; user.managementVersion = input.expectedVersion + 1;
    await user.save({ session });
    const after = employeeProfile(user);
    // UC-10/11: Ghi cùng giao dịch để việc đổi quyền luôn có người thực hiện và lý do.
    await ownerAudit(req, session, 'User Management', 'Role Assignment', 'ASSIGN_EMPLOYEE_ROLE',
      { collection: 'users', id: user._id, code: user.employeeCode }, before, { ...after, reason: input.reason });
    return after;
  });
};
