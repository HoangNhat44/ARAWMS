/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Trang gửi yêu cầu Quên mật khẩu.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { authService } from '../services/authService';
import { identifierError } from '../utils/authValidation';
import PasswordRecoveryLayout from './PasswordRecoveryLayout';

function ForgotPasswordForm() {
  const location = useLocation();
  const [identifier, setIdentifier] = useState(typeof location.state?.usernameOrEmail === 'string' ? location.state.usernameOrEmail : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  // GBR-02: Đếm thời gian chờ gửi lại email để tránh bấm liên tục.
  useEffect(() => {
    if (!cooldown) return;
    const timeout = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timeout);
  }, [cooldown]);
  // GBR-02: Kiểm tra email hoặc mã nhân viên và gửi yêu cầu khôi phục.
  const submit = async (event) => {
    event.preventDefault();
    if (busy || cooldown) return;
    const invalidIdentifier = identifierError(identifier);
    if (invalidIdentifier) return setError(invalidIdentifier);
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await authService.forgotPassword({ usernameOrEmail: identifier.trim() });
      setNotice(response.message); setCooldown(60);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <>
    {error && <div role="alert" className="ara-alert ara-alert-error">{error}</div>}
    {notice && <div role="status" className="ara-alert ara-alert-success">{notice}</div>}
    <form onSubmit={submit}>
      <div className="form-group"><label className="form-label" htmlFor="recoveryIdentifier">Email hoặc mã nhân viên</label>
        <input id="recoveryIdentifier" className="form-input ara-plain-input" autoComplete="username" required maxLength={254}
          value={identifier} disabled={busy} onChange={(event) => { setIdentifier(event.target.value); setError(''); }} />
      </div>
      <button className="btn-ara-primary ara-submit" disabled={busy || cooldown > 0}>
        {busy ? 'Đang gửi...' : cooldown > 0 ? 'Gửi lại sau ' + cooldown + ' giây' : 'Gửi liên kết đặt lại mật khẩu'}
      </button>
    </form>
  </>;
}

export default function ForgotPasswordPage() {
  return <PasswordRecoveryLayout title="Quên mật khẩu" description="Nhập email hoặc mã nhân viên. Chúng tôi sẽ gửi liên kết đặt lại mật khẩu tới email đã đăng ký.">
    <ForgotPasswordForm />
  </PasswordRecoveryLayout>;
}
