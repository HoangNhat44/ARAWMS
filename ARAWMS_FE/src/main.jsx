/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | Khởi tạo ứng dụng và nạp font Inter cục bộ. */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';
import './styles/wms.css';

// Register the app-shell cache only in production; API responses stay outside the service worker cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/finished-goods-sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
