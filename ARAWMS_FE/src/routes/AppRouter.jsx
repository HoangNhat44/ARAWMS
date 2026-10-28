/*
 * File: AppRouter.jsx
 * Author: Duy Anh
 * Date: 2026-10-15
 * Description: Routes users to warehouse and order screens.
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import NotFoundPage from '../pages/NotFoundPage';
import OrderQrPage from '../pages/OrderQrPage';
import WarehousePackingPage from '../pages/WarehousePackingPage';
import ProductConfigurationPage from '../pages/ProductConfigurationPage';
import FinishedGoodsPage from '../pages/FinishedGoodsPage';
import SupplierInboundPage from '../pages/SupplierInboundPage';
import WarehouseLayoutPage from '../pages/WarehouseLayoutPage';
import WarehousePutawayPage from '../pages/WarehousePutawayPage';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';

/** Restricts operational pages to an authenticated user.
 * Waits for session restoration before deciding whether to redirect. */
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (!user) return <Navigate to="/login" replace />;

  return children;
};

/** Allows a page only when an authenticated user has one of its required roles. */
const RoleRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.some((role) => user.roles?.includes(role))) return <Navigate to="/" replace />;
  return children;
};

/** Redirects signed-in users away from login and registration pages. */
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Đang tải..." />;
  if (user) return <Navigate to="/" replace />;

  return children;
};

/** Maps public, authenticated, and role-gated pages to application URLs. */
const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/orders/qr" element={<RoleRoute roles={['OWNER', 'SELLER', 'WAREHOUSE_STAFF']}><OrderQrPage /></RoleRoute>} />
      <Route path="/packing/qr" element={<RoleRoute roles={['WAREHOUSE_STAFF']}><WarehousePackingPage /></RoleRoute>} />
      <Route path="/warehouse/products/new" element={<RoleRoute roles={['WAREHOUSE_MANAGER']}><ProductConfigurationPage /></RoleRoute>} />
      <Route path="/warehouse/products/:id/edit" element={<RoleRoute roles={['WAREHOUSE_MANAGER']}><ProductConfigurationPage /></RoleRoute>} />
      <Route path="/warehouse/finished-goods" element={<RoleRoute roles={['WAREHOUSE_MANAGER']}><FinishedGoodsPage /></RoleRoute>} />
      <Route path="/warehouse/raw-materials/inbound" element={<RoleRoute roles={['OWNER', 'WAREHOUSE_MANAGER']}><SupplierInboundPage /></RoleRoute>} />
      <Route path="/warehouse/layout" element={<RoleRoute roles={['OWNER', 'WAREHOUSE_MANAGER']}><WarehouseLayoutPage /></RoleRoute>} />
      <Route path="/warehouse/putaway" element={<RoleRoute roles={['WAREHOUSE_STAFF']}><WarehousePutawayPage /></RoleRoute>} />
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
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRouter;
