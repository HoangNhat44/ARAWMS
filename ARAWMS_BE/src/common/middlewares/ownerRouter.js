/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Tạo router chỉ dùng cho Owner và thiết lập cách phản hồi dữ liệu quản trị.
 */
import { Router } from 'express';
import authenticate from './authenticate.js';
import authorizeRole from './authorizeRole.js';

/** Xác thực phiên rồi kiểm tra vai trò Owner trước khi chạy handler. Đặt phản hồi không được lưu vào bộ nhớ đệm. */
export const ownerRouter = () => {
  const router = Router();
  router.use(authenticate, authorizeRole('OWNER'));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  return router;
};
