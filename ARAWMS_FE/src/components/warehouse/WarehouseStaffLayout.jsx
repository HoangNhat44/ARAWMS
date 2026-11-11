/*
 * File: WarehouseStaffLayout.jsx
 * Role: WAREHOUSE_STAFF (Nhân viên kho)
 * Description: Unified Enterprise layout for Warehouse Staff module, providing standardized 64px header,
 *              responsive collapsible sidebar, and Warm Stone surface.
 */
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Grid,
  QrCode,
  Truck,
  Shirt,
  ArrowUpRight,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import WmsHeader from '../common/WmsHeader';

export default function WarehouseStaffLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const menuItems = [
    {
      to: '/warehouse/putaway',
      label: 'Nhập nguyên phụ liệu và thành phẩm',
      subLabel: 'Quét mã & cất hàng vào ô kệ',
      icon: Grid,
      match: (path) => path.startsWith('/warehouse/putaway'),
    },
    {
      to: '/warehouse/staff/outbound',
      label: 'Lệnh xuất nguyên phụ liệu và thành phẩm',
      subLabel: 'Lấy hàng theo FIFO & xuất kho',
      icon: ArrowUpRight,
      match: (path) => path.startsWith('/warehouse/staff/outbound'),
    },
    {
      to: '/warehouse/staff/finished-goods',
      label: 'Kho thành phẩm',
      subLabel: 'Tra cứu tồn kho theo SKU',
      icon: Shirt,
      match: (path) => path === '/warehouse/staff/finished-goods',
    },
    {
      to: '/warehouse/staff/inbound-progress',
      label: 'Tiến độ nhập kho',
      subLabel: 'Theo dõi cất hàng & phân bổ kệ',
      icon: TrendingUp,
      match: (path) => path.startsWith('/warehouse/staff/inbound-progress'),
    },
    {
      to: '/packing/qr',
      label: 'Đóng hàng',
      subLabel: 'Quét QR đóng gói & video',
      icon: Box,
      match: (path) => path.startsWith('/packing'),
    },
    {
      to: '/orders/qr',
      label: 'Đơn hàng & Quét QR',
      subLabel: 'Tra cứu đơn & in/quét mã QR',
      icon: QrCode,
      match: (path) => path.startsWith('/orders'),
    },
    {
      to: '/warehouse/shipping',
      label: 'Vận chuyển & Bàn giao',
      subLabel: 'Điều phối & bàn giao đơn',
      icon: Truck,
      match: (path) => path.startsWith('/warehouse/shipping'),
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

      {/* Sidebar for Warehouse Staff */}
      <aside
        className={`wms-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Thanh điều hướng Nhân viên kho"
      >
        {/* Brand Header */}
        <div className="wms-sidebar-brand">
          <Link
            to="/warehouse/putaway"
            className="wms-brand-link"
            title="AraStore WMS – Nhân viên kho"
            onClick={() => setMobileOpen(false)}
          >
            <img src="/logo.png" alt="AraStore Logo" className="wms-brand-logo" />
            {(!collapsed || mobileOpen) && (
              <div className="wms-brand-meta">
                <span className="wms-brand-title">AraStore WMS</span>
                <span className="wms-brand-subtitle">Nhân viên kho</span>
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
        <nav className="wms-sidebar-nav" aria-label="Danh mục tác vụ nhân viên kho">
          {(!collapsed || mobileOpen) && (
            <div className="wms-nav-group-title">Tác vụ vận hành kho</div>
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
              Nhân viên trực ca
            </div>
            <div className="wms-sidebar-footer-name">
              {user?.fullName || user?.username || 'Nhân viên kho'}
            </div>
            <div className="wms-sidebar-footer-role">
              {user?.roleCode || 'WAREHOUSE_STAFF'}
            </div>
          </div>
        )}
      </aside>

      {/* Main Wrapper */}
      <div className="wms-main-wrapper">
        <WmsHeader
          roleTitle="Nhân viên kho"
          currentTitle={currentItem?.label || 'Nhân viên kho'}
          navItems={menuItems}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((p) => !p)}
          onToggleMobile={() => setMobileOpen((p) => !p)}
          profilePath="/account"
        />
        <main className="wms-content-container">
          {children}
        </main>
      </div>
    </div>
  );
}
