/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-10, UC-11 - Đọc nhật ký có phân trang và truy vết theo đối tượng.
 */
import SystemLog from '../../../models/SystemLog.model.js';
import { activityFilter, redactActivity } from './systemActivity.validation.js';
export const listActivity = async (query, trace = false) => {
  const { filter, page, limit } = activityFilter(query, trace);
  // UC-10/11: Xếp mới nhất trước; dùng thêm ID để thứ tự ổn định khi hai log cùng thời điểm.
  const [items, total] = await Promise.all([
    SystemLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('actorId', 'employeeCode fullName roleCode').lean(), SystemLog.countDocuments(filter),
  ]);
  // Chỉ trả người thực hiện và dữ liệu đã che thông tin nhạy cảm; không gửi nguyên bản ghi log.
  return { items: items.map((log) => ({ id: String(log._id), createdAt: log.createdAt,
    actor: log.actorId ? { id: String(log.actorId._id), employeeCode: log.actorId.employeeCode, fullName: log.actorId.fullName } : null,
    actorRole: log.actorRole, majorFeature: log.majorFeature, subFeature: log.subFeature, action: log.action,
    targetCollection: log.targetCollection, targetId: log.targetId && String(log.targetId), targetCode: log.targetCode,
    ipAddress: log.ipAddress, beforeSnapshot: redactActivity(log.beforeSnapshot), afterSnapshot: redactActivity(log.afterSnapshot) })), total, page, limit };
};
