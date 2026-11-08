/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-15; GBR-01 - Xem tổng giá trị tồn kho nguyên vật liệu.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { valuationReport } from './inventoryValuation.service.js';
import { httpError } from '../../../common/utils/httpError.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm giá trị tồn nguyên liệu; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/', asyncHandler(async (req, res) => {
  if (req.query.type !== undefined && req.query.type !== 'materials') throw httpError(400, 'Báo cáo này chỉ dành cho nguyên vật liệu.');
  res.json({ success: true, data: await valuationReport({ ...req.query, type: 'materials' }) });
}));
export default router;
