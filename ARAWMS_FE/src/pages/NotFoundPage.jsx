import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Home } from 'lucide-react';

const NotFoundPage = () => {
  return (
    <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
      <div className="glass-card" style={{ maxWidth: '500px', margin: '0 auto', padding: '3rem 2rem' }}>
        <AlertTriangle size={64} style={{ color: 'var(--error)', marginBottom: '1rem' }} />
        <h1 style={{ fontSize: '4rem', color: 'var(--text-main)', margin: 0 }}>404</h1>
        <h2 style={{ marginBottom: '1rem' }}>Trang Không Tồn Tại</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Đường dẫn bạn truy cập có thể đã bị đổi hoặc không còn tồn tại trong hệ thống.
        </p>
        <Link to="/" className="btn btn-primary">
          <Home size={18} />
          Trở về Trang chủ
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
