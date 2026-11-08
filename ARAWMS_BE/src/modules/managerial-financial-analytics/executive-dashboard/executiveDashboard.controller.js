/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-12 - Trả dashboard tổng hợp theo khoảng ngày đã xác thực.
 */
import { getDashboard } from './executiveDashboard.service.js';
// UC-12: Trả số tài chính theo kỳ và số vận hành hiện tại.
export const read = async (req, res) => res.json({ success: true, data: await getDashboard(req.query) });
