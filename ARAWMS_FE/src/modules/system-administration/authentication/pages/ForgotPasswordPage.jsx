/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Trang gửi yêu cầu Quên mật khẩu.
 */

import PasswordRecoveryLayout from '../components/PasswordRecoveryLayout';
import ForgotPasswordForm from '../components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return <PasswordRecoveryLayout title="Quên mật khẩu" description="Nhập email hoặc mã nhân viên. Chúng tôi sẽ gửi liên kết đặt lại mật khẩu tới email đã đăng ký.">
    <ForgotPasswordForm />
  </PasswordRecoveryLayout>;
}
