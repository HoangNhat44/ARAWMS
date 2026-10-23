import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../../models/User.model.js';
import { ENV } from '../../config/env.js';
import { asyncHandler, httpError } from '../utils/httpError.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
  if (!match) throw httpError(401, 'Vui lòng đăng nhập để tiếp tục.');
  let payload;
  try {
    payload = jwt.verify(match[1], ENV.JWT_SECRET, {
      algorithms: ['HS256'], issuer: 'arawms', audience: 'arawms-web',
    });
  } catch {
    throw httpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }
  if (!mongoose.isValidObjectId(payload.sub) || typeof payload.sid !== 'string') {
    throw httpError(401, 'Phiên đăng nhập không hợp lệ.');
  }
  const user = await User.findOne({
    _id: payload.sub, isDeleted: { $ne: true }, status: 'ACTIVE',
    sessions: { $elemMatch: { sessionId: payload.sid, expiresAt: { $gt: new Date() } } },
  }).populate('roleId', 'roleName roleCode isActive isDeleted');
  if (!user || !user.roleId || !user.roleId.isActive || user.roleId.isDeleted
    || user.roleId.roleCode !== user.roleCode) {
    throw httpError(401, 'Phiên làm việc đã kết thúc hoặc tài khoản không còn quyền truy cập.');
  }
  req.user = user;
  req.auth = { sessionId: payload.sid };
  next();
});

export default authenticate;
