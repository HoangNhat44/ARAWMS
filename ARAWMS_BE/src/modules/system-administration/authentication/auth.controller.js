import { sendSuccess } from '../../../common/utils/responseHandler.js';
import { loginUser, publicUser, registerUser } from './auth.service.js';

export const register = async (req, res, next) => {
  try {
    return sendSuccess(res, 'Đăng ký thành công', await registerUser(req.body), 201);
  } catch (error) { next(error); }
};

export const login = async (req, res, next) => {
  try {
    return sendSuccess(res, 'Đăng nhập thành công', await loginUser(req.body));
  } catch (error) { next(error); }
};

export const me = (req, res) => sendSuccess(res, 'Thông tin tài khoản', { user: publicUser(req.user) });
