import * as notificationService from './notification.service.js';

// Role và user luôn lấy từ phiên đăng nhập để không đọc được thông báo của role/người khác.
const viewer = (req) => ({ role: req.user?.roleCode || 'ACCOUNTANT', userId: req.user?._id || null });

export const getNotifications = async (req, res, next) => {
  try {
    const { role, userId } = viewer(req);
    const result = await notificationService.listNotifications({
      ...req.query,
      role,
      userId,
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
    const updated = await notificationService.markNotificationAsRead(id, req.user?._id);
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
    const { role, userId } = viewer(req);
    const result = await notificationService.markAllNotificationsAsRead(role, userId);
    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
};
