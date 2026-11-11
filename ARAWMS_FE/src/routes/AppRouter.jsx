/*
 * File: AppRouter.jsx
 * Author: Duy Anh & Antigravity (merged with Nguyễn Ngọc Huy-HE171157 & Nguyễn Quang Huy)
 * Description: Unified routing for all modules:
 *              - Bán hàng đa kênh & CSKH (Seller Workspace: Chat, Orders, Marketplace, RMA)
 *              - Phân hệ Kỹ thuật may (Garment Technician)
 *              - Phân hệ Quản lý kho (Warehouse Manager)
 *              - Phân hệ Nhân viên kho (Warehouse Staff)
 *              - Phân hệ Kế toán (Accountant)
 *              - Phân hệ Chủ xưởng (Owner)
 */
import React, { lazy, Suspense } from 'react';
import { Routes, Route, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Result } from 'antd';
import { WmsButton } from '../components/ui/WmsControls';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import AccountPage from '../pages/AccountPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import RegisterPage from '../pages/RegisterPage';
import NotFoundPage from '../pages/NotFoundPage';
import SellerChatPage from '../pages/seller/SellerChatPage';
import SellerOrdersPage from '../pages/seller/SellerOrdersPage';
import OrderQrPage from '../pages/OrderQrPage';
import WarehousePackingPage from '../pages/WarehousePackingPage';
import ProductConfigurationPage from '../pages/ProductConfigurationPage';
import FinishedGoodsPage from '../pages/FinishedGoodsPage';
import TechnicalInboundPage from '../pages/TechnicalInboundPage';
import TechnicalOutboundPage from '../pages/TechnicalOutboundPage';
import InboundProgressPage from '../pages/InboundProgressPage';
import SupplierInboundPage from '../pages/SupplierInboundPage';
import MaterialOutboundPage from '../pages/MaterialOutboundPage';
import WarehouseLayoutPage from '../pages/WarehouseLayoutPage';
import WarehousePutawayPage from '../pages/WarehousePutawayPage';
import StocktakePage from '../pages/StocktakePage';
import ShippingPage from '../pages/ShippingPage';
import MaterialInboundVerificationPage from '../pages/garment/MaterialInboundVerificationPage';
import GarmentRawMaterialsPage from '../pages/garment/GarmentRawMaterialsPage';
import GarmentReturnInspectionPage from '../pages/garment/GarmentReturnInspectionPage';
import FinishedGoodsInspectionPage from '../pages/garment/FinishedGoodsInspectionPage';
import GarmentStocktakeExecutionPage from '../pages/garment/GarmentStocktakeExecutionPage';
import GarmentMaterialOutboundPage from '../pages/garment/GarmentMaterialOutboundPage';
import GarmentCuttingAndRemnantPage from '../pages/garment/GarmentCuttingAndRemnantPage';
import GarmentLayout from '../components/garment/GarmentLayout';
import WarehouseManagerLayout from '../components/warehouse/WarehouseManagerLayout';
import WarehouseStaffLayout from '../components/warehouse/WarehouseStaffLayout';
import SellerLayout from '../components/seller/SellerLayout';
import AccountantRoutes from './AccountantRoutes';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getRoleHome } from './roleHome';

const OwnerLayout = lazy(() => import('../pages/Owner/OwnerLayout'));
const InboundPlanDetailPage = lazy(() => import('../pages/Owner/InboundPlanDetailPage'));
const ContractDetailPage = lazy(() => import('../pages/Owner/ContractDetailPage'));
const ContractMaterialPage = lazy(() => import('../pages/Owner/ContractDetailPage').then(({ ContractMaterialPage }) => ({ default: ContractMaterialPage })));
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

/* Bảo vệ phiên đăng nhập và kiểm tra vai trò ở mọi đường dẫn của phân hệ. */
function ProtectedRoute({ role, children }) {
  const { user, loading, authError, refreshSession } = useAuth();
  const { pathname, search, hash } = useLocation();

  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (authError) return <SessionError message={authError} retry={refreshSession} />;
  if (!user) return <Navigate to="/login" replace state={{ returnTo: { pathname, search, hash, role } }} />;
  if (role && user.roleCode !== role) {
    return <Result status="403" title="Không có quyền truy cập"
      subTitle="Vai trò của bạn chưa được cấp quyền vào khu vực này."
      extra={<Link to={getRoleHome(user.roleCode)}>Về phân hệ của tôi</Link>} />;
  }
  return children ?? <Outlet />;
}

/* PublicRoute: Chuyển hướng người đã đăng nhập khỏi trang login/register */
export const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner message="Đang tải..." />;
  if (user) return <Navigate to={getRoleHome(user.roleCode)} replace />;
  return children;
};

function HomeEntry() {
  const { user, loading, authError, refreshSession } = useAuth();
  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (authError) return <SessionError message={authError} retry={refreshSession} />;
  return user ? <Navigate to={getRoleHome(user.roleCode)} replace /> : <HomePage />;
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
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/account" element={<ProtectedRoute><AccountEntry /></ProtectedRoute>} />

        {/* Phân hệ Seller Workspace (Bán hàng & CSKH đa kênh, Quản lý đơn hàng, TMĐT, RMA) */}
        <Route element={<ProtectedRoute role="SELLER"><SellerLayout /></ProtectedRoute>}>
          <Route path="/seller/chat" element={<SellerChatPage />} />
          <Route path="/seller/orders" element={<SellerOrdersPage />} />
        </Route>

        {/* Phân hệ Kế toán (Accountant) */}
        <Route path="/accountant/*" element={<ProtectedRoute role="ACCOUNTANT"><AccountantRoutes /></ProtectedRoute>} />

        {/* Phân hệ Quản lý kho */}
        <Route element={<ProtectedRoute role="WAREHOUSE_MANAGER"><WarehouseManagerLayout><Outlet /></WarehouseManagerLayout></ProtectedRoute>}>
          <Route path="/warehouse/raw-materials/inbound" element={<SupplierInboundPage />} />
          <Route path="/warehouse/raw-materials/outbound" element={<MaterialOutboundPage />} />
          <Route path="/warehouse/finished-goods" element={<FinishedGoodsPage />} />
          <Route path="/warehouse/technical-inbound" element={<TechnicalInboundPage />} />
          <Route path="/warehouse/technical-outbound" element={<TechnicalOutboundPage />} />
          <Route path="/warehouse/inbound-progress" element={<InboundProgressPage />} />
          <Route path="/warehouse/products/new" element={<ProductConfigurationPage />} />
          <Route path="/warehouse/products/:id/edit" element={<ProductConfigurationPage />} />
          <Route path="/warehouse/layout" element={<WarehouseLayoutPage />} />
          <Route path="/warehouse/stocktake" element={<StocktakePage />} />
        </Route>

        {/* Phân hệ Nhân viên kho */}
        <Route element={<ProtectedRoute role="WAREHOUSE_STAFF"><WarehouseStaffLayout><Outlet /></WarehouseStaffLayout></ProtectedRoute>}>
          <Route path="/warehouse/putaway" element={<WarehousePutawayPage />} />
          <Route path="/warehouse/staff/outbound" element={<MaterialOutboundPage isStaffMode />} />
          <Route path="/warehouse/staff/finished-goods" element={<FinishedGoodsPage isStaffMode />} />
          <Route path="/warehouse/staff/inbound-progress" element={<InboundProgressPage />} />
          <Route path="/packing/qr" element={<WarehousePackingPage />} />
          <Route path="/orders/qr" element={<OrderQrPage />} />
          <Route path="/warehouse/shipping" element={<ShippingPage />} />
        </Route>

        {/* Phân hệ Kỹ thuật may */}
        <Route element={<ProtectedRoute role="GARMENT_TECHNICIAN"><GarmentLayout><Outlet /></GarmentLayout></ProtectedRoute>}>
          <Route path="/garment/raw-materials" element={<GarmentRawMaterialsPage />} />
          <Route path="/garment/material-inbound-verification" element={<MaterialInboundVerificationPage />} />
          <Route path="/garment/finished-goods-inspection" element={<FinishedGoodsInspectionPage />} />
          <Route path="/garment/return-inspection" element={<GarmentReturnInspectionPage />} />
          <Route path="/garment/stocktake-execution" element={<GarmentStocktakeExecutionPage />} />
          <Route path="/garment/material-outbound-request" element={<GarmentMaterialOutboundPage />} />
          <Route path="/garment/remnant-recovery" element={<GarmentCuttingAndRemnantPage />} />
        </Route>

        {/* Phân hệ Chủ xưởng (Owner) */}
        <Route path="/owner" element={<ProtectedRoute role="OWNER"><OwnerLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<OperationsPage key="dashboard" />} />
          <Route path="bi" element={<OperationsPage key="bi" mode="bi" />} />
          <Route path="profit" element={<Navigate to="/owner/bi" replace />} />
          <Route path="contracts/:id/plans/:planId" element={<InboundPlanDetailPage />} />
          <Route path="contracts/:id/materials/:line" element={<ContractMaterialPage />} />
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

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
