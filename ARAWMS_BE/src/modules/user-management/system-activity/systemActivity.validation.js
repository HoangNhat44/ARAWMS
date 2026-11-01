/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-10, UC-11 - Kiểm tra bộ lọc nhật ký và khóa truy vết.
 */
import { objectFields, objectId, textField, pagination, escapedSearch } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';
import { dashboardRange } from '../../managerial-financial-analytics/executive-dashboard/executiveDashboard.validation.js';
export const activityFilter = (query, trace = false) => {
  // UC-10/11: Chỉ cho lọc bằng các trường hỗ trợ; không chuyển thẳng query của FE vào MongoDB.
  objectFields(query, ['page', 'limit', 'from', 'to', 'actorId', 'targetId', 'targetCode', 'action', 'majorFeature', 'search']);
  const { page, limit } = pagination(query);
  const filter = { isDeleted: { $ne: true } };
  // Có lọc ngày thì phải đủ hai mốc; dùng trọn ngày cuối theo giờ Việt Nam.
  if (query.from || query.to) {
    if (!query.from || !query.to) throw httpError(400, 'Cần cả ngày bắt đầu và ngày kết thúc.');
    const { start, end } = dashboardRange({ from: query.from, to: query.to }); filter.createdAt = { $gte: start, $lt: end };
  }
  // ID phải hợp lệ; mã nghiệp vụ và hành động được so khớp đúng chuỗi đã nhập.
  for (const field of ['actorId', 'targetId']) if (query[field]) filter[field] = objectId(query[field]);
  for (const field of ['targetCode', 'action', 'majorFeature']) if (query[field]) filter[field] = textField(query[field], field, 100);
  // Tìm văn bản trên chức năng/hành động/mã đối tượng, không cho từ khóa trở thành lệnh tìm kiếm.
  if (query.search) {
    const search = escapedSearch(textField(query.search, 'Từ khóa', 100));
    filter.$or = ['action', 'targetCode', 'majorFeature', 'subFeature'].map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
  }
  // UC-11: Cần biết đang truy vết ai hoặc đối tượng nào, tránh trả toàn bộ log dưới tên truy vết.
  if (trace && !filter.actorId && !filter.targetId && !filter.targetCode) throw httpError(400, 'Truy vết cần mã đối tượng, mã nghiệp vụ hoặc ID người thực hiện.');
  return { filter, page, limit };
};
// UC-10/11: Các nhật ký cũ có thể chứa snapshot; ẩn khóa bảo mật trước khi trả FE.
export const redactActivity = (value, depth = 0) => {
  // Giới hạn độ sâu và độ dài mảng của dữ liệu cũ để phản hồi không phình quá lớn.
  if (depth > 8) return '[Nội dung lồng sâu]';
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactActivity(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  // Loại khóa bảo mật ở mọi cấp trước khi đưa thông tin trước/sau lên giao diện.
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|token|secret|credential|session|googleId|otp|authorization|cookie/i.test(key))
    .map(([key, item]) => [key, redactActivity(item, depth + 1)]));
};
