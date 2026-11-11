
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: Khung Owner responsive, điều hướng, breadcrumb và thao tác tài khoản.
 */
import { Suspense, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Avatar, Button, Dropdown, Grid, Result, Tooltip } from 'antd';
import { BarChart3, ClipboardCheck, FileText, History, Layers, LogOut, Menu as MenuIcon, Package, Settings, Users, User as UserIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ResourceState } from './OwnerUI';
import OwnerHeaderTools from './OwnerHeaderTools';
import OwnerSidebar from './OwnerSidebar';
import '../../styles/owner.css';

// Một đường dẫn cho một màn hình; chức năng chi tiết giữ cùng mục điều hướng với danh sách cha.
const groups = [
  // Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 1/6/8 - Các nghiệp vụ chính hiện đầy đủ, nhân sự/thu chi ở dưới.
  { title: 'Điều hành kinh doanh', items: [['dashboard', 'Tổng quan', BarChart3], ['purchases', 'Nhập hàng và công nợ', Package], ['bi', 'Báo cáo doanh thu', Layers], ['products', 'Danh mục sản phẩm', Package]] },
  { title: 'Tồn kho và kiểm kê', items: [['material-valuation', 'Tồn kho nguyên liệu', Package], ['asset-valuation', 'Tồn kho thành phẩm', Layers], ['stock-adjustments', 'Báo cáo kiểm kê', ClipboardCheck]] },
  // Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi bổ sung - Quản lý và nhân sự là nhóm cuối cùng.
  { title: 'Công nợ và cài đặt', items: [['payables', 'Lập phiếu chi trả nợ', FileText], ['settings/integrations', 'Kết nối dịch vụ', Settings], ['settings/fabric', 'Thu hồi vải dư', Settings], ['settings/inventory', 'Mức tồn tối thiểu', Settings], ['settings/returns', 'Chính sách đổi trả', Settings]] },
  { title: 'Quản lý và nhân sự', items: [['manager-reports', 'Báo cáo quản lý', FileText], ['employees', 'Nhân viên', Users], ['activity', 'Nhật ký hoạt động', History]] },
];
const pageTitles = Object.fromEntries(groups.flatMap((g) => g.items.map(([path, title]) => [`/owner/${path}`, title])));
const detailTitle = (path) => /^\/owner\/contracts\/[^/]+\/plans\/[^/]+$/.test(path) ? 'Chi tiết kế hoạch nhập' : path.startsWith('/owner/contracts/') ? 'Chi tiết hợp đồng' : path.endsWith('/permissions') ? 'Phân quyền nhân viên' : path === '/owner/employees/new' ? 'Tạo nhân viên'
  : path.startsWith('/owner/manager-reports/') ? 'Chi tiết báo cáo' : path.startsWith('/owner/production/') ? 'Chi tiết sản xuất'
    : path.startsWith('/owner/samples/') ? 'Chi tiết mẫu sản phẩm' : path.startsWith('/owner/stock-adjustments/') ? 'Duyệt báo cáo kiểm kê'
      : path.startsWith('/owner/settings/') ? 'Cấu hình vận hành' : path === '/owner/account' ? 'Tài khoản của tôi' : 'Khu vực chủ cửa hàng';

export default function OwnerLayout() {
  const { user } = useAuth();
  // GBR-01: Kiểm tra quyền cả ở giao diện và BE; không cấp Owner bằng cách sửa URL.
  if (user?.roleCode !== 'OWNER') return <Result status="403" title={<h1>Không có quyền truy cập</h1>} subTitle="Khu vực này chỉ dành cho chủ cửa hàng." extra={<Link to="/">Về trang chủ</Link>} />;
  return <OwnerWorkspace user={user} />;
}
function OwnerWorkspace({ user }) {
  const { logout } = useAuth(); const navigate = useNavigate(); const location = useLocation(); const screens = Grid.useBreakpoint();
  const [collapsed, setCollapsed] = useState(false); const [drawer, setDrawer] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const desktop = screens.lg; const title = pageTitles[location.pathname] || detailTitle(location.pathname);
  const allItems = groups.flatMap((group) => group.items);
  const selected = location.pathname.startsWith('/owner/contracts/') ? 'purchases' : allItems.find(([path]) => location.pathname === `/owner/${path}`)?.[0] || allItems.find(([path]) => location.pathname.startsWith(`/owner/${path}/`))?.[0];
  // Đổi trang thì đóng menu di động và cập nhật tên tab để người dùng biết đang ở màn hình nào.
  useEffect(() => { setDrawer(false); document.title = `${title} | AraStore`; }, [location.pathname, title]);
  const signOut = async () => {
    setBusy(true); setError('');
    try { await logout(); navigate('/login', { replace: true }); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const account = { items: [{ key: 'profile', label: 'Tài khoản & bảo mật', icon: <UserIcon size={16} />, onClick: () => navigate('/owner/account') },
    { type: 'divider' }, { key: 'logout', danger: true, disabled: busy, label: busy ? 'Đang đăng xuất…' : 'Đăng xuất', icon: <LogOut size={16} />, onClick: signOut }] };
  return (
    <div className="owner-shell">
      {/* Backdrop overlay khi mở mobile sidebar */}
      {drawer && (
        <div
          className="owner-sidebar-backdrop"
          onClick={() => setDrawer(false)}
          aria-hidden="true"
        />
      )}

      {/* Unified Owner Sidebar synced 100% with Accountant Sidebar */}
      <OwnerSidebar
        groups={groups}
        selected={selected}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        mobileOpen={drawer}
        onCloseMobile={() => setDrawer(false)}
      />

      <div className={`owner-workspace ${collapsed ? 'owner-workspace-collapsed' : 'owner-workspace-expanded'}`}>
        <header className="owner-header">
          <div className="owner-header-context">
            <Tooltip rootClassName="owner-tooltip" title={desktop ? (collapsed ? 'Mở rộng điều hướng' : 'Thu gọn điều hướng') : 'Mở điều hướng'}>
              <Button
                type="text"
                className="owner-icon-button"
                aria-label={desktop ? (collapsed ? 'Mở rộng điều hướng' : 'Thu gọn điều hướng') : 'Mở điều hướng'}
                aria-expanded={desktop ? !collapsed : drawer}
                onClick={() => (desktop ? setCollapsed(!collapsed) : setDrawer(true))}
                icon={desktop ? (collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />) : <MenuIcon size={18} />}
              />
            </Tooltip>
            <div className="owner-header-titles">
              <span className="owner-header-brand">AraStore WMS</span>
              <span className="owner-header-sep">/</span>
              <span className="owner-header-page-title" title={title}>{title}</span>
            </div>
          </div>
          <div className="owner-header-actions">
            <OwnerHeaderTools groups={groups} />
            <Dropdown menu={account} trigger={['click']} overlayClassName="owner-profile-dropdown" rootClassName="owner-profile-dropdown-root">
              <Button type="text" className="owner-profile-button" aria-label="Mở menu tài khoản">
                <Avatar size={28} className="owner-avatar">{user.fullName?.trim()?.[0] || 'O'}</Avatar>
                <span className="owner-profile-info">
                  <strong>{user.fullName}</strong>
                  <small>Chủ cửa hàng</small>
                </span>
              </Button>
            </Dropdown>
          </div>
        </header>
        <div className="owner-main">
          {error && <Alert type="error" showIcon title={error} role="alert" />}
          <Suspense fallback={<ResourceState resource={{ loading: true }} />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
