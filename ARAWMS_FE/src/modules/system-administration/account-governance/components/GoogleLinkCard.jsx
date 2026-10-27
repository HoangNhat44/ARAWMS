/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04, UC-05 - Liên kết, hủy liên kết và đổi tài khoản Google
 * của Owner.
 */

import { useEffect, useState } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { authService } from '../../authentication/services/authService';
import GoogleIdentityButton from '../../authentication/components/GoogleIdentityButton';
import { accountService } from '../services/accountService';
import { passwordError } from '../../authentication/validation/authValidation';

export default function GoogleLinkCard({ user, onSaved }) {
  const [config, setConfig] = useState(null);
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    authService.googleConfig().then((response) => { if (active) setConfig(response.data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  /*
   * UC-04, UC-05: Xác nhận mật khẩu trước khi chuẩn bị liên kết hoặc hủy
   * Google.
   */
  const confirm = async (event) => {
    event.preventDefault();
    if (busy) return;
    const invalidPassword = passwordError(password, 'Mật khẩu hiện tại');
    if (invalidPassword) return setError(invalidPassword);
    setError(''); setMessage(''); setBusy(true);
    try {
      // UC-04: Hủy Google hiện tại để người dùng có thể chọn Google khác.
      if (unlinking) {
        const response = await accountService.unlinkGoogle({ currentPassword: password });
        onSaved(response.data.user);
        setMessage(response.message); setUnlinking(false); setChallenge(null);
      } else {
        // UC-04, UC-05: Xin mã liên kết sau khi BE kiểm tra mật khẩu hiện tại.
        const response = await accountService.googleChallenge({ currentPassword: password });
        setChallenge(response.data);
      }
    } catch (err) { setError(err.message); }
    finally { setPassword(''); setBusy(false); }
  };
  const cancel = () => { setUnlinking(false); setPassword(''); setChallenge(null); setError(''); setMessage(''); };
  // UC-04: Dùng chung form xác nhận mật khẩu cho liên kết và hủy liên kết.
  const passwordForm = <form onSubmit={confirm}>
    <div className="form-group"><label className="form-label" htmlFor="googleLinkPassword">Mật khẩu hiện tại</label>
      <input id="googleLinkPassword" type="password" className="form-input ara-plain-input" value={password}
        onChange={(event) => { setPassword(event.target.value); setError(''); }} required autoComplete="current-password" disabled={busy} />
    </div>
    <button className="btn-ara-primary" disabled={busy}>{busy ? 'Đang xử lý...' : unlinking ? 'Xác nhận hủy liên kết' : 'Chọn tài khoản Google'}</button>
  </form>;
  return <section className="ara-account-card">
    <h2><Link2 size={21} /> Liên kết Google</h2>
    <p className="ara-section-note">Thêm tài khoản Google để đăng nhập nhanh hơn.</p>
    {error && <div role="alert" className="ara-alert ara-alert-error">{error}</div>}
    {message && <div role="status" className="ara-alert ara-alert-success">{message}</div>}
    {user.googleLinked ? <>
      <div className="ara-google-linked"><strong>Đã liên kết Google</strong><p>{user.googleEmail || 'Tài khoản Google của bạn'}</p></div>
      {unlinking ? <>
        <p className="ara-section-note">Nhập mật khẩu để hủy liên kết. Sau đó bạn có thể chọn tài khoản Google khác.</p>
        {passwordForm}
        <button type="button" className="ara-text-button ara-google-action" disabled={busy} onClick={cancel}>Giữ liên kết</button>
      </> : <button type="button" className="btn-ara-secondary ara-google-action" onClick={() => { setUnlinking(true); setError(''); setMessage(''); }}>
        <Unlink size={17} /> Hủy liên kết
      </button>}
    </> : <>
      {config?.enabled === false && <p className="ara-section-note">Đăng nhập Google chưa được bật.</p>}
      {!config && !error && <p role="status" className="ara-section-note">Đang tải...</p>}
      {!config && error && <button type="button" className="ara-text-button" onClick={() => { setError(''); setAttempt(attempt + 1); }}>Thử lại</button>}
      {config?.enabled && !challenge && passwordForm}
      {challenge && <>
        <p className="ara-section-note">Chọn Google muốn liên kết trong vòng 5 phút.</p>
        <GoogleIdentityButton challenge={challenge} onBusyChange={setBusy} onError={(err) => { setError(err.message); setChallenge(null); }}
          onCredential={async (input) => {
            const response = await accountService.linkGoogle(input);
            onSaved(response.data.user); setMessage(response.message); setChallenge(null);
          }} />
        <button type="button" className="ara-text-button" disabled={busy} onClick={cancel}>Hủy</button>
      </>}
    </>}
  </section>;
}
