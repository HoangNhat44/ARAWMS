
/**
 * ============================================================================
 * @title        : Enterprise Top Header Bar
 * @author       : AraStore Frontend Team
 * @createdDate  : 2026-11-02
 * @description  : Thanh điều hướng đỉnh (Top Header) mỏng chuẩn ERP, hiển thị breadcrumb động,
 *                 trạng thái đa kênh (Facebook, TikTok, Shopee), chuông thông báo Realtime
 *                 và avatar hồ sơ người dùng.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  Bell,
  RotateCcw,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { getSocket } from '../../services/socketService';

const PAGE_TITLES = {
  '/seller/chat': { section: 'Bán Hàng & CSKH', title: 'Hội Thoại Đa Kênh' },
  '/seller/orders': { section: 'Bán Hàng & CSKH', title: 'Quản Lý Đơn Hàng' },
  '/orders/qr': { section: 'Vận Hành Kho', title: 'Chốt Đơn & In Tem QR' },
  '/packing/qr': { section: 'Vận Hành Kho', title: 'Đóng Hàng & Ghi Hình Video' },
  '/warehouse/putaway': { section: 'Vận Hành Kho', title: 'Xếp Hàng Lên Kệ (Putaway)' },
  '/warehouse/finished-goods': { section: 'Vận Hành Kho', title: 'Kho Thành Phẩm' },
  '/warehouse/technical-inbound': { section: 'Vận Hành Kho', title: 'Lệnh Nhập Thành Phẩm' },
  '/warehouse/technical-outbound': { section: 'Vận Hành Kho', title: 'Lệnh Xuất Thành Phẩm' },
  '/warehouse/inbound-progress': { section: 'Vận Hành Kho', title: 'Tiến Độ Nhập Kho' },
  '/warehouse/staff/inbound-progress': { section: 'Vận Hành Kho', title: 'Tiến Độ Nhập Kho' },
  '/warehouse/layout': { section: 'Vận Hành Kho', title: 'Sơ Đồ Vị Trí Kho' },
  '/warehouse/raw-materials/inbound': { section: 'Vận Hành Kho', title: 'Nhập Nguyên Phụ Liệu' },
  '/account': { section: 'Hệ Thống', title: 'Hồ Sơ Tài Khoản' },
  '/': { section: 'Tổng Quan', title: 'Trang Chủ Dashboard' },
};

const TopHeader = ({ onToggleSidebar, user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([
    {
      id: 'init-1',
      type: 'info',
      title: 'Hệ thống ARAWMS sẵn sàng',
      time: 'Vừa xong',
      read: true,
      desc: 'Đã đồng bộ dữ liệu kho và các kênh bán hàng',
    },
  ]);

  // Lắng nghe socket sự kiện đổi trả RMA hoặc thông báo đơn mới từ backend
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleRmaAlert = (data) => {
      const newNotif = {
        id: 'rma-' + Date.now(),
        type: 'rma',
        title: `Phiếu RMA mới: ${data.rmaCode}`,
        time: 'Vừa xong',
        read: false,
        desc: data.message || `Đơn ${data.originalOrderCode} yêu cầu xử lý đổi/trả`,
      };
      setNotifications((prev) => [newNotif, ...prev.slice(0, 19)]);
    };

    const handleImportAlert = (data) => {
      const newNotif = {
        id: 'import-' + Date.now(),
        type: 'import',
        title: `Đơn sàn TMĐT mới: ${data.sourceName || 'Shopee/TikTok'}`,
        time: 'Vừa xong',
        read: false,
        desc: data.message || `Có ${data.orderCount || 1} đơn cần xử lý`,
      };
      setNotifications((prev) => [newNotif, ...prev.slice(0, 19)]);
    };

    socket.on('new_rma_alert', handleRmaAlert);
    socket.on('marketplace_orders_imported', handleImportAlert);

    return () => {
      socket.off('new_rma_alert', handleRmaAlert);
      socket.off('marketplace_orders_imported', handleImportAlert);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const currentPathKey = Object.keys(PAGE_TITLES).find(
    (k) => k !== '/' && location.pathname.startsWith(k)
  ) || (location.pathname === '/' ? '/' : null);

  const currentPage = PAGE_TITLES[currentPathKey] || {
    section: 'Hệ Thống',
    title: 'ARAWMS Enterprise Workspace',
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <header className="ara-top-header">
      <div className="ara-header-left">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="ara-btn-toggle-menu"
          title="Thu gọn / Mở rộng Sidebar"
          aria-label="Thu gọn / Mở rộng Sidebar"
        >
          <Menu size={18} />
        </button>

        <div className="ara-breadcrumb overflow-hidden">
          <span className="crumb-section d-none d-sm-inline text-nowrap">{currentPage.section}</span>
          <span className="crumb-separator d-none d-sm-inline">/</span>
          <span className="crumb-title text-truncate" style={{ maxWidth: 170 }}>{currentPage.title}</span>
        </div>
      </div>

      <div className="ara-header-right">
        {/* Notifications Dropdown */}
        <div className="ara-notification-wrapper">
          <button
            type="button"
            className="ara-icon-btn position-relative"
            onClick={() => setShowNotifications(!showNotifications)}
            title="Thông báo hệ thống"
            aria-label="Thông báo hệ thống"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="ara-notification-badge">{unreadCount}</span>
            )}
          </button>

          {showNotifications && (
            <div className="ara-notification-dropdown">
              <div className="notif-header">
                <span className="notif-title">Thông Báo Hệ Thống</span>
                {unreadCount > 0 && (
                  <button type="button" className="notif-mark-read" onClick={markAllRead}>
                    Đánh dấu đã đọc
                  </button>
                )}
              </div>

              <div className="notif-list">
                {notifications.length === 0 ? (
                  <div className="notif-empty">Không có thông báo mới</div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`notif-item ${!item.read ? 'unread' : ''}`}
                    >
                      <div className="notif-icon">
                        {item.type === 'rma' ? (
                          <RotateCcw size={15} color="var(--wms-accent, #8A6A46)" />
                        ) : item.type === 'import' ? (
                          <ShoppingBag size={15} color="var(--wms-success, #1E6B47)" />
                        ) : (
                          <Sparkles size={15} color="#2563eb" />
                        )}
                      </div>
                      <div className="notif-content">
                        <div className="notif-item-title">{item.title}</div>
                        <div className="notif-item-desc">{item.desc}</div>
                        <div className="notif-item-time">{item.time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Pill */}
        {user && (
          <Link to="/account" className="ara-user-pill" title="Hồ sơ cá nhân">
            <div className="user-pill-avatar" style={{ overflow: 'hidden' }}>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt="Avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                />
              ) : (
                (user.fullName || user.username || 'U').charAt(0).toUpperCase()
              )}
            </div>
            <div className="user-pill-meta d-none d-sm-flex">
              <span className="user-pill-name">
                {user.fullName || user.username}
              </span>
              <span className="user-pill-role">
                {user.roleCode || (user.roles && user.roles[0]) || 'SELLER'}
              </span>
            </div>
          </Link>
        )}
      </div>
    </header>
  );
};

export default TopHeader;
