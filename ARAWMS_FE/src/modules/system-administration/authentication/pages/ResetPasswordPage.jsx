/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Đọc mã khôi phục và mở biểu mẫu đặt mật
 * khẩu mới.
 */

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import PasswordRecoveryLayout from '../components/PasswordRecoveryLayout';
import ResetPasswordForm from '../components/ResetPasswordForm';

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // GBR-02: Lấy mã từ liên kết email và giữ trong bộ nhớ của trang.
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || '');
  // GBR-02: Bỏ mã khỏi thanh địa chỉ sau khi đọc để tránh lưu lại cùng URL.
  useEffect(() => {
    if (location.hash) navigate('/reset-password', { replace: true });
  }, [location.hash, navigate]);
  return <PasswordRecoveryLayout title="Đặt lại mật khẩu" description="Mật khẩu mới cần ít nhất 8 ký tự. Sau khi lưu, hãy đăng nhập lại.">
    {/^[a-f0-9]{64}$/.test(token) ? <ResetPasswordForm token={token} /> : <>
      <div role="alert" className="ara-alert ara-alert-error">Liên kết đặt lại mật khẩu không hợp lệ.</div>
      <Link to="/forgot-password" className="btn-ara-secondary">Gửi yêu cầu mới</Link>
    </>}
  </PasswordRecoveryLayout>;
}
