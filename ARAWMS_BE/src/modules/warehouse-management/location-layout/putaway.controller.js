/*
 * File: putaway.controller.js
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: HTTP handlers for barcode putaway by warehouse staff and shortage/incident review by managers.
 */
import { handle } from '../shared/warehouseHttp.js';
import { assertReceiptId, parseShortageDecision } from './location.validation.js';
import { getMaterialReceiptLabels } from '../../raw-material-warehousing/inbound-execution/inboundExecution.service.js';
import { listMaterialPutawayTasks, listMaterialPutawayLocations, verifyMaterialPutawayLocation,
  scanMaterialPutawayTask } from './materialPutaway.service.js';
import { listPutawayTasks, getPutawayTask, verifyPutawayLocation, scanPutawayUnit, reportPutawayShortage,
  resolvePutawayShortage, rackContents, binUnits, listPutawayIssues, reportPutawayIncident, listPutawayIncidents,
  reviewPutawayIncident, listUnplacedReceiptLabels, bulkPutawayPlan, bulkPlaceUnits } from './putawayExecution.service.js';

const putawayErrors = {
  invalidId: { message: 'ID không hợp lệ', code: 'INVALID_ID' },
  conflict: { message: 'Tiến độ vừa thay đổi, hãy thử lại cùng mã quét', code: 'TASK_CHANGED' },
  duplicate: { message: 'Mã này đã được xác nhận', code: 'UNIT_ALREADY_PLACED' },
};
const run = (message, task, status) => handle(message, task, { ...putawayErrors, ...(status ? { status } : {}) });

// Raw materials (warehouse staff).
export const materialTasks = run('Nguyên phụ liệu chờ xếp', async (req) => ({ tasks: await listMaterialPutawayTasks(req.user) }));
export const materialLocations = run('Kệ nguyên phụ liệu', async (req) => ({ locations: await listMaterialPutawayLocations(req.user) }));
export const materialReceiptLabels = run('Tem nguyên phụ liệu đã cấp', (req) => getMaterialReceiptLabels(req.params.receiptId, req.user));
export const verifyMaterialLocation = run('Đúng kệ cần xếp',
  async (req) => ({ location: await verifyMaterialPutawayLocation(req.user, req.body || {}) }));
export const scanMaterial = run('Đã xếp nguyên phụ liệu', async (req) => ({ result: await scanMaterialPutawayTask(req.user, req.body || {}) }));

// Finished goods (warehouse staff).
export const tasks = run('Hàng chờ xếp', async () => ({ tasks: await listPutawayTasks() }));
export const receiptLabels = run('Tem của hàng còn chờ xếp', (req) => {
  assertReceiptId(req.params.receiptId);
  return listUnplacedReceiptLabels(req.params.receiptId);
});
// Xếp hàng loạt: xem trước nhóm theo ô, rồi quét mã ô một lần để xếp cả nhóm.
export const bulkPlan = run('Kế hoạch xếp hàng loạt', (req) => bulkPutawayPlan(req.params.receiptId, req.body?.barcodes, req.body?.locationCode));
export const bulkPlace = run('Đã xếp hàng loạt', async (req) => ({ result: await bulkPlaceUnits(req.user,
  req.params.receiptId, req.body || {}) }));
export const task = run('Dòng cần xếp', async (req) => ({ task: await getPutawayTask(req.params.allocationId, req.params.lineId) }));
export const verifyLocation = run('Đúng vị trí cần xếp', async (req) => ({ location: await verifyPutawayLocation(
  req.params.allocationId, req.params.lineId, req.body?.barcode) }));
export const scanUnit = run('Đã xếp sản phẩm', async (req) => ({ result: await scanPutawayUnit(req.user,
  req.params.allocationId, req.params.lineId, req.body || {}) }));
export const reportShortage = run('Đã báo quản lý kiểm tra hàng thiếu', async (req) => ({ task: await reportPutawayShortage(req.user,
  req.params.allocationId, req.params.lineId, req.body?.reason) }));
export const reportIncident = run('Đã báo sự cố cho quản lý', async (req) => ({ incident: await reportPutawayIncident(req.user,
  req.params.allocationId, req.params.lineId, req.body || {}) }), 201);

// Review (owners and warehouse managers).
export const issues = run('Báo thiếu chờ xử lý', async () => ({ issues: await listPutawayIssues() }));
export const incidents = run('Sự cố chờ xử lý', async () => ({ incidents: await listPutawayIncidents() }));
export const reviewIncident = run('Đã ghi kết quả xử lý sự cố', async (req) => ({ incident: await reviewPutawayIncident(req.user,
  req.params.id, req.body?.note) }));
export const resolveShortage = run('Đã xử lý báo thiếu', async (req) => {
  const accept = parseShortageDecision(req.body);
  return { task: await resolvePutawayShortage(req.user, req.params.allocationId, req.params.lineId, accept) };
});
export const rack = run('Hàng trong kệ', async (req) => ({ contents: await rackContents(req.params.rackId) }));
export const binUnitPage = run('Barcode đang ở ô', async (req) => ({ page: await binUnits(req.params.binId, req.query.page) }));
