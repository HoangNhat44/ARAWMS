import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendError } from '../utils/responseHandler.js';

/**
 * Middleware xác thực Token JWT
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return sendError(res, 'Không có quyền truy cập, thiếu Token xác thực', null, 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-passwordHash');

    if (!req.user) {
      return sendError(res, 'Tài khoản không tồn tại hoặc đã bị xóa', null, 401);
    }

    if (req.user.status !== 'ACTIVE') {
      return sendError(res, 'Tài khoản đang bị khóa hoặc không hoạt động', null, 403);
    }

    next();
  } catch (error) {
    return sendError(res, 'Token không hợp lệ hoặc đã hết hạn', null, 401);
  }
};

/**
 * Middleware phân quyền (Role Authorization)
 * roles có thể là mảng string
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return sendError(
        res,
        `Tài khoản không có quyền thực hiện hành động này. Yêu cầu một trong các quyền: ${allowedRoles.join(', ')}`,
        null,
        403
      );
    }
    next();
  };
};
