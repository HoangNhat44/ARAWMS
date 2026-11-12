/*
 * File: App.jsx
 * Description: Composes global theme (Ant Design wmsTheme), routers, role layouts,
 *              notification toast provider, and background sync runners (packing, catalog, finished goods, realtime).
 */
import React from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AppRouter from './routes/AppRouter';
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import PackingUploadRunner from './components/PackingUploadRunner';
import CatalogSyncRunner from './components/CatalogSyncRunner';
import FinishedGoodsSyncRunner from './components/FinishedGoodsSyncRunner';
import RealtimeBridge from './components/RealtimeBridge';
import { wmsTheme } from './theme/wmsTheme';

// Kiểm tra xem trang hiện tại có thuộc các phân hệ vận hành nội bộ WMS hay không
function isWmsWorkspace(pathname) {
  return (
    pathname.startsWith('/owner') ||
    pathname.startsWith('/accountant') ||
    pathname.startsWith('/warehouse') ||
    pathname.startsWith('/packing') ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/garment') ||
    pathname.startsWith('/seller')
  );
}

// Các phân hệ WMS có Header & Sidebar chuyên dụng; không hiển thị Navbar/Footer công cộng để tránh xếp tầng 2 header
function AppChrome() {
  const { pathname } = useLocation();
  const isWms = isWmsWorkspace(pathname);
  const isOwner = pathname === '/owner' || pathname.startsWith('/owner/');
  const isSellerWorkspace = pathname.startsWith('/seller');

  return (
    <div
      className={`app-container ${isWms ? 'wms-workspace-active' : 'wms-public-app'} ${
        isOwner ? 'wms-owner-app' : ''
      } ${isSellerWorkspace ? 'seller-workspace-active' : ''}`}
    >
      {!isWms && <Navbar />}
      <a className="wms-skip-link" href="#main-content">
        Bỏ qua điều hướng, đến nội dung
      </a>
      <main id="main-content" className="main-content" tabIndex={-1}>
        <AppRouter />
      </main>
      {!isWms && <Footer />}
    </div>
  );
}

/** Keeps pending packing recordings uploading across direct URL navigation. */
function App() {
  return (
    <ConfigProvider theme={wmsTheme} locale={viVN}>
      <AntApp className="wms-application">
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <ToastProvider>
              <PackingUploadRunner />
              <CatalogSyncRunner />
              <FinishedGoodsSyncRunner />
              <RealtimeBridge />
              <AppChrome />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
