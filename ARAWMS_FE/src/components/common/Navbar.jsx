/*
 * File: Navbar.jsx
 * Author: Duy Anh
 * Date: 2026-10-29
 * Description: Links warehouse workflows and exposes catalog account sign-in and safe sign-out.
 */
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getPendingCatalogChanges } from '../../services/offlineCatalogSync';

const links = [
  ['/', 'Trang chủ'],
  ['/orders/qr', 'Đơn hàng / QR'],
  ['/packing/qr', 'Đóng hàng'],
  ['/warehouse/putaway', 'Xếp hàng vào kệ'],
  ['/warehouse/finished-goods', 'Kho thành phẩm'],
  ['/warehouse/layout', 'Vị trí kho'],
  ['/warehouse/raw-materials/inbound', 'Nhập nguyên phụ liệu'],
  ['/warehouse/raw-materials/outbound', 'Xuất nguyên phụ liệu'],
  ['/warehouse/stocktake', 'Kiểm kê kho'],
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    try {
      const ownerId = user?.id || user?._id;
      const pending = await getPendingCatalogChanges(ownerId);
      if (pending.some((item) => !['DONE', 'DISCARDED', 'SUPERSEDED'].includes(item.status)) &&
          !window.confirm('Có dữ liệu sản phẩm chưa đồng bộ. Dữ liệu vẫn ở thiết bị này và chỉ hiện lại khi đăng nhập đúng tài khoản. Đăng xuất?')) return;
      logout();
      navigate('/login');
    } catch (error) { window.alert(`Không kiểm tra được dữ liệu chờ đồng bộ: ${error.message}`); }
  };
  return <header className="ara-navbar">
    <Link to="/" className="ara-brand">
      <img src="/logo.png" alt="ARA Logo" className="ara-brand-logo" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="ara-brand-text">ARA</span>
        <span style={{ fontSize: '0.68rem', letterSpacing: '0.12em', color: 'var(--ara-gold)', textTransform: 'uppercase', marginTop: '-4px' }}>
          Atelier & Warehouse
        </span>
      </div>
    </Link>
    <nav aria-label="Chức năng kho">
      <ul className="ara-nav-links">
        {links.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}
      </ul>
    </nav>
    {user ? <button type="button" className="btn-ara-secondary" onClick={signOut}>Đăng xuất</button>
      : <Link to="/login" className="btn-ara-secondary">Đăng nhập</Link>}
  </header>;
}
