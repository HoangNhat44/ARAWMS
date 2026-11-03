// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 8 - Nhãn nghiệp vụ tiếng Việt.
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06 đến UC-09; GBR-01/02 - Danh sách, tạo, khóa/mở khóa và phân quyền nhân viên.
 */
import { WmsButton, WmsField, WmsInput, WmsSelect, WmsTextArea, WmsLinkButton } from '../../components/ui/WmsControls';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { ownerService } from '../../services/ownerService';
import { employeeError, reasonError } from '../../utils/ownerValidation';
import { Table, Status, ResourceState, Pagination, Modal, Notice, labels, datetime } from './OwnerUI';
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi nhân viên - Không hiển thị phân quyền/gán lại vai trò trong phạm vi hiện tại.
const blank = { employeeCode: '', fullName: '', email: '', phone: '', password: '', confirmPassword: '', roleCode: '' };
export default function EmployeesPage() {
  // UC-06..09: Giữ bộ lọc đã áp dụng tách khỏi ô tìm kiếm đang nhập.
  const location = useLocation();
  const [query, setQuery] = useOwnerQuery({ page: 1, search: '', status: '', roleCode: '' }); const [search, setSearch] = useState(query.search);
  const [modal, setModal] = useState(null); const [busy, setBusy] = useState(false); const [success, setSuccess] = useState(location.state?.message || '');
  // Tải danh sách nhân viên và danh mục quyền/vai trò để dùng chung cho các hộp thoại.
  const employees = useOwnerResource('employees', query); const catalog = useOwnerResource('employee-permissions');
  // Chỉ đóng form sau khi BE báo thành công; tải lại danh sách để thấy trạng thái thật.
  const done = (message) => { setModal(null); setSuccess(message); employees.reload(); };
  return <><header className="owner-page-heading"><div><p className="owner-eyebrow">Quản lý người dùng</p><h1>Quản lý nhân viên</h1><p>Tạo tài khoản, khóa tạm thời hoặc ngừng hoạt động khi nhân viên không còn làm việc.</p></div>
    <WmsLinkButton className="btn-ara-primary" disabled={!catalog.data || catalog.loading} to="/owner/employees/new" state={{ from: location.pathname + location.search }}>Tạo nhân viên</WmsLinkButton></header>
    <Notice success={success} error={catalog.error} />
    {/* Tìm kiếm và lọc chỉ cập nhật danh sách; không làm thay đổi thông tin nhân viên. */}
    <form className="owner-filters" onSubmit={(event) => { event.preventDefault(); setQuery({ ...query, page: 1, search: search.trim() }); }}>
      <WmsField>Tìm nhân viên<WmsInput maxLength={100} placeholder="Mã, họ tên hoặc email" value={search} onChange={(e) => setSearch(e.target.value)} /></WmsField>
      <WmsField>Trạng thái<WmsSelect value={query.status} onChange={(e) => setQuery({ ...query, page: 1, status: e.target.value })}><option value="">Tất cả</option>{['ACTIVE', 'LOCKED', 'INACTIVE'].map((s) => <option key={s} value={s}>{labels[s]}</option>)}</WmsSelect></WmsField>
      <WmsField>Vai trò<WmsSelect value={query.roleCode} onChange={(e) => setQuery({ ...query, page: 1, roleCode: e.target.value })}><option value="">Tất cả</option>{catalog.data?.roles.map((r) => <option key={r.roleCode} value={r.roleCode}>{r.roleName}</option>)}</WmsSelect></WmsField><WmsButton>Tìm kiếm</WmsButton></form>
    {/* Bảng chỉ hiện nút phù hợp trạng thái; BE vẫn kiểm tra lại trước khi khóa/mở khóa. */}
    <ResourceState resource={employees}>{employees.data && <><Table headings={['Nhân viên', 'Liên hệ', 'Vai trò', 'Trạng thái', 'Đăng nhập gần nhất', 'Thao tác']} empty={!employees.data.items.length}>
      {employees.data.items.map((employee) => <tr key={employee.id}><td><strong>{employee.fullName}</strong><small>{employee.employeeCode}</small></td><td>{employee.email}<small>{employee.phone || 'Chưa có số điện thoại'}</small></td>
        <td>{labels[employee.roleCode] || employee.roleCode}</td><td><Status value={employee.status} /></td><td>{datetime(employee.lastLoginAt)}</td><td><div className="owner-actions">
          {['ACTIVE', 'LOCKED'].includes(employee.status) && <WmsButton danger={employee.status === 'ACTIVE'} onClick={() => { setSuccess(''); setModal({ type: employee.status === 'ACTIVE' ? 'lock' : 'unlock', employee }); }}>{employee.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}</WmsButton>}
          {['ACTIVE', 'LOCKED'].includes(employee.status) && <WmsButton onClick={() => { setSuccess(''); setModal({ type: 'deactivate', employee }); }}>Ngừng hoạt động</WmsButton>}
          {employee.status === 'INACTIVE' && <WmsButton onClick={() => { setSuccess(''); setModal({ type: 'reactivate', employee }); }}>Cho hoạt động lại</WmsButton>}</div></td></tr>)}
    </Table><Pagination data={employees.data} onPage={(page) => setQuery({ ...query, page })} /></>}</ResourceState>
    {/* Mỗi thao tác có form xác nhận riêng; đang lưu thì không đóng hộp thoại hoặc gửi lần hai. */}
    <p className="owner-method">Khóa: tạm chặn đăng nhập. Ngừng hoạt động: nhân viên đã nghỉ hoặc tạm ngừng làm việc. Cả hai đều kết thúc các phiên đăng nhập cũ; chủ cửa hàng có thể mở khóa hoặc cho hoạt động lại.</p>
    {modal && <Modal title={statusActions[modal.type].confirm} busy={busy} onClose={() => setModal(null)}>
      <EmployeeStatusAction employee={modal.employee} action={modal.type} onDone={done} setBusy={setBusy} /></Modal>}
  </>;
}
// UC-06: Form tạo nhân viên; không cung cấp lựa chọn tạo thêm Owner.
export function CreateEmployee({ roles, onDone, setBusy }) {
  const [form, setForm] = useState(blank); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    // Chặn form sai trước khi gửi; lỗi kiểm tra lại từ BE vẫn hiển thị ngay trong form.
    event.preventDefault(); const message = employeeError(form); setError(message); if (message) return;
    setSaving(true); setBusy(true);
    // Khóa nút trong lúc gửi để hạn chế tạo trùng; giữ nguyên dữ liệu nhập nếu lưu lỗi.
    try { const response = await ownerService.createEmployee({ ...form, employeeCode: form.employeeCode.trim(), fullName: form.fullName.trim(), email: form.email.trim() }); onDone(response.message); }
    catch (err) { setError(err.message); } finally { setSaving(false); setBusy(false); }
  };
  return <form className="owner-form" onSubmit={submit}><Notice error={error} /><div className="owner-form-grid">
    {[['employeeCode', 'Mã nhân viên', 'text', 30], ['fullName', 'Họ tên', 'text', 100], ['email', 'Thư điện tử', 'email', 254], ['phone', 'Số điện thoại (không bắt buộc)', 'tel', 10], ['password', 'Mật khẩu ban đầu', 'password', 72], ['confirmPassword', 'Xác nhận mật khẩu', 'password', 72]].map(([key, title, type, max]) =>
      <WmsField key={key}>{title}<WmsInput type={type} autoComplete={type === 'password' ? 'new-password' : 'off'} required={key !== 'phone'} maxLength={max} value={form[key]} disabled={saving} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></WmsField>)}
    <WmsField>Vai trò<WmsSelect required disabled={saving} value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}><option value="">Chọn vai trò nhân viên</option>{roles.map((role) => <option key={role.roleCode} value={role.roleCode}>{labels[role.roleCode] || 'Chưa cập nhật'}</option>)}</WmsSelect></WmsField></div>
    {!roles.length && <p>Chưa có vai trò nhân viên đang hoạt động.</p>}<p>Mật khẩu cần ít nhất 8 ký tự, tối đa 72 byte. Không thể tạo thêm chủ cửa hàng tại đây.</p>
    <WmsButton className="btn-ara-primary" disabled={saving || !roles.length}>{saving ? 'Đang tạo…' : 'Xác nhận tạo tài khoản'}</WmsButton></form>;
}
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: GBR-01/02 - Thao tác theo trạng thái, không sửa vai trò hoặc quyền.
const statusActions = {
  lock: { label: 'Khóa', confirm: 'Xác nhận khóa tài khoản', note: 'Tạm chặn đăng nhập và kết thúc các phiên hiện có.' },
  unlock: { label: 'Mở khóa', confirm: 'Xác nhận mở khóa', note: 'Nhân viên cần đăng nhập lại; yêu cầu đặt lại mật khẩu trước đó vẫn được giữ.' },
  deactivate: { label: 'Ngừng hoạt động', confirm: 'Xác nhận ngừng hoạt động', note: 'Dùng khi nhân viên nghỉ hoặc ngừng làm việc. Tài khoản không thể đăng nhập.' },
  reactivate: { label: 'Cho hoạt động lại', confirm: 'Xác nhận cho hoạt động lại', note: 'Nhân viên được làm việc lại theo vị trí hiện có và phải đăng nhập lại.' },
};
// UC-07/08, GBR-01/02: Yêu cầu xác nhận và lý do; mở khóa không bỏ yêu cầu đổi mật khẩu.
function EmployeeStatusAction({ employee, action, onDone, setBusy }) {
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); const message = reasonError(reason); setError(message); if (message) return;
    setSaving(true); setBusy(true);
    // Gửi phiên bản đang xem để BE phát hiện tài khoản vừa bị người khác thay đổi.
    try { const response = await ownerService.employeeAction(employee.id, action, { expectedVersion: employee.managementVersion, reason }); onDone(response.message); }
    catch (err) { setError(err.message); } finally { setSaving(false); setBusy(false); }
  };
  return <form onSubmit={submit} className="owner-form"><p>{statusActions[action].label} tài khoản <strong>{employee.fullName} ({employee.employeeCode})</strong>.</p>
    <p>{statusActions[action].note}</p>
    <Notice error={error} /><WmsField>Lý do<WmsTextArea required minLength={5} maxLength={500} disabled={saving} value={reason} onChange={(e) => setReason(e.target.value)} /></WmsField>
    <WmsButton className="btn-ara-primary" danger={['lock', 'deactivate'].includes(action)} disabled={saving}>{saving ? 'Đang xử lý…' : statusActions[action].confirm}</WmsButton></form>;
}
