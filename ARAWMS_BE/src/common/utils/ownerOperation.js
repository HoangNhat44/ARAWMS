/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Dùng chung giao dịch MongoDB và cách ghi nhật ký cho thao tác ghi của Owner.
 */
import mongoose from 'mongoose';
import SystemLog from '../../models/SystemLog.model.js';
import { httpError } from './httpError.js';

// Giao dịch chỉ thành công khi cả dữ liệu nghiệp vụ và nhật ký đều ghi được.
/** Chạy callback trong transaction và đổi lỗi trùng dữ liệu hoặc xung đột phiên bản thành HTTP 409 để giao diện có thể yêu cầu tải lại. */
export const ownerTransaction = async (work) => {
  try { return await mongoose.connection.transaction(work); }
  catch (error) {
    if (error.code === 11000) throw httpError(409, 'Dữ liệu đã tồn tại hoặc vừa được người khác thay đổi. Vui lòng tải lại.');
    if (error.name === 'VersionError') throw httpError(409, 'Dữ liệu đã thay đổi. Vui lòng tải lại.');
    throw error;
  }
};
// Truyền cùng session với thao tác nghiệp vụ để nhật ký được lưu hoặc hủy theo giao dịch.
/** Ghi người thao tác, đối tượng, dữ liệu trước/sau và ngữ cảnh yêu cầu để tra cứu trong UC-017. */
export const ownerAudit = (req, session, feature, subFeature, action, target, before, after) => SystemLog.create([{
  actorId: req.user._id, actorRole: req.user.roleCode, majorFeature: feature, subFeature, action,
  targetCollection: target.collection, targetId: target.id, targetCode: target.code,
  beforeSnapshot: before, afterSnapshot: after, ipAddress: req.ip, userAgent: req.get('user-agent'),
}], { session });
