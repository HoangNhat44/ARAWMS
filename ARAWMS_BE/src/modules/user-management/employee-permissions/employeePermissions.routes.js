/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-011. Điểm vào danh mục và ngoại lệ quyền của nhân viên.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as controller from './employeePermissions.controller.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm quyền riêng của nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Đọc danh mục quyền và vai trò dùng khi mở form. */
router.get('/', asyncHandler(controller.catalog));
// Đọc bản ghi theo đường dẫn được chọn trong nhóm quyền riêng của nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Đọc quyền đã cấp và quyền có hiệu lực của một nhân viên. */
router.get('/:id', asyncHandler(controller.detail));
// Cập nhật bản ghi theo đường dẫn được chọn trong nhóm quyền riêng của nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Lưu ngoại lệ mới cho tài khoản nhân viên theo phiên bản đang xem. */
router.patch('/:id', asyncHandler(controller.assign));
export default router;
