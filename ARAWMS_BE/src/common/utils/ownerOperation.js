/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06..09, UC-18, OWNER-EXT-01..06 - Ghi thay đổi và nhật ký cùng giao dịch.
 */
import mongoose from 'mongoose';
import SystemLog from '../../models/SystemLog.model.js';
import { httpError } from './httpError.js';

// Giao dịch chỉ thành công khi cả dữ liệu nghiệp vụ và nhật ký đều ghi được.
export const ownerTransaction = async (work) => {
  try { return await mongoose.connection.transaction(work); }
  catch (error) {
    if (error.code === 11000) throw httpError(409, 'Dữ liệu đã tồn tại hoặc vừa được người khác thay đổi. Vui lòng tải lại.');
    if (error.name === 'VersionError') throw httpError(409, 'Dữ liệu đã thay đổi. Vui lòng tải lại.');
    throw error;
  }
};
// Nhật ký kỹ thuật: không gán GBR-23 cho audit log; GBR-23 là video kiểm hàng trả.
export const ownerAudit = (req, session, feature, subFeature, action, target, before, after) => SystemLog.create([{
  actorId: req.user._id, actorRole: req.user.roleCode, majorFeature: feature, subFeature, action,
  targetCollection: target.collection, targetId: target.id, targetCode: target.code,
  beforeSnapshot: before, afterSnapshot: after, ipAddress: req.ip, userAgent: req.get('user-agent'),
}], { session });
