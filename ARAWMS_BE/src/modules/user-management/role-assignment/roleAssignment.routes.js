/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-01; GBR-01 - API gán vai trò chỉ dành cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { assignEmployeeRole } from './roleAssignment.service.js';
const router = ownerRouter();
// Kiểm tra phiên và quyền Owner trước khi kiểm tra dữ liệu hoặc tìm nhân viên.
router.patch('/:id', asyncHandler(async (req, res) => res.json({ success: true,
  message: 'Đã đổi vai trò, bỏ quyền ngoại lệ cũ và thu hồi các phiên đăng nhập.', data: await assignEmployeeRole(req) })));
export default router;
