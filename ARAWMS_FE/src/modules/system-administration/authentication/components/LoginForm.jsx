import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../../hooks/useAuth';
import { authService } from '../services/authService';

export default function LoginForm() {
  const [form, setForm] = useState({ usernameOrEmail: '', password: '', rememberMe: true });
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const change = (event) => { setError(''); setForm({ ...form, [event.target.name]: event.target.value }); };
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await authService.login({ ...form, usernameOrEmail: form.usernameOrEmail.trim() });
      login(response.data.user, response.data.token, form.rememberMe);
      const destination = location.state?.from;
      navigate(typeof destination === 'string' && destination.startsWith('/') && !destination.startsWith('//')
        ? destination : '/', { replace: true });
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };
  return <div className="ara-login-form">
    <div className="ara-login-heading">
      <span className="ara-eyebrow">Cổng Đăng Nhập Nội Bộ</span>
      <h2>Chào mừng trở lại</h2><p>Vui lòng nhập thông tin xác thực để truy cập hệ thống</p>
    </div>
    {location.state?.message && <div role="status" className="ara-alert ara-alert-success">{location.state.message}</div>}
    {error && <div role="alert" className="ara-alert ara-alert-error"><AlertCircle size={18} /><span>{error}</span></div>}
    <form onSubmit={submit}>
      <div className="form-group"><label className="form-label" htmlFor="usernameOrEmail">Mã nhân viên hoặc Email</label>
        <div className="input-wrapper"><User size={18} className="input-icon" />
          <input id="usernameOrEmail" name="usernameOrEmail" className="form-input" placeholder="NV001 hoặc email của bạn"
            value={form.usernameOrEmail} onChange={change} autoComplete="username" maxLength={254} required disabled={submitting} />
        </div>
      </div>
      <div className="form-group"><div className="ara-password-label">
        <label className="form-label" htmlFor="password">Mật khẩu</label>
        <button type="button" className="ara-text-button" onClick={() => setError('Vui lòng liên hệ Owner để được hỗ trợ khôi phục tài khoản.')}>Quên mật khẩu?</button>
      </div>
        <div className="input-wrapper"><Lock size={18} className="input-icon" />
          <input id="password" name="password" type={visible ? 'text' : 'password'} className="form-input ara-password-input"
            placeholder="Nhập mật khẩu..." value={form.password} onChange={change} autoComplete="current-password" required disabled={submitting} />
          <button type="button" className="input-action-btn" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      <label className="ara-remember"><input type="checkbox" checked={form.rememberMe} disabled={submitting}
        onChange={(event) => setForm({ ...form, rememberMe: event.target.checked })} />Ghi nhớ đăng nhập trên thiết bị này</label>
      <button type="submit" className="btn-ara-primary ara-submit" disabled={submitting}>
        {submitting ? 'Đang xác thực...' : <>Đăng nhập hệ thống <ArrowRight size={18} /></>}
      </button>
    </form>
    <p className="ara-access-note">Chưa có tài khoản nội bộ? Liên hệ Owner để được cấp tài khoản nhân viên.</p>
  </div>;
}
