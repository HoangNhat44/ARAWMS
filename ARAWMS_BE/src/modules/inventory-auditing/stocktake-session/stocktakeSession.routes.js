import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { options, list, create, updateSchedule, setScheduleStatus, report, approve, recount, adjust, announcements } from './stocktakeSession.controller.js';

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
// Nhân viên kho và kỹ thuật cũng cần biết lịch kiểm kê (chuẩn bị đi kiểm / khóa đóng hàng).
router.get('/announcements', authenticate, authorizeRole('OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'GARMENT_TECHNICIAN'), announcements);
router.use(authenticate, authorizeRole('OWNER', 'WAREHOUSE_MANAGER'));
router.get('/options', options);
router.get('/', list);
router.post('/', create);
router.put('/schedules/:id', updateSchedule);
router.patch('/schedules/:id/status', setScheduleStatus);
// Chi tiết báo cáo, duyệt chênh lệch nhỏ và trả về kiểm kê lại.
router.get('/sessions/:id', report);
router.post('/sessions/:id/approve', approve);
router.post('/sessions/:id/recount', recount);
router.post('/sessions/:id/adjust', adjust);
export default router;
