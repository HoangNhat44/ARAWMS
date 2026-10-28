/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01 đến UC-05; GBR-02 - Điều hướng trang và kiểm tra trạng
 * thái đăng nhập.
 */

import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import AccountPage from '../pages/AccountPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import NotFoundPage from '../pages/NotFoundPage';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';

const SessionError = ({ message, retry }) => <div className="ara-account-page">
  <div className="ara-alert ara-alert-error" role="alert">{message}</div>
  <button className="btn-ara-secondary" onClick={retry}>Thử kết nối lại</button>
</div>;

/*
 * UC-01, UC-03, UC-04: Chỉ mở trang được bảo vệ sau khi FE kiểm tra phiên với
 * BE.
 */
const ProtectedRoute = ({ children }) => {
  const { user, loading, authError, refreshSession } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (authError) return <SessionError message={authError} retry={refreshSession} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
};

// UC-01: Người đã đăng nhập được đưa về trang chủ khi mở lại trang đăng nhập.
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner message="Đang tải..." />;
  if (user) return <Navigate to="/" replace />;
  return children;
};

/*
 * UC-01 đến UC-05, GBR-02: Khai báo trang đăng nhập, hồ sơ và khôi phục mật
 * khẩu.
 */
export default function AppRouter() {
  return <Routes>
    <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
    <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
    <Route path="/register" element={<Navigate to="/login" replace />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
