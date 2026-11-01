/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-12; GBR-01 - Bảo vệ số liệu điều hành bằng quyền Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { read } from './executiveDashboard.controller.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm dashboard Owner; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/', asyncHandler(read));
export default router;
