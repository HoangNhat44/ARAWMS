/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01; GBR-02 - Nhập tài khoản, đăng nhập và chuyển sang Quên
 * mật khẩu.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../../hooks/useAuth';
import { authService } from '../services/authService';
import GoogleLogin from './GoogleLogin';
import { passwordError } from '../validation/authValidation';

export default function LoginForm() {
  const [form, setForm] = useState({ usernameOrEmail: '', password: '', rememberMe: true });
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resetRequired, setResetRequired] = useState(false);
  const busy = submitting || googleBusy;
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const change = (event) => { setError(''); setResetRequired(false); setForm({ ...form, [event.target.name]: event.target.value }); };
  // GBR-02: Mở Quên mật khẩu và điền sẵn tài khoản vừa nhập.
  const forgot = () => navigate('/forgot-password', { state: { usernameOrEmail: form.usernameOrEmail.trim() } });
  // UC-01, UC-05: Lưu hồ sơ và token rồi chuyển về trang người dùng muốn mở.
  const authenticated = (response) => {
    login(response.data.user, response.data.token, form.rememberMe);
    const destination = location.state?.from;
    navigate(typeof destination === 'string' && destination.startsWith('/') && !destination.startsWith('//')
      ? destination : '/', { replace: true });
  };
  /*
   * UC-01: Kiểm tra ô nhập trước khi gửi email hoặc mã nhân viên và mật khẩu
   * lên BE.
   */
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!form.usernameOrEmail.trim() || form.usernameOrEmail.trim().length > 254) return setError('Nhập email hoặc mã nhân viên hợp lệ.');
    const invalidPassword = passwordError(form.password);
    if (invalidPassword) return setError(invalidPassword);
    setError('');
    setSubmitting(true);
    try {
      const response = await authService.login({ ...form, usernameOrEmail: form.usernameOrEmail.trim() });
      authenticated(response);
    } catch (err) { setError(err.message); setResetRequired(err.code === 'PASSWORD_RESET_REQUIRED'); }
    finally { setSubmitting(false); }
  };
  /*
   * UC-01, GBR-02: Hiển thị form và nút đặt lại mật khẩu khi BE báo đã sai 5
   * lần.
   */
  return <div className="ara-login-form">
    <div className="ara-login-heading">
      <span className="ara-eyebrow">Cổng Đăng Nhập Nội Bộ</span>
      <h2>Chào mừng trở lại</h2><p>Vui lòng nhập thông tin xác thực để truy cập hệ thống</p>
    </div>
    {location.state?.message && <div role="status" className="ara-alert ara-alert-success">{location.state.message}</div>}
    {error && <div role="alert" className="ara-alert ara-alert-error"><AlertCircle size={18} /><span>{error}</span></div>}
    {resetRequired && <button type="button" className="btn-ara-secondary ara-recovery-action" onClick={forgot}>Đặt lại mật khẩu qua email</button>}
    <form onSubmit={submit}>
      <div className="form-group"><label className="form-label" htmlFor="usernameOrEmail">Mã nhân viên hoặc Email</label>
        <div className="input-wrapper"><User size={18} className="input-icon" />
          <input id="usernameOrEmail" name="usernameOrEmail" className="form-input" placeholder="NV001 hoặc email của bạn"
            value={form.usernameOrEmail} onChange={change} autoComplete="username" maxLength={254} required disabled={busy} />
        </div>
      </div>
      <div className="form-group"><div className="ara-password-label">
        <label className="form-label" htmlFor="password">Mật khẩu</label>
        <button type="button" className="ara-text-button" disabled={busy} onClick={forgot}>Quên mật khẩu?</button>
      </div>
        <div className="input-wrapper"><Lock size={18} className="input-icon" />
          <input id="password" name="password" type={visible ? 'text' : 'password'} className="form-input ara-password-input"
            placeholder="Nhập mật khẩu..." value={form.password} onChange={change} autoComplete="current-password" required disabled={busy} />
          <button type="button" className="input-action-btn" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      <label className="ara-remember"><input type="checkbox" checked={form.rememberMe} disabled={busy}
        onChange={(event) => setForm({ ...form, rememberMe: event.target.checked })} />Ghi nhớ đăng nhập trên thiết bị này</label>
      <button type="submit" className="btn-ara-primary ara-submit" disabled={busy}>
        {submitting ? 'Đang xác thực...' : <>Đăng nhập hệ thống <ArrowRight size={18} /></>}
      </button>
    </form>
    <GoogleLogin rememberMe={form.rememberMe} disabled={submitting} onSuccess={authenticated} onBusyChange={setGoogleBusy} />
  </div>;
}
