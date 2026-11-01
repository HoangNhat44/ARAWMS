/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-19; GBR-01 - Báo cáo sản xuất/BOM chỉ đọc cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { listProduction, productionDetail } from './bomPlanReport.service.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm báo cáo sản xuất theo BOM; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await listProduction(req.query) })));
// Đọc bản ghi theo đường dẫn được chọn trong nhóm báo cáo sản xuất theo BOM; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/:id', asyncHandler(async (req, res) => res.json({ success: true, data: await productionDetail(req.params.id) })));
export default router;
