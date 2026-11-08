/**
 * ============================================================================
 * @title        : Enterprise Sidebar Navigation
 * @author       : AraStore Frontend Team
 * @createdDate  : 2026-11-02
 * @description  : Thanh điều hướng đứng (Sidebar) chuẩn Enterprise ERP/WMS theo yêu cầu Mentor,
 *                 hỗ trợ thu gọn/mở rộng, phân quyền vai trò (Seller, Warehouse, Admin) và hiển thị
 *                 đầy đủ các phân hệ bán hàng, xử lý đơn sàn và kho vận.
 * ============================================================================
 */

import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  MessageSquareText,
  ShoppingBag,
  FileSpreadsheet,
  RotateCcw,
  QrCode,
  PackageCheck,
  Boxes,
  Warehouse,
  LayoutGrid,
  Truck,
  Home,
  User as UserIcon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react';

const Sidebar = ({ collapsed, mobileOpen, onCloseMobile, onToggle, user, onLogout }) => {
  const location = useLocation();

  const handleLinkClick = () => {
    if (onCloseMobile) onCloseMobile();
  };

  const isRole = (...roles) => {
    if (!user) return false;
    const userRoles = user.roles || (user.roleCode ? [user.roleCode] : ['SELLER']);
    return roles.some((r) => userRoles.includes(r));
  };

  const isSellerOrOwner = isRole('SELLER', 'OWNER');
  const isWarehouseOrOwner = isRole('WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER', 'OWNER');

  // Kiểm tra link active bao gồm cả query parameter (cho tab sàn TMĐT & RMA)
  const isTabActive = (path, tabKey) => {
    if (!location.pathname.startsWith(path)) return false;
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('tab') === tabKey;
  };

  return (
    <aside
      className={`ara-sidebar ${collapsed ? 'ara-sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      aria-label="Thanh điều hướng chính"
    >
      {/* Brand Header */}
      <div className="ara-sidebar-header">
        <NavLink to="/" onClick={handleLinkClick} className="ara-sidebar-brand" title="ARA Atelier & Warehouse">
          <img src="/logo.png" alt="ARA Logo" className="ara-sidebar-logo" />
          {(!collapsed || mobileOpen) && (
            <div className="ara-sidebar-brand-text">
              <span className="brand-title">ARA</span>
              <span className="brand-subtitle">Atelier & WMS</span>
            </div>
          )}
        </NavLink>

        {/* Desktop Toggle Button */}
        <button
          type="button"
          onClick={onToggle}
          className="ara-sidebar-toggle-btn d-none d-lg-flex"
          title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Mobile Close X Button */}
        <button
          type="button"
          onClick={onCloseMobile}
          className="ara-sidebar-toggle-btn d-lg-none"
          title="Đóng menu"
          aria-label="Đóng menu"
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav Content */}
      <div className="ara-sidebar-scroll">
        {/* Nhóm Bán Hàng & CSKH */}
        {isSellerOrOwner && (
          <div className="ara-nav-group">
            {!collapsed && <div className="ara-nav-group-title">BÁN HÀNG & CSKH</div>}
            <nav className="ara-nav-list">
              <NavLink
                to="/seller/chat"
                onClick={handleLinkClick}
                className={({ isActive }) =>
                  `ara-nav-item ${isActive ? 'active' : ''}`
                }
                title="Hội thoại & Bán hàng (Pancake Inbox)"
              >
                <span className="ara-nav-icon">
                  <MessageSquareText size={18} />
                </span>
                {(!collapsed || mobileOpen) && <span className="ara-nav-label">Hội Thoại & Bán Hàng</span>}
              </NavLink>

              <NavLink
                to="/seller/orders"
                end
                onClick={handleLinkClick}
                className={({ isActive }) =>
                  `ara-nav-item ${isActive && !location.search ? 'active' : ''}`
                }
                title="Quản lý danh sách đơn hàng"
              >
                <span className="ara-nav-icon">
                  <ShoppingBag size={18} />
                </span>
                {(!collapsed || mobileOpen) && <span className="ara-nav-label">Quản Lý Đơn Hàng</span>}
              </NavLink>

              <NavLink
                to="/seller/orders?tab=marketplace_import"
                onClick={handleLinkClick}
                className={`ara-nav-item ${isTabActive('/seller/orders', 'marketplace_import') ? 'active' : ''}`}
                title="Xử lý đơn Shopee, TikTok & Excel"
              >
                <span className="ara-nav-icon">
                  <FileSpreadsheet size={18} />
                </span>
                {(!collapsed || mobileOpen) && (
                  <span className="ara-nav-label d-flex justify-content-between align-items-center w-100">
                    <span>Xử Lý Đơn Sàn & Excel</span>
                    <span className="badge-new-nav">TMĐT</span>
                  </span>
                )}
              </NavLink>

              <NavLink
                to="/seller/orders?tab=rma_returns"
                onClick={handleLinkClick}
                className={`ara-nav-item ${isTabActive('/seller/orders', 'rma_returns') ? 'active' : ''}`}
                title="Quản lý Đổi & Trả Hàng"
              >
                <span className="ara-nav-icon">
                  <RotateCcw size={18} />
                </span>
                {(!collapsed || mobileOpen) && <span className="ara-nav-label">Đổi & Trả Hàng</span>}
              </NavLink>
            </nav>
          </div>
        )}

        {/* Nhóm Vận Hành Kho */}
        {isWarehouseOrOwner && (
          <div className="ara-nav-group">
            {(!collapsed || mobileOpen) && <div className="ara-nav-group-title">VẬN HÀNH KHO</div>}
            <nav className="ara-nav-list">
              <NavLink
                to="/orders/qr"
                onClick={handleLinkClick}
                className={({ isActive }) => `ara-nav-item ${isActive ? 'active' : ''}`}
                title="Chốt đơn & In QR"
              >
                <span className="ara-nav-icon">
                  <QrCode size={18} />
                </span>
                {(!collapsed || mobileOpen) && <span className="ara-nav-label">Chốt Đơn & QR</span>}
              </NavLink>

              {isRole('WAREHOUSE_STAFF', 'OWNER') && (
                <NavLink
                  to="/packing/qr"
                  onClick={handleLinkClick}
                  className={({ isActive }) => `ara-nav-item ${isActive ? 'active' : ''}`}
                  title="Đóng hàng & Video"
                >
                  <span className="ara-nav-icon">
                    <PackageCheck size={18} />
                  </span>
                  {(!collapsed || mobileOpen) && <span className="ara-nav-label">Đóng Hàng</span>}
                </NavLink>
              )}

              {isRole('WAREHOUSE_STAFF', 'OWNER') && (
                <NavLink
                  to="/warehouse/putaway"
                  onClick={handleLinkClick}
                  className={({ isActive }) => `ara-nav-item ${isActive ? 'active' : ''}`}
                  title="Xếp hàng vào kệ"
                >
                  <span className="ara-nav-icon">
                    <Boxes size={18} />
                  </span>
                  {(!collapsed || mobileOpen) && <span className="ara-nav-label">Xếp Hàng Vào Kệ</span>}
                </NavLink>
              )}

              {isRole('WAREHOUSE_MANAGER', 'OWNER') && (
                <NavLink
                  to="/warehouse/finished-goods"
                  onClick={handleLinkClick}
                  className={({ isActive }) => `ara-nav-item ${isActive ? 'active' : ''}`}
                  title="Kho thành phẩm"
                >
                  <span className="ara-nav-icon">
                    <Warehouse size={18} />
                  </span>
                  {(!collapsed || mobileOpen) && <span className="ara-nav-label">Kho Thành Phẩm</span>}
                </NavLink>
              )}

              {isRole('WAREHOUSE_MANAGER', 'OWNER') && (
                <NavLink
                  to="/warehouse/layout"
                  onClick={handleLinkClick}
                  className={({ isActive }) => `ara-nav-item ${isActive ? 'active' : ''}`}
                  title="Sơ đồ & Vị trí kho"
                >
                  <span className="ara-nav-icon">
                    <LayoutGrid size={18} />
                  </span>
                  {(!collapsed || mobileOpen) && <span className="ara-nav-label">Vị Trí Kho</span>}
                </NavLink>
              )}

              {isRole('WAREHOUSE_MANAGER', 'OWNER') && (
                <NavLink
                  to="/warehouse/raw-materials/inbound"
                  onClick={handleLinkClick}
                  className={({ isActive }) => `ara-nav-item ${isActive ? 'active' : ''}`}
                  title="Nhập nguyên phụ liệu"
                >
                  <span className="ara-nav-icon">
                    <Truck size={18} />
                  </span>
                  {(!collapsed || mobileOpen) && <span className="ara-nav-label">Nhập Nguyên Phụ Liệu</span>}
                </NavLink>
              )}
            </nav>
          </div>
        )}

        {/* Nhóm Hệ Thống */}
        <div className="ara-nav-group">
          {(!collapsed || mobileOpen) && <div className="ara-nav-group-title">HỆ THỐNG</div>}
          <nav className="ara-nav-list">
            <NavLink
              to="/"
              end
              onClick={handleLinkClick}
              className={({ isActive }) => `ara-nav-item ${isActive ? 'active' : ''}`}
              title="Trang chủ Dashboard"
            >
              <span className="ara-nav-icon">
                <Home size={18} />
              </span>
              {(!collapsed || mobileOpen) && <span className="ara-nav-label">Trang Chủ</span>}
            </NavLink>

            <NavLink
              to="/account"
              onClick={handleLinkClick}
              className={({ isActive }) => `ara-nav-item ${isActive ? 'active' : ''}`}
              title="Hồ sơ tài khoản"
            >
              <span className="ara-nav-icon">
                <UserIcon size={18} />
              </span>
              {(!collapsed || mobileOpen) && <span className="ara-nav-label">Tài Khoản</span>}
            </NavLink>
          </nav>
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="ara-sidebar-footer">
        {user ? (
          <div className="ara-sidebar-user-block">
            <div className="ara-sidebar-user-avatar" style={{ overflow: 'hidden' }}>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt="Avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                />
              ) : (
                <span>{(user.fullName || user.username || 'U').charAt(0).toUpperCase()}</span>
              )}
            </div>

            {!collapsed && (
              <div className="ara-sidebar-user-info">
                <div className="user-name" title={user.fullName || user.username}>
                  {user.fullName || user.username || user.employeeCode}
                </div>
                <div className="user-role-badge">
                  {user.roleCode || (user.roles && user.roles[0]) || 'SELLER'}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="ara-sidebar-logout-btn"
              title="Đăng xuất"
              aria-label="Đăng xuất"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
};

export default Sidebar;
