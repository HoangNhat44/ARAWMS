import { httpError } from '../../../common/utils/httpError.js';

const onlyFields = (body, allowed) => body && typeof body === 'object' && !Array.isArray(body)
  && Object.keys(body).every((key) => allowed.includes(key));

export const validateProfile = (req, res, next) => {
  const body = req.body;
  if (!onlyFields(body, ['fullName', 'phone']) || !Object.keys(body).length) {
    return next(httpError(400, 'Chỉ được cập nhật họ tên và số điện thoại của chính bạn.'));
  }
  const data = {};
  if (body.fullName !== undefined) {
    if (typeof body.fullName !== 'string' || !body.fullName.trim() || body.fullName.trim().length > 100) {
      return next(httpError(400, 'Họ tên phải có từ 1 đến 100 ký tự.'));
    }
    data.fullName = body.fullName.trim();
  }
  if (body.phone !== undefined) {
    if (typeof body.phone !== 'string' || (body.phone.trim() && !/^\+?[0-9][0-9 ()-]{7,19}$/.test(body.phone.trim()))) {
      return next(httpError(400, 'Số điện thoại không hợp lệ.'));
    }
    data.phone = body.phone.trim();
  }
  req.profileInput = data;
  next();
};

export const validatePassword = (req, res, next) => {
  const body = req.body;
  if (!onlyFields(body, ['currentPassword', 'newPassword', 'confirmPassword'])
    || typeof body.currentPassword !== 'string' || !body.currentPassword
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
