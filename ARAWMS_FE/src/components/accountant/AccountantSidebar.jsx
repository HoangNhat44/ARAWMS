import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Home, X } from 'lucide-react';
import { ACCOUNTANT_NAV_GROUPS } from './accountantNavConfig';

const AccountantSidebar = ({
  collapsed,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile = () => {},
}) => {
  return (
    <aside
      className={`ara-acc-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      aria-label="Thanh điều hướng chính phân hệ Kế toán"
    >
      {/* Brand Header */}
      <div className="ara-acc-sidebar-brand">
        <Link
          to="/accountant"
          className="ara-acc-brand-link"
          title="AraStore WMS – Kế toán"
          onClick={onCloseMobile}
        >
          <img src="/logo.png" alt="AraStore Logo" className="ara-acc-brand-logo" />
          {(!collapsed || mobileOpen) && (
            <div className="ara-acc-brand-meta">
              <span className="ara-acc-brand-title">AraStore WMS</span>
              <span className="ara-acc-brand-subtitle">Phân hệ Kế toán</span>
            </div>
          )}
        </Link>

        <div className="ara-acc-sidebar-actions">
          {/* Collapse button on Desktop */}
          <button
            type="button"
            className="ara-acc-collapse-btn desktop-only"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            title={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          {/* Close button on Mobile Drawer */}
          <button
            type="button"
            className="ara-acc-mobile-close-btn"
            onClick={onCloseMobile}
            aria-label="Đóng thanh điều hướng"
            title="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="ara-acc-sidebar-nav" aria-label="Danh mục chức năng kế toán">
        {ACCOUNTANT_NAV_GROUPS.map((group) => (
          <div key={group.groupKey} className="ara-acc-nav-group">
            {(!collapsed || mobileOpen) && <div className="ara-acc-nav-group-title">{group.groupTitle}</div>}

            {(group?.items || []).map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.key}
                  to={item.path}
                  end={Boolean(item.exact)}
                  title={collapsed && !mobileOpen ? item.label : item.description}
                  onClick={onCloseMobile}
                  className={({ isActive }) => `ara-acc-nav-item ${isActive ? 'active' : ''}`}
                >
                  <div className="ara-acc-nav-item-left">
                    <Icon size={18} className="ara-acc-nav-icon" aria-hidden="true" />
                    {(!collapsed || mobileOpen) && <span className="ara-acc-nav-label">{item.label}</span>}
                  </div>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="ara-acc-sidebar-footer">
        <Link
          to="/"
          className="ara-acc-back-home-link"
          title="Quay về Trang chủ AraStore"
          onClick={onCloseMobile}
        >
          <Home size={16} aria-hidden="true" />
          {(!collapsed || mobileOpen) && <span>Quay về Trang chủ</span>}
        </Link>
      </div>
    </aside>
  );
};

export default AccountantSidebar;
