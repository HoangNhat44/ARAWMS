import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AccountantLayout from '../components/accountant/AccountantLayout';
import AccountantOverviewPage from '../pages/accountant/AccountantOverviewPage';
import SupplierManagementPage from '../pages/accountant/SupplierManagementPage';
import ContractFrameworkPage from '../pages/accountant/ContractFrameworkPage';
import InboundPlanningPage from '../pages/accountant/InboundPlanningPage';

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
        <Route path="*" element={<AccountantOverviewPage />} />
      </Route>
    </Routes>
  );
};

export default AccountantRoutes;
