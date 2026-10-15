import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { CheckCircle2, Server, Database, Layers, ArrowRight, Shield, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const HomePage = () => {
  const { user } = useAuth();
  const [backendStatus, setBackendStatus] = useState({ loading: true, online: false, message: '' });

  useEffect(() => {
    const checkApi = async () => {
      try {
        const res = await authService.checkHealth();
        setBackendStatus({ loading: false, online: true, message: res.message || 'Kết nối máy chủ thành công' });
      } catch (err) {
        setBackendStatus({ loading: false, online: false, message: 'Chưa kết nối được tới Backend API' });
      }
    };

    checkApi();
  }, []);

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
                Tài khoản: <strong>{user.username}</strong> | Vai trò: <strong>{user.roles?.join(', ') || 'USER'}</strong>
              </div>
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

      {/* Grid 3 Trụ cột chức năng */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <div style={{
          background: '#FFFFFF',
          padding: '2rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--ara-border)',
          boxShadow: 'var(--ara-shadow-sm)',
        }}>
          <div style={{
            display: 'inline-flex',
            padding: '0.75rem',
            background: 'var(--ara-bg-surface)',
            borderRadius: '12px',
            color: 'var(--ara-gold)',
            marginBottom: '1rem',
          }}>
            <Layers size={24} />
          </div>
          <h3 style={{ fontSize: '1.35rem', marginBottom: '0.65rem' }}>Quản lý Kho Vải & Phụ liệu</h3>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.92rem', lineHeight: 1.55 }}>
            Theo dõi từng cây vải theo lô, số mét, độ co dãn, định mức tiêu hao và vị trí kệ chứa trong kho atelier.
          </p>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '2rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--ara-border)',
          boxShadow: 'var(--ara-shadow-sm)',
        }}>
          <div style={{
            display: 'inline-flex',
            padding: '0.75rem',
            background: 'var(--ara-bg-surface)',
            borderRadius: '12px',
            color: 'var(--ara-gold)',
            marginBottom: '1rem',
          }}>
            <Database size={24} />
          </div>
          <h3 style={{ fontSize: '1.35rem', marginBottom: '0.65rem' }}>MongoDB Atlas Cloud</h3>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.92rem', lineHeight: 1.55 }}>
            Dữ liệu đồng bộ trực tiếp lên Cloud Database Atlas, sẵn sàng với 31 Models chuẩn Data Dictionary.
          </p>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '2rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--ara-border)',
          boxShadow: 'var(--ara-shadow-sm)',
        }}>
          <div style={{
            display: 'inline-flex',
            padding: '0.75rem',
            background: 'var(--ara-bg-surface)',
            borderRadius: '12px',
            color: 'var(--ara-gold)',
            marginBottom: '1rem',
          }}>
            <Server size={24} />
          </div>
          <h3 style={{ fontSize: '1.35rem', marginBottom: '0.65rem' }}>Trạng thái API Backend</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: backendStatus.online ? 'var(--ara-success)' : 'var(--ara-error)',
              display: 'inline-block',
            }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: backendStatus.online ? 'var(--ara-success)' : 'var(--ara-error)' }}>
              {backendStatus.loading ? 'Đang kiểm tra...' : backendStatus.online ? 'Backend Sẵn Sàng (Online)' : 'Backend Chưa Sẵn Sàng'}
            </span>
          </div>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
            {backendStatus.message}
          </p>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
