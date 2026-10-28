/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Bố cục chung cho các trang khôi phục mật
 * khẩu.
 */

import { Link } from 'react-router-dom';
import { LoginBrandPanel } from './LoginPage';
import '../styles/accountAuth.css';

export default function PasswordRecoveryLayout({ title, description, children }) {
  return <div className="ara-login-page"><div className="ara-login-card">
    <LoginBrandPanel />
    <div className="ara-login-form">
      <div className="ara-login-heading"><span className="ara-eyebrow">Khôi phục tài khoản</span>
        <h2>{title}</h2><p>{description}</p>
      </div>
      {children}
      <Link className="ara-text-button ara-recovery-back" to="/login">Quay lại đăng nhập</Link>
    </div>
  </div></div>;
}
