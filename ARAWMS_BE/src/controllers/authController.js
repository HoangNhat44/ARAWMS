import * as authService from '../services/authService.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';

export const register = async (req, res, next) => {
  try {
    const { username, fullName, name, email, password, roles } = req.body;
    const finalFullName = fullName || name;
    const finalUsername = username || (email ? email.split('@')[0] : '');

    if (!finalFullName || !email || !password) {
      return sendError(res, 'Vui lòng cung cấp đầy đủ họ tên, email và mật khẩu');
    }

    const result = await authService.registerUser({
      username: finalUsername,
      fullName: finalFullName,
      email,
      password,
      roles,
    });
    return sendSuccess(res, 'Đăng ký tài khoản thành công', result, 201);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    // Chấp nhận cả usernameOrEmail hoặc email hoặc username
    const usernameOrEmail = req.body.usernameOrEmail || req.body.email || req.body.username;
    const { password } = req.body;

    if (!usernameOrEmail || !password) {
      return sendError(res, 'Vui lòng nhập tên đăng nhập/email và mật khẩu');
    }

    const result = await authService.loginUser({ usernameOrEmail, password });
    return sendSuccess(res, 'Đăng nhập thành công', result, 200);
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    return sendSuccess(res, 'Lấy thông tin người dùng thành công', { user: req.user });
  } catch (error) {
    next(error);
  }
};
