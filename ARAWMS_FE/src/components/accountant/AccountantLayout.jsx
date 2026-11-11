import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AccountantSidebar from './AccountantSidebar';
import AccountantHeader from './AccountantHeader';
import './accountantLayout.css';

/**
 * Khung giao diện dùng chung cho toàn bộ các trang của Role Kế toán (ACCOUNTANT)
 * Bao gồm:
 *  - AccountantSidebar (bên trái, đọc cấu hình từ accountantNavConfig.js, hỗ trợ collapse trên PC và off-canvas drawer trên mobile/tablet)
 *  - AccountantHeader (phía trên, tự động cập nhật tiêu đề, breadcrumb và hamburger button trên mobile)
 *  - Backdrop overlay che nền khi mở sidebar trên màn hình nhỏ
 *  - <Outlet /> (vùng hiển thị nội dung của từng mục chức năng con, cách ly chống tràn ngang)
 */
const AccountantLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // Tự động đóng sidebar drawer trên mobile khi chuyển trang
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="ara-accountant-shell">
      {/* Backdrop overlay khi mở mobile sidebar */}
      {mobileSidebarOpen && (
        <div
          className="ara-acc-sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <AccountantSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="ara-acc-main-wrapper">
        <AccountantHeader
          onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
        />
        <main className="ara-acc-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AccountantLayout;

