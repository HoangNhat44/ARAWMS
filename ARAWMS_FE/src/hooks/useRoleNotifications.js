/*
 * File: useRoleNotifications.js
 * Description: Chuông thông báo realtime dùng chung cho Quản lý kho, Nhân viên kho và Nhân viên kỹ thuật.
 * - Tải lịch sử thông báo của người đăng nhập (GET /notifications, role + user lấy từ phiên ở BE).
 * - Vào phòng socket `role:<ROLE>` và `user:<id>` để nhận sự kiện `new_notification` ngay lập tức.
 * - Hiện popup góc màn hình khi có thông báo mới, bấm vào để mở đúng trang xử lý.
 * - Tải lại định kỳ (dự phòng khi mất kết nối socket).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { getSocket } from '../services/socketService';
import { notificationService } from '../services/notificationService';

const POLL_MS = 60000;
const userIdOf = (user) => String(user?.id || user?._id || '');

/** Thông báo có dành cho người đăng nhập không (đề phòng socket còn ở phòng của phiên trước). */
const isForMe = (item, user) => {
  if (!item || !user) return false;
  if (item.recipientUserId) return String(item.recipientUserId) === userIdOf(user);
  return [user.roleCode, 'ALL'].includes(item.recipientRole);
};

export function useRoleNotifications({ limit = 30, popup = true } = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notification } = App.useApp();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userRef = useRef(user);
  userRef.current = user;
  // ID đã hiển thị, để một thông báo đến qua nhiều phòng socket chỉ được đếm một lần
  const seenRef = useRef(new Set());

  const load = useCallback(async () => {
    if (!userRef.current) return;
    setLoading(true);
    try {
      const res = await notificationService.getNotifications({ limit });
      (res.items || []).forEach((n) => seenRef.current.add(String(n._id)));
      setItems(res.items || []);
      setUnreadCount(res.unreadCount || 0);
      setError('');
    } catch {
      setError('Không tải được thông báo.');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const open = useCallback(async (item) => {
    if (!item) return;
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n._id === item._id ? { ...n, isRead: true } : n)));
      setUnreadCount((count) => Math.max(0, count - 1));
      notificationService.markAsRead(item._id).catch(() => {});
    }
    if (item.targetUrl) navigate(item.targetUrl);
  }, [navigate]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try { await notificationService.markAllAsRead(); } catch { load(); }
  }, [load]);

  useEffect(() => {
    if (!user?.roleCode) return undefined;
    load();
    const timer = setInterval(load, POLL_MS);
    const socket = getSocket();
    const join = () => socket.emit('join_workspace', { role: user.roleCode, userId: userIdOf(user) });
    if (socket.connected) join();
    socket.on('connect', join);

    const onNew = (item) => {
      if (!isForMe(item, userRef.current)) return;
      const key = String(item._id);
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      setItems((prev) => (prev.some((n) => String(n._id) === key) ? prev : [item, ...prev].slice(0, limit)));
      setUnreadCount((count) => count + 1);
      // Báo cho các trang đang mở biết có thay đổi nghiệp vụ (trang nào quan tâm tự tải lại)
      window.dispatchEvent(new CustomEvent('arawms-notification-realtime', { detail: item }));
      if (popup) {
        notification.open({
          key: String(item._id),
          message: item.title,
          description: item.message,
          placement: 'bottomRight',
          duration: item.priority === 'HIGH' || item.priority === 'URGENT' ? 10 : 6,
          style: { cursor: item.targetUrl ? 'pointer' : 'default' },
          onClick: () => { notification.destroy(String(item._id)); open(item); },
        });
      }
    };
    socket.on('new_notification', onNew);
    return () => {
      clearInterval(timer);
      socket.off('connect', join);
      socket.off('new_notification', onNew);
    };
  }, [user?.roleCode, user?.id, user?._id, load, limit, popup, notification, open]);

  return { items, unreadCount, loading, error, reload: load, open, markAllRead };
}

export default useRoleNotifications;
