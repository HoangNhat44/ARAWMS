/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-09 - Kiểm tra danh sách quyền ngoại lệ, cấm quyền tùy ý/trùng.
 */
import { httpError } from '../../../common/utils/httpError.js';
import { objectFields, textField } from '../../../common/utils/ownerValidation.js';
import { validateEmployeeAction } from '../employee-management/employeeManagement.validation.js';
export const validatePermissions = (body) => {
  // Dùng chung kiểm tra phiên bản và lý do với thao tác quản trị nhân viên.
  const input = validateEmployeeAction(body, ['permissionOverrides']);
  if (!Array.isArray(body.permissionOverrides) || body.permissionOverrides.length > 100) throw httpError(400, 'Cần danh sách tối đa 100 quyền ngoại lệ.');
  // Ghi nhớ mã đã gặp để chặn một quyền bị gửi hai lần với quyết định trái nhau.
  const seen = new Set();
  const permissionOverrides = body.permissionOverrides.map((entry) => {
    // Mỗi mục chỉ có mã quyền và true/false; người cấp và ngày cấp phải do BE ghi.
    objectFields(entry, ['code', 'granted']);
    const code = textField(entry.code, 'Mã quyền', 200);
    if (typeof entry.granted !== 'boolean' || seen.has(code)) throw httpError(400, 'Quyền trùng hoặc giá trị cấp quyền không hợp lệ.');
    seen.add(code); return { code, granted: entry.granted };
  });
  return { ...input, permissionOverrides };
};
