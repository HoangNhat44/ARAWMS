/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-009. Dashboard tổng hợp sau khi xác thực quyền Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { read } from './executiveDashboard.controller.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm dashboard Owner; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** GET /api/owner/dashboard. Trả tài chính theo kỳ cùng số liệu vận hành hiện tại. */
router.get('/', asyncHandler(read));
export default router;
