import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { CheckCircle2, ArrowRight, Layers, Database, Server, PackageCheck, QrCode, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Shows the application entry points and a live backend availability indicator.
 * Reads the current user when available so the overview reflects the session. */
const HomePage = () => {
  const { user } = useAuth();
  const [backendStatus, setBackendStatus] = useState({ loading: true, online: false, message: '' });

  const userRoles = user?.roles || (user?.roleCode ? [user.roleCode] : []);
  const hasRole = (...roles) => roles.some((r) => userRoles.includes(r));

  useEffect(() => {
    /** Converts the health endpoint result into a concise connection status. */
    const checkApi = async () => {
      try {
        const res = await authService.checkHealth();
        setBackendStatus({ loading: false, online: true, message: res?.message || 'Kết nối máy chủ thành công' });
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
              {/* Phím tắt Seller */}
              {hasRole('SELLER', 'OWNER') && (
                <>
                  <Link to="/seller/chat" className="btn-ara-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                    <span>Vào Seller Chat Workspace</span>
                    <ArrowRight size={18} />
                  </Link>
                  <Link to="/seller/orders" className="btn-ara-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                    <span>Quản Lý Đơn Hàng</span>
                  </Link>
                </>
              )}

              {/* Phím tắt WAREHOUSE_MANAGER */}
              {hasRole('WAREHOUSE_MANAGER', 'OWNER') && (
                <>
                  <Link to="/warehouse/finished-goods" className="btn-ara-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                    <span>Kho Thành Phẩm</span>
                    <ArrowRight size={18} />
                  </Link>
                  <Link to="/warehouse/layout" className="btn-ara-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                    <span>Sơ Đồ & Sự Cố Kho</span>
                  </Link>
                  <Link to="/warehouse/raw-materials/inbound" className="btn-ara-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                    <span>Nhập Nguyên Phụ Liệu</span>
                  </Link>
                </>
              )}

              {/* Phím tắt WAREHOUSE_STAFF */}
              {hasRole('WAREHOUSE_STAFF', 'OWNER') && (
                <>
                  <Link to="/warehouse/putaway" className="btn-ara-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                    <span>Xếp Hàng Vào Kệ</span>
                    <ArrowRight size={18} />
                  </Link>
                  <Link to="/packing/qr" className="btn-ara-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                    <span>Đóng Gói Đơn Hàng</span>
                  </Link>
                </>
              )}

              {/* Phím tắt QR đơn hàng */}
              {hasRole('WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER', 'SELLER', 'OWNER') && (
                <Link to="/orders/qr" className="btn-ara-secondary" style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}>
                  <span>QR Đơn Hàng</span>
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

      {/* Grid Chức năng theo Role */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {/* Module WAREHOUSE_MANAGER */}
        {hasRole('WAREHOUSE_MANAGER', 'OWNER') && (
          <>
            <Link to="/warehouse/finished-goods" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
              <Layers size={28} color="var(--ara-gold)" />
              <h3 style={{ margin: '1rem 0 .5rem' }}>Quản lý kho thành phẩm & Nhập hàng loạt</h3>
              <p style={{ color: 'var(--ara-text-muted)' }}>Xem tồn kho SKU, quản lý sản phẩm, nhập kho hàng loạt theo lô / vị trí.</p>
              <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Mở kho thành phẩm →</span>
            </Link>

            <Link to="/warehouse/layout" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
              <MapPin size={28} color="var(--ara-gold)" />
              <h3 style={{ margin: '1rem 0 .5rem' }}>Cấu hình sơ đồ kho & Xử lý sự cố</h3>
              <p style={{ color: 'var(--ara-text-muted)' }}>Quy hoạch kệ/ô, phân bổ vị trí putaway, xem báo thiếu và phê duyệt sự cố xếp hàng.</p>
              <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Mở cấu hình sơ đồ kho →</span>
            </Link>

            <Link to="/warehouse/raw-materials/inbound" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
              <PackageCheck size={28} color="var(--ara-gold)" />
              <h3 style={{ margin: '1rem 0 .5rem' }}>Nhập kho nguyên phụ liệu</h3>
              <p style={{ color: 'var(--ara-text-muted)' }}>Tiếp nhận hàng theo kế hoạch nhà cung cấp, kiểm nhận cây vải, khai báo lô và in mã tem.</p>
              <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Tạo phiếu nhập →</span>
            </Link>
          </>
        )}

        {/* Module WAREHOUSE_STAFF */}
        {hasRole('WAREHOUSE_STAFF', 'OWNER') && (
          <>
            <Link to="/warehouse/putaway" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
              <Layers size={28} color="var(--ara-gold)" />
              <h3 style={{ margin: '1rem 0 .5rem' }}>Xếp hàng vào kệ (Putaway Tasks)</h3>
              <p style={{ color: 'var(--ara-text-muted)' }}>Quét mã vạch vị trí, quét barcode sản phẩm để xác nhận xếp hàng vào ô kệ chỉ định.</p>
              <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Bắt đầu xếp hàng →</span>
            </Link>

            <Link to="/packing/qr" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
              <PackageCheck size={28} color="var(--ara-gold)" />
              <h3 style={{ margin: '1rem 0 .5rem' }}>Đóng gói đơn hàng & Quay video</h3>
              <p style={{ color: 'var(--ara-text-muted)' }}>Quét kiểm tra sản phẩm đơn hàng, quay video đóng gói và đồng bộ bằng chứng kiểm hàng.</p>
              <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Mở trạm đóng gói →</span>
            </Link>
          </>
        )}

        {/* Module dùng chung QR đơn hàng */}
        {hasRole('WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER', 'SELLER', 'OWNER') && (
          <Link to="/orders/qr" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
            <QrCode size={28} color="var(--ara-gold)" />
            <h3 style={{ margin: '1rem 0 .5rem' }}>Quản lý & In QR Đơn Hàng</h3>
            <p style={{ color: 'var(--ara-text-muted)' }}>Tra cứu đơn, cấp phát mã QR đơn hàng hàng loạt, in phiếu và xác thực đơn xuất kho.</p>
            <span style={{ color: 'var(--ara-gold)', fontWeight: 700 }}>Tra cứu QR đơn hàng →</span>
          </Link>
        )}

        {/* Card MongoDB Atlas Cloud */}
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

        {/* Card Server Status */}
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
