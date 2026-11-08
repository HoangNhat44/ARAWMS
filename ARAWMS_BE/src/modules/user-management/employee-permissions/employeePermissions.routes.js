/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-09; GBR-01 - Route quản lý quyền chỉ dành cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as controller from './employeePermissions.controller.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm quyền riêng của nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/', asyncHandler(controller.catalog));
// Đọc bản ghi theo đường dẫn được chọn trong nhóm quyền riêng của nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/:id', asyncHandler(controller.detail));
// Cập nhật bản ghi theo đường dẫn được chọn trong nhóm quyền riêng của nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.patch('/:id', asyncHandler(controller.assign));
export default router;
