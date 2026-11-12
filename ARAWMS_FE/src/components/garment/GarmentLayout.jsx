/*
 * File: GarmentLayout.jsx
 * Role: GARMENT_TECHNICIAN (Kỹ thuật viên may / KCS)
 * Description: Unified Enterprise layout for Garment Technician module, providing standardized 64px header,
 *              responsive collapsible sidebar, and Warm Stone surface.
 */
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ClipboardCheck,
  Shirt,
  ScanLine,
  ArrowUpRight,
  Scissors,
  Package,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import WmsHeader from '../common/WmsHeader';

export default function GarmentLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const menuItems = [
    {
      to: '/garment/raw-materials',
      label: 'Kho nguyên phụ liệu',
      subLabel: 'Danh mục, định mức & thông số NPL',
      icon: Package,
    },
    {
      to: '/garment/material-inbound-verification',
      label: 'Kế hoạch & Nhập NPL',
      subLabel: 'Đối soát & nhập kho nguyên phụ liệu',
      icon: ClipboardCheck,
    },
    {
      to: '/garment/finished-goods-inspection',
      label: 'KCS & Nhập thành phẩm',
      subLabel: 'Kiểm định may & nhập thành phẩm',
      icon: Shirt,
    },
    {
      to: '/garment/return-inspection',
      label: 'Kiểm tra hàng hoàn/trả',
      subLabel: 'Quét đơn, kiểm định KCS & nhập kho hoàn',
      icon: RotateCcw,
    },
    {
      to: '/garment/stocktake-execution',
      label: 'Kiểm kê theo yêu cầu',
      subLabel: 'Quét mã kệ & đếm kho theo lệnh',
      icon: ScanLine,
    },
    {
      to: '/garment/material-outbound-request',
      label: 'Yêu cầu xuất NPL',
      subLabel: 'Gửi yêu cầu xuất kho cho xưởng',
      icon: ArrowUpRight,
    },
    {
      to: '/garment/remnant-recovery',
      label: 'Cắt & Thu hồi vải thừa',
      subLabel: 'Đo vải thừa, kiểm tra ngưỡng & hoàn kho',
      icon: Scissors,
    },
  ];

  const currentItem =
    menuItems.find((item) => location.pathname.startsWith(item.to)) || menuItems[0];

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

      {/* Sidebar for Garment Technician */}
      <aside
        className={`wms-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Thanh điều hướng Kỹ thuật may"
      >
        {/* Brand Header */}
        <div className="wms-sidebar-brand">
          <Link
            to="/garment/raw-materials"
            className="wms-brand-link"
            title="AraStore WMS – Kỹ thuật may"
            onClick={() => setMobileOpen(false)}
          >
            <img src="/logo.png" alt="AraStore Logo" className="wms-brand-logo" />
            {(!collapsed || mobileOpen) && (
              <div className="wms-brand-meta">
                <span className="wms-brand-title">AraStore WMS</span>
                <span className="wms-brand-subtitle">Kỹ thuật may & KCS</span>
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
        <nav className="wms-sidebar-nav" aria-label="Danh mục nghiệp vụ kỹ thuật may">
          {(!collapsed || mobileOpen) && (
            <div className="wms-nav-group-title">KCS & Cắt may xưởng</div>
          )}

          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.to);

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
              Kỹ thuật viên KCS
            </div>
            <div className="wms-sidebar-footer-name">
              {user?.fullName || user?.username || 'Kỹ thuật may'}
            </div>
            <div className="wms-sidebar-footer-role">
              {user?.roleCode || 'GARMENT_TECHNICIAN'}
            </div>
          </div>
        )}
      </aside>

      {/* Main Wrapper */}
      <div className="wms-main-wrapper">
        <WmsHeader
          roleTitle="Kỹ thuật may"
          currentTitle={currentItem?.label || 'Kỹ thuật may'}
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
