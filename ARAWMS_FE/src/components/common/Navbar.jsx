/*
 * File: Navbar.jsx
 * Author: Duy Anh & Antigravity
 * Date: 2026-10-29
 * Description: Clean top navigation bar with 3 main role modules (Phân hệ Kỹ thuật, Quản lý kho, Nhân viên kho), user badge, and logout.
 */
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LogOut, User as UserIcon, LogIn, ShieldCheck, SlidersHorizontal, Box } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
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

  return (
    <header className="ara-navbar">
      <Link to="/" className="ara-brand">
        <img 
          src="/logo.png" 
          alt="ARA Logo" 
          className="ara-brand-logo" 
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="ara-brand-text">ARA</span>
          <span style={{ fontSize: '0.68rem', letterSpacing: '0.12em', color: 'var(--ara-gold)', textTransform: 'uppercase', marginTop: '-4px' }}>
            Atelier & Warehouse
          </span>
        </div>
      </Link>

      <nav>
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
              <ShieldCheck size={16} color={isGarmentActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'} />
              <span>Phân hệ Kỹ thuật</span>
            </Link>
          </li>

          {/* 2. Quản lý kho */}
          <li>
            <Link 
              to="/warehouse/raw-materials/inbound" 
              style={navLinkStyle(isManagerActive)}
            >
              <SlidersHorizontal size={16} color={isManagerActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'} />
              <span>Quản lý kho</span>
            </Link>
          </li>

          {/* 3. Nhân viên kho */}
          <li>
            <Link 
              to="/warehouse/putaway" 
              style={navLinkStyle(isStaffActive)}
            >
              <Box size={16} color={isStaffActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'} />
              <span>Nhân viên kho</span>
            </Link>
          </li>

          {user ? (
            <>
              <li style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                color: 'var(--ara-noir)', 
                background: 'var(--ara-bg-surface)',
                border: '1px solid var(--ara-border)',
                padding: '0.4rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.88rem',
                fontWeight: 600 
              }}>
                <UserIcon size={16} color="var(--ara-gold)" />
                <span>{user.fullName || user.username}</span>
                <span style={{
                  fontSize: '0.7rem',
                  background: 'var(--ara-noir)',
                  color: '#FFFFFF',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  marginLeft: '0.25rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}>
                  {user.roleCode || (user.roles && user.roles[0]) || 'TEST_USER'}
                </span>
              </li>
              <li>
                <button 
                  onClick={handleLogout} 
                  className="btn-ara-secondary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <LogOut size={15} />
                  <span>Đăng xuất</span>
                </button>
              </li>
            </>
          ) : (
            <>
              <li>
                <Link 
                  to="/login" 
                  className="btn-ara-primary" 
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <LogIn size={15} />
                  <span>Đăng nhập</span>
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </header>
  );
};

export default Navbar;
