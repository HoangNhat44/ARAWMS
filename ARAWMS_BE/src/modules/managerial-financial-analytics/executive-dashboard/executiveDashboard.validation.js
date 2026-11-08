/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-12 - Kiểm tra khoảng ngày báo cáo, tối đa 366 ngày.
 */
import { httpError } from '../../../common/utils/httpError.js';
import { objectFields } from '../../../common/utils/ownerValidation.js';
export const dashboardRange = (query, now = new Date()) => {
  objectFields(query, ['from', 'to']);
  // UC-12/13/14/17: Không chọn ngày thì mặc định từ đầu tháng đến hôm nay theo giờ Việt Nam.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const to = query.to ?? today;
  const from = query.from ?? `${today.slice(0, 7)}-01`;
  const date = (value, end = false) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(400, 'Ngày cần theo định dạng YYYY-MM-DD.');
    // Kiểm tra lại ngày sau khi chuyển đổi để loại ngày không tồn tại như 30/02.
    const parsed = new Date(`${value}T00:00:00+07:00`);
    if (!Number.isFinite(parsed.getTime()) || new Date(parsed.getTime() + 7 * 3600000).toISOString().slice(0, 10) !== value) throw httpError(400, 'Ngày báo cáo không tồn tại.');
    // Dùng mốc trước đầu ngày kế tiếp để lấy đủ dữ liệu của ngày kết thúc.
    return end ? new Date(parsed.getTime() + 86400000) : parsed;
  };
  const start = date(from); const end = date(to, true);
  if (start >= end || end - start > 366 * 86400000) throw httpError(400, 'Khoảng báo cáo phải đúng thứ tự và không quá 366 ngày.');
  return { from, to, start, end };
};
