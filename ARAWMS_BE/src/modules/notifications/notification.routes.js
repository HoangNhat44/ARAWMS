import express from 'express';
import * as notificationController from './notification.controller.js';

const router = express.Router();

router.get('/', notificationController.getNotifications);
router.patch('/mark-all-read', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);

export default router;

