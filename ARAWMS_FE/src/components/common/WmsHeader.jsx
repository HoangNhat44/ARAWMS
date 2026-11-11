import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AutoComplete, Badge, Button, Dropdown, Avatar, Tooltip, Input, Popover } from 'antd';
import {
  Search,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  User,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import '../../styles/wmsLayout.css';

const normalize = (value) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();

export default function WmsHeader({
  roleTitle = 'Vận hành kho',
  currentTitle = 'Bảng điều khiển',
  navItems = [],
  collapsed = false,
  onToggleCollapse = () => {},
  onToggleMobile = () => {},
  notifications = [],
  unreadCount = 0,
  notificationContent = null,
  profilePath = '/account',
  extraActions = null,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Responsive desktop check
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
    setNotifOpen(false);
    setSearch('');
  }, [location.pathname]);

  const displayName = user?.fullName || user?.username || roleTitle;
  const initials = displayName
    .split(' ')
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || roleTitle.slice(0, 2).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Search suggestions
  const searchOptions = useMemo(() => {
    const term = normalize(search);
    return (navItems || [])
      .filter((item) => {
        if (!term) return true;
        const haystack = normalize(`${item.label || ''} ${item.subLabel || ''} ${item.to || ''}`);
        return haystack.includes(term);
      })
      .map((item) => ({
        value: item.to,
        label: (
          <div style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
            <strong style={{ fontSize: 13, color: 'var(--wms-text-primary)' }}>{item.label}</strong>
            {item.subLabel && (
              <small style={{ color: 'var(--wms-secondary)', fontSize: 11 }}>{item.subLabel}</small>
            )}
          </div>
        ),
      }));
  }, [search, navItems]);

  const selectPage = (path) => {
    setSearch('');
    setSearchOpen(false);
    if (path) navigate(path);
  };

  const searchField = (
    <AutoComplete
      className="wms-header-search"
      value={search}
      options={searchOptions}
      onChange={setSearch}
      onSelect={selectPage}
      notFoundContent="Không tìm thấy nghiệp vụ phù hợp"
      defaultActiveFirstOption
      aria-label="Tìm nhanh chức năng"
    >
      <Input
        allowClear
        prefix={<Search size={16} aria-hidden="true" />}
        placeholder="Tìm chức năng..."
        maxLength={100}
        aria-label="Tìm nhanh chức năng"
      />
    </AutoComplete>
  );

  const accountMenu = {
    items: [
      {
        key: 'header-user-info',
        label: (
          <div style={{ padding: '4px 0' }}>
            <div style={{ fontWeight: 600, color: 'var(--wms-text-primary)' }}>{displayName}</div>
            <div style={{ fontSize: 12, color: 'var(--wms-secondary)' }}>{roleTitle}</div>
          </div>
        ),
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'account-profile',
        icon: <User size={15} />,
        label: 'Thông tin tài khoản',
        onClick: () => navigate(profilePath),
      },
      {
        key: 'account-logout',
        danger: true,
        icon: <LogOut size={15} />,
        label: 'Đăng xuất',
        onClick: handleLogout,
      },
    ],
  };

  return (
    <header className="wms-header">
      {/* Phía trái: Menu toggle & Phân cấp thương hiệu */}
      <div className="wms-header-context">
        <Tooltip
          title={
            isDesktop
              ? collapsed
                ? 'Mở rộng điều hướng'
                : 'Thu gọn điều hướng'
              : 'Mở điều hướng'
          }
        >
          <Button
            type="text"
            className="wms-icon-button"
            aria-label={
              isDesktop
                ? collapsed
                  ? 'Mở rộng điều hướng'
                  : 'Thu gọn điều hướng'
                : 'Mở điều hướng'
            }
            onClick={() => (isDesktop ? onToggleCollapse() : onToggleMobile())}
            icon={
              isDesktop ? (
                collapsed ? (
                  <ChevronRight size={18} />
                ) : (
                  <ChevronLeft size={18} />
                )
              ) : (
                <Menu size={18} />
              )
            }
          />
        </Tooltip>
        <div className="wms-header-titles">
          <span className="wms-header-brand">AraStore WMS</span>
          <span className="wms-header-sep">/</span>
          <span className="wms-header-page-title" title={currentTitle}>
            {currentTitle}
          </span>
        </div>
      </div>

      {/* Phía phải: Tìm kiếm, Thông báo & Tài khoản */}
      <div className="wms-header-actions">
        {extraActions}

        {/* Ô tìm kiếm Desktop */}
        <div className="wms-header-search-desktop">{searchField}</div>

        {/* Nút tìm kiếm Mobile */}
        <div className="wms-header-search-mobile">
          <Popover
            trigger="click"
            placement="bottomRight"
            open={searchOpen}
            onOpenChange={(open) => {
              setSearchOpen(open);
              if (open) setNotifOpen(false);
            }}
            content={searchField}
          >
            <Button
              type="text"
              className="wms-icon-button"
              aria-label="Mở tìm kiếm"
              icon={<Search size={18} />}
            />
          </Popover>
        </div>

        {/* Chuông thông báo */}
        <Popover
          trigger="click"
          placement="bottomRight"
          open={notifOpen}
          onOpenChange={(open) => {
            setNotifOpen(open);
            if (open) setSearchOpen(false);
          }}
          content={
            notificationContent || (
              <div style={{ padding: '16px 20px', textAlign: 'center', minWidth: 260 }}>
                <Bell size={24} style={{ color: 'var(--wms-accent)', margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--wms-text-primary)' }}>
                  Không có thông báo mới
                </div>
                <div style={{ fontSize: 12, color: 'var(--wms-secondary)', marginTop: 4 }}>
                  Hệ thống hoạt động ổn định
                </div>
              </div>
            )
          }
        >
          <Button
            type="text"
            className="wms-icon-button"
            aria-label={`Thông báo${unreadCount > 0 ? `: ${unreadCount} chưa xem` : ''}`}
          >
            <Badge count={unreadCount} size="small" overflowCount={99}>
              <Bell size={18} />
            </Badge>
          </Button>
        </Popover>

        {/* Profile Dropdown */}
        <Dropdown menu={accountMenu} trigger={['click']} placement="bottomRight">
          <Button type="text" className="wms-profile-button" aria-label="Mở menu tài khoản">
            <Avatar size={28} className="wms-avatar">
              {initials}
            </Avatar>
            <span className="wms-profile-info">
              <strong>{displayName}</strong>
              <small>{roleTitle}</small>
            </span>
          </Button>
        </Dropdown>
      </div>
    </header>
  );
}

