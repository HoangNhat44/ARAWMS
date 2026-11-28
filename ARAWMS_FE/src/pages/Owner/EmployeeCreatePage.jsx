/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | UC-010: Trang tạo tài khoản nhân viên. */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { CreateEmployee } from './EmployeesPage';
import OwnerDetailHeading from './OwnerDetailHeading';
import { ResourceState } from './OwnerUI';
/** Tải danh sách vai trò được phép tạo và mở form tạo nhân viên trong một trang riêng. Sau khi lưu, quay về danh sách nhân viên. */
export default function EmployeeCreatePage() {
  const catalog = useOwnerResource('employee-permissions'); const navigate = useNavigate(); const location = useLocation(); const [busy, setBusy] = useState(false);
  const destination = location.state?.from?.startsWith('/owner/employees') ? location.state.from : '/owner/employees';
  return <><OwnerDetailHeading title="Tạo tài khoản nhân viên" description="Nhập thông tin truy cập và chọn vai trò phù hợp." backTo="/owner/employees" disabled={busy} />
    <div className="owner-page-form"><ResourceState resource={catalog}>{catalog.data && <CreateEmployee roles={catalog.data.roles} setBusy={setBusy}
      onDone={(message) => navigate(destination, { replace: true, state: { message } })} />}</ResourceState></div></>;
}
