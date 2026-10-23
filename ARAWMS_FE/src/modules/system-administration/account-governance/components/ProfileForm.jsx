import { useState } from 'react';
import { Save } from 'lucide-react';
import { accountService } from '../services/accountService';

export default function ProfileForm({ user, onSaved }) {
  const [form, setForm] = useState({ fullName: user.fullName, phone: user.phone || '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const response = await accountService.updateProfile({ fullName: form.fullName.trim(), phone: form.phone.trim() });
      onSaved(response.data.user); setNotice({ ok: true, text: response.message });
    } catch (error) { setNotice({ ok: false, text: error.message }); }
    finally { setBusy(false); }
  };
  return <section className="ara-account-card">
    <h2>Thông tin cá nhân</h2><p className="ara-section-note">Cập nhật họ tên và thông tin liên hệ của bạn.</p>
    {notice && <div role={notice.ok ? 'status' : 'alert'} className={`ara-alert ara-alert-${notice.ok ? 'success' : 'error'}`}>{notice.text}</div>}
    <form onSubmit={submit}>
      <div className="form-group"><label className="form-label" htmlFor="fullName">Họ và tên</label>
        <input className="form-input ara-plain-input" id="fullName" autoComplete="name" maxLength={100} required disabled={busy}
          value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
      </div>
      <div className="form-group"><label className="form-label" htmlFor="phone">Số điện thoại</label>
        <input className="form-input ara-plain-input" id="phone" type="tel" autoComplete="tel" maxLength={21} disabled={busy}
          value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <dl className="ara-account-details">
        <div><dt>Mã nhân viên</dt><dd>{user.employeeCode}</dd></div>
        <div><dt>Email đăng nhập</dt><dd>{user.email}</dd></div>
        <div><dt>Vai trò</dt><dd>{user.roleName}</dd></div>
        <div><dt>Trạng thái</dt><dd>{user.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'}</dd></div>
        <div><dt>Đăng nhập gần nhất</dt><dd>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('vi-VN') : 'Chưa có thông tin'}</dd></div>
      </dl>
      <button className="btn-ara-primary" disabled={busy || !form.fullName.trim()}><Save size={17} />{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
    </form>
  </section>;
}
