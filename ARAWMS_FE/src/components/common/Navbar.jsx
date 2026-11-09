/*
 * File: Navbar.jsx
 * Author: Duy Anh & Antigravity (merged with Nguyễn Ngọc Huy-HE171157 & Nguyễn Quang Huy)
 * Date: 2026-11-08
 * Description: Clean top navigation bar with all role modules:
 *              - Bán hàng & CSKH (Seller)
 *              - Phân hệ Kỹ thuật (Garment Technician)
 *              - Quản lý kho (Warehouse Manager)
 *              - Nhân viên kho (Warehouse Staff)
 *              - Phân hệ Kế toán (Accountant)
 *              - Phân hệ Chủ xưởng (Owner)
 *              user profile dropdown, status badge, and logout.
 */
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown } from 'antd';
import {
  LogOut,
  User as UserIcon,
  LogIn,
  ShieldCheck,
  SlidersHorizontal,
  Box,
  Calculator,
  Crown,
  MessageSquareText,
  ShoppingBag,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_HOME } from '../../routes/roleHome';

const workspaceNav = new Map([
  ['OWNER', { label: 'Chủ xưởng', icon: Crown }],
  ['SELLER', { label: 'Bán hàng', icon: MessageSquareText }],
  ['GARMENT_TECHNICIAN', { label: 'Kỹ thuật may', icon: ShieldCheck }],
  ['WAREHOUSE_MANAGER', { label: 'Quản lý kho', icon: SlidersHorizontal }],
  ['WAREHOUSE_STAFF', { label: 'Nhân viên kho', icon: Box }],
  ['ACCOUNTANT', { label: 'Kế toán', icon: Calculator }],
]);
export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err?.message || 'Đăng xuất thất bại');
    } finally {
      setBusy(false);
    }
  };

  const workspace = workspaceNav.get(user?.roleCode);
  const navItems = workspace ? [{ ...workspace, path: ROLE_HOME.get(user.roleCode) }] : [];
  if (user?.roleCode === 'SELLER') {
    navItems.push({ label: 'Đơn hàng', path: '/seller/orders', icon: ShoppingBag });
  }

  const navLinkStyle = (isActive) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    textDecoration: 'none',
    fontSize: '0.92rem',
    fontWeight: isActive ? 700 : 500,
    color: isActive ? 'var(--ara-gold)' : 'var(--ara-noir-soft)',
    background: isActive ? 'var(--ara-bg-surface)' : 'transparent',
    border: isActive ? '1px solid var(--ara-gold)' : '1px solid transparent',
    padding: '0.4rem 0.85rem',
    borderRadius: 'var(--radius-sm)',
    transition: 'all 0.2s ease',
  });

  const profileMenuItems = [
    {
      key: 'profile',
      label: 'Tài khoản & bảo mật',
      icon: <UserIcon size={16} />,
      onClick: () => navigate(user?.roleCode === 'OWNER' ? '/owner/account' : '/account'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      label: busy ? 'Đang đăng xuất…' : 'Đăng xuất',
      danger: true,
      disabled: busy,
      icon: <LogOut size={16} />,
      onClick: signOut,
    },
  ];

  return (
    <>
      <header className="ara-navbar">
        <Link to="/" className="ara-brand">
          <img src="/logo.png" alt="ARA Logo" className="ara-brand-logo" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="ara-brand-text">ARA</span>
            <span
              style={{
                fontSize: '0.68rem',
                letterSpacing: '0.12em',
                color: 'var(--ara-gold)',
                textTransform: 'uppercase',
                marginTop: '-4px',
              }}
            >
              Atelier & Warehouse
            </span>
          </div>
        </Link>

        <nav aria-label="Điều hướng chính">
          <ul className="ara-nav-links">
            {navItems.map(({ label, path, icon: Icon }) => (
              <li key={path}>
                <Link to={path} style={navLinkStyle(location.pathname === path)}>
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}

            {/* User Account Dropdown hoặc Đăng nhập */}
            {user ? (
              <li>
                <Dropdown
                  menu={{ items: profileMenuItems }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <Button
                    type="text"
                    className="ara-profile-button"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      height: 'auto',
                      padding: '0.35rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--ara-bg-surface)',
                      border: '1px solid var(--ara-border)',
                    }}
                  >
                    <Avatar
                      size={24}
                      style={{
                        backgroundColor: 'var(--ara-gold)',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                      }}
                    >
                      {user.fullName?.[0] || user.employeeCode?.[0] || 'U'}
                    </Avatar>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.88rem',
                        color: 'var(--ara-noir)',
                      }}
                    >
                      {user.fullName || user.username || user.employeeCode}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        background: 'var(--ara-noir)',
                        color: '#FFFFFF',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '3px',
                        fontWeight: 700,
                      }}
                    >
                      {user.roleCode || (user.roles && user.roles[0]) || 'USER'}
                    </span>
                  </Button>
                </Dropdown>
              </li>
            ) : (
              <li>
                <Link
                  to="/login"
                  className="btn-ara-primary"
                  style={{
                    padding: '0.45rem 1.15rem',
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <LogIn size={15} />
                  <span>Đăng nhập</span>
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </header>
      {error && (
        <div role="alert" className="ara-logout-error" style={{ color: 'red', textAlign: 'center', padding: '0.25rem' }}>
          {error}
        </div>
      )}
    </>
  );
}
