/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-05 - Ghép phần giới thiệu và biểu mẫu đăng nhập.
 */

import LoginBrandPanel from '../components/LoginBrandPanel';
import LoginForm from '../components/LoginForm';
import '../../systemAdministration.css';

export default function LoginPage() {
  return <div className="ara-login-page"><div className="ara-login-card">
    <LoginBrandPanel /><LoginForm />
  </div></div>;
}
