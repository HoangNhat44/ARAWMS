import { httpError } from '../../../common/utils/httpError.js';

export const validateLogin = (req, res, next) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !['usernameOrEmail', 'password', 'rememberMe'].includes(key))
    || typeof body.usernameOrEmail !== 'string' || !body.usernameOrEmail.trim()
    || body.usernameOrEmail.trim().length > 254
    || typeof body.password !== 'string' || !body.password
    || Buffer.byteLength(body.password, 'utf8') > 72
    || (body.rememberMe !== undefined && typeof body.rememberMe !== 'boolean')) {
    return next(httpError(400, 'Vui lòng nhập email hoặc mã nhân viên và mật khẩu hợp lệ.'));
  }
  req.loginInput = {
    identifier: body.usernameOrEmail.trim(), password: body.password, rememberMe: body.rememberMe === true,
  };
  next();
};
