import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

const LoginPage = () => {
  const [formData, setFormData] = useState({
    usernameOrEmail: 'admin',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleQuickFill = (username, pass) => {
    setFormData({ usernameOrEmail: username, password: pass });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.usernameOrEmail.trim() || !formData.password) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập/email và mật khẩu');
      return;
    }

    setSubmitting(true);

    try {
      const res = await authService.login({
        usernameOrEmail: formData.usernameOrEmail.trim(),
        password: formData.password,
      });

      if (res.success && res.data) {
        login(res.data.user, res.data.token);
        navigate('/');
      } else {
        setError(res.message || 'Đăng nhập không thành công');
      }
    } catch (err) {
      setError(err.message || 'Tài khoản hoặc mật khẩu không chính xác');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 120px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1.5rem',
    }}>
      <div style={{
        maxWidth: '980px',
        width: '100%',
        background: '#FFFFFF',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--ara-border)',
        boxShadow: 'var(--ara-shadow-lg)',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      }}>

        {/* CỘT TRÁI: BRAND SHOWCASE & LOGO ARA */}
        <div style={{
          background: 'linear-gradient(145deg, #F5F0E8 0%, #EAE2D5 100%)',
          padding: '3.5rem 2.5rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRight: '1px solid var(--ara-border)',
          position: 'relative',
        }}>
          <div>
            {/* Logo ARA hình vuông bo tròn cao cấp */}
            <div style={{
              display: 'inline-flex',
              padding: '0.85rem',
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid rgba(159, 131, 101, 0.25)',
              boxShadow: 'var(--ara-shadow-sm)',
              marginBottom: '2rem',
            }}>
              <img 
                src="/logo.png" 
                alt="ARA Atelier Logo" 
                style={{ height: '70px', width: 'auto', display: 'block' }}
              />
            </div>

            <div style={{
              display: 'inline-block',
              padding: '0.35rem 0.85rem',
              background: 'rgba(159, 131, 101, 0.15)',
              color: 'var(--ara-gold-hover)',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '1rem',
            }}>
              Atelier & Warehouse Solution
            </div>

            <h1 style={{
              fontSize: '2.5rem',
              lineHeight: 1.15,
              marginBottom: '1rem',
              color: 'var(--ara-noir)',
            }}>
              Hệ thống Quản lý Kho & Xưởng May ARA
            </h1>

            <p style={{
              color: 'var(--ara-text-muted)',
              fontSize: '0.98rem',
              lineHeight: 1.6,
              marginBottom: '2rem',
            }}>
              Nền tảng kiểm soát nguyên phụ liệu, cây vải, đơn sản xuất và chuỗi cung ứng thời trang may mặc chính xác, tinh tế và đồng bộ thời gian thực.
            </p>
          </div>

          {/* Feature Highlights */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
            background: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(8px)',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(159, 131, 101, 0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.88rem', color: 'var(--ara-noir-soft)' }}>
              <CheckCircle2 size={18} color="var(--ara-gold)" />
              <span>Quản lý danh mục vải, phụ liệu & định mức BOM</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.88rem', color: 'var(--ara-noir-soft)' }}>
              <CheckCircle2 size={18} color="var(--ara-gold)" />
              <span>Theo dõi tiến độ lệnh may & kiểm kê tồn kho chính xác</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.88rem', color: 'var(--ara-noir-soft)' }}>
              <ShieldCheck size={18} color="var(--ara-gold)" />
              <span>Bảo mật dữ liệu đám mây MongoDB Atlas phân quyền đa cấp</span>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI: FORM ĐĂNG NHẬP */}
        <div style={{
          padding: '3.5rem 3rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#FFFFFF',
        }}>
          <div style={{ marginBottom: '2rem' }}>
            <span style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--ara-gold)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>
              Cổng Đăng Nhập Nội Bộ
            </span>
            <h2 style={{ fontSize: '1.9rem', marginTop: '0.25rem', color: 'var(--ara-noir)' }}>
              Chào mừng trở lại
            </h2>
            <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.92rem', marginTop: '0.35rem' }}>
              Vui lòng nhập thông tin xác thực để truy cập hệ thống
            </p>
          </div>

          {error && (
            <div className="ara-alert ara-alert-error">
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Tên đăng nhập hoặc Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="usernameOrEmail">
                Tài khoản hoặc Email
              </label>
              <div className="input-wrapper">
                <User size={18} className="input-icon" />
                <input
                  id="usernameOrEmail"
                  name="usernameOrEmail"
                  type="text"
                  className="form-input"
                  placeholder="admin hoặc admin@arawms.com"
                  value={formData.usernameOrEmail}
                  onChange={handleChange}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Mật khẩu */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label className="form-label" htmlFor="password" style={{ margin: 0 }}>
                  Mật khẩu
                </label>
                <a 
                  href="#forgot" 
                  onClick={(e) => { e.preventDefault(); alert('Vui lòng liên hệ Quản trị viên để khôi phục mật khẩu tài khoản.'); }}
                  style={{ fontSize: '0.82rem', color: 'var(--ara-gold)', textDecoration: 'none', fontWeight: 500 }}
                >
                  Quên mật khẩu?
                </a>
              </div>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Nhập mật khẩu..."
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="input-action-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Ghi nhớ đăng nhập */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.75rem' }}>
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: 'var(--ara-noir)', width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="remember" style={{ fontSize: '0.88rem', color: 'var(--ara-text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                Ghi nhớ đăng nhập trên thiết bị này
              </label>
            </div>

            {/* Nút Đăng nhập */}
            <button
              type="submit"
              className="btn-ara-primary"
              style={{ width: '100%', padding: '0.95rem' }}
              disabled={submitting}
            >
              {submitting ? (
                'Đang xác thực...'
              ) : (
                <>
                  <span>Đăng nhập hệ thống</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Khối tài khoản thử nghiệm nhanh */}
          <div style={{
            marginTop: '2rem',
            paddingTop: '1.5rem',
            borderTop: '1px dashed var(--ara-border)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
            }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ara-text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Sparkles size={14} color="var(--ara-gold)" />
                Tài khoản kiểm tra nhanh (Demo):
              </span>
            </div>

            <div 
              onClick={() => handleQuickFill('admin', 'Admin@123')}
              style={{
                background: 'var(--ara-bg-surface)',
                border: '1px solid var(--ara-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'var(--transition)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--ara-gold)';
                e.currentTarget.style.background = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--ara-border)';
                e.currentTarget.style.background = 'var(--ara-bg-surface)';
              }}
              title="Nhấn để tự động điền tài khoản Admin"
            >
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ara-noir)' }}>
                  👑 Quản trị viên (Admin)
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>
                  User: <strong style={{ color: 'var(--ara-noir-soft)' }}>admin</strong> | Pass: <strong style={{ color: 'var(--ara-noir-soft)' }}>Admin@123</strong>
                </div>
              </div>
              <span style={{
                fontSize: '0.78rem',
                color: 'var(--ara-gold-hover)',
                fontWeight: 600,
                background: 'rgba(159, 131, 101, 0.12)',
                padding: '0.25rem 0.65rem',
                borderRadius: '4px',
              }}>
                Điền nhanh
              </span>
            </div>
          </div>

          {/* Đăng ký */}
          <div style={{
            marginTop: '1.5rem',
            textAlign: 'center',
            fontSize: '0.88rem',
            color: 'var(--ara-text-muted)',
          }}>
            Chưa có tài khoản nội bộ?{' '}
            <Link to="/register" style={{ color: 'var(--ara-noir)', fontWeight: 600, textDecoration: 'none' }}>
              Yêu cầu cấp quyền
            </Link>
          </div>

        </div>

      </div>
    </div>
  );
};

export default LoginPage;
