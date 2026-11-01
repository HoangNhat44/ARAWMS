/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-20; GBR-01 - Route xem mẫu sản phẩm dành cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { listSamples, sampleDetail } from './productSamples.service.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm mẫu sản phẩm mới; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await listSamples(req.query) })));
// Đọc bản ghi theo đường dẫn được chọn trong nhóm mẫu sản phẩm mới; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/:id', asyncHandler(async (req, res) => res.json({ success: true, data: await sampleDetail(req.params.id) })));
export default router;
