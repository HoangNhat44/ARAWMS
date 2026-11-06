import express from 'express';
import * as inboundPlanningController from './inboundPlanning.controller.js';
import {
  validateScheduleInboundPlan,
  validatePlanIdParam,
  validatePlanStatusUpdate,
  validateAmendInboundPlan,
} from './inboundPlanning.validation.js';

const router = express.Router();

// UC: Lập kế hoạch lịch trình tiếp nhận nguyên phụ liệu
router.get('/inbound-plans', inboundPlanningController.getInboundPlans);
router.get(
  '/inbound-plans/contract-summary/:contractId',
  inboundPlanningController.getContractInboundSummary
);
router.get(
  '/inbound-plans/:id/versions',
  validatePlanIdParam,
  inboundPlanningController.getPlanVersions
);
router.get(
  '/inbound-plans/:id',
  validatePlanIdParam,
  inboundPlanningController.getInboundPlanById
);
router.post(
  '/inbound-plans',
  validateScheduleInboundPlan,
  inboundPlanningController.createInboundPlan
);
router.post(
  '/inbound-plans/:id/amend',
  validatePlanIdParam,
  validateAmendInboundPlan,
  inboundPlanningController.amendInboundPlan
);
router.post(
  '/inbound-plans/:id/verify',
  validatePlanIdParam,
  inboundPlanningController.verifyInboundPlanDelivery
);
router.patch(
  '/inbound-plans/:id',
  validatePlanIdParam,
  validatePlanStatusUpdate,
  inboundPlanningController.updateInboundPlanStatus
);

export default router;
