/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-18 - Nhận, xem báo cáo đã gửi và xác nhận đã xem.
 */
import ManagerReport from '../../../models/ManagerReport.model.js';
import { readQuery, safeUrl } from '../../../common/utils/ownerReadQuery.js';
import { objectId, objectFields, textField } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';
import { ownerAudit, ownerTransaction } from '../../../common/utils/ownerOperation.js';
// UC-18: Danh sách chỉ chứa báo cáo đã gửi; bản nháp của Manager chưa được đưa cho Owner.
export const listReports = async (query) => {
  const { filter, page, limit } = readQuery(query, { fields: ['code', 'title'], statuses: ['SUBMITTED', 'REVIEWED'] });
  filter.status ||= { $in: ['SUBMITTED', 'REVIEWED'] };
  const [items, total] = await Promise.all([ManagerReport.find(filter).select('code title reportType status submittedAt summary')
    .sort({ submittedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), ManagerReport.countDocuments(filter)]);
  return { items, total, page, limit };
};
// UC-18: Kiểm tra lại quyền xem bản ghi cụ thể và lấy tên người gửi/người đã xem.
export const reportDetail = async (id) => {
  objectId(id);
  const report = await ManagerReport.findOne({ _id: id, isDeleted: { $ne: true }, status: { $in: ['SUBMITTED', 'REVIEWED'] } })
    .populate('submittedBy', 'fullName employeeCode').populate('reviewedBy', 'fullName employeeCode');
  if (!report) throw httpError(404, 'Báo cáo chưa được gửi hoặc không tồn tại.');
  // Chỉ cho mở link HTTP/HTTPS hợp lệ; không đưa link chạy mã lên FE.
  const data = report.toJSON(); data.fileUrl = safeUrl(data.fileUrl); return data;
};
// UC-18: Xác nhận đã xem là một lần chuyển trạng thái, không phải phê duyệt nội dung báo cáo.
export const acknowledgeReport = async (req) => {
  objectId(req.params.id); objectFields(req.body, ['comment']);
  const comment = req.body.comment === '' || req.body.comment === undefined ? '' : textField(req.body.comment, 'Ghi chú', 2000);
  return ownerTransaction(async (session) => {
    const report = await ManagerReport.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).session(session);
    if (!report || report.status === 'DRAFT') throw httpError(404, 'Không tìm thấy báo cáo đã gửi.');
    // Chặn xác nhận lần hai hoặc ghi đè người đã xem trước đó.
    if (report.status !== 'SUBMITTED') throw httpError(409, 'Báo cáo đã được xác nhận xem.');
    // Ghi danh tính từ phiên đăng nhập; không nhận người duyệt hoặc ngày duyệt do FE gửi.
    report.status = 'REVIEWED'; report.reviewedBy = req.user._id; report.reviewedAt = new Date(); report.ownerComment = comment;
    await report.save({ session });
    // UC-10/11: Lưu dấu vết xác nhận trong cùng giao dịch với báo cáo.
    await ownerAudit(req, session, 'Managerial Financial Analytics', 'Manager Reports', 'REVIEW_MANAGER_REPORT',
      { collection: 'manager_reports', id: report._id, code: report.code }, { status: 'SUBMITTED' }, { status: 'REVIEWED', comment });
    return { id: String(report._id), status: report.status, reviewedAt: report.reviewedAt };
  });
};
