/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04 - Kiểm tra số di động mới và OTP sáu chữ số.
 */

import { httpError } from '../../../common/utils/httpError.js';
import { normalizePhone, normalizeFullName, validFullName } from './accountInput.js';
import { isObjectBody } from '../authentication/googleAuth.validation.js';

export const validatePhoneRequest = (req, res, next) => {
  if (!isObjectBody(req.body) || Object.keys(req.body).some((key) => !['phone', 'fullName'].includes(key))
    || !normalizePhone(req.body.phone)) {
    return next(httpError(400, 'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0.'));
  }
  req.newPhone = normalizePhone(req.body.phone);
  if (typeof req.body.fullName !== 'string' || req.body.fullName.length > 100
    || !validFullName(normalizeFullName(req.body.fullName))) {
    return next(httpError(400, 'Họ tên là bắt buộc, cần từ 2 đến 100 ký tự và không chứa số hoặc ký tự đặc biệt.'));
  }
  req.pendingFullName = normalizeFullName(req.body.fullName);
  next();
};

export const validatePhoneConfirmation = (req, res, next) => {
  if (!isObjectBody(req.body) || Object.keys(req.body).some((key) => !['challengeId', 'otp'].includes(key))
    || typeof req.body.challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.challengeId)
    || typeof req.body.otp !== 'string' || !/^\d{6}$/.test(req.body.otp)) {
    return next(httpError(400, 'OTP phải gồm đúng 6 chữ số. Vui lòng kiểm tra mã và yêu cầu xác nhận.'));
  }
  next();
};
