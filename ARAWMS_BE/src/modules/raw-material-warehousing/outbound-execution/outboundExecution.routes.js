/*
 * File: outboundExecution.routes.js
 * Description: Exposes raw-material issue operations and the complete technician-request-picking-handover workflow.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  options,
  list,
  detail,
  create,
  update,
  check,
  confirm,
  cancel,
  listRequests,
  staffUsers,
  requestDetail,
  approveAndAssign,
  staffTasks,
  startPickingTask,
  scanBarcode,
  recordQuantity,
  removeSource,
  reportShortageTask,
  resolveShortageTask,
  reallocate,
  pauseTask,
  confirmHandover,
} from './outboundExecution.controller.js';

const router = express.Router();

router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authenticate, authorizeRole('OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'));
const manageOutbound = authorizeRole('OWNER', 'WAREHOUSE_MANAGER');

// Existing ticket endpoints
router.get('/options', options);
router.get('/tickets', list);
router.post('/tickets', manageOutbound, create);
router.get('/tickets/:id', manageOutbound, detail);
router.put('/tickets/:id', manageOutbound, update);
router.post('/tickets/:id/check', manageOutbound, check);
router.post('/tickets/:id/confirm', manageOutbound, confirm);
router.post('/tickets/:id/cancel', manageOutbound, cancel);

// New workflow routes
router.get('/requests', listRequests);
router.get('/staff-users', manageOutbound, staffUsers);
router.get('/requests/:id', requestDetail);
router.post('/requests/:id/approve-and-assign', manageOutbound, approveAndAssign);
router.post('/requests/:id/reallocate', manageOutbound, reallocate);
router.post('/requests/:id/resolve-shortage', manageOutbound, resolveShortageTask);
router.get('/staff-tasks', staffTasks);
router.post('/requests/:id/start-picking', startPickingTask);
router.post('/requests/:id/scan', scanBarcode);
router.post('/requests/:id/record-quantity', recordQuantity);
router.post('/requests/:id/remove-source', removeSource);
router.post('/requests/:id/report-shortage', reportShortageTask);
router.post('/requests/:id/pause', pauseTask);
router.post('/requests/:id/confirm-handover', confirmHandover);

export default router;
