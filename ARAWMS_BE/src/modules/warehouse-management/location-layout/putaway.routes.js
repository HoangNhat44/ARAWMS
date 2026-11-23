/*
 * File: putaway.routes.js
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Barcode putaway endpoints under /api/warehouse-putaway. Scanning is limited to warehouse staff;
 * shortage and incident review and rack contents to owners and warehouse managers.
 * Handlers are in putaway.controller.js.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { putawayRole } from './layoutPermission.js';
import {
  materialTasks, materialLocations, materialReceiptLabels, verifyMaterialLocation, scanMaterial, tasks, receiptLabels,
  task, verifyLocation, scanUnit, reportShortage, reportIncident, issues, incidents, reviewIncident, resolveShortage,
  rack, binUnitPage, bulkPlan, bulkPlace,
} from './putaway.controller.js';

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authenticate);
const staff = putawayRole('WAREHOUSE_STAFF');
const manager = putawayRole('OWNER', 'WAREHOUSE_MANAGER');

// Raw-material putaway (warehouse staff).
router.get('/material-tasks', staff, materialTasks);
router.get('/material-locations', staff, materialLocations);
router.get('/material-receipts/:receiptId/labels', staff, materialReceiptLabels);
router.post('/material-tasks/location', staff, verifyMaterialLocation);
router.post('/material-tasks/scan', staff, scanMaterial);

// Finished-goods putaway (warehouse staff).
router.get('/tasks', staff, tasks);
router.get('/receipts/:receiptId/labels', staff, receiptLabels);
// Xếp hàng loạt các tem đã chọn: xem nhóm theo ô, rồi quét mã ô một lần cho cả nhóm.
router.post('/receipts/:receiptId/bulk-plan', staff, bulkPlan);
router.post('/receipts/:receiptId/bulk-place', staff, bulkPlace);
router.get('/tasks/:allocationId/:lineId', staff, task);
router.post('/tasks/:allocationId/:lineId/location', staff, verifyLocation);
router.post('/tasks/:allocationId/:lineId/scan', staff, scanUnit);
router.post('/tasks/:allocationId/:lineId/shortage', staff, reportShortage);
router.post('/tasks/:allocationId/:lineId/incident', staff, reportIncident);

// Review (owners and warehouse managers).
router.get('/issues', manager, issues);
router.get('/incidents', manager, incidents);
router.post('/incidents/:id/review', manager, reviewIncident);
router.post('/issues/:allocationId/:lineId/resolve', manager, resolveShortage);
router.get('/racks/:rackId/contents', manager, rack);
router.get('/bins/:binId/units', manager, binUnitPage);

export default router;
