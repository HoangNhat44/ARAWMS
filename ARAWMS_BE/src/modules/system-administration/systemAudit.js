/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: GBR-23 - Lưu người thực hiện và thông tin thao tác thay đổi tài
 * khoản.
 */

import SystemLog from '../../models/SystemLog.model.js';

// GBR-23: Lưu người thao tác, chức năng, dữ liệu thay đổi và thông tin yêu cầu.
export const recordAccountActivity = (req, user, subFeature, action, snapshots = {}) => SystemLog.create({
  actorId: user._id,
  actorRole: user.roleCode,
  majorFeature: 'System Administration',
  subFeature,
  action,
  targetCollection: 'users',
  targetId: user._id,
  targetCode: user.employeeCode,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
  ...snapshots,
});
