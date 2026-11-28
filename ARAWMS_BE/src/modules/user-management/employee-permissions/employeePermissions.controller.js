/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-011. Chuyển dữ liệu quyền nhân viên sang phản hồi HTTP.
 */
import * as service from './employeePermissions.service.js';
// UC-09: Trả danh mục quyền và vai trò nhân viên đang hoạt động.
/** Trả danh mục quyền cùng các vai trò đang hoạt động. */
export const catalog = async (req, res) => res.json({ success: true, data: await service.permissionCatalog() });
// UC-09: Trả quyền riêng và quyền có hiệu lực của nhân viên cụ thể.
/** Trả hồ sơ và quyền hiệu lực của nhân viên theo mã. */
export const detail = async (req, res) => res.json({ success: true, data: await service.getPermissions(req.params.id) });
// UC-09: Trả kết quả sau khi lưu quyền và thu hồi phiên cũ.
/** Trả kết quả sau khi ghi quyền ngoại lệ và thu hồi phiên cũ. */
export const assign = async (req, res) => res.json({ success: true, message: 'Đã cập nhật quyền và thu hồi phiên đăng nhập cũ.', data: await service.assignPermissions(req) });
