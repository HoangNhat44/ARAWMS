import { Navigate } from 'react-router-dom';

// Employee accounts are provisioned internally; public self-registration is outside this module.
export default function RegisterPage() {
  return <Navigate to="/login" replace state={{ message: 'Vui lòng liên hệ Owner để được cấp tài khoản nhân viên.' }} />;
}
