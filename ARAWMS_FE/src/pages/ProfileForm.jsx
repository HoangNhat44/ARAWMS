/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-03, UC-04 - Hiển thị hồ sơ và gửi thay đổi họ tên, số điện
 * thoại.
 */

import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { accountService } from "../services/accountService";
import { fullNameError, normalizeFullName, normalizePhone } from "../utils/accountValidation";

export default function ProfileForm({ user, onSaved }) {
  const profileForm = useRef(null);
  const [form, setForm] = useState({ fullName: user.fullName, phone: user.phone || '' });
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setForm({ fullName: user.fullName, phone: user.phone || '' });
    setChallenge(null); setOtp('');
  }, [user.id, user.fullName, user.phone, user.email, user.googleLinkedAt]);
  // UC-04: Bấm nền ngoài các ô nhập/nút Lưu thì lấy lại hồ sơ đã lưu.
  useEffect(() => {
    const discardOutside = (event) => {
      const control = event.target.closest?.('input, button, label');
      if (busy || challenge || (control && profileForm.current?.contains(control))) return;
      setForm({ fullName: user.fullName, phone: user.phone || '' });
      setNotice(null);
    };
    document.addEventListener('click', discardOutside);
    return () => document.removeEventListener('click', discardOutside);
  }, [user.fullName, user.phone, busy, challenge]);
  useEffect(() => {
    if (!challenge && !resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge, resendAt]);
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expired = Boolean(challenge && now >= new Date(challenge.expiresAt).getTime());
  const change = (key, value) => { setForm(current => ({ ...current, [key]: value })); setNotice(null); };
  // UC-04: Chỉ khi bấm Lưu thay đổi và số điện thoại đã đổi mới gửi OTP.
  const submit = async (event) => {
    event.preventDefault();
    if (busy || challenge) return;
    const invalidName = fullNameError(form.fullName);
    if (invalidName) return setNotice({ ok: false, text: invalidName });
    const phone = normalizePhone(form.phone);
    if (!phone) return setNotice({ ok: false, text: 'Số điện thoại là bắt buộc, phải gồm đúng 10 chữ số và bắt đầu bằng số 0.' });
    const phoneChanged = phone !== (normalizePhone(user.phone || '') || user.phone || '');
    if (phoneChanged && !phone) return setNotice({ ok: false, text: 'Vui lòng nhập số điện thoại mới.' });
    if (phoneChanged && !user.emailVerified) return setNotice({ ok: false, text: 'Liên kết Google để xác nhận email trước khi đổi số điện thoại.' });
    if (phoneChanged && cooldown) return setNotice({ ok: false, text: `Vui lòng đợi ${cooldown} giây trước khi gửi OTP mới.` });
    setBusy(true); setNotice(null);
    try {
      const fullName = normalizeFullName(form.fullName);
      if (phoneChanged) {
        const response = await accountService.requestPhoneOtp({ phone, fullName });
        setChallenge(response.data); setOtp(''); setNow(Date.now());
        setResendAt(Date.now() + response.data.resendAfter * 1000);
        setNotice({ ok: true, text: response.message });
      } else {
        const response = await accountService.updateProfile({ fullName, phone });
        onSaved(response.data.user); setNotice({ ok: true, text: response.message });
      }
    } catch (error) { setNotice({ ok: false, text: error.message }); }
    finally { setBusy(false); }
  };
  // UC-04: Cả họ tên và số mới được lưu cùng lúc sau khi OTP đúng.
  const confirm = async (event) => {
    event.preventDefault();
    if (busy || !challenge || expired) return;
    if (!/^\d{6}$/.test(otp)) return setNotice({ ok: false, text: 'OTP phải gồm đúng 6 chữ số.' });
    setBusy(true); setNotice(null);
    try {
      const response = await accountService.confirmPhoneOtp({ challengeId: challenge.challengeId, otp });
      onSaved(response.data.user); setChallenge(null); setOtp('');
      setNotice({ ok: true, text: response.message });
    } catch (error) { setNotice({ ok: false, text: error.message }); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    if (busy || cooldown || !challenge) return;
    setBusy(true); setNotice(null);
    try {
      const response = await accountService.requestPhoneOtp({ phone: challenge.phone, fullName: normalizeFullName(form.fullName) });
      setChallenge(response.data); setOtp(''); setNow(Date.now());
      setResendAt(Date.now() + response.data.resendAfter * 1000);
      setNotice({ ok: true, text: response.message });
    } catch (error) { setNotice({ ok: false, text: error.message }); }
    finally { setBusy(false); }
  };
  return <section className="ara-account-card">
    <h2>Thông tin cá nhân</h2><p className="ara-section-note">Cập nhật họ tên và thông tin liên hệ của bạn.</p>
    {notice && <div role={notice.ok ? 'status' : 'alert'} className={`ara-alert ara-alert-${notice.ok ? 'success' : 'error'}`}>{notice.text}</div>}
    <form ref={profileForm} onSubmit={submit} onBlur={event => {
      if (!busy && !challenge && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
        setForm({ fullName: user.fullName, phone: user.phone || '' }); setNotice(null);
      }
    }}>
      <div className="form-group"><label className="form-label" htmlFor="fullName">Họ và tên</label>
        <input className="form-input ara-plain-input" id="fullName" autoComplete="name" maxLength={100} required disabled={busy || Boolean(challenge)}
          value={form.fullName} onChange={event => change('fullName', event.target.value)} />
      </div>
      <div className="form-group"><label className="form-label" htmlFor="phone">Số điện thoại</label>
        <input className="form-input ara-plain-input" id="phone" type="tel" autoComplete="tel" minLength={10} maxLength={10} required
          pattern="0[0-9]{9}" title="Số điện thoại gồm đúng 10 chữ số và bắt đầu bằng số 0."
          placeholder="0912345678" disabled={busy || Boolean(challenge)}
          value={form.phone} onChange={event => change('phone', event.target.value)} />
      </div>
      <dl className="ara-account-details">
        <div><dt>Mã nhân viên</dt><dd>{user.employeeCode}</dd></div>
        <div><dt>Email đăng nhập</dt><dd>{user.email}</dd></div>
        <div><dt>Vai trò</dt><dd>{user.roleName}</dd></div>
        <div><dt>Đăng nhập gần nhất</dt><dd>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('vi-VN') : 'Chưa có thông tin'}</dd></div>
      </dl>
      {!challenge && <button className="btn-ara-primary" disabled={busy}><Save size={17} />{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button>}
    </form>
    {challenge && <PhoneOtpConfirmation challenge={challenge} otp={otp} onOtpChange={setOtp} busy={busy} expired={expired}
      cooldown={cooldown} onConfirm={confirm} onResend={resend}
      onCancel={() => { setChallenge(null); setOtp(''); setNotice(null); }} />}
  </section>;
}

function PhoneOtpConfirmation({ challenge, otp, onOtpChange, busy, expired, cooldown, onConfirm, onResend, onCancel }) {
  return <div className="ara-phone-otp">
    <p className="ara-section-note">Nhập OTP gửi tới {challenge.email} để lưu thay đổi số điện thoại thành {challenge.phone}. Mã có hiệu lực 5 phút.</p>
    {expired && <p role="alert" className="ara-section-note">OTP đã hết hạn. Hãy gửi mã mới.</p>}
    <form onSubmit={onConfirm}>
      <div className="form-group"><label className="form-label" htmlFor="phoneOtp">Mã OTP</label>
        <input id="phoneOtp" className="form-input ara-plain-input" inputMode="numeric" autoComplete="one-time-code"
          maxLength={6} pattern="[0-9]{6}" required autoFocus disabled={busy || expired}
          value={otp} onChange={event => onOtpChange(event.target.value.replace(/\D/g, '').slice(0, 6))} />
      </div>
      <button className="btn-ara-primary" disabled={busy || expired || otp.length !== 6}>{busy ? 'Đang xác nhận...' : 'Xác nhận lưu thay đổi'}</button>
    </form>
    <div className="ara-otp-actions">
      <button type="button" className="ara-text-button" disabled={busy || cooldown > 0} onClick={onResend}>
        {cooldown > 0 ? `Gửi lại sau ${cooldown} giây` : 'Gửi lại OTP'}
      </button>
      <button type="button" className="ara-text-button" disabled={busy} onClick={onCancel}>Sửa lại thông tin</button>
    </div>
  </div>;
}
