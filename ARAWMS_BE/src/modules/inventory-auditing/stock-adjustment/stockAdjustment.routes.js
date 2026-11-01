/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-06; GBR-01/19 - API duyệt kiểm kê lớn chỉ dành cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { listStocktakes, stocktakeDetail, approveStocktake } from './stockAdjustment.service.js';
const router = ownerRouter();
// Xem danh sách, đọc báo cáo đã kiểm đếm và gửi một yêu cầu phê duyệt có dấu báo cáo.
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await listStocktakes(req.query) })));
router.get('/:id', asyncHandler(async (req, res) => res.json({ success: true, data: await stocktakeDetail(req.params.id) })));
router.post('/:id/approve', asyncHandler(async (req, res) => res.json({ success: true,
  message: 'Đã duyệt báo cáo. Phiên chờ quản lý kho thực hiện điều chỉnh.', data: await approveStocktake(req) })));
export default router;
