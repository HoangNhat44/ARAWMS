/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | UC-011: Trang quản lý quyền nhân viên. */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import EmployeePermissionsForm from './EmployeePermissionsForm';
import OwnerDetailHeading from './OwnerDetailHeading';
import { Notice, ResourceState } from './OwnerUI';
/** Lấy mã nhân viên từ đường dẫn, tải danh mục quyền và gắn form quyền vào khung chi tiết dùng chung. */
export default function EmployeePermissionsPage() {
  const { employeeId } = useParams(); const catalog = useOwnerResource('employee-permissions'); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false); const [version, setVersion] = useState(0);
  return <><OwnerDetailHeading title="Phân quyền nhân viên" description="Phân biệt quyền theo vai trò và quyền được cấp hoặc thu hồi riêng." backTo="/owner/employees" disabled={busy} />
    <Notice success={success} /><div className="owner-page-form"><ResourceState resource={catalog}>{catalog.data && <EmployeePermissionsForm key={version} employee={{ id: employeeId }} catalog={catalog.data} setBusy={setBusy}
      onDone={(message) => { setSuccess(message); setVersion((v) => v + 1); }} />}</ResourceState></div></>;
}
