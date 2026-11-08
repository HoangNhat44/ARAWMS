// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 8 - Thống nhất nhãn hiển thị bằng tiếng Việt phổ thông.
import { Navigate } from 'react-router-dom';

// Employee accounts are provisioned internally; public self-registration is outside this module.
export default function RegisterPage() {
  return <Navigate to="/login" replace state={{ message: 'Vui lòng liên hệ chủ cửa hàng để được cấp tài khoản nhân viên.' }} />;
}
