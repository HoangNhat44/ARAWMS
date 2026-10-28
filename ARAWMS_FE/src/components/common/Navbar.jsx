/*
 * File: Navbar.jsx
 * Author: Duy Anh
 * Date: 2026-10-15
 * Description: Provides navigation to warehouse and order screens.
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
// import { useAuth } from '../../hooks/useAuth';
import { LogOut, User as UserIcon, LogIn, Shield } from 'lucide-react';

/** Renders navigation allowed by the signed-in user's roles.
 * Logging out clears shared auth state before redirecting to sign-in. */
const Navbar = () => {
  // const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Mock user for testing without authentication
  const user = {
    _id: '507f1f77bcf86cd799439011',
    username: 'test',
    fullName: 'Test User',
    roles: ['OWNER', 'ADMIN'],
    warehouseIds: []
  };

  const handleLogout = () => {
    // logout();
    navigate('/login');
  };

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
            <Link to="/">Trang chủ</Link>
          </li>
          {user && (
            <>
              {(user.roles?.includes('OWNER') || user.roles?.includes('SELLER') || user.roles?.includes('WAREHOUSE_STAFF')) && <li><Link to="/orders/qr">{user.roles?.includes('WAREHOUSE_STAFF') ? 'Xem / in đơn & QR' : 'Chốt đơn / QR'}</Link></li>}
              {user.roles?.includes('WAREHOUSE_STAFF') && <li><Link to="/packing/qr">Đóng hàng</Link></li>}
              {user.roles?.includes('WAREHOUSE_STAFF') && <li><Link to="/warehouse/putaway">Xếp hàng vào kệ</Link></li>}
              {user.roles?.includes('WAREHOUSE_MANAGER') && <li><Link to="/warehouse/finished-goods">Kho thành phẩm</Link></li>}
              {(user.roles?.includes('WAREHOUSE_MANAGER') || user.roles?.includes('OWNER')) && <li><Link to="/warehouse/layout">Vị trí kho</Link></li>}
              {(user.roles?.includes('WAREHOUSE_MANAGER') || user.roles?.includes('OWNER')) && <li><Link to="/warehouse/raw-materials/inbound">Nhập nguyên phụ liệu</Link></li>}
            </>
          )}
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
                {user.roles && user.roles.includes('ADMIN') && (
                  <span style={{
                    fontSize: '0.7rem',
                    background: 'var(--ara-noir)',
                    color: '#FFFFFF',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    marginLeft: '0.25rem',
                  }}>
                    ADMIN
                  </span>
                )}
              </li>
              <li>
                <button 
                  onClick={handleLogout} 
                  className="btn-ara-secondary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
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
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
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
