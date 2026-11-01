/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-01; GBR-01 - Gán vai trò và xác nhận bỏ quyền riêng của vai trò cũ.
 */
import { WmsField, WmsSelect, WmsTextArea, WmsButton } from '../../components/ui/WmsControls';
import { useState } from 'react';
import { ownerService } from '../../services/ownerService';
import { reasonError } from '../../utils/ownerValidation';
import { Notice, labels } from './OwnerUI';
export default function EmployeeRoleForm({ employee, roles, setBusy, onDone }) {
  const [roleCode, setRoleCode] = useState(''); const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); const message = reasonError(reason); setError(message);
    if (message) return;
    // Chỉ chấp nhận vai trò khác hiện tại có trong danh mục; BE vẫn kiểm tra độc lập.
    if (!roles.some((role) => role.roleCode === roleCode) || roleCode === employee.roleCode) { setError('Cần chọn vai trò nhân viên khác hiện tại.'); return; }
    setSaving(true); setBusy(true);
    try { const result = await ownerService.assignRole(employee.id, { expectedVersion: employee.managementVersion, roleCode, reason }); onDone(result.message); }
    catch (err) { setError(err.message); } finally { setSaving(false); setBusy(false); }
  };
  return <form className="owner-form" onSubmit={submit}><p>Nhân viên <strong>{employee.fullName}</strong> · Vai trò hiện tại: {labels[employee.roleCode]}.</p><Notice error={error} />
    <WmsField>Vai trò mới<WmsSelect required value={roleCode} disabled={saving} onChange={(e) => setRoleCode(e.target.value)}><option value="">Chọn vai trò mới</option>{roles.filter((role) => role.roleCode !== employee.roleCode).map((role) => <option key={role.roleCode} value={role.roleCode}>{role.roleName}</option>)}</WmsSelect></WmsField>
    <WmsField>Lý do thay đổi<WmsTextArea required minLength={5} maxLength={500} value={reason} disabled={saving} onChange={(e) => setReason(e.target.value)} /></WmsField>
    <p>Quyền cấp/thu hồi riêng cũ sẽ được bỏ và các phiên đăng nhập sẽ kết thúc. Nhân viên nhận quyền theo vai trò mới khi đăng nhập lại; tài khoản đang khóa vẫn giữ trạng thái khóa.</p>
    <WmsButton className="btn-ara-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Xác nhận đổi vai trò'}</WmsButton></form>;
}
