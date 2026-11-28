/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-017. Trả kết quả tra cứu nhật ký và truy vết.
 */
import { listActivity } from './systemActivity.service.js';
// Trả nhật ký theo trang và bộ lọc đã kiểm tra.
export const list = async (req, res) => res.json({ success: true, data: await listActivity(req.query) });
// Bật chế độ yêu cầu mã truy vết trước khi đọc dữ liệu.
export const trace = async (req, res) => res.json({ success: true, data: await listActivity(req.query, true) });
