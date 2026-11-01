/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | Trạng thái tải dùng chung, hỗ trợ trình đọc màn hình. */
import { Spin } from 'antd';
export default function LoadingSpinner({message='Đang tải dữ liệu…'}){return <div className="wms-loading" role="status" aria-live="polite"><Spin size="large"/><p>{message}</p></div>;}
