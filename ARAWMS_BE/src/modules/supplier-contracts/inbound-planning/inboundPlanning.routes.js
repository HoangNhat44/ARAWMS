import express from 'express';
import * as inboundPlanningController from './inboundPlanning.controller.js';
import {
  validateScheduleInboundPlan,
  validatePlanIdParam,
  validatePlanStatusUpdate,
} from './inboundPlanning.validation.js';

const router = express.Router();

// UC 05: Schedule Material Inbound Plan
router.get('/inbound-plans', inboundPlanningController.getInboundPlans);
router.post(
  '/inbound-plans',
  validateScheduleInboundPlan,
  inboundPlanningController.createInboundPlan
);
router.patch(
  '/inbound-plans/:id',
  validatePlanIdParam,
  validatePlanStatusUpdate,
  inboundPlanningController.updateInboundPlanStatus
);

export default router;
