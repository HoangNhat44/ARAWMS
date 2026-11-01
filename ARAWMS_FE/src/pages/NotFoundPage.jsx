/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | Trang lỗi có lối quay lại rõ ràng. */
import { Result } from 'antd';
import { useLocation } from 'react-router-dom';
import { WmsLinkButton } from '../components/ui/WmsControls';
export default function NotFoundPage(){const {pathname}=useLocation();return <Result status="404" title={<h1>Không tìm thấy trang</h1>} subTitle="Đường dẫn không tồn tại hoặc đã được thay đổi." extra={<WmsLinkButton className="btn-ara-primary" to={pathname.startsWith('/owner')?'/owner/dashboard':'/'}>Về trang chủ</WmsLinkButton>}/>;}
