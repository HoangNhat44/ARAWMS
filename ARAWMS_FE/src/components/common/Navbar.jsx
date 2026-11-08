/*
 * File: Navbar.jsx
 * Author: Duy Anh & Antigravity
 * Date: 2026-10-29
 * Description: Clean top navigation bar with role modules (Phân hệ Kỹ thuật, Quản lý kho, Nhân viên kho, Kế toán),
 *              user profile dropdown, and logout.
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
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

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

  const isHomeActive = location.pathname === '/';
  const isGarmentActive = location.pathname.startsWith('/garment');
  const isManagerActive =
    location.pathname.startsWith('/warehouse/raw-materials') ||
    location.pathname.startsWith('/warehouse/finished-goods') ||
    location.pathname.startsWith('/warehouse/products') ||
    location.pathname.startsWith('/warehouse/layout') ||
    location.pathname.startsWith('/warehouse/stocktake');
  const isStaffActive =
    location.pathname.startsWith('/warehouse/putaway') ||
    location.pathname.startsWith('/warehouse/staff') ||
    location.pathname.startsWith('/packing') ||
    location.pathname.startsWith('/orders') ||
    location.pathname.startsWith('/warehouse/shipping');
  const isAccountantActive = location.pathname.startsWith('/accountant');
  const isOwnerActive = location.pathname.startsWith('/owner');

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
    ...(user?.roleCode === 'OWNER'
      ? [
          {
            key: 'owner-dashboard',
            label: 'Trang quản trị Chủ xưởng',
            icon: <Crown size={16} />,
            onClick: () => navigate('/owner/dashboard'),
          },
        ]
      : []),
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
            <li>
              <Link to="/" style={navLinkStyle(isHomeActive)}>
                Trang chủ
              </Link>
            </li>

            {/* 1. Phân hệ Kỹ thuật */}
            <li>
              <Link
                to="/garment/material-inbound-verification"
                style={navLinkStyle(isGarmentActive)}
              >
                <ShieldCheck
                  size={16}
                  color={isGarmentActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'}
                />
                <span>Phân hệ Kỹ thuật</span>
              </Link>
            </li>

            {/* 2. Quản lý kho */}
            <li>
              <Link
                to="/warehouse/raw-materials/inbound"
                style={navLinkStyle(isManagerActive)}
              >
                <SlidersHorizontal
                  size={16}
                  color={isManagerActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'}
                />
                <span>Quản lý kho</span>
              </Link>
            </li>

            {/* 3. Nhân viên kho */}
            <li>
              <Link
                to="/warehouse/putaway"
                style={navLinkStyle(isStaffActive)}
              >
                <Box
                  size={16}
                  color={isStaffActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'}
                />
                <span>Nhân viên kho</span>
              </Link>
            </li>

            {/* 4. Phân hệ Kế toán */}
            <li>
              <Link
                to="/accountant"
                style={navLinkStyle(isAccountantActive)}
              >
                <Calculator
                  size={16}
                  color={isAccountantActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'}
                />
                <span>Phân hệ Kế toán</span>
              </Link>
            </li>

            {/* 5. Phân hệ Chủ xưởng (nếu có role OWNER) */}
            {user?.roleCode === 'OWNER' && (
              <li>
                <Link
                  to="/owner/dashboard"
                  style={navLinkStyle(isOwnerActive)}
                >
                  <Crown
                    size={16}
                    color={isOwnerActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'}
                  />
                  <span>Chủ xưởng</span>
                </Link>
              </li>
            )}

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
