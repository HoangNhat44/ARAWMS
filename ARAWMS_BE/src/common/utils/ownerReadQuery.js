/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-15 đến UC-20 - Bộ lọc chung có phân trang và tìm kiếm an toàn.
 */
import { httpError } from './httpError.js';
import { objectFields, pagination, textField, escapedSearch } from './ownerValidation.js';
// UC-15 đến UC-20: Tạo bộ lọc từ đầu sau khi kiểm tra đầu vào; luôn loại bản ghi đã xóa mềm.
export const readQuery = (query, { fields = ['code', 'name'], statuses = [], extra = [] } = {}) => {
  objectFields(query, ['page', 'limit', 'search', 'status', ...extra]);
  const { page, limit } = pagination(query); const filter = { isDeleted: { $ne: true } };
  if (query.status) {
    if (!statuses.includes(query.status)) throw httpError(400, 'Trạng thái bộ lọc không hợp lệ.');
    filter.status = query.status;
  }
  if (query.search) {
    const search = escapedSearch(textField(query.search, 'Từ khóa', 100));
    filter.$or = fields.map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
  }
  return { filter, page, limit };
};
// Chỉ giữ HTTP/HTTPS không nhúng tài khoản; trả chuỗi rỗng nếu link sai hoặc có thể chạy mã.
export const safeUrl = (value) => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
};
