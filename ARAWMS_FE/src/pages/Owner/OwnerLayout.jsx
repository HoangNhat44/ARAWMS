// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi - Bỏ báo cáo thu chi khỏi thanh điều hướng.
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi giao diện - Thanh đầu trang thống nhất, không chứa điều hướng nghiệp vụ hoặc dòng dẫn nhỏ.
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 8 - Thống nhất nhãn hiển thị bằng tiếng Việt phổ thông.
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: Khung Owner responsive, điều hướng, breadcrumb và thao tác tài khoản.
 */
import { Suspense, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Avatar, Badge, Button, Drawer, Dropdown, Grid, Layout, Menu, Result, Tooltip } from 'antd';
import { BarChart3, Bell, ClipboardCheck, FileText, History, Layers, LogOut, Menu as MenuIcon, Package, Settings, Shield, Users, User as UserIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { ResourceState } from './OwnerUI';
import '../../styles/owner.css';

// Một đường dẫn cho một màn hình; chức năng chi tiết giữ cùng mục điều hướng với danh sách cha.
const groups = [
  // Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 1/6/8 - Các nghiệp vụ chính hiện đầy đủ, nhân sự/thu chi ở dưới.
  { title: 'Điều hành và sản xuất', items: [['dashboard', 'Tổng quan', BarChart3], ['production', 'Kế hoạch sản xuất', ClipboardCheck], ['purchases', 'Nhập hàng và công nợ', Package], ['bi', 'Báo cáo doanh thu', Layers], ['samples', 'Mẫu sản phẩm', Package]] },
  { title: 'Tồn kho và kiểm kê', items: [['material-valuation', 'Tồn kho nguyên liệu', Package], ['asset-valuation', 'Tồn kho thành phẩm', Layers], ['material-stocktakes', 'Kiểm kê nguyên liệu', ClipboardCheck], ['finished-stocktakes', 'Kiểm kê thành phẩm', ClipboardCheck], ['stock-adjustments', 'Duyệt kiểm kê', ClipboardCheck]] },
  // Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi bổ sung - Công việc và nhân sự là nhóm cuối cùng.
  { title: 'Công nợ và cài đặt', items: [['payables', 'Lập phiếu chi trả nợ', FileText], ['settings/integrations', 'Kết nối dịch vụ', Settings], ['settings/fabric', 'Thu hồi vải dư', Settings], ['settings/inventory', 'Mức tồn tối thiểu', Settings], ['settings/returns', 'Chính sách đổi trả', Settings]] },
  { title: 'Công việc và nhân sự', items: [['tasks', 'Phân công công việc', ClipboardCheck], ['manager-reports', 'Báo cáo quản lý', FileText], ['employees', 'Nhân viên', Users], ['activity', 'Nhật ký hoạt động', History]] },
];
const pageTitles = Object.fromEntries(groups.flatMap((g) => g.items.map(([path, title]) => [`/owner/${path}`, title])));
const detailTitle = (path) => path.endsWith('/permissions') ? 'Phân quyền nhân viên' : path === '/owner/employees/new' ? 'Tạo nhân viên'
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
  const reports = useOwnerResource('manager-reports', { limit: 1, status: 'SUBMITTED' });
  const desktop = screens.lg; const title = pageTitles[location.pathname] || detailTitle(location.pathname);
  const allItems = groups.flatMap((group) => group.items);
  const selected = allItems.find(([path]) => location.pathname === `/owner/${path}`)?.[0] || allItems.find(([path]) => location.pathname.startsWith(`/owner/${path}/`))?.[0];
  // Đổi trang thì đóng menu di động và cập nhật tên tab để người dùng biết đang ở màn hình nào.
  useEffect(() => { setDrawer(false); document.title = `${title} | AraStore`; }, [location.pathname, title]);
  const signOut = async () => {
    setBusy(true); setError('');
    try { await logout(); navigate('/login', { replace: true }); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const menu = <Menu theme="dark" mode="inline" selectedKeys={selected ? [selected] : []} inlineCollapsed={desktop && collapsed}
    items={groups.map((group) => ({ type: 'group', label: group.title, key: group.title, children: group.items.map(([key, label, Icon]) => ({ key, icon: <Icon size={18} aria-hidden="true" />, label })) }))}
    onClick={({ key }) => { navigate(`/owner/${key}`); setDrawer(false); }} />;
  const brand = <Link className="owner-brand" to="/owner/dashboard" aria-label="AraStore — Tổng quan"><img src="/logo.png" alt="" /><span><strong>AraStore</strong></span></Link>;
  const account = { items: [{ key: 'profile', label: 'Tài khoản & bảo mật', icon: <UserIcon size={16} />, onClick: () => navigate('/owner/account') },
    { type: 'divider' }, { key: 'logout', danger: true, disabled: busy, label: busy ? 'Đang đăng xuất…' : 'Đăng xuất', icon: <LogOut size={16} />, onClick: signOut }] };
  return <Layout className="owner-shell">
    {desktop && <Layout.Sider className="owner-sider" width={248} collapsedWidth={80} collapsed={collapsed} theme="dark" trigger={null}>
      {brand}<nav aria-label="Điều hướng quản lý">{menu}</nav></Layout.Sider>}
    <Drawer open={!desktop && drawer} onClose={() => setDrawer(false)} title={brand} placement="left" width={288} className="owner-nav-drawer" styles={{ body: { padding: 0 } }}>
      <nav aria-label="Điều hướng quản lý trên thiết bị di động">{menu}</nav></Drawer>
    <Layout className={`owner-workspace ${desktop ? collapsed ? 'owner-workspace-collapsed' : 'owner-workspace-expanded' : ''}`}>
      <Layout.Header className="owner-header"><div className="owner-header-context"><Tooltip title={desktop ? collapsed ? 'Mở rộng điều hướng' : 'Thu gọn điều hướng' : 'Mở điều hướng'}>
        <Button type="text" className="owner-icon-button" aria-label={desktop ? collapsed ? 'Mở rộng điều hướng' : 'Thu gọn điều hướng' : 'Mở điều hướng'} aria-expanded={desktop ? !collapsed : drawer}
          onClick={() => desktop ? setCollapsed(!collapsed) : setDrawer(true)} icon={desktop ? collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} /> : <MenuIcon size={20} />} /></Tooltip>
        <span className="owner-header-brand">AraStore</span></div>
        <div className="owner-header-actions"><Tooltip title="Báo cáo quản lý chưa xem"><Badge count={reports.data?.total || 0} size="small" overflowCount={99}>
          <Button type="text" className="owner-icon-button" aria-label={`Báo cáo chưa xem: ${reports.data?.total || 0}`} onClick={() => navigate('/owner/manager-reports?status=SUBMITTED')} icon={<Bell size={20} />} /></Badge></Tooltip>
          <Dropdown menu={account} trigger={['click']}><Button type="text" className="owner-profile-button" aria-label="Mở menu tài khoản"><Avatar size={32}>{user.fullName?.trim()?.[0] || 'O'}</Avatar><span><strong>{user.fullName}</strong><small>Chủ cửa hàng</small></span></Button></Dropdown>
        </div></Layout.Header>
      <div className="owner-main">
        {error && <Alert type="error" showIcon title={error} role="alert" />}<Suspense fallback={<ResourceState resource={{ loading: true }} />}><Outlet /></Suspense></div>
    </Layout>
  </Layout>;
}
