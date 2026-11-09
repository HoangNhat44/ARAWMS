import api from './api';

export const notificationService = {
  getNotifications: async (params = {}) => {
    // api interceptor trong api.js tự động unwrap và trả về response.data
    const res = await api.get('/notifications', { params });

    // Chuẩn hóa dữ liệu trả về cho caller:
    // Có thể là:
    // 1) { success: true, data: [...], unreadCount: 3 }
    // 2) { success: true, data: { items: [...], unreadCount: 3 } }
    // 3) mảng trực tiếp [...]
    const rawItems = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.data?.items)
      ? res.data.items
      : Array.isArray(res?.items)
      ? res.items
      : Array.isArray(res)
      ? res
      : [];

    const unreadCount =
      typeof res?.unreadCount === 'number'
        ? res.unreadCount
        : typeof res?.data?.unreadCount === 'number'
        ? res.data.unreadCount
        : rawItems.filter((n) => !n.isRead).length;

    const total =
      typeof res?.total === 'number'
        ? res.total
        : typeof res?.data?.total === 'number'
        ? res.data.total
        : rawItems.length;

    return {
      items: rawItems,
      unreadCount,
      total,
      success: true,
    };
  },

  markAsRead: async (id) => {
    const res = await api.patch(`/notifications/${id}/read`);
    return res;
  },

  markAllAsRead: async (role = 'ACCOUNTANT') => {
    const res = await api.patch('/notifications/mark-all-read', { role });
    return res;
  },
};

export default notificationService;
