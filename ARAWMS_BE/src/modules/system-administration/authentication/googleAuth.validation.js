/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-05 - Kiểm tra dữ liệu xác thực Google trước khi xử lý.
 */

import { httpError } from '../../../common/utils/httpError.js';

export const isObjectBody = (body) => body !== null && typeof body === 'object' && !Array.isArray(body);
export const validCurrentPassword = (value) => typeof value === 'string' && value.trim().length > 0
  && Buffer.byteLength(value, 'utf8') <= 72;

// UC-05: Kiểm tra cấu trúc token, mã yêu cầu và các trường được phép gửi.
export const validateGoogleCredential = (purpose) => (req, res, next) => {
  const body = req.body;
  const allowed = purpose === 'LOGIN' ? ['credential', 'challengeId', 'rememberMe'] : ['credential', 'challengeId'];
  if (!isObjectBody(body) || Object.keys(body).some((key) => !allowed.includes(key))
    || typeof body.challengeId !== 'string' || !/^[a-f0-9]{24}$/i.test(body.challengeId)
    || typeof body.credential !== 'string' || body.credential.length > 8192
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.credential)
    || (body.rememberMe !== undefined && typeof body.rememberMe !== 'boolean')) {
    return next(httpError(400, 'Thông tin xác thực Google không hợp lệ. Vui lòng thử lại.'));
  }
  next();
};
