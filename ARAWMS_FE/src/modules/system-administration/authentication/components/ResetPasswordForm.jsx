/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Nhập và xác nhận mật khẩu mới qua liên
 * kết khôi phục.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { authService } from '../services/authService';
import { newPasswordError } from '../validation/authValidation';
import { useAuth } from '../../../../hooks/useAuth';

export default function ResetPasswordForm({ token }) {
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { clearSession } = useAuth();
  // GBR-02: Kiểm tra hai ô mật khẩu trước khi gửi mã khôi phục và mật khẩu mới.
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const invalid = newPasswordError(form.newPassword, form.confirmPassword);
    if (invalid) return setError(invalid);
    setBusy(true); setError('');
    try {
      const response = await authService.resetPassword({ token, ...form });
      // GBR-02: Đổi mật khẩu xong thì xóa phiên FE và yêu cầu đăng nhập lại.
      clearSession();
      navigate('/login', { replace: true, state: { message: response.message } });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <>
    {error && <div role="alert" className="ara-alert ara-alert-error">{error}</div>}
    <form onSubmit={submit}>
      {[['newPassword', 'Mật khẩu mới'], ['confirmPassword', 'Xác nhận mật khẩu mới']].map(([name, label]) =>
        <div className="form-group" key={name}><label className="form-label" htmlFor={name}>{label}</label>
          <input id={name} className="form-input ara-plain-input" type={visible ? 'text' : 'password'} required minLength={8}
            autoComplete="new-password" disabled={busy} value={form[name]}
            onChange={(event) => { setForm({ ...form, [name]: event.target.value }); setError(''); }} />
        </div>)}
      <button type="button" className="ara-text-button ara-password-toggle" disabled={busy} onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}{visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      </button>
      <button className="btn-ara-primary ara-submit" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu mật khẩu mới'}</button>
    </form>
  </>;
}
