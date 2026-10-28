import React from 'react';
import { authService } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const HomePage = () => {
  const { user } = useAuth();

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%' }}>
      {/* Hero Banner */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--ara-border)',
        boxShadow: 'var(--ara-shadow-md)',
        padding: '3.5rem 2.5rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'inline-flex',
          padding: '0.75rem',
          background: 'var(--ara-bg-surface)',
          borderRadius: '20px',
          border: '1px solid rgba(159, 131, 101, 0.25)',
          boxShadow: 'var(--ara-shadow-sm)',
          marginBottom: '1.5rem',
        }}>
          <img src="/logo.png" alt="ARA Logo" style={{ height: '80px', width: 'auto' }} />
        </div>

        <div style={{
          display: 'inline-block',
          padding: '0.35rem 0.85rem',
          background: 'rgba(159, 131, 101, 0.12)',
          color: 'var(--ara-gold-hover)',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.8rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '1rem',
        }}>
          Atelier & Warehouse Management System
        </div>

        <h1 style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--ara-noir)' }}>
          Hệ thống Quản lý Chuỗi Cung ứng ARA
        </h1>
        <p style={{ color: 'var(--ara-text-muted)', fontSize: '1.05rem', maxWidth: '720px', margin: '0 auto 2.5rem', lineHeight: 1.6 }}>
          Nền tảng kiểm soát thông minh chuyên biệt cho xưởng may và thương hiệu thời trang ARA: từ kho vải, phụ liệu, định mức BOM, lệnh sản xuất đến kế toán kho và giao vận.
        </p>

        {user ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem 2rem',
              background: 'var(--ara-bg-surface)',
              border: '1px solid var(--ara-gold)',
              borderRadius: 'var(--radius-full)',
              boxShadow: 'var(--ara-shadow-sm)',
            }}>
              <CheckCircle2 color="var(--ara-success)" size={24} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
                  Xin chào, {user.fullName || user.username}!
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--ara-text-muted)' }}>
                  Tài khoản: <strong>{user.employeeCode || user.email || user.username}</strong> | Vai trò: <strong>{user.roleName || user.roleCode || 'USER'}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link to="/seller/chat" className="btn-ara-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                <span>Vào Seller Chat Workspace (UC-69 - UC-83)</span>
                <ArrowRight size={18} />
              </Link>
              <Link to="/seller/orders" className="btn-ara-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                <span>Quản Lý Đơn Hàng</span>
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/login" className="btn-ara-primary">
              <span>Đăng nhập hệ thống</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        )}
      </div>

    </div>
  );
};

export default HomePage;
