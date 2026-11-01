/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | Theme Ant Design và khung điều hướng dùng chung. */
import React from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { AuthProvider } from './context/AuthContext';
import AppRouter from './routes/AppRouter';
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import { wmsTheme } from './theme/wmsTheme';

// Layout Owner có header/sidebar riêng; trang chung dùng thanh điều hướng gọn, không xếp hai header.
function AppChrome() {
  const { pathname } = useLocation();
  const owner = pathname === '/owner' || pathname.startsWith('/owner/');
  return <div className={`app-container ${owner ? 'wms-owner-app' : 'wms-public-app'}`}>
    {!owner && <Navbar />}
    <a className="wms-skip-link" href="#main-content">Bỏ qua điều hướng, đến nội dung</a>
    <main id="main-content" className="main-content" tabIndex={-1}><AppRouter /></main>
    {!owner && <Footer />}
  </div>;
}

function App() {
  return (
    <ConfigProvider theme={wmsTheme} locale={viVN}><AntApp className="wms-application"><BrowserRouter>
      <AuthProvider>
        <AppChrome />
      </AuthProvider>
    </BrowserRouter></AntApp></ConfigProvider>
  );
}

export default App;
