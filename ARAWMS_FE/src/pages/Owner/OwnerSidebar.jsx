import { useEffect, useRef } from 'react';
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
  const closeButton = useRef(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const frame = requestAnimationFrame(() => closeButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mobileOpen]);

  return (
    <aside
      id="owner-sidebar"
      className={`owner-sidebar${mobileOpen ? ' mobile-open' : ''}`}
      aria-label="Thanh điều hướng chính phân hệ Chủ cửa hàng"
    >
      {/* Brand Header */}
      <div className="owner-sidebar-brand">
        <Link
          to="/owner/dashboard"
          className="owner-brand-link"
          aria-label="AraStore WMS – Chủ cửa hàng"
          title="AraStore WMS – Chủ cửa hàng"
          onClick={onCloseMobile}
        >
          <img src="/logo.png" alt="AraStore Logo" className="owner-brand-logo" />
          <div className="owner-brand-meta">
            <span className="owner-brand-title">AraStore WMS</span>
            <span className="owner-brand-subtitle">Chủ cửa hàng</span>
          </div>
        </Link>

        <div className="owner-sidebar-actions">
          <button
            type="button"
            className="owner-collapse-btn desktop-only"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            aria-expanded={!collapsed}
            aria-controls="owner-sidebar-nav"
            title={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          <button
            ref={closeButton}
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
      <nav id="owner-sidebar-nav" className="owner-sidebar-nav" aria-label="Danh mục chức năng chủ cửa hàng">
        {groups.map((group) => (
          <div key={group.title} className="owner-nav-group">
            <div className="owner-nav-group-title">{group.title}</div>

            {group.items.map(([key, label, Icon]) => {
              const isActive = selected === key;
              return (
                <NavLink
                  key={key}
                  to={`/owner/${key}`}
                  aria-label={label}
                  title={collapsed ? label : undefined}
                  onClick={onCloseMobile}
                  className={`owner-nav-item ${isActive ? 'active' : ''}`}
                >
                  <div className="owner-nav-item-left">
                    <Icon size={18} className="owner-nav-icon" aria-hidden="true" />
                    <span className="owner-nav-label">{label}</span>
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
          aria-label="Quay về Trang chủ"
          title="Quay về Trang chủ AraStore"
          onClick={onCloseMobile}
        >
          <Home size={16} aria-hidden="true" />
          <span>Quay về Trang chủ</span>
        </Link>
      </div>
    </aside>
  );
}

