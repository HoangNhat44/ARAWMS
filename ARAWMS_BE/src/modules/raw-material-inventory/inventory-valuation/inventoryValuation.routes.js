/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-102, UC-110. Điểm vào báo cáo giá trị tồn nguyên liệu của Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { valuationReport } from './inventoryValuation.service.js';
import { httpError } from '../../../common/utils/httpError.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm giá trị tồn nguyên liệu; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** GET /api/owner/material-valuation. Giới hạn loại hàng của báo cáo ở nguyên liệu. */
router.get('/', asyncHandler(async (req, res) => {
  if (req.query.type !== undefined && req.query.type !== 'materials') throw httpError(400, 'Báo cáo này chỉ dành cho nguyên vật liệu.');
  res.json({ success: true, data: await valuationReport({ ...req.query, type: 'materials' }) });
}));
export default router;
