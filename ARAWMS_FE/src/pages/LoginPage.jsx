// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-01/04/06 - Nhãn và hướng dẫn tiếng Việt phổ thông.
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-05 - Ghép phần giới thiệu và biểu mẫu đăng nhập.
 */
import { WmsButton, WmsField, WmsInput } from '../components/ui/WmsControls';

import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { User, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { authService } from "../services/authService";
import { passwordError, identifierError } from "../utils/authValidation";
import "../styles/accountAuth.css";
import GoogleIdentityButton from "./GoogleIdentityButton";
import { getLoginDestination } from '../routes/roleHome';

export function LoginBrandPanel() {
  return <section className="ara-login-brand" aria-label="Giới thiệu hệ thống">
    <img src="/logo.png" alt="AraStore" />
    <div><span className="ara-eyebrow">AraStore · Quản trị nội bộ</span><h2>Quản lý kho và xưởng may</h2></div>
    <p>Theo dõi nguyên liệu, thành phẩm và vận hành tại một nơi. Thông tin được truy cập theo vai trò của bạn.</p>
    <ul><li>Quản lý nguyên vật liệu và thành phẩm</li><li>Theo dõi sản xuất và kiểm kê kho</li><li>Kiểm soát tài khoản và quyền truy cập</li></ul>
  </section>;
}

function LoginForm() {
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
  // UC-01, UC-05: Mở phân hệ của vai trò hoặc quay lại trang đã yêu cầu nếu được phép.
  const authenticated = (response) => {
    const { user, token } = response.data;
    login(user, token, form.rememberMe);
    navigate(getLoginDestination(user.roleCode, location.state?.returnTo), { replace: true });
  };
  /*
   * UC-01: Kiểm tra ô nhập trước khi gửi email hoặc mã nhân viên và mật khẩu
   * lên BE.
   */
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const invalidIdentifier = identifierError(form.usernameOrEmail);
    if (invalidIdentifier) return setError(invalidIdentifier);
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
      <h1>Đăng nhập hệ thống</h1><p>Vui lòng nhập thông tin xác thực để truy cập hệ thống</p>
    </div>
    {location.state?.message && <div role="status" className="ara-alert ara-alert-success">{location.state.message}</div>}
    {error && <div role="alert" className="ara-alert ara-alert-error"><AlertCircle size={18} /><span>{error}</span></div>}
    {resetRequired && <WmsButton type="button" className="btn-ara-secondary ara-recovery-action" onClick={forgot}>Đặt lại mật khẩu qua thư điện tử</WmsButton>}
    <form onSubmit={submit}>
      <div className="form-group"><WmsField required className="form-label" htmlFor="usernameOrEmail">Mã nhân viên hoặc thư điện tử</WmsField>
        <div className="input-wrapper"><User size={18} className="input-icon" />
          <WmsInput id="usernameOrEmail" name="usernameOrEmail" className="form-input" placeholder="NV001 hoặc email của bạn"
            value={form.usernameOrEmail} onChange={change} autoComplete="username" maxLength={254} required disabled={busy} />
        </div>
      </div>
      <div className="form-group"><div className="ara-password-label">
        <WmsField required className="form-label" htmlFor="password">Mật khẩu</WmsField>
        <WmsButton type="button" className="ara-text-button" disabled={busy} onClick={forgot}>Quên mật khẩu?</WmsButton>
      </div>
        <div className="input-wrapper"><Lock size={18} className="input-icon" />
          <WmsInput id="password" name="password" type={visible ? 'text' : 'password'} className="form-input ara-password-input"
            placeholder="Nhập mật khẩu..." value={form.password} onChange={change} autoComplete="current-password" required disabled={busy} />
          <WmsButton type="button" className="input-action-btn" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </WmsButton>
        </div>
      </div>
      <WmsField className="ara-remember"><WmsInput type="checkbox" checked={form.rememberMe} disabled={busy}
        onChange={(event) => setForm({ ...form, rememberMe: event.target.checked })} />Ghi nhớ đăng nhập trên thiết bị này</WmsField>
      <WmsButton type="submit" className="btn-ara-primary ara-submit" disabled={busy}>
        {submitting ? 'Đang xác thực...' : <>Đăng nhập hệ thống <ArrowRight size={18} /></>}
      </WmsButton>
    </form>
    <GoogleLogin rememberMe={form.rememberMe} disabled={submitting} onSuccess={authenticated} onBusyChange={setGoogleBusy} />
  </div>;
}

export default function LoginPage() {
  return <div className="ara-login-page"><div className="ara-login-card">
    <LoginBrandPanel /><LoginForm />
  </div></div>;
}

function GoogleLogin({ rememberMe, disabled, onSuccess, onBusyChange }) {
  const [config, setConfig] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  // UC-05: Đọc cấu hình Google và xin mã xác thực từ BE trước khi hiển thị nút.
  useEffect(() => {
    let active = true;
    setError(''); setChallenge(null);
    authService.googleConfig().then(async (response) => {
      if (!active) return;
      setConfig(response.data);
      if (response.data.enabled) {
        const result = await authService.googleChallenge();
        if (active) setChallenge(result.data);
      }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  // UC-05: Bỏ mã đang dùng khi xác thực lỗi để lần thử lại nhận mã mới.
  const failed = (err) => { setError(err.message); setChallenge(null); };
  return <section className="ara-google-login" aria-label="Đăng nhập bằng Google">
    <div className="ara-auth-divider"><span>Hoặc đăng nhập bằng Google</span></div>
    {error && <div role="alert" className="ara-alert ara-alert-error">{error}</div>}
    {config?.enabled === false && <p className="ara-section-note">Google chưa được cấu hình. Bạn có thể đăng nhập bằng thư điện tử hoặc mã nhân viên và mật khẩu.</p>}
    {challenge && <GoogleIdentityButton challenge={challenge} disabled={disabled} onError={failed} onBusyChange={onBusyChange}
      onCredential={async (input) => {
        const response = await authService.googleLogin({ ...input, rememberMe });
        onSuccess(response);
      }} />}
    {!error && config?.enabled && !challenge && <p role="status" className="ara-section-note">Đang chuẩn bị đăng nhập Google...</p>}
    {error && <WmsButton type="button" className="ara-text-button" disabled={disabled} onClick={() => setAttempt(attempt + 1)}>Thử lại Google</WmsButton>}
  </section>;
}
