import express from 'express';
import * as notificationController from './notification.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';

const router = express.Router();

// Thông báo luôn gắn với người đăng nhập (role + userId lấy từ phiên)
router.use(authenticate);

router.get('/', notificationController.getNotifications);
router.patch('/mark-all-read', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);

export default router;
