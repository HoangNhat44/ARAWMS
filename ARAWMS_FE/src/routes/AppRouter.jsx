/*
 * File: AppRouter.jsx
 * Author: Duy Anh & Antigravity
 * Date: 2026-10-15
 * Description: Routes users to role modules (Kỹ thuật may, Quản lý kho, Nhân viên kho) with dedicated sidebar layouts.
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

// Route bảo vệ (yêu cầu phải đăng nhập mới truy cập được)
export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Đang xác thực thông tin đăng nhập..." />;
  if (!user) return <Navigate to="/login" replace />;

  return children;
};

// Route công khai (nếu đã đăng nhập rồi thì chuyển sang HomePage)
export const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Đang tải..." />;
  if (user) return <Navigate to="/" replace />;

  return children;
};

/** Maps public, authenticated, and role-gated pages to application URLs. */
const AppRouter = () => {
  return (
    <Routes>
      {/* Trang chủ */}
      <Route path="/" element={<HomePage />} />
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

      {/* Auth & Fallback */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRouter;
