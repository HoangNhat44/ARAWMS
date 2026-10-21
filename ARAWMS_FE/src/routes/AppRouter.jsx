import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import NotFoundPage from '../pages/NotFoundPage';
import SellerChatPage from '../pages/seller/SellerChatPage';
import SellerOrdersPage from '../pages/seller/SellerOrdersPage';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';

// Route bảo vệ (yêu cầu phải đăng nhập mới truy cập được)
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (!user) return <Navigate to="/login" replace />;

  return children;
};

// Route công khai (nếu đã đăng nhập rồi thì chuyển sang HomePage)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Đang tải..." />;
  if (user) return <Navigate to="/" replace />;

  return children;
};

const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />

      {/* Phân hệ Seller Workspace (UC-69 -> UC-83) — yêu cầu đăng nhập */}
      <Route
        path="/seller/chat"
        element={
          <ProtectedRoute>
            <SellerChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/seller/orders"
        element={
          <ProtectedRoute>
            <SellerOrdersPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRouter;
