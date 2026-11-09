import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AccountantLayout from '../components/accountant/AccountantLayout';
import AccountantOverviewPage from '../pages/accountant/AccountantOverviewPage';
import SupplierManagementPage from '../pages/accountant/SupplierManagementPage';
import ContractFrameworkPage from '../pages/accountant/ContractFrameworkPage';
import InboundPlanningPage from '../pages/accountant/InboundPlanningPage';
import ContractDeviationPage from '../pages/accountant/ContractDeviationPage';
import PaymentVoucherPage from '../pages/accountant/PaymentVoucherPage';
import CodReconciliationPage from '../pages/accountant/CodReconciliationPage';
import SupplierDebtPage from '../pages/accountant/SupplierDebtPage';
import ProductInventoryValuationPage from '../pages/accountant/ProductInventoryValuationPage';
import RawMaterialInventoryValuationPage from '../pages/accountant/RawMaterialInventoryValuationPage';

/**
 * Định tuyến nội bộ riêng cho phân hệ Kế toán (`/accountant/*`)
 * Tất cả các route con bên trong đều tự động dùng chung AccountantSidebar + AccountantHeader.
 */
const AccountantRoutes = () => {
  return (
    <Routes>
      <Route element={<AccountantLayout />}>
        <Route index element={<AccountantOverviewPage />} />
        <Route path="suppliers" element={<SupplierManagementPage />} />
        <Route path="contracts" element={<ContractFrameworkPage />} />
        <Route path="inbound-plans" element={<InboundPlanningPage />} />
        <Route path="contract-deviations" element={<ContractDeviationPage />} />
        {/* Quản lý Công nợ Nhà cung cấp & Đối tác Vận chuyển GHN (UC 07) */}
        <Route path="supplier-debts" element={<SupplierDebtPage />} />
        <Route path="debts" element={<SupplierDebtPage />} />
        {/* Phiếu chi tiền mặt & ngân hàng (UC 08 & UC 15) */}
        <Route path="payment-vouchers" element={<PaymentVoucherPage />} />
        <Route path="supplier-payments" element={<PaymentVoucherPage />} />
        <Route path="cash-flow-vouchers" element={<PaymentVoucherPage />} />
        {/* Đối soát tự động COD & Cảnh báo cờ đỏ (UC 16 & UC 17) */}
        <Route path="cod-reconciliation" element={<CodReconciliationPage />} />
        <Route path="cod-red-flags" element={<CodReconciliationPage />} />
        {/* Định giá tồn kho thành phẩm (UC 10 - View Total Inventory Valuation) */}
        <Route path="inventory-valuation" element={<ProductInventoryValuationPage />} />
        <Route path="product-valuation" element={<ProductInventoryValuationPage />} />
        {/* Định giá tồn kho nguyên vật liệu (UC 11 - View Total Raw Material Inventory Value) */}
        <Route path="raw-material-valuation" element={<RawMaterialInventoryValuationPage />} />
        <Route path="raw-materials-valuation" element={<RawMaterialInventoryValuationPage />} />
        <Route path="*" element={<AccountantOverviewPage />} />
      </Route>
    </Routes>
  );
};

export default AccountantRoutes;
