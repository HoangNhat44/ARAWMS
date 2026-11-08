/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Kiểm tra tài khoản, mã khôi phục và mật
 * khẩu mới.
 */

import { httpError } from '../../../common/utils/httpError.js';
import { isObjectBody } from './googleAuth.validation.js';
import { validIdentifier } from '../account-governance/accountInput.js';

// GBR-02: Chỉ nhận email hoặc mã nhân viên hợp lệ khi gửi yêu cầu khôi phục.
export const validateForgotPassword = (req, res, next) => {
  const body = req.body;
  if (!isObjectBody(body) || Object.keys(body).some((key) => key !== 'usernameOrEmail')
    || !validIdentifier(body.usernameOrEmail) || body.usernameOrEmail.trim().length > 254) {
    return next(httpError(400, 'Nhập email hoặc mã nhân viên hợp lệ.'));
  }
  req.recoveryIdentifier = body.usernameOrEmail.trim();
  next();
};

// GBR-02: Kiểm tra mã khôi phục, độ dài mật khẩu mới và xác nhận khớp nhau.
export const validateResetPassword = (req, res, next) => {
  const body = req.body;
  if (!isObjectBody(body) || Object.keys(body).some((key) => !['token', 'newPassword', 'confirmPassword'].includes(key))
    || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) {
    return next(httpError(400, 'Liên kết đặt lại mật khẩu không hợp lệ. Hãy gửi yêu cầu mới.'));
  }
  if (typeof body.newPassword !== 'string' || !body.newPassword.trim() || body.newPassword.length < 8
    || Buffer.byteLength(body.newPassword, 'utf8') > 72) {
    return next(httpError(400, 'Mật khẩu mới phải có ít nhất 8 ký tự và tối đa 72 byte.'));
  }
  if (typeof body.confirmPassword !== 'string' || body.newPassword !== body.confirmPassword) {
    return next(httpError(400, 'Xác nhận mật khẩu mới không khớp.'));
  }
  req.resetInput = { token: body.token, newPassword: body.newPassword };
  next();
};
