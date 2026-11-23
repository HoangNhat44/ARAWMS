/*
 * File: stocktakeReview.service.js
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: Quản lý kho xem chi tiết báo cáo kiểm kê, duyệt báo cáo (kể cả khi còn lệch / chưa đếm đủ), hoặc trả báo cáo
 * không hợp lý về và phát phiên kiểm kê lại cho nhân viên kỹ thuật xưởng.
 * Vượt ngưỡng, còn dòng chưa đếm hoặc thiếu đơn giá không chặn duyệt; các vấn đề này được lưu vào approvalInfo.
 */
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import StocktakeRecord from '../../../models/StocktakeRecord.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import User from '../../../models/User.model.js';
import { objectFields, textField, numberField, versionField, objectId } from '../../../common/utils/ownerValidation.js';
import { ownerTransaction, ownerAudit } from '../../../common/utils/ownerOperation.js';
import { httpError } from '../../../common/utils/httpError.js';
import { reportData } from '../stock-adjustment/stockAdjustment.service.js';
import { planSession } from './stocktakeAdjustment.service.js';
import { notifyStocktakeScheduled, announceStocktakeStep, publishStocktakeChanged } from './stocktakeNotice.service.js';

/** Lý do duyệt / kiểm lại: chỉ cần có nội dung (không giới hạn tối thiểu), cho phép xuống dòng.
 * Ký tự điều khiển khác (ngoài xuống dòng, tab) bị loại bỏ thay vì báo lỗi. */
const reasonField = (value, label, max) => {
  const text = typeof value === 'string'
    ? value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/gu, '').trim() : '';
  if (!text) throw httpError(400, `Nhập ${label.toLowerCase()}.`);
  return text.slice(0, max);
};

const active = { isDeleted: { $ne: true } };
const ownerRequiredFor = (stocktake, summary) => !summary || summary.requiresOwner
  || stocktake.approvalInfo?.approvalLevelRequired === 'MAJOR_OWNER';
const fullyCounted = (rows) => rows.length > 0 && rows.every((row) => row.scannedAt);
const assertFresh = (stocktake, input, hash) => {
  if ((stocktake.approvalRevision || 0) !== input.expectedVersion || (hash && input.reportHash !== hash)) {
    throw httpError(409, 'Báo cáo đã thay đổi. Cần tải lại và kiểm tra trước khi xử lý.');
  }
};

const itemName = (record) => {
  if (record.skuId) return [record.skuId.skuCode, record.skuId.productName, record.skuId.color, record.skuId.size].filter(Boolean).join(' · ');
  if (record.rawMaterialId) return [record.rawMaterialId.materialCode, record.rawMaterialId.materialName, record.rawMaterialId.color].filter(Boolean).join(' · ');
  if (record.fabricRollId) return `Cuộn vải ${record.fabricRollId.rollBarcode || ''}`.trim();
  return '';
};

export async function stocktakeReport(id) {
  objectId(id);
  const report = await reportData(id, null, { requireCost: false });
  const [stocktake, records] = await Promise.all([
    StocktakeSession.findById(id)
      .populate('inspectorId approverId createdByManagerId approvalInfo.approvedByUserId recountInfo.requestedByUserId adjustmentInfo.adjustedByUserId', 'fullName employeeCode roleCode')
      .populate('recountOfSessionId recountInfo.recountSessionId', 'sessionCode status')
      .lean(),
    StocktakeRecord.find({ sessionId: id, ...active })
      .populate('locationId', 'locationCode zoneCode rackCode')
      .populate('skuId', 'skuCode productName color size')
      .populate('rawMaterialId', 'materialCode materialName color unit')
      .populate('fabricRollId', 'rollBarcode')
      .lean(),
  ]);
  const plans = new Map((await planSession(records)).map(({ record, plan }) => [String(record._id), plan]));
  const extra = new Map(records.map((record) => [String(record._id), {
    locationCode: record.locationId?.locationCode || '', itemName: itemName(record), unit: record.rawMaterialId?.unit || '',
    conditionNote: record.conditionNote || '', adjustment: record.adjustment?.action ? record.adjustment : null,
    plan: plans.get(String(record._id)) }]));
  const rows = report.records.map((row) => ({ ...row, ...extra.get(row.id) }));
  const ownerRequired = ownerRequiredFor(stocktake, report.summary);
  const reviewable = stocktake.status === 'VARIANCE_REVIEW' && !stocktake.approvalInfo?.approvedAt;
  return { stocktake: { ...stocktake, id: String(stocktake._id) }, records: rows, summary: report.summary,
    missingCost: report.missingCost, reportHash: report.reportHash, thresholds: report.thresholds,
    ownerRequired, counted: fullyCounted(rows),
    uncountedCount: rows.filter((row) => !row.scannedAt).length,
    // Quản lý kho được duyệt mọi báo cáo đang chờ duyệt; vượt ngưỡng / chưa đếm đủ chỉ là cảnh báo và được ghi lại khi duyệt.
    canApprove: reviewable, canRequestRecount: reviewable,
    canAdjust: stocktake.status === 'APPROVED_PENDING_ADJUSTMENT' };
}

export async function approveStocktakeByManager(req) {
  objectId(req.params.id);
  const body = req.body || {};
  objectFields(body, ['expectedVersion', 'reportHash', 'adjustmentReason']);
  if (typeof body.reportHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.reportHash)) throw httpError(400, 'Cần mở lại báo cáo kiểm kê trước khi duyệt.');
  const input = { expectedVersion: versionField(body.expectedVersion), reportHash: body.reportHash,
    adjustmentReason: reasonField(body.adjustmentReason, 'Lý do duyệt', 2000) };
  const result = await ownerTransaction(async (session) => {
    const { stocktake, records, summary, missingCost, reportHash } = await reportData(req.params.id, session, { requireCost: false });
    if (stocktake.status !== 'VARIANCE_REVIEW' || stocktake.approvalInfo?.approvedAt) throw httpError(409, 'Phiên không còn ở trạng thái chờ duyệt.');
    assertFresh(stocktake, input, reportHash);
    // Không chặn khi lệch vượt ngưỡng, còn dòng chưa đếm (tính là thiếu) hay thiếu đơn giá; ghi rõ các vấn đề này vào phần duyệt.
    const uncountedCount = records.filter((row) => !row.scannedAt).length;
    if (await InventoryTransaction.exists({ referenceId: stocktake._id, transactionType: 'STOCKTAKE_ADJUSTMENT', ...active }).session(session)) {
      throw httpError(409, 'Phiên đã có bút toán điều chỉnh. Cần đối soát trước khi duyệt.');
    }
    const before = { status: stocktake.status, approvalInfo: stocktake.approvalInfo };
    // GBR-18: duyệt chưa phải ghi sổ; tồn kho chỉ đổi khi thực hiện điều chỉnh.
    stocktake.status = 'APPROVED_PENDING_ADJUSTMENT';
    stocktake.approvalRevision = input.expectedVersion + 1;
    stocktake.approvalInfo = { approvalLevelRequired: 'MINOR_MANAGER', approvedByUserId: req.user._id, approvedAt: new Date(),
      adjustmentReason: input.adjustmentReason, approvedReportHash: reportHash,
      exceededThreshold: ownerRequiredFor(stocktake, summary), uncountedCount, missingCost };
    await stocktake.save({ session });
    await ownerAudit(req, session, 'Inventory Auditing', 'Stocktake Review', 'MANAGER_APPROVE_INVENTORY_VARIANCE',
      { collection: 'stocktake_sessions', id: stocktake._id, code: stocktake.sessionCode }, before,
      { status: stocktake.status, approvalInfo: stocktake.approvalInfo, summary });
    return { stocktake, summary };
  });
  announceStocktakeStep(result.stocktake, 'APPROVED', req.user);
  return result;
}

// Kiểm lại theo khung giờ cụ thể: ngày + từ giờ – đến giờ (giờ Việt Nam). Không gửi thì bắt đầu ngay, hạn theo durationHours.
const recountWindow = (body) => {
  if (body.date === undefined && body.startTime === undefined && body.endTime === undefined) return null;
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !clock.test(body.startTime || '') || !clock.test(body.endTime || '')) {
    throw httpError(400, 'Chọn ngày, giờ bắt đầu và giờ kết thúc kiểm kê lại.');
  }
  const from = new Date(`${body.date}T${body.startTime}:00+07:00`);
  const to = new Date(`${body.date}T${body.endTime}:00+07:00`);
  if (Number.isNaN(from.getTime()) || to - from < 15 * 60000) throw httpError(400, 'Giờ kết thúc phải sau giờ bắt đầu ít nhất 15 phút (trong cùng ngày).');
  if (to <= new Date()) throw httpError(400, 'Khung giờ kiểm kê lại đã qua, hãy chọn giờ khác.');
  return { from, to };
};

export async function requestStocktakeRecount(req) {
  objectId(req.params.id);
  const body = req.body || {};
  objectFields(body, ['expectedVersion', 'reason', 'inspectorId', 'durationHours', 'date', 'startTime', 'endTime']);
  const input = { expectedVersion: versionField(body.expectedVersion),
    reason: reasonField(body.reason, 'Lý do kiểm kê lại', 1000),
    inspectorId: body.inspectorId === undefined || body.inspectorId === '' ? null : objectId(body.inspectorId),
    durationHours: body.durationHours === undefined ? 2 : numberField(body.durationHours, 'Hạn hoàn thành (giờ)', 1, 72, true),
    window: recountWindow(body) };
  const result = await ownerTransaction(async (session) => {
    const original = await StocktakeSession.findOne({ _id: req.params.id, ...active }).session(session);
    if (!original) throw httpError(404, 'Không tìm thấy phiên kiểm kê.');
    if (original.status !== 'VARIANCE_REVIEW' || original.approvalInfo?.approvedAt) throw httpError(409, 'Chỉ báo cáo đang chờ duyệt mới được yêu cầu kiểm kê lại.');
    assertFresh(original, input);
    const inspectorId = input.inspectorId || original.inspectorId;
    const inspector = inspectorId && await User.findOne({ _id: inspectorId, status: 'ACTIVE', ...active }).select('roleCode').session(session).lean();
    if (inspector?.roleCode !== 'GARMENT_TECHNICIAN') throw httpError(400, 'Người kiểm kê lại phải là nhân viên kỹ thuật xưởng đang hoạt động.');

    const now = new Date();
    const sessionCode = await CounterSequence.getNextSequence('STOCKTAKE_SESSION', 'KK', 6, { session });
    const instructions = [`Kiểm kê lại phiên ${original.sessionCode}. Lý do: ${input.reason}`, original.instructions].filter(Boolean).join('\n').slice(0, 2000);
    // Phiên kiểm lại giữ nguyên phạm vi phiên gốc và bắt đầu ngay; nhân viên kỹ thuật thấy nó trong danh sách chờ kiểm.
    const [recount] = await StocktakeSession.create([{ sessionCode, name: `Kiểm lại ${original.sessionCode}${original.name ? ` · ${original.name}` : ''}`.slice(0, 200),
      warehouseType: original.warehouseType, scopeType: original.scopeType, zoneCode: original.zoneCode, rackId: original.rackId,
      itemType: original.itemType, itemId: original.itemId, scopeLocationIds: original.scopeLocationIds,
      createdByManagerId: req.user._id, inspectorId, approverId: original.approverId, instructions,
      scheduledAt: input.window?.from || now, dueAt: input.window?.to || new Date(now.getTime() + input.durationHours * 3600000),
      status: 'WAITING', totalItemsExpected: 0, recountOfSessionId: original._id }], { session });

    const before = { status: original.status, recountInfo: original.recountInfo };
    original.status = 'RECOUNT_REQUESTED';
    original.approvalRevision = input.expectedVersion + 1;
    original.recountInfo = { requestedByUserId: req.user._id, requestedAt: now, reason: input.reason, recountSessionId: recount._id };
    await original.save({ session });
    await ownerAudit(req, session, 'Inventory Auditing', 'Stocktake Review', 'REQUEST_STOCKTAKE_RECOUNT',
      { collection: 'stocktake_sessions', id: original._id, code: original.sessionCode }, before,
      { status: original.status, recountInfo: original.recountInfo, recountSessionCode: recount.sessionCode });
    return { stocktake: original, recount };
  });
  // Báo sau khi giao dịch đã chốt, để không gửi thông báo cho một phiên bị hoàn tác.
  await notifyStocktakeScheduled(result.recount, req.user, { recount: true });
  // Người kiểm phiên gốc biết báo cáo bị trả về (người kiểm lại đã nhận lịch qua notifyStocktakeScheduled).
  if (String(result.stocktake.inspectorId || '') !== String(result.recount.inspectorId || '')) {
    announceStocktakeStep(result.stocktake, 'RECOUNT', req.user, { reason: input.reason, recountCode: result.recount.sessionCode });
  } else publishStocktakeChanged(result.stocktake, 'RECOUNT');
  return result;
}
