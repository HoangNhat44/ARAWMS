/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-070, UC-073, UC-075. API danh sách, chi tiết và phê duyệt chênh lệch kiểm kê của Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { listStocktakes, stocktakeDetail, approveStocktake } from './stockAdjustment.service.js';
const router = ownerRouter();
// Xem danh sách, đọc báo cáo đã kiểm đếm và gửi một yêu cầu phê duyệt có dấu báo cáo.
/** GET /api/owner/stock-adjustments. Trả các phiên theo bộ lọc đã kiểm tra. */
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await listStocktakes(req.query) })));
/** GET /api/owner/stock-adjustments/:id. Đọc báo cáo kèm dấu băm để dùng khi duyệt. */
router.get('/:id', asyncHandler(async (req, res) => res.json({ success: true, data: await stocktakeDetail(req.params.id) })));
/** POST /api/owner/stock-adjustments/:id/approve. Ghi nhận xác nhận của Owner và trả trạng thái chờ điều chỉnh. */
router.post('/:id/approve', asyncHandler(async (req, res) => res.json({ success: true,
  message: 'Đã duyệt báo cáo. Phiên chờ quản lý kho thực hiện điều chỉnh.', data: await approveStocktake(req) })));
export default router;
