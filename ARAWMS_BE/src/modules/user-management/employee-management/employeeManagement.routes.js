/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-010, UC-012. Định tuyến tạo và quản lý trạng thái nhân viên cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as controller from './employeeManagement.controller.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm quản lý nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** GET /api/owner/employees. Trả danh sách phân trang và danh mục vai trò được phép. */
router.get('/', asyncHandler(controller.list));
// Cập nhật dữ liệu tổng hợp hoặc danh sách trong nhóm quản lý nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** POST /api/owner/employees. Tạo tài khoản sau khi server kiểm tra hồ sơ. */
router.post('/', asyncHandler(controller.create));
// Cập nhật trạng thái khóa của nhân viên trong nhóm quản lý nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Khóa tạm một tài khoản đang hoạt động. */
router.patch('/:id/lock', asyncHandler(controller.lock));
// Cập nhật trạng thái khóa của nhân viên trong nhóm quản lý nhân viên; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Mở khóa tạm của một tài khoản. */
router.patch('/:id/unlock', asyncHandler(controller.unlock));
// Hai thao tác dưới đây dùng cho tài khoản ngừng hoặc quay lại làm việc.
/** Ngừng quyền truy cập của nhân viên theo trạng thái tài khoản. */
router.patch('/:id/deactivate', asyncHandler(controller.deactivate));
/** Cho nhân viên đã ngừng hoạt động truy cập lại theo luồng đăng nhập hiện hành. */
router.patch('/:id/reactivate', asyncHandler(controller.reactivate));
export default router;
