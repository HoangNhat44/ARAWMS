import * as notificationService from './notification.service.js';

export const getNotifications = async (req, res, next) => {
  try {
    const role = req.query.role || req.user?.role || 'ACCOUNTANT';
    const result = await notificationService.listNotifications({
      ...req.query,
      role,
    });
    return res.status(200).json({
      success: true,
      data: result.items || [],
      unreadCount: result.unreadCount || 0,
      total: result.total || 0,
      page: result.page,
      limit: result.limit,
    });
  } catch (err) {
    next(err);
  }
};

export const markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await notificationService.markNotificationAsRead(id);
    return res.status(200).json({
      success: true,
      message: 'Đã đánh dấu thông báo là đã đọc',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const markAllRead = async (req, res, next) => {
  try {
    const role = req.body?.role || req.user?.role || 'ACCOUNTANT';
    const result = await notificationService.markAllNotificationsAsRead(role);
    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
};

