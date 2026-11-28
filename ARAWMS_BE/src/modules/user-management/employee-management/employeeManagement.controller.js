/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-010 và UC-012. Trả kết quả HTTP cho thao tác quản lý nhân viên.
 */
import * as service from './employeeManagement.service.js';
// Quản lý tài khoản: Đọc danh sách theo bộ lọc đã kiểm tra.
/** Chuyển bộ lọc và tham số trang cho service, rồi trả danh sách. */
export const list = async (req, res) => res.json({ success: true, data: await service.listEmployees(req.query) });
// Trả HTTP 201 và hồ sơ tài khoản mới sau khi lưu thành công.
export const create = async (req, res) => res.status(201).json({ success: true, message: 'Đã tạo tài khoản nhân viên.', data: await service.createEmployee(req) });
// Trả trạng thái đã khóa và thông báo phiên cũ đã được thu hồi.
export const lock = async (req, res) => res.json({ success: true, message: 'Đã khóa tài khoản và thu hồi các phiên đăng nhập.', data: await service.changeEmployeeStatus(req, 'LOCKED') });
// Trả trạng thái đã mở khóa và yêu cầu nhân viên đăng nhập lại.
export const unlock = async (req, res) => res.json({ success: true, message: 'Đã mở khóa. Nhân viên cần đăng nhập lại.', data: await service.changeEmployeeStatus(req, 'ACTIVE') });
// Ngừng hoạt động và kích hoạt lại dùng hai chuyển trạng thái riêng.
/** Gửi yêu cầu chuyển tài khoản hiện tại sang INACTIVE. */
export const deactivate = async (req, res) => res.json({ success: true, message: 'Đã ngừng hoạt động tài khoản nhân viên.', data: await service.changeEmployeeStatus(req, 'INACTIVE') });
/** Yêu cầu chuyển từ INACTIVE sang ACTIVE. Tham số cuối xác định trạng thái nguồn. */
export const reactivate = async (req, res) => res.json({ success: true, message: 'Đã cho tài khoản hoạt động lại. Nhân viên cần đăng nhập lại.', data: await service.changeEmployeeStatus(req, 'ACTIVE', true) });
