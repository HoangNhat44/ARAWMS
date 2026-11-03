/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06, UC-07, UC-08 - API danh sách, tạo, khóa và mở khóa nhân viên.
 */
import * as service from './employeeManagement.service.js';
// Quản lý tài khoản: Đọc danh sách theo bộ lọc đã kiểm tra.
export const list = async (req, res) => res.json({ success: true, data: await service.listEmployees(req.query) });
// UC-06: Trả mã 201 khi nhân viên được tạo; không trả mật khẩu.
export const create = async (req, res) => res.status(201).json({ success: true, message: 'Đã tạo tài khoản nhân viên.', data: await service.createEmployee(req) });
// UC-07, GBR-01: Trả kết quả khóa và kết thúc phiên cũ.
export const lock = async (req, res) => res.json({ success: true, message: 'Đã khóa tài khoản và thu hồi các phiên đăng nhập.', data: await service.changeEmployeeStatus(req, 'LOCKED') });
// UC-08, GBR-02: Trả kết quả mở khóa; vẫn giữ yêu cầu đặt lại mật khẩu nếu có.
export const unlock = async (req, res) => res.json({ success: true, message: 'Đã mở khóa. Nhân viên cần đăng nhập lại.', data: await service.changeEmployeeStatus(req, 'ACTIVE') });
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: GBR-01 - Ngừng hoạt động/cho làm việc lại đều thu hồi phiên, ghi nhật ký và giữ yêu cầu đổi mật khẩu.
export const deactivate = async (req, res) => res.json({ success: true, message: 'Đã ngừng hoạt động tài khoản nhân viên.', data: await service.changeEmployeeStatus(req, 'INACTIVE') });
export const reactivate = async (req, res) => res.json({ success: true, message: 'Đã cho tài khoản hoạt động lại. Nhân viên cần đăng nhập lại.', data: await service.changeEmployeeStatus(req, 'ACTIVE', true) });
