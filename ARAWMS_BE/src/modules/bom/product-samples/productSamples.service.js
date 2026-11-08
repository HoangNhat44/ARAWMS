/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-20 - Chỉ xem mẫu sản phẩm, không thay đổi hay phê duyệt mẫu.
 */
import ProductSample from '../../../models/ProductSample.model.js';
import { readQuery, safeUrl } from '../../../common/utils/ownerReadQuery.js';
import { objectId } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';
// UC-20: Danh sách gọn gồm mã, tên, trạng thái và giá dự kiến; chi tiết chỉ tải khi mở mẫu.
export const listSamples = async (query) => {
  const { filter, page, limit } = readQuery(query, { statuses: ['IN_DEVELOPMENT', 'SAMPLE_READY', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] });
  const [items, total] = await Promise.all([ProductSample.find(filter).select('code name productCode status estimatedCost proposedPrice createdAt').sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit).limit(limit), ProductSample.countDocuments(filter)]);
  return { items, total, page, limit };
};
// UC-20: Chỉ đọc mẫu còn tồn tại; không thay trạng thái hoặc tự ghi nhận phê duyệt.
export const sampleDetail = async (id) => {
  objectId(id); const sample = await ProductSample.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!sample) throw httpError(404, 'Không tìm thấy mẫu sản phẩm.');
  // Loại link ảnh không an toàn trước khi FE hiển thị hoặc mở ảnh.
  const data = sample.toJSON(); data.imageUrls = (data.imageUrls || []).map(safeUrl).filter(Boolean); return data;
};
