/*
 * File: AppRouter.jsx
 * Author: Duy Anh & Antigravity (merged with Nguyễn Ngọc Huy-HE171157)
 * Description: Unified routing for all modules:
 *              - Phân hệ Kỹ thuật may (Garment Technician)
 *              - Phân hệ Quản lý kho (Warehouse Manager)
 *              - Phân hệ Nhân viên kho (Warehouse Staff)
 *              - Phân hệ Kế toán (Accountant)
 *              - Phân hệ Chủ xưởng (Owner)
 */
import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { WmsButton } from '../components/ui/WmsControls';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import AccountPage from '../pages/AccountPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import NotFoundPage from '../pages/NotFoundPage';
import OrderQrPage from '../pages/OrderQrPage';
import WarehousePackingPage from '../pages/WarehousePackingPage';
import ProductConfigurationPage from '../pages/ProductConfigurationPage';
import FinishedGoodsPage from '../pages/FinishedGoodsPage';
import SupplierInboundPage from '../pages/SupplierInboundPage';
import MaterialOutboundPage from '../pages/MaterialOutboundPage';
import WarehouseLayoutPage from '../pages/WarehouseLayoutPage';
import WarehousePutawayPage from '../pages/WarehousePutawayPage';
import StocktakePage from '../pages/StocktakePage';
import ShippingPage from '../pages/ShippingPage';
import MaterialInboundVerificationPage from '../pages/garment/MaterialInboundVerificationPage';
import FinishedGoodsInspectionPage from '../pages/garment/FinishedGoodsInspectionPage';
import GarmentStocktakeExecutionPage from '../pages/garment/GarmentStocktakeExecutionPage';
import GarmentMaterialOutboundPage from '../pages/garment/GarmentMaterialOutboundPage';
import GarmentCuttingAndRemnantPage from '../pages/garment/GarmentCuttingAndRemnantPage';
import GarmentLayout from '../components/garment/GarmentLayout';
import WarehouseManagerLayout from '../components/warehouse/WarehouseManagerLayout';
import WarehouseStaffLayout from '../components/warehouse/WarehouseStaffLayout';
import AccountantRoutes from './AccountantRoutes';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';

const OwnerLayout = lazy(() => import('../pages/Owner/OwnerLayout'));
const InboundPlanDetailPage = lazy(() => import('../pages/Owner/InboundPlanDetailPage'));
const ContractDetailPage = lazy(() => import('../pages/Owner/ContractDetailPage'));
const ProductCatalogPage = lazy(() => import('../pages/Owner/ProductCatalogPage'));
const OperationsPage = lazy(() => import('../pages/Owner/OperationsPage'));
const EmployeesPage = lazy(() => import('../pages/Owner/EmployeesPage'));
const ActivityPage = lazy(() => import('../pages/Owner/ActivityPage'));
const InventoryValuationPage = lazy(() => import('../pages/Owner/InventoryValuationPage'));
const OwnerRecordsPage = lazy(() => import('../pages/Owner/OwnerRecordsPage'));
const SystemSettingsPage = lazy(() => import('../pages/Owner/SystemSettingsPage'));
const StockAdjustmentPage = lazy(() => import('../pages/Owner/StockAdjustmentPage'));
const EmployeeCreatePage = lazy(() => import('../pages/Owner/EmployeeCreatePage'));
const OwnerRecordDetailPage = lazy(() => import('../pages/Owner/OwnerRecordDetailPage'));
const StockAdjustmentDetailPage = lazy(() => import('../pages/Owner/StockAdjustmentDetailPage'));

const SessionError = ({ message, retry }) => (
  <div className="ara-account-page" style={{ padding: '2rem', textAlign: 'center' }}>
    <div className="ara-alert ara-alert-error" role="alert" style={{ marginBottom: '1rem', color: '#dc2626' }}>
      {message}
    </div>
    <WmsButton className="btn-ara-secondary" onClick={retry}>
      Thử kết nối lại
    </WmsButton>
  </div>
);

/* ProtectedRoute: Bảo vệ các trang yêu cầu phiên đăng nhập */
export const ProtectedRoute = ({ children }) => {
  const { user, loading, authError, refreshSession } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (authError) return <SessionError message={authError} retry={refreshSession} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
};

/* PublicRoute: Chuyển hướng người đã đăng nhập khỏi trang login/register */
export const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner message="Đang tải..." />;
  if (user) return <Navigate to="/" replace />;
  return children;
};

// Điều hướng trang chủ: Owner vào dashboard, các vai trò khác vào trang chủ giới thiệu & chọn phân hệ
function HomeEntry() {
  const { user } = useAuth();
  return user?.roleCode === 'OWNER' ? <Navigate to="/owner/dashboard" replace /> : <HomePage />;
}

// Điều hướng trang tài khoản: Owner dùng layout riêng, các vai trò khác dùng trang hồ sơ chuẩn
function AccountEntry() {
  const { user } = useAuth();
  return user?.roleCode === 'OWNER' ? <Navigate to="/owner/account" replace /> : <AccountPage />;
}

/** Maps public, authenticated, and role-gated pages to application URLs. */
export default function AppRouter() {
  return (
    <Suspense fallback={<LoadingSpinner message="Đang mở màn hình…" />}>
      <Routes>
        {/* Trang chủ */}
        <Route path="/" element={<HomeEntry />} />

        {/* Auth & Tài khoản */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/account" element={<ProtectedRoute><AccountEntry /></ProtectedRoute>} />

        {/* Phân hệ Kế toán (Accountant) */}
        <Route path="/accountant/*" element={<AccountantRoutes />} />

        {/* Phân hệ Quản lý kho (Warehouse Manager) */}
        <Route
          path="/warehouse/raw-materials/inbound"
          element={
            <WarehouseManagerLayout>
              <SupplierInboundPage />
            </WarehouseManagerLayout>
          }
        />
        <Route
          path="/warehouse/raw-materials/outbound"
          element={
            <WarehouseManagerLayout>
              <MaterialOutboundPage />
            </WarehouseManagerLayout>
          }
        />
        <Route
          path="/warehouse/finished-goods"
          element={
            <WarehouseManagerLayout>
              <FinishedGoodsPage />
            </WarehouseManagerLayout>
          }
        />
        <Route
          path="/warehouse/products/new"
          element={
            <WarehouseManagerLayout>
              <ProductConfigurationPage />
            </WarehouseManagerLayout>
          }
        />
        <Route
          path="/warehouse/products/:id/edit"
          element={
            <WarehouseManagerLayout>
              <ProductConfigurationPage />
            </WarehouseManagerLayout>
          }
        />
        <Route
          path="/warehouse/layout"
          element={
            <WarehouseManagerLayout>
              <WarehouseLayoutPage />
            </WarehouseManagerLayout>
          }
        />
        <Route
          path="/warehouse/stocktake"
          element={
            <WarehouseManagerLayout>
              <StocktakePage />
            </WarehouseManagerLayout>
          }
        />

        {/* Phân hệ Nhân viên kho (Warehouse Staff) */}
        <Route
          path="/warehouse/putaway"
          element={
            <WarehouseStaffLayout>
              <WarehousePutawayPage />
            </WarehouseStaffLayout>
          }
        />
        <Route
          path="/warehouse/staff/outbound"
          element={
            <WarehouseStaffLayout>
              <MaterialOutboundPage isStaffMode={true} />
            </WarehouseStaffLayout>
          }
        />
        <Route
          path="/warehouse/staff/finished-goods"
          element={
            <WarehouseStaffLayout>
              <FinishedGoodsPage isStaffMode={true} />
            </WarehouseStaffLayout>
          }
        />
        <Route
          path="/packing/qr"
          element={
            <WarehouseStaffLayout>
              <WarehousePackingPage />
            </WarehouseStaffLayout>
          }
        />
        <Route
          path="/orders/qr"
          element={
            <WarehouseStaffLayout>
              <OrderQrPage />
            </WarehouseStaffLayout>
          }
        />
        <Route
          path="/warehouse/shipping"
          element={
            <WarehouseStaffLayout>
              <ShippingPage />
            </WarehouseStaffLayout>
          }
        />

        {/* Phân hệ Kỹ thuật may (Garment Technician) */}
        <Route
          path="/garment/material-inbound-verification"
          element={
            <GarmentLayout>
              <MaterialInboundVerificationPage />
            </GarmentLayout>
          }
        />
        <Route
          path="/garment/finished-goods-inspection"
          element={
            <GarmentLayout>
              <FinishedGoodsInspectionPage />
            </GarmentLayout>
          }
        />
        <Route
          path="/garment/stocktake-execution"
          element={
            <GarmentLayout>
              <GarmentStocktakeExecutionPage />
            </GarmentLayout>
          }
        />
        <Route
          path="/garment/material-outbound-request"
          element={
            <GarmentLayout>
              <GarmentMaterialOutboundPage />
            </GarmentLayout>
          }
        />
        <Route
          path="/garment/remnant-recovery"
          element={
            <GarmentLayout>
              <GarmentCuttingAndRemnantPage />
            </GarmentLayout>
          }
        />

        {/* Phân hệ Chủ xưởng (Owner) */}
        <Route path="/owner" element={<ProtectedRoute><OwnerLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<OperationsPage key="dashboard" />} />
          <Route path="bi" element={<OperationsPage key="bi" mode="bi" />} />
          <Route path="profit" element={<Navigate to="/owner/bi" replace />} />
          <Route path="contracts/:id/plans/:planId" element={<InboundPlanDetailPage />} />
          <Route path="contracts/:id" element={<ContractDetailPage />} />
          <Route path="purchases" element={<OperationsPage key="purchases" mode="purchases" />} />
          <Route path="tasks" element={<Navigate to="/owner/dashboard" replace />} />
          <Route path="payables" element={<OperationsPage key="payables" mode="payables" />} />
          <Route path="material-stocktakes" element={<Navigate to="/owner/stock-adjustments?warehouseType=RAW_MATERIAL" replace />} />
          <Route path="finished-stocktakes" element={<Navigate to="/owner/stock-adjustments?warehouseType=FINISHED_GOODS" replace />} />
          <Route path="cash-flow" element={<Navigate to="/owner/dashboard" replace />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="employees/new" element={<EmployeeCreatePage />} />
          <Route path="employees/:employeeId/permissions" element={<Navigate to="/owner/employees" replace />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="material-valuation" element={<OperationsPage key="materials" mode="inventory" />} />
          <Route path="asset-valuation" element={<OperationsPage key="finished" mode="finished" />} />
          <Route path="manager-reports" element={<OwnerRecordsPage key="reports" mode="reports" />} />
          <Route path="manager-reports/:id" element={<OwnerRecordDetailPage key="report-detail" mode="reports" />} />
          <Route path="production" element={<Navigate to="/owner/dashboard" replace />} />
          <Route path="production/:id" element={<Navigate to="/owner/dashboard" replace />} />
          <Route path="products" element={<ProductCatalogPage />} />
          <Route path="samples" element={<Navigate to="/owner/products" replace />} />
          <Route path="samples/:id" element={<Navigate to="/owner/products" replace />} />
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
      </Routes>
    </Suspense>
  );
}
