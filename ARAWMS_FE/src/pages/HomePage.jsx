import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { CheckCircle2, ArrowRight, Layers, Database, Server, MessageSquareText, ShoppingBag, ShieldCheck, Box, Calculator, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Shows the application entry points, role-based navigation pillars,
 * and a live backend availability indicator.
 */
const HomePage = () => {
  const { user } = useAuth();
  const [backendStatus, setBackendStatus] = useState({ loading: true, online: false, message: '' });

  useEffect(() => {
    /** Converts the health endpoint result into a concise connection status. */
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
          Nền tảng kiểm soát thông minh chuyên biệt cho xưởng may và thương hiệu thời trang ARA: từ kho vải, phụ liệu, định mức BOM, lệnh sản xuất đến kế toán kho, bán hàng và giao vận.
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
                  Xin chào, {user.fullName || user.username || user.employeeCode}!
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--ara-text-muted)' }}>
                  Tài khoản: <strong>{user.employeeCode || user.email || user.username}</strong> | Vai trò: <strong>{user.roleName || user.roleCode || 'USER'}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link to="/seller/chat" className="btn-ara-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquareText size={18} />
                <span>Hội Thoại & Bán Hàng</span>
                <ArrowRight size={18} />
              </Link>
              <Link to="/seller/orders" className="btn-ara-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingBag size={18} />
                <span>Quản Lý Đơn Hàng</span>
              </Link>
              {user?.roleCode === 'OWNER' && (
                <Link to="/owner/dashboard" className="btn-ara-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Crown size={18} />
                  <span>Trang Quản Trị Chủ Xưởng</span>
                </Link>
              )}
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

      {/* Grid Trụ cột chức năng */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <Link to="/garment/material-inbound-verification" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
          <ShieldCheck size={28} color="var(--ara-gold)" />
          <h3 style={{ margin: '1rem 0 .5rem', fontSize: '1.25rem' }}>Phân hệ Kỹ thuật may</h3>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.9rem' }}>Kiểm nhận nguyên phụ liệu, nghiệm thu KCS thành phẩm may, kiểm kê và thu hồi vải dư vụn.</p>
          <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Truy cập phân hệ →</span>
        </Link>

        <Link to="/warehouse/raw-materials/inbound" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
          <Layers size={28} color="var(--ara-gold)" />
          <h3 style={{ margin: '1rem 0 .5rem', fontSize: '1.25rem' }}>Quản lý kho</h3>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.9rem' }}>Quản lý kho nguyên phụ liệu, kho thành phẩm, cấu hình sản phẩm, sơ đồ vị trí kệ và kiểm kê kho.</p>
          <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Mở quản lý kho →</span>
        </Link>

        <Link to="/warehouse/putaway" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
          <Box size={28} color="var(--ara-gold)" />
          <h3 style={{ margin: '1rem 0 .5rem', fontSize: '1.25rem' }}>Nhân viên kho</h3>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.9rem' }}>Cất hàng vào kệ (putaway), xuất kho xưởng may, đóng hàng ghi hình video, in mã QR và giao vận.</p>
          <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Thao tác tác nghiệp →</span>
        </Link>

        <Link to="/accountant" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
          <Calculator size={28} color="var(--ara-gold)" />
          <h3 style={{ margin: '1rem 0 .5rem', fontSize: '1.25rem' }}>Phân hệ Kế toán</h3>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.9rem' }}>Hợp đồng mua sắm nhà cung cấp, kế hoạch nhập hàng, chứng từ thanh toán, đối soát COD và công nợ.</p>
          <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Vào phân hệ kế toán →</span>
        </Link>

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
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.65rem' }}>Cơ sở dữ liệu đám mây</h3>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.9rem', lineHeight: 1.55 }}>
            Dữ liệu đồng bộ trực tiếp lên Cloud Database Atlas, sẵn sàng với đầy đủ các phân hệ kinh doanh và kho vận.
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
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.65rem' }}>Trạng thái API Backend</h3>
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
