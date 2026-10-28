/*
 * File: putaway.routes.js
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Exposes staff barcode putaway and manager rack-content review endpoints. Authentication and role gates keep scanning separate from layout administration.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { listPutawayTasks, getPutawayTask, verifyPutawayLocation, scanPutawayUnit,
  reportPutawayShortage, resolvePutawayShortage, rackContents, binUnits,
  listPutawayIssues, reportPutawayIncident, listPutawayIncidents,
  reviewPutawayIncident } from './putawayExecution.service.js';

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authenticate);

/** Restricts physical scans to warehouse staff and review actions to managers. */
const role = (...allowed) => (req, res, next) => allowed.some((item) => req.user.roles?.includes(item))
  ? next() : sendError(res, 'Không có quyền thao tác xếp hàng', { code: 'FORBIDDEN' }, 403);

/** Converts expected business rejections into stable client error codes. */
const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res); }
  catch (error) {
    if (error.name === 'CastError') return sendError(res, 'ID không hợp lệ', { code: 'INVALID_ID' }, 400);
    if (error.code === 112 || error.hasErrorLabel?.('TransientTransactionError'))
      return sendError(res, 'Tiến độ vừa thay đổi, hãy thử lại cùng mã quét',
        { code: 'TASK_CHANGED' }, 409);
    if (error.code === 11000) return sendError(res, 'Mã này đã được xác nhận',
      { code: 'UNIT_ALREADY_PLACED' }, 409);
    if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
    next(error);
  }
};

router.get('/tasks', role('WAREHOUSE_STAFF'), handle(async (req, res) =>
  sendSuccess(res, 'Hàng chờ xếp', { tasks: await listPutawayTasks() })));
router.get('/tasks/:allocationId/:lineId', role('WAREHOUSE_STAFF'), handle(async (req, res) =>
  sendSuccess(res, 'Dòng cần xếp', { task: await getPutawayTask(req.params.allocationId,
    req.params.lineId) })));
router.post('/tasks/:allocationId/:lineId/location', role('WAREHOUSE_STAFF'), handle(async (req, res) =>
  sendSuccess(res, 'Đúng vị trí cần xếp', { location: await verifyPutawayLocation(
    req.params.allocationId, req.params.lineId, req.body?.barcode) })));
router.post('/tasks/:allocationId/:lineId/scan', role('WAREHOUSE_STAFF'), handle(async (req, res) =>
  sendSuccess(res, 'Đã xếp sản phẩm', { result: await scanPutawayUnit(req.user,
    req.params.allocationId, req.params.lineId, req.body || {}) })));
router.post('/tasks/:allocationId/:lineId/shortage', role('WAREHOUSE_STAFF'), handle(async (req, res) =>
  sendSuccess(res, 'Đã báo quản lý kiểm tra hàng thiếu', { task: await reportPutawayShortage(req.user,
    req.params.allocationId, req.params.lineId, req.body?.reason) })));
router.post('/tasks/:allocationId/:lineId/incident', role('WAREHOUSE_STAFF'), handle(async (req, res) =>
  sendSuccess(res, 'Đã báo sự cố cho quản lý', { incident: await reportPutawayIncident(req.user,
    req.params.allocationId, req.params.lineId, req.body || {}) }, 201)));

router.get('/issues', role('OWNER', 'WAREHOUSE_MANAGER'), handle(async (req, res) =>
  sendSuccess(res, 'Báo thiếu chờ xử lý', { issues: await listPutawayIssues() })));
router.get('/incidents', role('OWNER', 'WAREHOUSE_MANAGER'), handle(async (req, res) =>
  sendSuccess(res, 'Sự cố chờ xử lý', { incidents: await listPutawayIncidents() })));
router.post('/incidents/:id/review', role('OWNER', 'WAREHOUSE_MANAGER'), handle(async (req, res) =>
  sendSuccess(res, 'Đã ghi kết quả xử lý sự cố', { incident: await reviewPutawayIncident(req.user,
    req.params.id, req.body?.note) })));
router.post('/issues/:allocationId/:lineId/resolve', role('OWNER', 'WAREHOUSE_MANAGER'),
  handle(async (req, res) => {
    if (typeof req.body?.accept !== 'boolean')
      return sendError(res, 'Cần chọn chấp nhận hoặc trả lại để xếp tiếp',
        { code: 'INVALID_DECISION' }, 400);
    return sendSuccess(res, 'Đã xử lý báo thiếu', { task: await resolvePutawayShortage(req.user,
      req.params.allocationId, req.params.lineId, req.body.accept) });
  }));
router.get('/racks/:rackId/contents', role('OWNER', 'WAREHOUSE_MANAGER'), handle(async (req, res) =>
  sendSuccess(res, 'Hàng trong kệ', { contents: await rackContents(req.params.rackId) })));
router.get('/bins/:binId/units', role('OWNER', 'WAREHOUSE_MANAGER'), handle(async (req, res) =>
  sendSuccess(res, 'Barcode đang ở ô', { page: await binUnits(req.params.binId, req.query.page) })));

export default router;
