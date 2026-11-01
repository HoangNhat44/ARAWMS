/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC Owner; GBR-01 - Xác thực lại trạng thái và chỉ cho Owner truy cập.
 */
import { Router } from 'express';
import authenticate from './authenticate.js';
import authorizeRole from './authorizeRole.js';

export const ownerRouter = () => {
  const router = Router();
  router.use(authenticate, authorizeRole('OWNER'));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  return router;
};
