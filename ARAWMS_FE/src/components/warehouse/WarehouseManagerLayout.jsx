/*
 * File: WarehouseManagerLayout.jsx
 * Role: WAREHOUSE_MANAGER (Quản lý kho)
 * Description: Unified Enterprise layout for Warehouse Manager module, providing standardized 64px header,
 *              responsive collapsible sidebar, and Warm Stone surface.
 */
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  PackagePlus,
  ArrowUpRight,
  Shirt,
  Sliders,
  LayoutGrid,
  ClipboardCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import WmsHeader from '../common/WmsHeader';

export default function WarehouseManagerLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const menuItems = [
    {
      to: '/warehouse/raw-materials/inbound',
      label: 'Nhập nguyên phụ liệu',
      subLabel: 'Duyệt & nhập kho từ NCC',
      icon: PackagePlus,
      match: (path) => path.startsWith('/warehouse/raw-materials/inbound'),
    },
    {
      to: '/warehouse/raw-materials/outbound',
      label: 'Xuất nguyên phụ liệu',
      subLabel: 'Duyệt cấp & phân bổ cuộn/lô',
      icon: ArrowUpRight,
      match: (path) => path.startsWith('/warehouse/raw-materials/outbound'),
    },
    {
      to: '/warehouse/finished-goods',
      label: 'Kho thành phẩm',
      subLabel: 'Tồn kho theo SKU & định giá',
      icon: Shirt,
      match: (path) => path === '/warehouse/finished-goods',
    },
    {
      to: '/warehouse/technical-inbound',
      label: 'Lệnh nhập thành phẩm',
      subLabel: 'Phiếu KCS xưởng & hàng hoàn',
      icon: ArrowDownToLine,
      match: (path) => path.startsWith('/warehouse/technical-inbound'),
    },
    {
      to: '/warehouse/technical-outbound',
      label: 'Lệnh xuất thành phẩm',
      subLabel: 'Chứng từ xuất kho thành phẩm',
      icon: ArrowUpFromLine,
      match: (path) => path.startsWith('/warehouse/technical-outbound'),
    },
    {
      to: '/warehouse/inbound-progress',
      label: 'Tiến độ nhập kho',
      subLabel: 'Theo dõi cất hàng & phân bổ kệ',
      icon: TrendingUp,
      match: (path) => path.startsWith('/warehouse/inbound-progress'),
    },
    {
      to: '/warehouse/products/new',
      label: 'Cấu hình sản phẩm',
      subLabel: 'Thông số & định mức quy cách',
      icon: Sliders,
      match: (path) => path.startsWith('/warehouse/products'),
    },
    {
      to: '/warehouse/layout',
      label: 'Cấu hình vị trí kho',
      subLabel: 'Sơ đồ khu vực, kệ & ô lưu trữ',
      icon: LayoutGrid,
      match: (path) => path.startsWith('/warehouse/layout'),
    },
    {
      to: '/warehouse/stocktake',
      label: 'Tạo lịch kiểm kê',
      subLabel: 'Lập đợt kiểm kê & đối soát',
      icon: ClipboardCheck,
      match: (path) => path.startsWith('/warehouse/stocktake'),
    },
  ];

  // Tìm tiêu đề hiện tại theo URL
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

      {/* Sidebar for Warehouse Manager */}
      <aside
        className={`wms-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Thanh điều hướng Quản lý kho"
      >
        {/* Brand Header */}
        <div className="wms-sidebar-brand">
          <Link
            to="/warehouse/finished-goods"
            className="wms-brand-link"
            title="AraStore WMS – Quản lý kho"
            onClick={() => setMobileOpen(false)}
          >
            <img src="/logo.png" alt="AraStore Logo" className="wms-brand-logo" />
            {(!collapsed || mobileOpen) && (
              <div className="wms-brand-meta">
                <span className="wms-brand-title">AraStore WMS</span>
                <span className="wms-brand-subtitle">Quản lý kho</span>
              </div>
            )}
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Desktop collapse toggle */}
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

            {/* Mobile close button */}
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
        <nav className="wms-sidebar-nav" aria-label="Danh mục nghiệp vụ quản lý kho">
          {(!collapsed || mobileOpen) && (
            <div className="wms-nav-group-title">Nghiệp vụ kho vận</div>
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
              Trực ca vận hành
            </div>
            <div className="wms-sidebar-footer-name">
              {user?.fullName || user?.username || 'Quản lý kho'}
            </div>
            <div className="wms-sidebar-footer-role">
              {user?.roleCode || 'WAREHOUSE_MANAGER'}
            </div>
          </div>
        )}
      </aside>

      {/* Main Wrapper */}
      <div className="wms-main-wrapper">
        <WmsHeader
          roleTitle="Quản lý kho"
          currentTitle={currentItem?.label || 'Quản lý kho'}
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
