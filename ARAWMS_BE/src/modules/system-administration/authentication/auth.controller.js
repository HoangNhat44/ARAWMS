import { login as loginService, getMe as getMeService } from './auth.service.js';

export const login = async (req, res, next) => {
  try {
    const { usernameOrEmail, password } = req.body;
    const result = await loginService({ usernameOrEmail, password });
    return res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      data: result,
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.message || 'Đăng nhập thất bại',
    });
  }
};

export const getMe = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const result = await getMeService(userId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return res.status(404).json({
      success: false,
      message: err.message || 'Không tìm thấy thông tin tài khoản',
    });
  }
};

export default {
  login,
  getMe,
};
