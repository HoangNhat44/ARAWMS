/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-017. API đọc nhật ký và truy vết dành cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as controller from './systemActivity.controller.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm nhật ký và truy vết; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Trả nhật ký hệ thống theo bộ lọc và trang đang xem. */
router.get('/', asyncHandler(controller.list));
// Đọc lịch sử theo đối tượng cần truy vết trong nhóm nhật ký và truy vết; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Truy vết theo mã đối tượng hoặc người thực hiện. */
router.get('/trace', asyncHandler(controller.trace));
export default router;
