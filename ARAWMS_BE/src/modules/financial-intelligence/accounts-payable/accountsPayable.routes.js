import express from 'express';
import * as accountsPayableController from './accountsPayable.controller.js';
import {
  validateCreatePaymentVoucher,
  validateUpdatePaymentVoucher,
  validateExecutePayment,
  validateCancelVoucher,
} from './accountsPayable.validation.js';

const router = express.Router();

// 1. Danh mục hạng mục chi
router.get('/categories', accountsPayableController.getExpenseCategories);

// 2. Danh sách phiếu chi & Chi tiết
router.get('/', accountsPayableController.listPaymentVouchers);
router.get('/:id', accountsPayableController.getPaymentVoucherById);

// 3. Tạo mới phiếu chi
router.post('/', validateCreatePaymentVoucher, accountsPayableController.createPaymentVoucher);

// 4. Chỉnh sửa phiếu chi nháp
router.put('/:id', validateUpdatePaymentVoucher, accountsPayableController.updatePaymentVoucher);

// 5. Kế toán xác nhận duyệt phiếu chi (DRAFT -> CONFIRMED)
router.patch('/:id/confirm', accountsPayableController.confirmPaymentVoucher);

// 6. Kế toán xác nhận chi tiền thực tế (CONFIRMED -> PAID, trừ nợ NCC)
router.post('/:id/execute-payment', validateExecutePayment, accountsPayableController.executePayment);

// 7. Hủy phiếu chi
router.patch('/:id/cancel', validateCancelVoucher, accountsPayableController.cancelPaymentVoucher);

export default router;

