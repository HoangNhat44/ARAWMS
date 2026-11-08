/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04 - Kiểm tra thông tin hồ sơ và mật khẩu mới trước khi lưu.
 */

import { httpError } from '../../../common/utils/httpError.js';
import { normalizeFullName, validFullName, normalizePhone } from './accountInput.js';

const onlyFields = (body, allowed) => body && typeof body === 'object' && !Array.isArray(body)
  && Object.keys(body).every((key) => allowed.includes(key));

/*
 * UC-04: Chỉ cho sửa họ tên và số điện thoại; không nhận email, role hoặc mã
 * nhân viên gửi thêm.
 */
export const validateProfile = (req, res, next) => {
  const body = req.body;
  if (!onlyFields(body, ['fullName', 'phone'])) {
    return next(httpError(400, 'Chỉ được cập nhật họ tên và số điện thoại của chính bạn.'));
  }
  if (typeof body.fullName !== 'string' || body.fullName.length > 100 || !validFullName(normalizeFullName(body.fullName))) {
    return next(httpError(400, 'Họ tên là bắt buộc, cần từ 2 đến 100 ký tự, chỉ gồm chữ và dấu câu thông dụng.'));
  }
  if (!normalizePhone(body.phone)) {
    return next(httpError(400, 'Số điện thoại là bắt buộc, phải gồm đúng 10 chữ số và bắt đầu bằng số 0.'));
  }
  const data = { fullName: normalizeFullName(body.fullName), phone: normalizePhone(body.phone) };
  req.profileInput = data;
  next();
};

// UC-04: Mật khẩu mới cần ít nhất 8 ký tự, tối đa 72 byte và khớp ô xác nhận.
export const validatePassword = (req, res, next) => {
  const body = req.body;
  if (!onlyFields(body, ['currentPassword', 'newPassword', 'confirmPassword'])
    || typeof body.currentPassword !== 'string' || !body.currentPassword.trim()
    || Buffer.byteLength(body.currentPassword, 'utf8') > 72
    || typeof body.newPassword !== 'string' || !body.newPassword.trim() || body.newPassword.length < 8
    || Buffer.byteLength(body.newPassword, 'utf8') > 72) {
    return next(httpError(400, 'Mật khẩu mới phải có ít nhất 8 ký tự và tối đa 72 byte.'));
  }
  if (body.newPassword !== body.confirmPassword) return next(httpError(400, 'Xác nhận mật khẩu mới không khớp.'));
  if (body.newPassword === body.currentPassword) return next(httpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.'));
  req.passwordInput = { currentPassword: body.currentPassword, newPassword: body.newPassword };
  next();
};
