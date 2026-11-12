import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Home, X } from 'lucide-react';

/**
 * OwnerSidebar - Thanh điều hướng chính của phân hệ Chủ cửa hàng (Owner)
 * Đồng bộ 100% với cấu trúc, màu sắc, cỡ chữ, font chữ và layout của Kế toán kho (AccountantSidebar)
 */
export default function OwnerSidebar({
  groups,
  selected,
  collapsed,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile = () => {},
}) {
  return (
    <aside
      className={`owner-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      aria-label="Thanh điều hướng chính phân hệ Chủ cửa hàng"
    >
      {/* Brand Header */}
      <div className="owner-sidebar-brand">
        <Link
          to="/owner/dashboard"
          className="owner-brand-link"
          title="AraStore WMS – Chủ cửa hàng"
          onClick={onCloseMobile}
        >
          <img src="/logo.png" alt="AraStore Logo" className="owner-brand-logo" />
          {(!collapsed || mobileOpen) && (
            <div className="owner-brand-meta">
              <span className="owner-brand-title">AraStore WMS</span>
              <span className="owner-brand-subtitle">Chủ cửa hàng</span>
            </div>
          )}
        </Link>

        <div className="owner-sidebar-actions">
          {/* Collapse button on Desktop */}
          <button
            type="button"
            className="owner-collapse-btn desktop-only"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            title={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          {/* Close button on Mobile Drawer */}
          <button
            type="button"
            className="owner-mobile-close-btn"
            onClick={onCloseMobile}
            aria-label="Đóng thanh điều hướng"
            title="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="owner-sidebar-nav" aria-label="Danh mục chức năng chủ cửa hàng">
        {groups.map((group) => (
          <div key={group.title} className="owner-nav-group">
            {(!collapsed || mobileOpen) && (
              <div className="owner-nav-group-title">{group.title}</div>
            )}

            {group.items.map(([key, label, Icon]) => {
              const isActive = selected === key;
              return (
                <NavLink
                  key={key}
                  to={`/owner/${key}`}
                  title={collapsed && !mobileOpen ? label : undefined}
                  onClick={onCloseMobile}
                  className={`owner-nav-item ${isActive ? 'active' : ''}`}
                >
                  <div className="owner-nav-item-left">
                    <Icon size={18} className="owner-nav-icon" aria-hidden="true" />
                    {(!collapsed || mobileOpen) && (
                      <span className="owner-nav-label">{label}</span>
                    )}
                  </div>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="owner-sidebar-footer">
        <Link
          to="/"
          className="owner-back-home-link"
          title="Quay về Trang chủ AraStore"
          onClick={onCloseMobile}
        >
          <Home size={16} aria-hidden="true" />
          {(!collapsed || mobileOpen) && <span>Quay về Trang chủ</span>}
        </Link>
      </div>
    </aside>
  );
}

