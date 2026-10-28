/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157 & Duy Anh
 * Ngày thực hiện: 28-10-2026
 * Chức năng: Điều hướng trang và phân quyền chi tiết theo vai trò (Role-based access).
 */

import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import LoginPage from '../modules/system-administration/authentication/pages/LoginPage';
import AccountPage from '../modules/system-administration/account-governance/pages/AccountPage';
import ForgotPasswordPage from '../modules/system-administration/authentication/pages/ForgotPasswordPage';
import ResetPasswordPage from '../modules/system-administration/authentication/pages/ResetPasswordPage';
import RegisterPage from '../pages/RegisterPage';
import NotFoundPage from '../pages/NotFoundPage';

// Seller Workspace Pages
import SellerChatPage from '../pages/seller/SellerChatPage';
import SellerOrdersPage from '../pages/seller/SellerOrdersPage';

// Warehouse Management Pages
import FinishedGoodsPage from '../pages/FinishedGoodsPage';
import WarehouseLayoutPage from '../pages/WarehouseLayoutPage';
import SupplierInboundPage from '../pages/SupplierInboundPage';
import ProductConfigurationPage from '../pages/ProductConfigurationPage';
import WarehousePutawayPage from '../pages/WarehousePutawayPage';
import WarehousePackingPage from '../pages/WarehousePackingPage';
import OrderQrPage from '../pages/OrderQrPage';

import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';

const SessionError = ({ message, retry }) => (
  <div className="ara-account-page">
    <div className="ara-alert ara-alert-error" role="alert">{message}</div>
    <button className="btn-ara-secondary" onClick={retry}>Thử kết nối lại</button>
  </div>
);

// Chỉ mở trang được bảo vệ sau khi FE kiểm tra phiên với BE.
const ProtectedRoute = ({ children }) => {
  const { user, loading, authError, refreshSession } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (authError) return <SessionError message={authError} retry={refreshSession} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
};

// Kiểm tra quyền theo vai trò (RoleRoute)
const RoleRoute = ({ children, roles }) => {
  const { user, loading, authError, refreshSession } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner message="Đang kiểm tra quyền truy cập..." />;
  if (authError) return <SessionError message={authError} retry={refreshSession} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const userRoles = user.roles || (user.roleCode ? [user.roleCode] : []);
  const hasAccess = roles.some((r) => userRoles.includes(r));
  if (!hasAccess) return <Navigate to="/" replace />;
  return children;
};

// Người đã đăng nhập được đưa về trang chủ khi mở lại trang đăng nhập.
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner message="Đang tải..." />;
  if (user) return <Navigate to="/" replace />;
  return children;
};

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />

      {/* Phân hệ Seller Workspace (UC-69 -> UC-83) */}
      <Route path="/seller/chat" element={<RoleRoute roles={['SELLER', 'OWNER']}><SellerChatPage /></RoleRoute>} />
      <Route path="/seller/orders" element={<RoleRoute roles={['SELLER', 'OWNER']}><SellerOrdersPage /></RoleRoute>} />

      {/* ==================================================================== */}
      {/* Phân hệ WAREHOUSE_MANAGER (Quản lý kho) - 6 trang                    */}
      {/* ==================================================================== */}
      {/* 1 & 5. Quản lý sản phẩm thành phẩm & Nhập kho hàng loạt */}
      <Route path="/warehouse/finished-goods" element={<RoleRoute roles={['WAREHOUSE_MANAGER', 'OWNER']}><FinishedGoodsPage /></RoleRoute>} />
      {/* 2. Cấu hình sơ đồ kho (kèm xử lý sự cố putaway) */}
      <Route path="/warehouse/layout" element={<RoleRoute roles={['WAREHOUSE_MANAGER', 'OWNER']}><WarehouseLayoutPage /></RoleRoute>} />
      {/* 3. Nhập kho nguyên liệu */}
      <Route path="/warehouse/raw-materials/inbound" element={<RoleRoute roles={['WAREHOUSE_MANAGER', 'OWNER']}><SupplierInboundPage /></RoleRoute>} />
      {/* 6. Cấu hình sản phẩm (Tạo mới & Chỉnh sửa) */}
      <Route path="/warehouse/products/new" element={<RoleRoute roles={['WAREHOUSE_MANAGER', 'OWNER']}><ProductConfigurationPage /></RoleRoute>} />
      <Route path="/warehouse/products/:id/edit" element={<RoleRoute roles={['WAREHOUSE_MANAGER', 'OWNER']}><ProductConfigurationPage /></RoleRoute>} />

      {/* ==================================================================== */}
      {/* Phân hệ WAREHOUSE_STAFF (Nhân viên kho)                              */}
      {/* ==================================================================== */}
      {/* Đóng gói đơn hàng */}
      <Route path="/packing/qr" element={<RoleRoute roles={['WAREHOUSE_STAFF', 'OWNER']}><WarehousePackingPage /></RoleRoute>} />

      {/* ==================================================================== */}
      {/* Phân hệ DÙNG CHUNG (WAREHOUSE_MANAGER & WAREHOUSE_STAFF)             */}
      {/* ==================================================================== */}
      {/* Xếp hàng vào kho (Staff quét mã, Manager theo dõi sự cố) */}
      <Route path="/warehouse/putaway" element={<RoleRoute roles={['WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER', 'OWNER']}><WarehousePutawayPage /></RoleRoute>} />
      {/* QR đơn hàng (Staff in/xử lý, Manager/Seller theo dõi) */}
      <Route path="/orders/qr" element={<RoleRoute roles={['WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER', 'SELLER', 'OWNER']}><OrderQrPage /></RoleRoute>} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
