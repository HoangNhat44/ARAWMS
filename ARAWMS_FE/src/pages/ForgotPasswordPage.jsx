// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-01/04/06 - Nhãn và hướng dẫn tiếng Việt phổ thông.
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Trang gửi yêu cầu Quên mật khẩu.
 */
import { WmsField, WmsInput, WmsButton } from '../components/ui/WmsControls';

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
      <div className="form-group"><WmsField required className="form-label" htmlFor="recoveryIdentifier">Thư điện tử hoặc mã nhân viên</WmsField>
        <WmsInput id="recoveryIdentifier" className="form-input ara-plain-input" autoComplete="username" required maxLength={254}
          value={identifier} disabled={busy} onChange={(event) => { setIdentifier(event.target.value); setError(''); }} />
      </div>
      <WmsButton className="btn-ara-primary ara-submit" disabled={busy || cooldown > 0}>
        {busy ? 'Đang gửi...' : cooldown > 0 ? 'Gửi lại sau ' + cooldown + ' giây' : 'Gửi liên kết đặt lại mật khẩu'}
      </WmsButton>
    </form>
  </>;
}

export default function ForgotPasswordPage() {
  return <PasswordRecoveryLayout title="Quên mật khẩu" description="Nhập địa chỉ thư điện tử hoặc mã nhân viên. Chúng tôi sẽ gửi liên kết đặt lại mật khẩu tới địa chỉ thư điện tử đã đăng ký.">
    <ForgotPasswordForm />
  </PasswordRecoveryLayout>;
}
