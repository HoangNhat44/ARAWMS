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
/** UC-044. Điểm vào danh sách kế hoạch dùng chung, được trang Owner dùng làm nguồn hồ sơ sai lệch. */
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
  // Trả kế hoạch cùng kết quả KCS và thông tin hợp đồng sau khi kiểm tra mã.
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
router.post(
  // Ghi trình báo và tạo thông báo gắn hồ sơ sai lệch cho Owner.
  '/inbound-plans/:id/report-to-owner',
  validatePlanIdParam,
  inboundPlanningController.reportDeviationToOwner
);
router.patch(
  '/inbound-plans/:id',
  validatePlanIdParam,
  validatePlanStatusUpdate,
  inboundPlanningController.updateInboundPlanStatus
);

export default router;
