import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AccountantLayout from '../components/accountant/AccountantLayout';
import AccountantDashboardPage from '../pages/accountant/AccountantDashboardPage';
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
        {/* [UC-009, UC-111] Dashboard Kế toán & Báo cáo phân tích dòng tiền */}
        <Route index element={<AccountantDashboardPage />} />
        {/* [UC-036, UC-037] Quản lý nhà cung ứng nguyên phụ liệu (Thêm mới / Cập nhật) */}
        <Route path="suppliers" element={<SupplierManagementPage />} />
        {/* [UC-027, UC-038, UC-039] Tạo/Cập nhật khung hợp đồng & Tạo nhanh nguyên phụ liệu */}
        <Route path="contracts" element={<ContractFrameworkPage />} />
        {/* [UC-040, UC-044] Lập và xem kế hoạch lịch trình tiếp nhận nguyên vật liệu */}
        <Route path="inbound-plans" element={<InboundPlanningPage />} />
        {/* [UC-041] Điều tra & trình báo sai lệch hợp đồng (KCS) */}
        <Route path="contract-deviations" element={<ContractDeviationPage />} />
        {/* [UC-114] Quản lý Công nợ Nhà cung cấp & Đối tác Vận chuyển GHN */}
        <Route path="supplier-debts" element={<SupplierDebtPage />} />
        <Route path="debts" element={<SupplierDebtPage />} />
        {/* [UC-112, UC-113] Lịch sử dòng tiền & Lập phiếu thu/chi */}
        <Route path="payment-vouchers" element={<PaymentVoucherPage />} />
        <Route path="supplier-payments" element={<PaymentVoucherPage />} />
        <Route path="cash-flow-vouchers" element={<PaymentVoucherPage />} />
        {/* [UC-115, UC-118, UC-119] Đối soát COD tự động GHN & Khiếu nại tranh chấp vận chuyển */}
        <Route path="cod-reconciliation" element={<CodReconciliationPage />} />
        <Route path="cod-red-flags" element={<CodReconciliationPage />} />
        {/* [UC-109] Xem tổng giá trị định giá tồn kho thành phẩm */}
        <Route path="inventory-valuation" element={<ProductInventoryValuationPage />} />
        <Route path="product-valuation" element={<ProductInventoryValuationPage />} />
        {/* [UC-110] Xem tổng giá trị định giá tồn kho nguyên vật liệu */}
        <Route path="raw-material-valuation" element={<RawMaterialInventoryValuationPage />} />
        <Route path="raw-materials-valuation" element={<RawMaterialInventoryValuationPage />} />
        <Route path="*" element={<AccountantDashboardPage />} />
      </Route>
    </Routes>
  );
};

export default AccountantRoutes;
