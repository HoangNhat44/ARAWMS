/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01 đến UC-05; GBR-02 - Điều hướng trang và kiểm tra trạng
 * thái đăng nhập.
 */

import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { WmsButton } from '../components/ui/WmsControls';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import AccountPage from '../pages/AccountPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import NotFoundPage from '../pages/NotFoundPage';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';
const OwnerLayout = lazy(() => import('../pages/Owner/OwnerLayout'));
const EmployeesPage = lazy(() => import('../pages/Owner/EmployeesPage'));
const ActivityPage = lazy(() => import('../pages/Owner/ActivityPage'));
const FinancialPage = lazy(() => import('../pages/Owner/FinancialPage'));
const InventoryValuationPage = lazy(() => import('../pages/Owner/InventoryValuationPage'));
const OwnerRecordsPage = lazy(() => import('../pages/Owner/OwnerRecordsPage'));
const SystemSettingsPage = lazy(() => import('../pages/Owner/SystemSettingsPage'));
const StockAdjustmentPage = lazy(() => import('../pages/Owner/StockAdjustmentPage'));
const EmployeeCreatePage = lazy(() => import('../pages/Owner/EmployeeCreatePage'));
const EmployeePermissionsPage = lazy(() => import('../pages/Owner/EmployeePermissionsPage'));
const OwnerRecordDetailPage = lazy(() => import('../pages/Owner/OwnerRecordDetailPage'));
const StockAdjustmentDetailPage = lazy(() => import('../pages/Owner/StockAdjustmentDetailPage'));

const SessionError = ({ message, retry }) => <div className="ara-account-page">
  <div className="ara-alert ara-alert-error" role="alert">{message}</div>
  <WmsButton className="btn-ara-secondary" onClick={retry}>Thử kết nối lại</WmsButton>
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
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
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
  return <Suspense fallback={<LoadingSpinner message="Đang mở màn hình…" />}><Routes>
    <Route path="/" element={<ProtectedRoute><HomeEntry /></ProtectedRoute>} />
    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
    <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/account" element={<ProtectedRoute><AccountEntry /></ProtectedRoute>} />
    {/* Nguyễn Ngọc Huy-HE171157, 30-10-2026: UC-05 đến UC-20; GBR-01 - Toàn bộ trang Owner trong pages/Owner. */}
    <Route path="/owner" element={<ProtectedRoute><OwnerLayout /></ProtectedRoute>}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<FinancialPage key="dashboard" mode="dashboard" />} />
      <Route path="bi" element={<FinancialPage key="bi" mode="bi" />} />
      <Route path="profit" element={<FinancialPage key="profit" mode="profit" />} />
      <Route path="cash-flow" element={<FinancialPage key="cash" mode="cash" />} />
      <Route path="employees" element={<EmployeesPage />} />
      <Route path="employees/new" element={<EmployeeCreatePage />} />
      <Route path="employees/:employeeId/permissions" element={<EmployeePermissionsPage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="material-valuation" element={<InventoryValuationPage key="materials" />} />
      <Route path="asset-valuation" element={<InventoryValuationPage key="assets" assets />} />
      <Route path="manager-reports" element={<OwnerRecordsPage key="reports" mode="reports" />} />
      <Route path="manager-reports/:id" element={<OwnerRecordDetailPage key="report-detail" mode="reports" />} />
      <Route path="production" element={<OwnerRecordsPage key="production" mode="production" />} />
      <Route path="production/:id" element={<OwnerRecordDetailPage key="production-detail" mode="production" />} />
      <Route path="samples" element={<OwnerRecordsPage key="samples" mode="samples" />} />
      <Route path="samples/:id" element={<OwnerRecordDetailPage key="sample-detail" mode="samples" />} />
      {/* OWNER-EXT-02..06: Nhóm bổ sung từ Word sau khi hợp nhất hai danh sách Owner. */}
      <Route path="settings" element={<Navigate to="integrations" replace />} />
      <Route path="settings/integrations" element={<SystemSettingsPage key="api" section="api" />} />
      <Route path="settings/fabric" element={<SystemSettingsPage key="fabric" section="fabric" />} />
      <Route path="settings/inventory" element={<SystemSettingsPage key="inventory" section="inventory" />} />
      <Route path="settings/returns" element={<SystemSettingsPage key="returns" section="returns" />} />
      <Route path="stock-adjustments" element={<StockAdjustmentPage />} />
      <Route path="stock-adjustments/:id" element={<StockAdjustmentDetailPage />} />
      <Route path="account" element={<AccountPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
    <Route path="/register" element={<Navigate to="/login" replace />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></Suspense>;
}

// UC-12: Owner vào dashboard; các vai trò khác giữ trang chủ đang sử dụng.
function HomeEntry() {
  const { user } = useAuth();
  return user?.roleCode === 'OWNER' ? <Navigate to="/owner/dashboard" replace /> : <HomePage />;
}

// Owner giữ khung điều hướng khi mở hồ sơ; các vai trò khác tiếp tục dùng trang tài khoản chung.
function AccountEntry() {
  const { user } = useAuth();
  return user?.roleCode === 'OWNER' ? <Navigate to="/owner/account" replace /> : <AccountPage />;
}
