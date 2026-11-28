/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-011. Thay đổi vai trò được gán cho tài khoản nhân viên.
 */
import User from '../../../models/User.model.js';
import Role from '../../../models/Role.model.js';
import { objectId } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';
import { ownerTransaction, ownerAudit } from '../../../common/utils/ownerOperation.js';
import { validateEmployeeAction, employeeRoles } from '../employee-management/employeeManagement.validation.js';
import { employeeProfile } from '../employee-management/employeeManagement.service.js';

// Dùng kiểm tra thao tác chung rồi xác thực thêm mã vai trò đích.
/** Kiểm tra phiên bản và lý do. Mã vai trò đích phải thuộc nhóm vai trò nhân viên. */
export const validateRoleAssignment = (body) => {
  const input = validateEmployeeAction(body, ['roleCode']);
  if (!employeeRoles.includes(body.roleCode)) throw httpError(400, 'Chỉ được gán vai trò nhân viên, không được cấp Owner.');
  return { ...input, roleCode: body.roleCode };
};
/** Đọc lại nhân viên và vai trò đích, kiểm tra phiên bản rồi đổi vai trò và ghi nhật ký trong cùng giao dịch. */
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
    // Xóa quyền ngoại lệ cũ và thu hồi phiên để vai trò mới được áp dụng từ lần đăng nhập sau.
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
