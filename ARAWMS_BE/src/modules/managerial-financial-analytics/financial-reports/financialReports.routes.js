/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-111, UC-112. API báo cáo tài chính theo kỳ và lịch sử phiếu thu chi.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { financialReport, listCashVouchers } from './financialReports.service.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm báo cáo tài chính; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** GET /api/owner/financial-reports. Trả tổng tài chính, các điểm theo ngày và thông tin giá vốn còn thiếu. */
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await financialReport(req.query) })));
// Đọc các phiếu thu/chi dùng đối chiếu trong nhóm báo cáo tài chính; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
/** Trả phiếu thu/chi phân trang trong kỳ, kèm thông tin tham chiếu chứng từ nguồn. */
router.get('/cash-vouchers', asyncHandler(async (req, res) => res.json({ success: true, data: await listCashVouchers(req.query) })));
export default router;
