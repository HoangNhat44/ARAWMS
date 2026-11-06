import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut, ChevronRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { FLATTENED_ACCOUNTANT_NAV } from './accountantNavConfig';

const AccountantHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Tự động xác định mục đang mở trên Sidebar theo URL hiện tại
  const currentNavItem =
    FLATTENED_ACCOUNTANT_NAV.find((item) =>
      item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
    ) || FLATTENED_ACCOUNTANT_NAV[0];

  const displayName = user?.fullName || user?.username || 'Kế toán kho';
  const displayRole = user?.roleCode || user?.roles?.[0] || 'ACCOUNTANT';
  const initials = displayName
    .split(' ')
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="ara-acc-header">
      {/* Left: Dynamic Breadcrumb & Title */}
      <div className="ara-acc-header-left">
        <nav className="ara-acc-breadcrumb" aria-label="Breadcrumb">
          <span>AraStore WMS</span>
          <ChevronRight size={13} aria-hidden="true" />
          <span>{currentNavItem?.groupTitle || 'Tổng quan'}</span>
        </nav>

        <div className="ara-acc-header-title-row">
          <h1 className="ara-acc-header-title">
            {currentNavItem?.label || 'Bảng điều khiển Kế toán'}
          </h1>
        </div>
      </div>

      {/* Right: Quick Search, Alerts, User Badge */}
      <div className="ara-acc-header-right">
        <div className="ara-acc-search-box">
          <Search size={15} className="ara-acc-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="ara-acc-search-input"
            aria-label="Tìm kiếm nhanh chứng từ, mã hợp đồng, vận đơn"
            placeholder="Tìm mã HĐ, phiếu chi, vận đơn..."
          />
        </div>

        <button
          type="button"
          className="ara-acc-icon-btn"
          aria-label="Cảnh báo đối soát COD và công nợ đến hạn"
          title="Cảnh báo đối soát COD & Công nợ đến hạn"
          onClick={() => navigate('/accountant/cod-red-flags')}
        >
          <Bell size={17} aria-hidden="true" />
          <span className="ara-acc-notif-dot" aria-hidden="true" />
        </button>

        <div className="ara-acc-user-badge">
          <div className="ara-acc-user-avatar" aria-hidden="true">
            {initials || 'KT'}
          </div>
          <div className="ara-acc-user-info">
            <span className="ara-acc-user-name">{displayName}</span>
            <span className="ara-acc-user-role">{displayRole}</span>
          </div>
        </div>

        {user && (
          <button
            type="button"
            className="ara-acc-icon-btn"
            aria-label="Đăng xuất khỏi hệ thống"
            title="Đăng xuất"
            onClick={handleLogout}
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
};

export default AccountantHeader;
