import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LogOut, User as UserIcon, LogIn, Shield } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleLogout = async () => {
    setBusy(true);
    setError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <><header className="ara-navbar">
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
                <Link to="/account" title="Xem và cập nhật tài khoản">{user.fullName || user.employeeCode}</Link>
                {user.roleCode === 'OWNER' && (
                  <span style={{
                    fontSize: '0.7rem',
                    background: 'var(--ara-noir)',
                    color: '#FFFFFF',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    marginLeft: '0.25rem',
                  }}>
                    OWNER
                  </span>
                )}
              </li>
              <li>
                <button 
                  onClick={handleLogout} 
                  disabled={busy}
                  className="btn-ara-secondary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  <LogOut size={15} />
                  <span>{busy ? 'Đang đăng xuất...' : 'Đăng xuất'}</span>
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
    </header>{error && <div role="alert" className="ara-logout-error">{error}</div>}</>
  );
};

export default Navbar;
