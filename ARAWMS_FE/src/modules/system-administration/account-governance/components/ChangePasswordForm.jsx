import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../../../hooks/useAuth';
import { accountService } from '../services/accountService';

export default function ChangePasswordForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { clearSession } = useAuth();
  const navigate = useNavigate();
  const submit = async (event) => {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) return setError('Xác nhận mật khẩu mới không khớp.');
    if (form.newPassword === form.currentPassword) return setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
    if (new TextEncoder().encode(form.newPassword).length > 72) return setError('Mật khẩu mới không được vượt quá 72 byte.');
    setBusy(true); setError('');
    try {
      const response = await accountService.changePassword(form);
      clearSession();
      navigate('/login', { replace: true, state: { message: response.message } });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const fields = [['currentPassword', 'Mật khẩu hiện tại'], ['newPassword', 'Mật khẩu mới'], ['confirmPassword', 'Xác nhận mật khẩu mới']];
  return <section className="ara-account-card">
    <h2>Đổi mật khẩu</h2><p className="ara-section-note">Sử dụng ít nhất 8 ký tự. Sau khi đổi mật khẩu, bạn cần đăng nhập lại trên các thiết bị.</p>
    {error && <div role="alert" className="ara-alert ara-alert-error">{error}</div>}
    <form onSubmit={submit}>
      {fields.map(([name, label]) => <div className="form-group" key={name}>
        <label className="form-label" htmlFor={name}>{label}</label>
        <div className="input-wrapper"><Lock size={18} className="input-icon" />
          <input id={name} type={visible ? 'text' : 'password'} className="form-input ara-password-input" required disabled={busy}
            minLength={name === 'currentPassword' ? undefined : 8} autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'}
            value={form[name]} onChange={(e) => { setError(''); setForm({ ...form, [name]: e.target.value }); }} />
        </div>
      </div>)}
      <button className="ara-text-button ara-password-toggle" type="button" onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}{visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      </button>
      <button className="btn-ara-primary" disabled={busy}><Lock size={17} />{busy ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</button>
    </form>
  </section>;
}
