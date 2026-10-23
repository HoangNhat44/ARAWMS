import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import LoginPage from '../modules/system-administration/authentication/pages/LoginPage';
import AccountPage from '../modules/system-administration/account-governance/pages/AccountPage';
import NotFoundPage from '../pages/NotFoundPage';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';

const SessionError = ({ message, retry }) => <div className="ara-account-page">
  <div className="ara-alert ara-alert-error" role="alert">{message}</div>
  <button className="btn-ara-secondary" onClick={retry}>Thử kết nối lại</button>
</div>;

const ProtectedRoute = ({ children }) => {
  const { user, loading, authError, refreshSession } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (authError) return <SessionError message={authError} retry={refreshSession} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner message="Đang tải..." />;
  if (user) return <Navigate to="/" replace />;
  return children;
};

export default function AppRouter() {
  return <Routes>
    <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
    <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
    <Route path="/register" element={<Navigate to="/login" replace />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
