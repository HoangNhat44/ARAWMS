/*
 * File: App.jsx
 * Description: Composes global theme (Ant Design wmsTheme), routers, role layouts,
 *              and background sync runners (packing, catalog, finished goods, realtime).
 */
import React from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { AuthProvider } from './context/AuthContext';
import AppRouter from './routes/AppRouter';
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import QuickNav from './components/common/QuickNav';
import PackingUploadRunner from './components/PackingUploadRunner';
import CatalogSyncRunner from './components/CatalogSyncRunner';
import FinishedGoodsSyncRunner from './components/FinishedGoodsSyncRunner';
import RealtimeBridge from './components/RealtimeBridge';
import { wmsTheme } from './theme/wmsTheme';

// Layout Owner có header/sidebar riêng; trang chung dùng thanh điều hướng gọn, không xếp hai header.
function AppChrome() {
  const { pathname } = useLocation();
  const isOwner = pathname === '/owner' || pathname.startsWith('/owner/');

  return (
    <div className={`app-container ${isOwner ? 'wms-owner-app' : 'wms-public-app'}`}>
      {!isOwner && <Navbar />}
      <a className="wms-skip-link" href="#main-content">Bỏ qua điều hướng, đến nội dung</a>
      <main id="main-content" className="main-content" tabIndex={-1}>
        <AppRouter />
      </main>
      {!isOwner && <Footer />}
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
            <PackingUploadRunner />
            <CatalogSyncRunner />
            <FinishedGoodsSyncRunner />
            <RealtimeBridge />
            <QuickNav />
            <AppChrome />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
