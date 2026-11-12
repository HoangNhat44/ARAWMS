import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { AutoComplete, Badge, Button, Empty, Input, Popover, Skeleton, Dropdown, Avatar, Tooltip } from 'antd';
import {
  Search,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  AlertTriangle,
  Info,
  Clock,
  X,
  ArrowRight,
  FileText,
  User,
  CheckCheck,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ACCOUNTANT_NAV_GROUPS, FLATTENED_ACCOUNTANT_NAV } from './accountantNavConfig';
import { notificationService } from '../../services/notificationService';
import { getSocket } from '../../services/socketService';
import './accountantLayout.css';
import '../../styles/wmsLayout.css';

const normalize = (value) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();

const AccountantHeader = ({
  onToggleMobileSidebar,
  collapsed = false,
  onToggleCollapse = () => {},
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Search state
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // Notification state
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
  const [notifError, setNotifError] = useState(null);
  const [toastNotif, setToastNotif] = useState(null);

  // Check desktop vs mobile breakpoint
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Tự động xác định mục đang mở trên Sidebar theo URL hiện tại
  const currentNavItem =
    FLATTENED_ACCOUNTANT_NAV.find((item) =>
      item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
    ) || FLATTENED_ACCOUNTANT_NAV[0];

  const displayName = user?.fullName || user?.username || 'Kế toán kho';
  const displayRole = user?.roleCode || user?.roles?.[0] || 'Kế toán kho';
  const initials = displayName
    .split(' ')
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Close popovers on navigation
  useEffect(() => {
    setNotificationsOpen(false);
    setSearchOpen(false);
    setSearch('');
  }, [location.pathname, location.search]);

  // Options cho ô tìm kiếm chức năng kế toán
  const searchOptions = useMemo(() => {
    const term = normalize(search);
    return (ACCOUNTANT_NAV_GROUPS || []).flatMap((group) =>
      (group.items || [])
        .filter((item) => {
          if (!term) return true;
          const searchHaystack = normalize(
            `${item.label} ${group.groupTitle} ${item.path} ${item.description || ''} ${item.ucCode || ''}`
          );
          return searchHaystack.includes(term);
        })
        .map((item) => ({
          value: item.path,
          labelStr: `${item.label} ${group.groupTitle}`,
          label: (
            <div style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
              <strong style={{ fontSize: 13, color: 'var(--wms-text-primary)' }}>{item.label}</strong>
              <small style={{ color: 'var(--wms-secondary)', fontSize: 11 }}>
                {group.groupTitle} {item.ucCode ? `• ${item.ucCode}` : ''}
              </small>
            </div>
          ),
        }))
    );
  }, [search]);

  const selectPage = (path) => {
    setSearch('');
    setSearchOpen(false);
    if (path) navigate(path);
  };

  // 1. Fetch notifications từ backend
  const fetchNotifications = async () => {
    try {
      setIsLoadingNotifs(true);
      setNotifError(null);
      const res = await notificationService.getNotifications({ role: 'ACCOUNTANT', limit: 40 });
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

  // 2. Realtime WebSocket listener & Polling dự phòng
  useEffect(() => {
    fetchNotifications();

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

    setNotificationsOpen(false);
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

  // Ô tìm kiếm AutoComplete
  const searchField = (
    <AutoComplete
      className="wms-header-search owner-header-search"
      value={search}
      options={searchOptions}
      onChange={setSearch}
      onSelect={selectPage}
      notFoundContent="Không tìm thấy chức năng phù hợp"
      defaultActiveFirstOption
      aria-label="Tìm chức năng kế toán"
    >
      <Input
        allowClear
        prefix={<Search size={16} aria-hidden="true" />}
        placeholder="Tìm chức năng kế toán..."
        maxLength={100}
        aria-label="Tìm chức năng kế toán"
      />
    </AutoComplete>
  );

  // Nội dung Popover thông báo
  const notificationContent = (
    <section className="owner-notifications" aria-label="Danh sách thông báo kế toán">
      <div className="owner-notifications-heading">
        <h2>Thông báo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{unreadCount > 0 ? `${unreadCount} chưa xem` : 'Không có mới'}</span>
          {unreadCount > 0 && (
            <Button
              type="link"
              size="small"
              onClick={handleMarkAllRead}
              style={{ padding: 0, height: 'auto', fontSize: 12 }}
            >
              <CheckCheck size={13} style={{ display: 'inline', marginRight: 2 }} />
              Đã đọc tất cả
            </Button>
          )}
        </div>
      </div>

      <div className="owner-notifications-list" aria-busy={isLoadingNotifs}>
        {isLoadingNotifs ? (
          <div style={{ padding: 12 }}>
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        ) : notifError ? (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <AlertTriangle size={24} style={{ margin: '0 auto 8px', color: '#f59e0b', display: 'block' }} />
            <p style={{ margin: 0, fontSize: 13 }}>{notifError}</p>
            <Button size="small" onClick={fetchNotifications} style={{ marginTop: 8 }}>
              Thử lại
            </Button>
          </div>
        ) : !notifications.length ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Bạn không có thông báo nào"
            style={{ margin: '20px 0' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {notifications.map((item) => {
              const isDeviation = item.type === 'CONTRACT_DEVIATION';
              return (
                <div
                  key={item._id}
                  className={`owner-notification-item ${!item.isRead ? 'is-unread' : ''}`}
                  onClick={() => handleItemClick(item)}
                >
                  <span className={`owner-notification-icon ${isDeviation ? 'deviation' : ''}`}>
                    {isDeviation ? <AlertTriangle size={18} /> : <Info size={18} />}
                  </span>
                  <span className="owner-notification-copy">
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <time dateTime={item.createdAt}>
                      <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
                      {formatTimeAgo(item.createdAt)}
                    </time>
                  </span>
                  {!item.isRead && <span className="owner-notification-dot" aria-label="Chưa xem" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        className="owner-notifications-footer"
        onClick={() => {
          setNotificationsOpen(false);
          navigate('/accountant/contract-deviations');
        }}
      >
        Xem toàn bộ danh sách sai lệch hợp đồng →
      </button>
    </section>
  );

  // Menu Dropdown Profile Kế toán
  const accountMenu = {
    items: [
      {
        key: 'header-user-info',
        label: (
          <div style={{ padding: '4px 0' }}>
            <div style={{ fontWeight: 600, color: 'var(--wms-text-primary)' }}>{displayName}</div>
            <div style={{ fontSize: 12, color: 'var(--wms-secondary)' }}>{displayRole}</div>
          </div>
        ),
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'account-profile',
        icon: <User size={15} />,
        label: 'Xem hồ sơ cá nhân',
        onClick: () => navigate('/accountant'),
      },
      {
        key: 'account-logout',
        danger: true,
        icon: <LogOut size={15} />,
        label: 'Đăng xuất',
        onClick: handleLogout,
      },
    ],
  };

  const title = currentNavItem?.label || 'Bảng điều khiển Kế toán';

  return (
    <>
      <header className="wms-header owner-header ara-acc-header">
        {/* Phía trái: Menu toggle & Phân cấp thương hiệu/tiêu đề */}
        <div className="wms-header-context owner-header-context">
          <Tooltip
            title={
              isDesktop
                ? collapsed
                  ? 'Mở rộng điều hướng'
                  : 'Thu gọn điều hướng'
                : 'Mở điều hướng'
            }
          >
            <Button
              type="text"
              className="wms-icon-button owner-icon-button"
              aria-label={
                isDesktop
                  ? collapsed
                    ? 'Mở rộng điều hướng'
                    : 'Thu gọn điều hướng'
                  : 'Mở điều hướng'
              }
              aria-expanded={isDesktop ? !collapsed : false}
              onClick={() => (isDesktop ? onToggleCollapse() : onToggleMobileSidebar())}
              icon={
                isDesktop ? (
                  collapsed ? (
                    <ChevronRight size={18} />
                  ) : (
                    <ChevronLeft size={18} />
                  )
                ) : (
                  <Menu size={18} />
                )
              }
            />
          </Tooltip>
          <div className="wms-header-titles owner-header-titles">
            <span className="wms-header-brand owner-header-brand">AraStore WMS</span>
            <span className="wms-header-sep owner-header-sep">/</span>
            <span className="wms-header-page-title owner-header-page-title" title={title}>
              {title}
            </span>
          </div>
        </div>

        {/* Phía phải: Tìm kiếm, Thông báo & Tài khoản Profile */}
        <div className="wms-header-actions owner-header-actions">
          {/* Tìm kiếm trên Desktop */}
          <div className="wms-header-search-desktop owner-header-search-desktop">{searchField}</div>

          {/* Trigger tìm kiếm trên Mobile */}
          <div className="wms-header-search-mobile owner-header-search-mobile">
            <Popover
              trigger="click"
              placement="bottomRight"
              open={searchOpen}
              onOpenChange={(open) => {
                setSearchOpen(open);
                if (open) setNotificationsOpen(false);
              }}
              content={searchField}
            >
              <Button
                type="text"
                className="wms-icon-button owner-icon-button"
                aria-label="Mở tìm kiếm"
                aria-expanded={searchOpen}
                icon={<Search size={18} />}
              />
            </Popover>
          </div>

          {/* Realtime Notification Popover */}
          <Popover
            trigger="click"
            placement="bottomRight"
            open={notificationsOpen}
            content={notificationContent}
            onOpenChange={(open) => {
              setNotificationsOpen(open);
              if (open) {
                setSearchOpen(false);
                fetchNotifications();
              }
            }}
          >
            <Button
              type="text"
              className={`wms-icon-button owner-icon-button${notificationsOpen ? ' owner-notifications-active' : ''}`}
              aria-label={`Thông báo${unreadCount > 0 ? `: ${unreadCount} chưa xem` : ''}`}
              aria-expanded={notificationsOpen}
            >
              <Badge count={unreadCount} size="small" overflowCount={99}>
                <Bell size={18} />
              </Badge>
            </Button>
          </Popover>

          {/* Profile Dropdown */}
          <Dropdown menu={accountMenu} trigger={['click']} placement="bottomRight">
            <Button type="text" className="wms-profile-button owner-profile-button" aria-label="Mở menu tài khoản">
              <Avatar size={28} className="wms-avatar owner-avatar">
                {initials || 'KT'}
              </Avatar>
              <span className="wms-profile-info owner-profile-info">
                <strong>{displayName}</strong>
                <small>Kế toán kho</small>
              </span>
            </Button>
          </Dropdown>
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
