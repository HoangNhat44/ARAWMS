import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AccountantSidebar from './AccountantSidebar';
import AccountantHeader from './AccountantHeader';
import './accountantLayout.css';

/**
 * Khung giao diện dùng chung cho toàn bộ các trang của Role Kế toán (ACCOUNTANT)
 * Bao gồm:
 *  - AccountantSidebar (bên trái, đọc cấu hình từ accountantNavConfig.js)
 *  - AccountantHeader (phía trên, tự động cập nhật tiêu đề & breadcrumb theo route)
 *  - <Outlet /> (vùng hiển thị nội dung của từng mục chức năng con)
 */
const AccountantLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="ara-accountant-shell">
      <AccountantSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <div className="ara-acc-main-wrapper">
        <AccountantHeader />
        <main className="ara-acc-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AccountantLayout;

