/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-02, UC-05; GBR-01 - Kiểm tra phiên và quyền truy cập
 * của tài khoản.
 */

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../../models/User.model.js';
import { ENV } from '../../config/env.js';
import { asyncHandler, httpError } from '../utils/httpError.js';
import { activeAccountFilter, isActiveAccount } from '../../modules/system-administration/authentication/auth.service.js';

// UC-01, UC-02, UC-05: Kiểm tra token và phiên trước khi vào API được bảo vệ.
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
  /*
   * GBR-01: Đọc lại trạng thái từ DB ở mỗi yêu cầu; token còn hạn không thay
   * thế được kiểm tra này.
   */
  const user = await User.findOne({
    _id: payload.sub, ...activeAccountFilter,
    sessions: { $elemMatch: { sessionId: payload.sid, expiresAt: { $gt: new Date() } } },
  }).populate('roleId', 'roleName roleCode isActive isDeleted');
  /*
   * GBR-01: Chặn tài khoản hoặc role đã bị vô hiệu hóa, kể cả khi đăng nhập từ
   * trước.
   */
  if (!isActiveAccount(user)) {
    throw httpError(401, 'Phiên làm việc đã kết thúc hoặc tài khoản không còn quyền truy cập.');
  }
  req.user = user;
  req.auth = { sessionId: payload.sid };
  next();
});

export default authenticate;
