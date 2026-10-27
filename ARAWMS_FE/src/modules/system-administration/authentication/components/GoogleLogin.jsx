/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-05 - Chuẩn bị nút Google và đăng nhập Owner sau khi xác
 * minh.
 */

import { useEffect, useState } from 'react';
import { authService } from '../services/authService';
import GoogleIdentityButton from './GoogleIdentityButton';

export default function GoogleLogin({ rememberMe, disabled, onSuccess, onBusyChange }) {
  const [config, setConfig] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  // UC-05: Đọc cấu hình Google và xin mã xác thực từ BE trước khi hiển thị nút.
  useEffect(() => {
    let active = true;
    setError(''); setChallenge(null);
    authService.googleConfig().then(async (response) => {
      if (!active) return;
      setConfig(response.data);
      if (response.data.enabled) {
        const result = await authService.googleChallenge();
        if (active) setChallenge(result.data);
      }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  // UC-05: Bỏ mã đang dùng khi xác thực lỗi để lần thử lại nhận mã mới.
  const failed = (err) => { setError(err.message); setChallenge(null); };
  return <section className="ara-google-login" aria-label="Đăng nhập Owner bằng Google">
    <div className="ara-auth-divider"><span>Hoặc đăng nhập Owner bằng Google</span></div>
    {error && <div role="alert" className="ara-alert ara-alert-error">{error}</div>}
    {config?.enabled === false && <p className="ara-section-note">Google chưa được cấu hình. Owner có thể đăng nhập bằng email hoặc mã nhân viên và mật khẩu.</p>}
    {challenge && <GoogleIdentityButton challenge={challenge} disabled={disabled} onError={failed} onBusyChange={onBusyChange}
      onCredential={async (input) => {
        const response = await authService.googleLogin({ ...input, rememberMe });
        onSuccess(response);
      }} />}
    {!error && config?.enabled && !challenge && <p role="status" className="ara-section-note">Đang chuẩn bị đăng nhập Google...</p>}
    {error && <button type="button" className="ara-text-button" disabled={disabled} onClick={() => setAttempt(attempt + 1)}>Thử lại Google</button>}
  </section>;
}
