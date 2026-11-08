// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-01/04/06 - Nhãn và hướng dẫn tiếng Việt phổ thông.
/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | Trang chủ nội bộ giữ thông tin người dùng và đường dẫn tài khoản. */
import { Card, Tag } from 'antd';
import { useAuth } from '../hooks/useAuth';
import { WmsLinkButton } from '../components/ui/WmsControls';
export default function HomePage(){const {user}=useAuth();return <div className="wms-home"><header className="wms-home-header"><Tag>Không gian làm việc nội bộ</Tag><h1>Xin chào, {user?.fullName||user?.employeeCode}</h1><p>Quản lý thông tin tài khoản và truy cập những chức năng được cấp cho vai trò của bạn.</p><WmsLinkButton to="/account" className="btn-ara-primary">Tài khoản & bảo mật</WmsLinkButton></header><div className="wms-home-grid"><Card title="Mã nhân viên">{user?.employeeCode||'Chưa cập nhật'}</Card><Card title="Vai trò">{user?.roleName||user?.roleCode||'Chưa cập nhật'}</Card><Card title="Thư điện tử đăng nhập">{user?.email||'Chưa cập nhật'}</Card></div></div>;}
