import { httpError } from '../utils/httpError.js';

export const authorizeRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(httpError(401, 'Vui lòng đăng nhập để tiếp tục.'));
  if (!roles.includes(req.user.roleCode)) return next(httpError(403, 'Bạn không có quyền thực hiện thao tác này.'));
  next();
};

export default authorizeRole;
