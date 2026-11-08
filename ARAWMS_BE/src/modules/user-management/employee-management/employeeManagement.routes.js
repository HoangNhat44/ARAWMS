/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06, UC-07, UC-08; GBR-01 - Route chỉ dành cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as controller from './employeeManagement.controller.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm quản lý nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/', asyncHandler(controller.list));
// Cập nhật dữ liệu tổng hợp hoặc danh sách trong nhóm quản lý nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.post('/', asyncHandler(controller.create));
// Cập nhật trạng thái khóa của nhân viên trong nhóm quản lý nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.patch('/:id/lock', asyncHandler(controller.lock));
// Cập nhật trạng thái khóa của nhân viên trong nhóm quản lý nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.patch('/:id/unlock', asyncHandler(controller.unlock));
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: GBR-01 - Chỉ chủ cửa hàng được dừng/khôi phục hoạt động của nhân viên.
router.patch('/:id/deactivate', asyncHandler(controller.deactivate));
router.patch('/:id/reactivate', asyncHandler(controller.reactivate));
export default router;
