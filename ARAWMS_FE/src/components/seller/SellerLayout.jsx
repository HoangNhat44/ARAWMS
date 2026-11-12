/*
 * File: SellerLayout.jsx
 * Role: SELLER (Nhân viên bán hàng / CSKH)
 * Description: Unified Enterprise layout for Seller Workspace, providing standardized 64px header,
 *              responsive collapsible sidebar, and Warm Stone surface.
 */
import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  MessageSquare,
  ShoppingBag,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import WmsHeader from '../common/WmsHeader';

export default function SellerLayout() {
  const { user } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const menuItems = [
    {
      to: '/seller/chat',
      label: 'Hội thoại & CSKH',
      subLabel: 'Chat đa kênh & chốt đơn nhanh',
      icon: MessageSquare,
      match: (path) => path.startsWith('/seller/chat'),
    },
    {
      to: '/seller/orders',
      label: 'Quản lý đơn hàng',
      subLabel: 'Danh sách đơn, sàn TMĐT & hoàn hàng',
      icon: ShoppingBag,
      match: (path) => path.startsWith('/seller/orders'),
    },
  ];

  const currentItem =
    menuItems.find((item) =>
      item.match ? item.match(location.pathname) : location.pathname === item.to
    ) || menuItems[0];

  return (
    <div className="wms-workspace-shell">
      {/* Backdrop overlay khi mở mobile sidebar */}
      {mobileOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(20, 18, 16, 0.45)',
            zIndex: 35,
            backdropFilter: 'blur(2px)',
          }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar for Seller Workspace */}
      <aside
        className={`wms-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Thanh điều hướng Bán hàng & CSKH"
      >
        {/* Brand Header */}
        <div className="wms-sidebar-brand">
          <Link
            to="/seller/orders"
            className="wms-brand-link"
            title="AraStore WMS – Bán hàng & CSKH"
            onClick={() => setMobileOpen(false)}
          >
            <img src="/logo.png" alt="AraStore Logo" className="wms-brand-logo" />
            {(!collapsed || mobileOpen) && (
              <div className="wms-brand-meta">
                <span className="wms-brand-title">AraStore WMS</span>
                <span className="wms-brand-subtitle">Bán hàng & CSKH</span>
              </div>
            )}
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              className="wms-icon-button"
              style={{ display: typeof window !== 'undefined' && window.innerWidth < 768 ? 'none' : 'inline-flex' }}
              onClick={() => setCollapsed((p) => !p)}
              aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
              title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            <button
              type="button"
              className="wms-icon-button"
              style={{ display: mobileOpen ? 'inline-flex' : 'none' }}
              onClick={() => setMobileOpen(false)}
              aria-label="Đóng thanh điều hướng"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="wms-sidebar-nav" aria-label="Danh mục tác vụ bán hàng">
          {(!collapsed || mobileOpen) && (
            <div className="wms-nav-group-title">Bán lẻ & Tư vấn khách</div>
          )}

          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.match
              ? item.match(location.pathname)
              : location.pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`wms-nav-item ${isActive ? 'active' : ''}`}
                title={collapsed && !mobileOpen ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <div className="wms-nav-icon">
                  <Icon size={18} />
                </div>
                {(!collapsed || mobileOpen) && (
                  <div className="wms-nav-text">
                    <span className="wms-nav-label">{item.label}</span>
                    {item.subLabel && (
                      <small className="wms-nav-sublabel">
                        {item.subLabel}
                      </small>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Card footer */}
        {(!collapsed || mobileOpen) && (
          <div className="wms-sidebar-footer">
            <div className="wms-sidebar-footer-label">
              Nhân viên tư vấn
            </div>
            <div className="wms-sidebar-footer-name">
              {user?.fullName || user?.username || 'Nhân viên bán hàng'}
            </div>
            <div className="wms-sidebar-footer-role">
              {user?.roleCode || 'SELLER'}
            </div>
          </div>
        )}
      </aside>

      {/* Main Wrapper */}
      <div className="wms-main-wrapper">
        <WmsHeader
          roleTitle="Bán hàng & CSKH"
          currentTitle={currentItem?.label || 'Bán hàng đa kênh'}
          navItems={menuItems}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((p) => !p)}
          onToggleMobile={() => setMobileOpen((p) => !p)}
          profilePath="/account"
        />
        <main className="wms-content-container" style={{ padding: location.pathname.startsWith('/seller/chat') ? 0 : undefined }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

