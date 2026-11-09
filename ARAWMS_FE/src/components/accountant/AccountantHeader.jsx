import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut, ChevronRight, CheckCheck, AlertTriangle, Info, Clock, X, ArrowRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { FLATTENED_ACCOUNTANT_NAV } from './accountantNavConfig';
import { notificationService } from '../../services/notificationService';
import { getSocket } from '../../services/socketService';

const AccountantHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpenNotif, setIsOpenNotif] = useState(false);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
  const [notifError, setNotifError] = useState(null);
  const [toastNotif, setToastNotif] = useState(null); // Realtime floating banner
  const notifRef = useRef(null);

  // Tự động xác định mục đang mở trên Sidebar theo URL hiện tại
  const currentNavItem =
    FLATTENED_ACCOUNTANT_NAV.find((item) =>
      item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
    ) || FLATTENED_ACCOUNTANT_NAV[0];

  const displayName = user?.fullName || user?.username || 'Kế toán kho';
  const displayRole = user?.roleCode || user?.roles?.[0] || 'ACCOUNTANT';
  const initials = displayName
    .split(' ')
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 1. Fetch notifications từ backend
  const fetchNotifications = async () => {
    try {
      setIsLoadingNotifs(true);
      setNotifError(null);
      const res = await notificationService.getNotifications({ role: 'ACCOUNTANT', limit: 40 });
      // Hỗ trợ cả hai cấu trúc response: res.data là mảng hoặc res.data là object { items, unreadCount }
      const notifList = Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.items)
        ? res.data.items
        : Array.isArray(res)
        ? res
        : [];

      const count =
        typeof res?.unreadCount === 'number'
          ? res.unreadCount
          : typeof res?.data?.unreadCount === 'number'
          ? res.data.unreadCount
          : notifList.filter((n) => !n.isRead).length;

      setNotifications(notifList);
      setUnreadCount(count);
    } catch (err) {
      console.error('Lỗi khi tải thông báo kế toán:', err);
      setNotifError('Không thể kết nối đến máy chủ thông báo.');
    } finally {
      setIsLoadingNotifs(false);
    }
  };

  // 2. Realtime WebSocket listener & Reconnect
  useEffect(() => {
    fetchNotifications();

    // Polling dự phòng mỗi 25s đảm bảo tính đồng bộ kể cả khi chập chờn mạng
    const interval = setInterval(() => {
      fetchNotifications();
    }, 25000);

    const socket = getSocket();
    if (socket) {
      const joinRoom = () => {
        socket.emit('join_accountant_workspace', { role: 'ACCOUNTANT', userId: user?._id });
      };

      if (socket.connected) {
        joinRoom();
      }
      socket.on('connect', joinRoom);

      const handleIncomingNotif = (newNotif) => {
        if (!newNotif) return;
        setNotifications((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          const exists = list.some((n) => String(n._id) === String(newNotif._id));
          if (exists) return list;
          return [newNotif, ...list];
        });
        setUnreadCount((prev) => prev + 1);

        // Bật Toast nổi realtime trên màn hình trong 8s
        setToastNotif(newNotif);
      };

      socket.on('accountant_notification', handleIncomingNotif);
      socket.on('new_notification', handleIncomingNotif);

      return () => {
        clearInterval(interval);
        socket.off('connect', joinRoom);
        socket.off('accountant_notification', handleIncomingNotif);
        socket.off('new_notification', handleIncomingNotif);
      };
    }

    return () => clearInterval(interval);
  }, [user]);

  // Tự động ẩn Toast realtime sau 8s
  useEffect(() => {
    if (toastNotif) {
      const timer = setTimeout(() => {
        setToastNotif(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [toastNotif]);

  // Click outside to close notification dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setIsOpenNotif(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle click on a single notification
  const handleItemClick = async (item) => {
    try {
      if (!item.isRead) {
        await notificationService.markAsRead(item._id);
        setNotifications((prev) =>
          (Array.isArray(prev) ? prev : []).map((n) =>
            String(n._id) === String(item._id) ? { ...n, isRead: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Lỗi đánh dấu đã đọc:', err);
    }

    setIsOpenNotif(false);
    if (item.targetUrl) {
      navigate(item.targetUrl);
    }
  };

  // Handle Mark All As Read
  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead('ACCOUNTANT');
      setNotifications((prev) =>
        (Array.isArray(prev) ? prev : []).map((n) => ({ ...n, isRead: true }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Lỗi đánh dấu tất cả đã đọc:', err);
    }
  };

  // Helper format time
  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    return `${diffDays} ngày trước`;
  };

  return (
    <>
      <header className="ara-acc-header">
        {/* Left: Dynamic Breadcrumb & Title */}
        <div className="ara-acc-header-left">
          <nav className="ara-acc-breadcrumb" aria-label="Breadcrumb">
            <span>AraStore WMS</span>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{currentNavItem?.groupTitle || 'Tổng quan'}</span>
          </nav>

          <div className="ara-acc-header-title-row">
            <h1 className="ara-acc-header-title">
              {currentNavItem?.label || 'Bảng điều khiển Kế toán'}
            </h1>
          </div>
        </div>

        {/* Right: Quick Search, Alerts, User Badge */}
        <div className="ara-acc-header-right">
          <div className="ara-acc-search-box">
            <Search size={15} className="ara-acc-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="ara-acc-search-input"
              aria-label="Tìm kiếm nhanh chứng từ, mã hợp đồng, vận đơn"
              placeholder="Tìm mã HĐ, phiếu chi, vận đơn..."
            />
          </div>

          {/* Realtime Notification Bell & Dropdown */}
          <div className="ara-acc-notif-wrapper" ref={notifRef}>
            <button
              type="button"
              className={`ara-acc-icon-btn ${isOpenNotif ? 'ara-acc-icon-btn-active' : ''}`}
              aria-label="Thông báo & Cảnh báo kế toán"
              title="Thông báo sai lệch & cảnh báo"
              onClick={() => {
                const nextOpen = !isOpenNotif;
                setIsOpenNotif(nextOpen);
                if (nextOpen) {
                  fetchNotifications();
                }
              }}
            >
              <Bell size={18} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="ara-acc-notif-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {isOpenNotif && (
              <div className="ara-acc-notif-dropdown">
                <div className="ara-acc-notif-header">
                  <div className="ara-acc-notif-title-row">
                    <span className="ara-acc-notif-title">Thông báo hệ thống</span>
                    {unreadCount > 0 && (
                      <span className="ara-acc-notif-count-tag">{unreadCount} mới</span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="ara-acc-notif-mark-all-btn"
                      onClick={handleMarkAllRead}
                      title="Đánh dấu tất cả đã đọc"
                    >
                      <CheckCheck size={14} style={{ display: 'inline', marginRight: 4 }} />
                      Đã đọc tất cả
                    </button>
                  )}
                </div>

                <div className="ara-acc-notif-list">
                  {isLoadingNotifs ? (
                    <div className="ara-acc-notif-empty">Đang tải thông báo...</div>
                  ) : notifError ? (
                    <div className="ara-acc-notif-empty">
                      <AlertTriangle size={24} style={{ margin: '0 auto 8px', color: '#f59e0b', display: 'block' }} />
                      <span>{notifError}</span>
                      <button
                        type="button"
                        onClick={fetchNotifications}
                        style={{ marginTop: 8, padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff' }}
                      >
                        Thử lại
                      </button>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="ara-acc-notif-empty">
                      <CheckCheck
                        size={28}
                        style={{ margin: '0 auto 8px', color: '#10b981', display: 'block' }}
                      />
                      <span>Không có thông báo mới nào</span>
                    </div>
                  ) : (
                    notifications.map((item) => {
                      const isDeviation = item.type === 'CONTRACT_DEVIATION';
                      return (
                        <div
                          key={item._id}
                          className={`ara-acc-notif-item ${!item.isRead ? 'is-unread' : ''} ${
                            isDeviation ? 'is-deviation' : ''
                          }`}
                          onClick={() => handleItemClick(item)}
                        >
                          <div
                            className={`ara-acc-notif-icon-box ${
                              isDeviation ? 'deviation' : 'info'
                            }`}
                          >
                            {isDeviation ? <AlertTriangle size={17} /> : <Info size={17} />}
                          </div>

                          <div className="ara-acc-notif-body">
                            <div className="ara-acc-notif-item-title">{item.title}</div>
                            <div className="ara-acc-notif-item-msg">{item.message}</div>
                            <div className="ara-acc-notif-item-meta">
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={11} />
                                {formatTimeAgo(item.createdAt)}
                              </span>
                              {item.targetUrl && (
                                <span className="ara-acc-notif-action-link">
                                  Xử lý ngay <ChevronRight size={12} />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="ara-acc-notif-footer">
                  <button
                    type="button"
                    className="ara-acc-notif-footer-link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => {
                      setIsOpenNotif(false);
                      navigate('/accountant/contract-deviations');
                    }}
                  >
                    Xem toàn bộ danh sách sai lệch hợp đồng →
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="ara-acc-user-badge">
            <div className="ara-acc-user-avatar" aria-hidden="true">
              {initials || 'KT'}
            </div>
            <div className="ara-acc-user-info">
              <span className="ara-acc-user-name">{displayName}</span>
              <span className="ara-acc-user-role">{displayRole}</span>
            </div>
          </div>

          {user && (
            <button
              type="button"
              className="ara-acc-icon-btn"
              aria-label="Đăng xuất khỏi hệ thống"
              title="Đăng xuất"
              onClick={handleLogout}
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {/* Realtime Floating Toast khi có sai lệch mới phát sinh */}
      {toastNotif && (
        <div className="ara-acc-toast-popup" role="alert">
          <div className="ara-acc-toast-header">
            <div className="ara-acc-toast-title-box">
              <AlertTriangle size={18} color="#dc2626" />
              <span className="ara-acc-toast-title">{toastNotif.title}</span>
            </div>
            <button
              type="button"
              className="ara-acc-toast-close-btn"
              onClick={() => setToastNotif(null)}
              aria-label="Đóng thông báo"
            >
              <X size={16} />
            </button>
          </div>
          <p className="ara-acc-toast-msg">{toastNotif.message}</p>
          <div className="ara-acc-toast-actions">
            <button
              type="button"
              className="ara-acc-toast-action-btn"
              onClick={() => {
                const target = toastNotif.targetUrl;
                handleItemClick(toastNotif);
                setToastNotif(null);
                if (target) navigate(target);
              }}
            >
              Xem & Xử lý ngay <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AccountantHeader;
