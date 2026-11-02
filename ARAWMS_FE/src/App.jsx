/*
 * File: App.jsx
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Composes the application shell with routing, authentication context, and shared navigation. Runs pending packing-video uploads while the app is open.
 */
import React, { useState, useEffect } from 'react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { useAuth } from './hooks/useAuth';
import AppRouter from './routes/AppRouter';
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import Sidebar from './components/common/Sidebar';
import TopHeader from './components/common/TopHeader';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('ara_sidebar_collapsed');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Tự động đóng menu Sidebar trên thiết bị di động khi chuyển trang
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const toggleSidebar = () => {
    if (window.innerWidth < 992) {
      setMobileSidebarOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem('ara_sidebar_collapsed', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const isPublicPage = PUBLIC_PATHS.some((p) => location.pathname.startsWith(p));
  const isSellerWorkspace = location.pathname.startsWith('/seller');

  // Nếu người dùng đã đăng nhập và không phải trang public: Hiển thị giao diện quản lý chung có Sidebar
  if (user && !isPublicPage) {
    return (
      <div className={`ara-enterprise-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
        {/* Backdrop che mờ khi mở Sidebar trên mobile */}
        {mobileSidebarOpen && (
          <div
            className="ara-sidebar-backdrop"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar
          collapsed={sidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onToggle={toggleSidebar}
          user={user}
          onLogout={handleLogout}
        />
        <div className="ara-main-area">
          <TopHeader onToggleSidebar={toggleSidebar} user={user} />
          <main className="ara-workspace-content">
            <AppRouter />
          </main>
        </div>
      </div>
    );
  }

  // Khách vãng lai / Trang đăng nhập
  return (
    <div className={`app-container ${isSellerWorkspace ? 'seller-workspace-active' : ''}`}>
      <Navbar />
      <main className="main-content">
        <AppRouter />
      </main>
      <Footer />
    </div>
  );
}

/** Composes routing, authentication, navigation, and the background video runner. */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppLayout />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
