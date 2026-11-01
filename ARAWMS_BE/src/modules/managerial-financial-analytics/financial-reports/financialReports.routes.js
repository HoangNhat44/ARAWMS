/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-13, UC-14, UC-17; GBR-01 - Báo cáo tài chính chỉ đọc cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { financialReport, listCashVouchers } from './financialReports.service.js';
const router = ownerRouter();
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm báo cáo tài chính; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await financialReport(req.query) })));
// Đọc các phiếu thu/chi dùng đối chiếu trong nhóm báo cáo tài chính; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/cash-vouchers', asyncHandler(async (req, res) => res.json({ success: true, data: await listCashVouchers(req.query) })));
export default router;
