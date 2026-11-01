/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-10, UC-11; GBR-01 - Chỉ Owner được xem và truy vết nhật ký.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as controller from './systemActivity.controller.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm nhật ký và truy vết; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/', asyncHandler(controller.list));
// Đọc lịch sử theo đối tượng cần truy vết trong nhóm nhật ký và truy vết; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/trace', asyncHandler(controller.trace));
export default router;
