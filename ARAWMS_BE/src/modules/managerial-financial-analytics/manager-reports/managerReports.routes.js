/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-107, UC-108. API đọc và xác nhận báo cáo quản lý kho.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as service from './managerReports.service.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm báo cáo Manager gửi Owner; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Trả báo cáo đã gửi hoặc đã xem, theo bộ lọc và trang. */
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await service.listReports(req.query) })));
// Đọc bản ghi theo đường dẫn được chọn trong nhóm báo cáo Manager gửi Owner; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Trả nội dung và tệp đính kèm của một báo cáo đã gửi. */
router.get('/:id', asyncHandler(async (req, res) => res.json({ success: true, data: await service.reportDetail(req.params.id) })));
// Cập nhật xác nhận đã xem một lần trong nhóm báo cáo Manager gửi Owner; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Lưu mốc đã xem và ghi chú của Owner. */
router.patch('/:id/review', asyncHandler(async (req, res) => res.json({ success: true, message: 'Đã xác nhận xem báo cáo.', data: await service.acknowledgeReport(req) })));
export default router;
