/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06, UC-07, UC-08 - Kiểm tra tạo, khóa và mở khóa nhân viên.
 */
import { ROLES } from '../../../common/constants/enums.js';
import { httpError } from '../../../common/utils/httpError.js';
import { objectFields, textField, versionField } from '../../../common/utils/ownerValidation.js';
import { normalizeFullName, validFullName, normalizePhone } from '../../system-administration/account-governance/accountInput.js';

// UC-06: Danh sách này loại OWNER; giao diện không thể tự gửi thêm vai trò quản trị.
export const employeeRoles = ROLES.filter((role) => role !== 'OWNER');
export const validateEmployee = (body) => {
  // Chặn trường gửi thêm như trạng thái, hash mật khẩu hoặc quyền tự cấp.
  objectFields(body, ['employeeCode', 'fullName', 'email', 'phone', 'password', 'confirmPassword', 'roleCode']);
  // Chuẩn hóa mã nhân viên trước khi kiểm tra trùng và lưu vào DB.
  const employeeCode = textField(body.employeeCode, 'Mã nhân viên', 30).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(employeeCode)) throw httpError(400, 'Mã nhân viên cần 2–30 chữ cái, số, dấu gạch nối hoặc gạch dưới.');
  // Dùng cùng quy tắc tên tiếng Việt với hồ sơ cá nhân để FE/BE nhất quán.
  const fullName = normalizeFullName(textField(body.fullName, 'Họ tên', 100, 2));
  if (!validFullName(fullName)) throw httpError(400, 'Họ tên không hợp lệ.');
  // Chuẩn hóa email chữ thường; không chấp nhận object hoặc chuỗi sai định dạng.
  const email = textField(body.email, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Email không hợp lệ.');
  if (!employeeRoles.includes(body.roleCode)) throw httpError(400, 'Chỉ được tạo tài khoản với vai trò nhân viên.');
  // Giới hạn theo byte UTF-8 vì bcrypt chỉ xử lý tối đa 72 byte, kể cả khi mật khẩu có dấu.
  if (typeof body.password !== 'string' || !body.password.trim() || body.password.length < 8
    || Buffer.byteLength(body.password, 'utf8') > 72) throw httpError(400, 'Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte.');
  if (body.password !== body.confirmPassword) throw httpError(400, 'Xác nhận mật khẩu không khớp.');
  if (body.phone !== undefined && body.phone !== '' && !normalizePhone(body.phone)) throw httpError(400, 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.');
  // Chỉ chuyển dữ liệu đã kiểm tra sang service; không chuyển nguyên request body.
  return { employeeCode, fullName, email, phone: body.phone || undefined, roleCode: body.roleCode, password: body.password };
};
// UC-07, UC-08: Bắt buộc lý do; phiên bản ngăn ghi đè thao tác quản trị khác.
export const validateEmployeeAction = (body, additional = []) => {
  objectFields(body, ['expectedVersion', 'reason', ...additional]);
  return { expectedVersion: versionField(body.expectedVersion), reason: textField(body.reason, 'Lý do', 500, 5) };
};
