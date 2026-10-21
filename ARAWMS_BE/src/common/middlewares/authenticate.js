import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env.js';
import User from '../../models/User.model.js';

/**
 * Middleware xác thực JWT Token & gán thông tin req.user
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, ENV.JWT_SECRET);
        const user = await User.findById(decoded._id || decoded.id || decoded.userId).lean();
        if (user && user.status === 'ACTIVE') {
          req.user = {
            _id: user._id,
            employeeCode: user.employeeCode,
            roleCode: user.roleCode,
            fullName: user.fullName,
            email: user.email,
          };
          return next();
        }
      } catch (jwtErr) {
        return res.status(401).json({
          success: false,
          message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
        });
      }
    }

    // Hỗ trợ chế độ Development nếu chưa có token để dễ dàng test API
    if (ENV.NODE_ENV === 'development') {
      const devUserId = req.headers['x-user-id'];
      let fallbackUser = null;

      if (devUserId) {
        fallbackUser = await User.findById(devUserId).lean();
      } else {
        // Mặc định lấy Seller đầu tiên trong DB để test
        fallbackUser = await User.findOne({ roleCode: 'SELLER', status: 'ACTIVE' }).lean();
      }

      if (fallbackUser) {
        req.user = {
          _id: fallbackUser._id,
          employeeCode: fallbackUser.employeeCode,
          roleCode: fallbackUser.roleCode,
          fullName: fallbackUser.fullName,
          email: fallbackUser.email,
        };
        return next();
      }
    }

    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập để tiếp tục (Thiếu Bearer Token)',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực người dùng',
      error: error.message,
    });
  }
};

export default authenticate;
