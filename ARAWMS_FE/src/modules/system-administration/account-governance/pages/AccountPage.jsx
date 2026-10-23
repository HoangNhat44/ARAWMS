import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../../../../hooks/useAuth';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import { accountService } from '../services/accountService';
import ProfileForm from '../components/ProfileForm';
import ChangePasswordForm from '../components/ChangePasswordForm';
import '../../systemAdministration.css';

export default function AccountPage() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setError('');
    accountService.getProfile().then((response) => { if (active) setProfile(response.data.user); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  const saved = (updated) => { setProfile(updated); updateUser(updated); };
  if (error) return <div className="ara-account-page"><div role="alert" className="ara-alert ara-alert-error">{error}</div>
    <button className="btn-ara-secondary" onClick={() => setAttempt(attempt + 1)}>Thử lại</button></div>;
  if (!profile) return <LoadingSpinner message="Đang tải thông tin tài khoản..." />;
  return <div className="ara-account-page">
    <header className="ara-account-heading"><span className="ara-eyebrow">Tài khoản của tôi</span>
      <h1><User size={30} />{profile.fullName}</h1><p>Quản lý thông tin cá nhân và bảo mật tài khoản.</p>
    </header>
    <div className="ara-account-grid"><ProfileForm user={profile} onSaved={saved} />
      {user.roleCode !== 'OWNER' && <ChangePasswordForm />}
    </div>
  </div>;
}
