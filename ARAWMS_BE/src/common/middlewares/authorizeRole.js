/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ phân quyền - Chỉ cho các vai trò được phép tiếp tục xử
 * lý yêu cầu.
 */

import { httpError } from '../utils/httpError.js';

// Kiểm tra role được phép dùng API sau bước xác thực phiên.
export const authorizeRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(httpError(401, 'Vui lòng đăng nhập để tiếp tục.'));
  if (!roles.includes(req.user.roleCode)) return next(httpError(403, 'Bạn không có quyền thực hiện thao tác này.'));
  next();
};

export default authorizeRole;
