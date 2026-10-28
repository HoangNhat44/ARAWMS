/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04, UC-05 - Liên kết, hủy liên kết và đổi tài khoản Google
 * của người dùng.
 */

import { useEffect, useState } from 'react';
import { Link2, Unlink, ArrowLeft } from 'lucide-react';
import { authService } from '../services/authService';
import GoogleIdentityButton from './GoogleIdentityButton';
import { accountService } from '../services/accountService';
import { passwordError } from '../utils/authValidation';

export default function GoogleLinkCard({ user, onSaved }) {
  const [config, setConfig] = useState(null);
  const [password, setPassword] = useState('');
  const [managementToken, setManagementToken] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [mode, setMode] = useState('idle');
  const [unlinking, setUnlinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    authService.googleConfig().then(response => { if (active) setConfig(response.data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  const back = () => {
    setMode('idle'); setUnlinking(false); setPassword(''); setManagementToken('');
    setChallenge(null); setError(''); setMessage('');
  };
  const failed = (err) => {
    setError(err.message); setChallenge(null);
    if (err.status === 403) { setManagementToken(''); setMode('password'); }
  };
  // UC-04: Chỉ giữ quyền xác nhận ngắn hạn trong bộ nhớ; không giữ lại mật khẩu.
  const confirm = async (event) => {
    event.preventDefault();
    if (busy) return;
    const invalid = passwordError(password, 'Mật khẩu hiện tại');
    if (invalid) return setError(invalid);
    setBusy(true); setError(''); setMessage('');
    try {
      if (unlinking) {
        const response = await accountService.unlinkGoogle({ currentPassword: password });
        onSaved(response.data.user);
        setManagementToken(response.data.managementToken); setChallenge(response.data.challenge);
        setMessage('Đã hủy liên kết. Bạn có thể chọn Google khác ngay.');
      } else {
        const response = await accountService.googleChallenge({ currentPassword: password });
        setManagementToken(response.data.managementToken); setChallenge(response.data);
      }
      setUnlinking(false); setMode('choose');
    } catch (err) { setError(err.message); }
    finally { setPassword(''); setBusy(false); }
  };
  // UC-04: Chọn nhầm Google hoặc trùng email thì chọn lại trong 5 phút, không nhập lại mật khẩu.
  const chooseAgain = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await accountService.googleChallenge({ managementToken });
      setChallenge(response.data); setMode('choose');
    } catch (err) { failed(err); }
    finally { setBusy(false); }
  };
  return <section className="ara-account-card">
    <h2><Link2 size={21} /> Liên kết Google</h2>
    <p className="ara-section-note">Email Google sau khi liên kết sẽ là email đăng nhập, nhận thư đặt lại mật khẩu và OTP đổi số điện thoại.</p>
    {error && <div role="alert" className="ara-alert ara-alert-error">{error}</div>}
    {message && <div role="status" className="ara-alert ara-alert-success">{message}</div>}
    {user.googleLinked && <div className="ara-google-linked"><strong>Đã liên kết Google</strong><p>{user.googleEmail}</p></div>}
    {mode === 'idle' && <>
      {user.googleLinked ? <button type="button" className="btn-ara-secondary ara-google-action"
        onClick={() => { setUnlinking(true); setMode('password'); setError(''); setMessage(''); }}>
        <Unlink size={17} /> Hủy liên kết
      </button> : <>
        {config?.enabled && <button type="button" className="btn-ara-secondary ara-google-action"
          onClick={() => { setUnlinking(false); setMode('password'); setError(''); setMessage(''); }}>Liên kết Google</button>}
        {config?.enabled === false && <p className="ara-section-note">Đăng nhập Google chưa được bật.</p>}
        {!config && !error && <p role="status" className="ara-section-note">Đang tải...</p>}
        {!config && error && <button type="button" className="ara-text-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Thử lại</button>}
      </>}
    </>}
    {mode === 'password' && <form onSubmit={confirm}>
      <p className="ara-section-note">{unlinking ? 'Nhập mật khẩu để hủy liên kết và chọn Google khác.' : 'Nhập mật khẩu để xác nhận liên kết Google.'}</p>
      <div className="form-group"><label className="form-label" htmlFor="googleLinkPassword">Mật khẩu hiện tại</label>
        <input id="googleLinkPassword" type="password" className="form-input ara-plain-input" value={password} maxLength={72}
          onChange={event => { setPassword(event.target.value); setError(''); }} required autoComplete="current-password" disabled={busy} />
      </div>
      <button className="btn-ara-primary" disabled={busy}>{busy ? 'Đang xử lý...' : unlinking ? 'Xác nhận hủy liên kết' : 'Chọn tài khoản Google'}</button>
    </form>}
    {mode === 'choose' && <>
      {challenge ? <>
        <p className="ara-section-note">Chọn Google muốn liên kết trong vòng 5 phút.</p>
        <GoogleIdentityButton challenge={challenge} onBusyChange={setBusy} onError={failed}
          onCredential={async input => {
            const response = await accountService.linkGoogle(input);
            onSaved(response.data.user); back(); setMessage(response.message);
          }} />
      </> : managementToken && config?.enabled
        ? <button type="button" className="btn-ara-secondary ara-google-action" disabled={busy} onClick={chooseAgain}>Chọn tài khoản Google khác</button>
        : <p className="ara-section-note">Đăng nhập Google chưa được bật.</p>}
    </>}
    {mode !== 'idle' && <button type="button" className="ara-text-button ara-google-action" disabled={busy} onClick={back}>
      <ArrowLeft size={16} /> Quay lại
    </button>}
  </section>;
}
