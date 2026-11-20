/*
 * File: WarehouseRoutes.jsx
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Routes of the warehouse manager and warehouse staff areas. URLs are unchanged; staff screens keep
 * their existing prefixes (/warehouse/..., /packing/qr, /orders/qr), so these are returned as <Route> elements
 * for AppRouter's <Routes> instead of being mounted under one path.
 */
import { Navigate, Outlet, Route } from 'react-router-dom';
import WarehouseManagerLayout from '../components/warehouse/WarehouseManagerLayout';
import WarehouseStaffLayout from '../components/warehouse/WarehouseStaffLayout';
import SupplierInboundPage from '../pages/warehouse/SupplierInboundPage';
import MaterialOutboundPage from '../pages/warehouse/MaterialOutboundPage';
import FinishedGoodsPage from '../pages/warehouse/FinishedGoodsPage';
import FinishedGoodsProductPage from '../pages/warehouse/FinishedGoodsProductPage';
import BarcodeTrackingPage from '../pages/warehouse/BarcodeTrackingPage';
import DefectWarehousePage from '../pages/warehouse/DefectWarehousePage';
import WarehouseReportPage from '../pages/warehouse/WarehouseReportPage';
import TechnicalInboundPage from '../pages/warehouse/TechnicalInboundPage';
import TechnicalOutboundPage from '../pages/warehouse/TechnicalOutboundPage';
import InboundProgressPage from '../pages/warehouse/InboundProgressPage';
import ProductConfigurationPage from '../pages/warehouse/ProductConfigurationPage';
import WarehouseLayoutPage from '../pages/warehouse/WarehouseLayoutPage';
import StocktakePage from '../pages/warehouse/StocktakePage';
import StocktakeReportDetailPage from '../pages/warehouse/StocktakeReportDetailPage';
import WarehousePutawayPage from '../pages/warehouse/WarehousePutawayPage';
import WarehousePackingPage from '../pages/warehouse/WarehousePackingPage';
import OrderQrPage from '../pages/warehouse/OrderQrPage';
import ShippingPage from '../pages/warehouse/ShippingPage';

/**
 * Warehouse manager area.
 * @param {Function} ProtectedRoute  AppRouter's role guard.
 */
export const warehouseManagerRoutes = (ProtectedRoute) => (
  <Route element={<ProtectedRoute role="WAREHOUSE_MANAGER"><WarehouseManagerLayout><Outlet /></WarehouseManagerLayout></ProtectedRoute>}>
    <Route path="/warehouse/raw-materials/inbound" element={<SupplierInboundPage />} />
    <Route path="/warehouse/raw-materials/outbound" element={<MaterialOutboundPage />} />
    <Route path="/warehouse/finished-goods" element={<FinishedGoodsPage />} />
    <Route path="/warehouse/finished-goods/:productId" element={<FinishedGoodsProductPage />} />
    <Route path="/warehouse/barcode-tracking" element={<BarcodeTrackingPage />} />
    <Route path="/warehouse/defects" element={<DefectWarehousePage />} />
    <Route path="/warehouse/reports" element={<WarehouseReportPage />} />
    <Route path="/warehouse/technical-inbound" element={<TechnicalInboundPage />} />
    <Route path="/warehouse/technical-outbound" element={<TechnicalOutboundPage />} />
    <Route path="/warehouse/inbound-progress" element={<InboundProgressPage />} />
    <Route path="/warehouse/products/new" element={<ProductConfigurationPage />} />
    <Route path="/warehouse/products/:id/edit" element={<ProductConfigurationPage />} />
    <Route path="/warehouse/layout" element={<WarehouseLayoutPage />} />
    <Route path="/warehouse/stocktake" element={<StocktakePage />} />
    <Route path="/warehouse/stocktake/:id" element={<StocktakeReportDetailPage />} />
  </Route>
);

/**
 * Warehouse staff area.
 * @param {Function} ProtectedRoute  AppRouter's role guard.
 */
export const warehouseStaffRoutes = (ProtectedRoute) => (
  <Route element={<ProtectedRoute role="WAREHOUSE_STAFF"><WarehouseStaffLayout><Outlet /></WarehouseStaffLayout></ProtectedRoute>}>
    <Route path="/warehouse/putaway" element={<WarehousePutawayPage />} />
    <Route path="/warehouse/staff/outbound" element={<MaterialOutboundPage isStaffMode />} />
    <Route path="/warehouse/staff/finished-goods" element={<FinishedGoodsPage isStaffMode />} />
    <Route path="/warehouse/staff/finished-goods/:productId" element={<FinishedGoodsProductPage isStaffMode />} />
    <Route path="/warehouse/staff/barcode-tracking" element={<BarcodeTrackingPage isStaffMode />} />
    {/* The inbound progress page was removed for staff; old links go to the putaway screen. */}
    <Route path="/warehouse/staff/inbound-progress" element={<Navigate to="/warehouse/putaway" replace />} />
    <Route path="/packing/qr" element={<WarehousePackingPage />} />
    <Route path="/orders/qr" element={<OrderQrPage />} />
    <Route path="/warehouse/shipping" element={<ShippingPage />} />
  </Route>
);
