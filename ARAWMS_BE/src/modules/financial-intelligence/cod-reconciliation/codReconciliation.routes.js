import express from 'express';
import * as controller from './codReconciliation.controller.js';
import {
  validateSyncCodRequest,
  validateResolveDisputeRequest,
  validateSimulateFeedbackRequest,
} from './codReconciliation.validation.js';

const router = express.Router();

// 1. Lấy danh sách các đơn hàng COD
router.get('/orders', controller.getCodOrdersList);

// 2. NÚT CHÍNH: Thực thi Đối soát Tự động qua API Giao Hàng Nhanh
router.post('/sync-ghn', validateSyncCodRequest, controller.executeAutomatedCodReconciliation);

// 3. Lấy danh sách cờ đỏ (Red Flag Discrepancies)
router.get('/red-flags', controller.getRedFlagDiscrepancies);

// 4. Lập khiếu nại / Xử lý tranh chấp cờ đỏ
router.post('/disputes/:itemId', validateResolveDisputeRequest, controller.resolveDispute);

// 4.1. Mô phỏng phản hồi kết quả điều tra từ GHN (Sandbox Simulator)
router.post(
  '/disputes/:itemId/simulate-feedback',
  validateSimulateFeedbackRequest,
  controller.simulateGhnDisputeFeedback
);

// 5. Nút bấm tạo 5 đơn hàng mẫu (4 đơn tiền mặt + 1 đơn chuyển khoản) phục vụ test
router.post('/seed-sample', controller.seedSampleOrders);

export default router;

