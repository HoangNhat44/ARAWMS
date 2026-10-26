/*
 * File: authenticate.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Authenticates API requests and loads the active user.
 */
import jwt from 'jsonwebtoken';
import User from '../../models/User.model.js';
import { sendError } from '../utils/responseHandler.js';

/** Verifies a bearer token and attaches only an active user to the request. */
export const authenticate = async (req, res, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return sendError(res, 'Vui lòng đăng nhập', { code: 'UNAUTHORIZED' }, 401);

  try {
    if (!process.env.JWT_SECRET) throw new Error('Thiếu cấu hình JWT_SECRET');
    const payload = jwt.verify(match[1], process.env.JWT_SECRET);
    if (!payload.id) return sendError(res, 'Token không hợp lệ', { code: 'UNAUTHORIZED' }, 401);

    const user = await User.findOne({ _id: payload.id, status: 'ACTIVE', isDeleted: { $ne: true } }).lean();
    if (!user) return sendError(res, 'Tài khoản không còn hoạt động', { code: 'UNAUTHORIZED' }, 401);

    // Keep legacy role aliases until all existing accounts use the current role codes.
    const legacyRole = { OWNER: 'ADMIN', SELLER: 'SALES' }[user.roleCode];
    req.user = { ...user, roles: legacyRole ? [user.roleCode, legacyRole] : [user.roleCode] };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'CastError') {
      return sendError(res, 'Token không hợp lệ hoặc đã hết hạn', { code: 'UNAUTHORIZED' }, 401);
    }
    next(error);
  }
};
