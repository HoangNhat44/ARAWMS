/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-03, UC-04 - Tải hồ sơ và hiển thị các mục quản lý tài khoản
 * cá nhân.
 */

import { useEffect, useState } from 'react';
import { User, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { accountService } from '../services/accountService';
import ProfileForm from './ProfileForm';
import ChangePasswordForm from './ChangePasswordForm';
import GoogleLinkCard from './GoogleLinkCard';
import '../styles/accountAuth.css';

export default function AccountPage() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
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
    <button className="btn-ara-secondary" onClick={() => setAttempt(attempt + 1)}>Thử lại</button></div>;
  if (!profile) return <LoadingSpinner message="Đang tải thông tin tài khoản..." />;
  return <div className="ara-account-page">
    <Link to="/" className="ara-text-button ara-google-action"><ArrowLeft size={16} /> Quay lại trang chủ</Link>
    <header className="ara-account-heading"><span className="ara-eyebrow">Tài khoản của tôi</span>
      <h1><User size={30} />{profile.fullName}</h1><p>Quản lý thông tin cá nhân và bảo mật tài khoản.</p>
    </header>
    <div className="ara-account-grid"><ProfileForm user={profile} onSaved={saved} />
      <ChangePasswordForm />
      <GoogleLinkCard user={profile} onSaved={saved} />
    </div>
  </div>;
}
