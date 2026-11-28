/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Tạo bộ lọc và chuẩn hóa URL đính kèm cho các màn hình tra cứu Owner.
 */
import { httpError } from './httpError.js';
import { objectFields, pagination, textField, escapedSearch } from './ownerValidation.js';
// UC-15 đến UC-20: Tạo bộ lọc từ đầu sau khi kiểm tra đầu vào; luôn loại bản ghi đã xóa mềm.
/** Tạo điều kiện MongoDB từ các trường được cho phép. Áp dụng phân trang, trạng thái, từ khóa và điều kiện loại bản ghi xóa mềm. */
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
/** Chuẩn hóa URL tệp từ dữ liệu lưu trữ, hỗ trợ HTTP(S) không chứa thông tin đăng nhập và các ảnh mẫu nội bộ. */
export const safeUrl = (value) => {
  // Đường dẫn tương đối chỉ chấp nhận tệp ảnh mẫu có tên hợp lệ dưới /demo/.
  if (typeof value === 'string' && /^\/demo\/[a-z0-9-]+\.(svg|png|webp|jpg)$/.test(value)) return value;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
};
