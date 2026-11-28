/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-011. Xem quyền hiệu lực và lưu các ngoại lệ so với quyền của vai trò.
 */
import { WmsField, WmsSelect, WmsTextArea, WmsButton } from '../../components/ui/WmsControls';
import { useState } from 'react';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { ownerService } from '../../services/ownerService';
import { reasonError } from '../../utils/ownerValidation';
import { ResourceState, Notice, labels } from './OwnerUI';
import { businessLabel, permissionLabel } from '../../utils/businessLabels';
/** Tải cấu hình quyền mới nhất của nhân viên khi mở. Khởi tạo lại trình chỉnh sửa nếu phiên bản quản trị thay đổi. */
export default function EmployeePermissionsForm({ employee, catalog, onDone, setBusy }) {
  // Đọc quyền chi tiết từ API vì bảng nhân viên chỉ chứa dữ liệu tóm tắt.
  const resource = useOwnerResource(`employee-permissions/${employee.id}`);
  return <ResourceState resource={resource}>{resource.data && <PermissionEditor key={resource.data.employee.managementVersion} data={resource.data} catalog={catalog} onDone={onDone} setBusy={setBusy} />}</ResourceState>;
}
// Tách phần nhập liệu để khởi tạo lại form khi phiên bản tài khoản thay đổi.
/** Kết hợp quyền mặc định của vai trò với lựa chọn cấp hoặc thu hồi riêng của Owner. Hiển thị quyền hiệu lực tại thời điểm tải. */
function PermissionEditor({ data, catalog, onDone, setBusy }) {
  const employee = data.employee;
  const [overrides, setOverrides] = useState(Object.fromEntries(employee.permissionOverrides.map((p) => [p.code, p.granted ? 'grant' : 'deny'])));
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  // Phân biệt quyền có từ vai trò với quyền Owner cấp/thu hồi riêng.
  const inherited = new Set(catalog.roles.find((role) => role.roleCode === employee.roleCode)?.permissions || []);
  /** Tạo danh sách ngoại lệ theo danh mục quyền đang hoạt động, gửi kèm lý do và phiên bản tài khoản rồi phản hồi kết quả cho trang cha. */
  const submit = async (event) => {
    event.preventDefault(); const message = reasonError(reason); setError(message); if (message) return;
    setSaving(true); setBusy(true);
    try {
      // Chỉ gửi những quyền khác mặc định; chọn Theo vai trò thì bỏ ngoại lệ tương ứng.
      const permissionOverrides = catalog.permissions.filter((p) => overrides[p.code] && overrides[p.code] !== 'inherit').map((p) => ({ code: p.code, granted: overrides[p.code] === 'grant' }));
      // BE lưu quyền, ghi log và kết thúc phiên cũ; thành công mới tải lại quyền trên trang.
      const response = await ownerService.assignPermissions(employee.id, { expectedVersion: employee.managementVersion, reason, permissionOverrides }); onDone(response.message);
    } catch (err) { setError(err.message); } finally { setSaving(false); setBusy(false); }
  };
  return <form onSubmit={submit} className="owner-form"><p>Nhân viên <strong>{employee.fullName}</strong> · Vai trò {labels[employee.roleCode] || 'Chưa cập nhật'}. Quyền có hiệu lực sau lần đăng nhập mới.</p>
    <Notice error={error} />
    {!catalog.permissions.length && <p className="owner-notice">Chưa có danh mục quyền của các vai trò nhân viên. Cần thiết lập quyền theo vai trò trước khi cấp quyền riêng.</p>}
    {employee.permissionOverrides.some((entry) => !catalog.permissions.some((p) => p.code === entry.code)) && <p className="owner-notice">Có quyền ngoại lệ đã ngừng hoạt động. Các quyền đó sẽ được loại khi lưu.</p>}
    {/* Mỗi quyền có thể lấy theo vai trò, cấp riêng hoặc thu hồi riêng. */}
    <div className="owner-permissions">{catalog.permissions.map((permission) => <WmsField key={permission.code}><span>{businessLabel(permission.majorFeature)} / {businessLabel(permission.subFeature)} / {businessLabel(permission.action)}<small>Vai trò mặc định: {inherited.has(permission.code) ? 'Có quyền' : 'Không có quyền'}</small></span>
      <WmsSelect disabled={saving} value={overrides[permission.code] || 'inherit'} onChange={(event) => setOverrides({ ...overrides, [permission.code]: event.target.value })}>
        <option value="inherit">Theo vai trò</option><option value="grant">Cấp riêng</option><option value="deny">Thu hồi riêng</option></WmsSelect></WmsField>)}</div>
    <details><summary>Quyền hiệu lực hiện tại ({data.effectivePermissions.length})</summary><ul>{data.effectivePermissions.map((code) => <li key={code}>{permissionLabel(code)}</li>)}</ul></details>
    <WmsField>Lý do thay đổi<WmsTextArea required minLength={5} maxLength={500} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} /></WmsField>
    <p>Các phiên đăng nhập cũ của nhân viên sẽ kết thúc. Trạng thái khóa tài khoản được giữ nguyên.</p>
    <WmsButton type="submit" className="btn-ara-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Xác nhận lưu quyền'}</WmsButton></form>;
}
