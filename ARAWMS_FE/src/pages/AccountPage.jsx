/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-03, UC-04 - Tải hồ sơ và hiển thị các mục quản lý tài khoản
 * cá nhân.
 */
import { WmsButton } from '../components/ui/WmsControls';

import { useEffect, useState } from 'react';
import { User, ArrowLeft, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { accountService } from '../services/accountService';
import ProfileForm from './ProfileForm';
import ChangePasswordForm from './ChangePasswordForm';
import GoogleLinkCard from './GoogleLinkCard';
import { getRoleHome } from '../routes/roleHome';
import '../styles/accountAuth.css';

export default function AccountPage() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const homePath = getRoleHome(user?.roleCode);
  // UC-03: Lấy hồ sơ mới từ BE và bỏ kết quả nếu người dùng đã rời trang.
  useEffect(() => {
    let active = true; setError('');
    accountService.getProfile().then((response) => { if (active) setProfile(response.data.user); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  // UC-04: Cập nhật hồ sơ hiển thị sau khi BE lưu thành công.
  const saved = (updated) => { setProfile(updated); updateUser(updated); };
  if (error) return <div className="ara-account-page"><div role="alert" className="ara-alert ara-alert-error">{error}</div>
    <WmsButton className="btn-ara-secondary" onClick={() => setAttempt(attempt + 1)}>Thử lại</WmsButton></div>;
  if (!profile) return <LoadingSpinner message="Đang tải thông tin tài khoản..." />;
  return (
    <div className="ara-account-page" style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Link to={homePath} className="ara-text-button ara-google-action" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: '1.5rem', fontWeight: 600 }}>
        <ArrowLeft size={16} /> Quay lại phân hệ làm việc
      </Link>
      <header className="ara-account-heading" style={{ marginBottom: '2rem' }}>
        <span className="ara-eyebrow" style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 700, color: 'var(--wms-accent, #8A6A46)', letterSpacing: '0.06em' }}>
          Hồ sơ người dùng • {user?.roleCode}
        </span>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0', fontSize: '2rem', fontWeight: 700, color: 'var(--wms-text-primary, #141210)' }}>
          <User size={28} />
          {profile.fullName}
        </h1>
        <p style={{ margin: 0, color: 'var(--wms-secondary, #574F46)', fontSize: 14 }}>
          Quản lý thông tin cá nhân và thiết lập bảo mật tài khoản hệ thống ARAWMS.
        </p>
      </header>
      <div className="ara-account-grid">
        <ProfileForm user={profile} onSaved={saved} />
        <ChangePasswordForm />
        <GoogleLinkCard user={profile} onSaved={saved} />
      </div>
    </div>
  );
}
