/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-009. Chuyển dữ liệu dashboard thành phản hồi HTTP.
 */
import { getDashboard } from './executiveDashboard.service.js';
// UC-12: Trả số tài chính theo kỳ và số vận hành hiện tại.
/** Chuyển bộ lọc từ query cho service và trả kết quả tổng hợp. */
export const read = async (req, res) => res.json({ success: true, data: await getDashboard(req.query) });
