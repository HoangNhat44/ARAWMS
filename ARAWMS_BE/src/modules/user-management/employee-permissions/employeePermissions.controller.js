/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-09 - API danh mục, xem quyền và gán quyền nhân viên.
 */
import * as service from './employeePermissions.service.js';
// UC-09: Trả danh mục quyền và vai trò nhân viên đang hoạt động.
export const catalog = async (req, res) => res.json({ success: true, data: await service.permissionCatalog() });
// UC-09: Trả quyền riêng và quyền có hiệu lực của nhân viên cụ thể.
export const detail = async (req, res) => res.json({ success: true, data: await service.getPermissions(req.params.id) });
// UC-09: Trả kết quả sau khi lưu quyền và thu hồi phiên cũ.
export const assign = async (req, res) => res.json({ success: true, message: 'Đã cập nhật quyền và thu hồi phiên đăng nhập cũ.', data: await service.assignPermissions(req) });
