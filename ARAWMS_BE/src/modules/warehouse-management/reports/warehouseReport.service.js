/*
 * File: warehouseReport.service.js
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Warehouse statistics reports written by the warehouse manager for the Owner. A report is a
 * ManagerReport of type INVENTORY: the data is built by warehouseReportSnapshot.js (never typed by hand),
 * the manager adds a comment per section, then sends it. Sending freezes the data for good and stamps it
 * with a SHA-256 hash; the Owner reads it under "Báo cáo quản lý".
 */
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import ManagerReport from '../../../models/ManagerReport.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import User from '../../../models/User.model.js';
import { requestError } from '../shared/warehouseHttp.js';
import { buildWarehouseSnapshot, REPORT_SCHEMA } from './warehouseReportSnapshot.js';

const COMMENT_KEYS = ['finishedGoods', 'materials', 'common'];
const MAX_DAYS = 366;
const DAY = 24 * 60 * 60 * 1000;
const TZ = '+07:00';

/** "YYYY-MM-DD" (Vietnam time) -> Date at the start of that day. */
const startOfDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00${TZ}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Validates an inclusive day range and returns the half-open [from, to) used by the snapshot. */
export const parsePeriod = (body) => {
  const from = startOfDay(body?.periodStart);
  const lastDay = startOfDay(body?.periodEnd);
  if (!from || !lastDay) throw requestError('Chọn ngày bắt đầu và ngày kết thúc của kỳ báo cáo', 'INVALID_PERIOD');
  if (lastDay < from) throw requestError('Ngày kết thúc phải sau ngày bắt đầu', 'INVALID_PERIOD');
  const to = new Date(lastDay.getTime() + DAY);
  if ((to - from) / DAY > MAX_DAYS) throw requestError('Kỳ báo cáo tối đa 366 ngày', 'INVALID_PERIOD');
  if (from.getTime() > Date.now()) throw requestError('Kỳ báo cáo không được bắt đầu sau hôm nay', 'INVALID_PERIOD');
  return { from, to };
};

/** Comments typed by the manager: one per section, up to 2000 characters each. */
const parseComments = (body) => {
  const source = body?.comments || {};
  if (typeof source !== 'object' || Array.isArray(source)) throw requestError('Nhận xét không hợp lệ', 'INVALID_COMMENTS');
  return Object.fromEntries(COMMENT_KEYS.map((key) => {
    const text = String(source[key] ?? '').trim();
    if (text.length > 2000) throw requestError('Mỗi nhận xét tối đa 2000 ký tự', 'INVALID_COMMENTS');
    return [key, text];
  }));
};

const assertId = (reportId) => {
  if (!mongoose.isValidObjectId(reportId)) throw requestError('Mã báo cáo không hợp lệ', 'INVALID_REPORT_ID');
};

const vnd = (value) => `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} đ`;
const day = (date) => new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10).split('-').reverse().join('/');

/** One-line summary shown in the Owner's report list. */
const summaryOf = (snapshot) => {
  const fg = snapshot.finishedGoods;
  const issues = Object.values(fg.attention.groups).reduce((sum, list) => sum + list.length, 0) +
    Object.values(snapshot.materials.attention).reduce((sum, list) => sum + list.length, 0);
  return `Thành phẩm: tồn ${fg.overview.onHand} chiếc, giá trị ${vnd(fg.overview.value)}. ` +
    `Nguyên phụ liệu: giá trị ${vnd(snapshot.materials.overview.value)}. ${issues} mục cần xử lý.`;
};

const hashOf = (content) => createHash('sha256').update(JSON.stringify(content)).digest('hex');

/** Report fields the warehouse page needs. */
const view = (report) => {
  const data = report.toJSON ? report.toJSON() : report;
  return { id: String(data._id || data.id), code: data.code, title: data.title, status: data.status,
    periodStart: data.periodStart, periodEnd: data.periodEnd, summary: data.summary, content: data.content,
    createdAt: data.createdAt, updatedAt: data.updatedAt, submittedAt: data.submittedAt || null,
    reviewedAt: data.reviewedAt || null, ownerComment: data.ownerComment || '' };
};

const findInventoryReport = async (reportId) => {
  assertId(reportId);
  const report = await ManagerReport.findOne({ _id: reportId, reportType: 'INVENTORY', isDeleted: { $ne: true } });
  if (!report) throw requestError('Không tìm thấy báo cáo', 'REPORT_NOT_FOUND', 404);
  return report;
};
const assertDraft = (report) => {
  if (report.status !== 'DRAFT') {
    throw requestError('Báo cáo đã gửi Owner, số liệu đã khóa và không sửa được', 'REPORT_LOCKED', 409);
  }
};

/** Report history, newest first (drafts and sent reports). */
export async function listWarehouseReports() {
  const reports = await ManagerReport.find({ reportType: 'INVENTORY', isDeleted: { $ne: true } })
    .select('code title status periodStart periodEnd summary createdAt submittedAt reviewedAt')
    .sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  return { items: reports.map(view) };
}

export async function getWarehouseReport(reportId) {
  return view(await findInventoryReport(reportId));
}

/** Creates a draft for the period with freshly built data. */
export async function createWarehouseReport(body, user) {
  const range = parsePeriod(body);
  const author = await User.findById(user._id).select('fullName employeeCode roleCode').lean();
  const snapshot = await buildWarehouseSnapshot(range);
  const month = day(new Date()).split('/').reverse().slice(0, 2).join('');
  const code = await CounterSequence.getNextSequence(`BCK-${month}`, `BCK-${month}`, 3);
  const report = await ManagerReport.create({
    code, reportType: 'INVENTORY', status: 'DRAFT',
    title: `Báo cáo kho ${day(range.from)} – ${day(new Date(range.to.getTime() - DAY))}`,
    periodStart: range.from, periodEnd: range.to, summary: summaryOf(snapshot), submittedBy: user._id,
    content: { ...snapshot, comments: parseComments(body),
      author: { id: String(user._id), name: author?.fullName || '', role: author?.roleCode || user.roleCode || '' } },
  });
  return view(report);
}

/** Rebuilds the data of a draft (optionally for a new period); the manager's comments are kept. */
export async function refreshWarehouseReport(reportId, body) {
  const report = await findInventoryReport(reportId);
  assertDraft(report);
  const range = body?.periodStart || body?.periodEnd ? parsePeriod(body)
    : { from: new Date(report.periodStart), to: new Date(report.periodEnd) };
  const snapshot = await buildWarehouseSnapshot(range);
  const comments = body?.comments ? parseComments(body) : report.content?.comments || {};
  report.set({ periodStart: range.from, periodEnd: range.to, summary: summaryOf(snapshot),
    title: `Báo cáo kho ${day(range.from)} – ${day(new Date(range.to.getTime() - DAY))}`,
    content: { ...snapshot, comments, author: report.content?.author } });
  report.markModified('content');
  await report.save();
  return view(report);
}

/** Saves the manager's comments on a draft. */
export async function saveWarehouseReportDraft(reportId, body) {
  const report = await findInventoryReport(reportId);
  assertDraft(report);
  report.set('content.comments', parseComments(body));
  report.markModified('content');
  await report.save();
  return view(report);
}

/** Sends the report: saves the last comments, freezes the data and stamps it with a hash. */
export async function submitWarehouseReport(reportId, body, user) {
  const report = await findInventoryReport(reportId);
  assertDraft(report);
  if (report.content?.schema !== REPORT_SCHEMA) throw requestError('Báo cáo chưa có số liệu', 'REPORT_EMPTY', 409);
  const content = { ...report.content, comments: parseComments(body) };
  const submittedAt = new Date();
  content.seal = { hash: hashOf({ ...content, seal: undefined }), sealedAt: submittedAt.toISOString(),
    sealedBy: content.author?.name || '' };
  // Only a draft can be sent; the condition stops two sends racing each other.
  const sent = await ManagerReport.findOneAndUpdate({ _id: report._id, status: 'DRAFT' },
    { $set: { content, status: 'SUBMITTED', submittedAt, submittedBy: user._id } }, { new: true });
  if (!sent) throw requestError('Báo cáo đã được gửi', 'REPORT_LOCKED', 409);
  return view(sent);
}

/** Drafts can be thrown away; a sent report stays for good. */
export async function deleteWarehouseReportDraft(reportId) {
  const report = await findInventoryReport(reportId);
  assertDraft(report);
  await ManagerReport.updateOne({ _id: report._id, status: 'DRAFT' }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { id: String(report._id) };
}
