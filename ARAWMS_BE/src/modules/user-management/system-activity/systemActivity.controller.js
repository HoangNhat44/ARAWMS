/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-10, UC-11 - Kết quả xem nhật ký và truy vết hoạt động.
 */
import { listActivity } from './systemActivity.service.js';
// UC-10: Trả nhật ký mới nhất theo trang và bộ lọc.
export const list = async (req, res) => res.json({ success: true, data: await listActivity(req.query) });
// UC-11: Chỉ truy vết khi có mã đối tượng hoặc người thực hiện.
export const trace = async (req, res) => res.json({ success: true, data: await listActivity(req.query, true) });
