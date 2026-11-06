import express from 'express';
import debtManagementController from './debtManagement.controller.js';
import {
  validateSupplierIdParam,
  validateUpdateCarrierConfigRequest,
  validateSettleCarrierCodPaymentRequest,
  validateSettleCarrierShippingFeeRequest,
} from './debtManagement.validation.js';

const router = express.Router();

/**
 * GET /api/financial/debts/suppliers
 * Lấy tổng quan công nợ NCC & phân loại tuổi nợ
 */
router.get('/suppliers', debtManagementController.getSupplierDebtOverview);

/**
 * GET /api/financial/debts/suppliers/:supplierId/ledger
 * Lấy sổ chi tiết công nợ của 1 NCC
 */
router.get(
  '/suppliers/:supplierId/ledger',
  validateSupplierIdParam,
  debtManagementController.getSupplierDebtLedger
);

/**
 * GET /api/financial/debts/carrier
 * Lấy tổng quan công nợ & bù trừ cước hãng vận chuyển GHN
 */
router.get('/carrier', debtManagementController.getCarrierDebtOverview);

/**
 * PATCH /api/financial/debts/carrier/config
 * Cấu hình mức cước phí thỏa thuận (baseShippingFee) cho GHN
 */
router.patch(
  '/carrier/config',
  validateUpdateCarrierConfigRequest,
  debtManagementController.updateCarrierConfig
);

/**
 * POST /api/financial/debts/carrier/settle-cod
 * Xác nhận đã thu tiền COD từ GHN (Tất toán công nợ)
 */
router.post(
  '/carrier/settle-cod',
  validateSettleCarrierCodPaymentRequest,
  debtManagementController.settleCarrierCodPayment
);

/**
 * POST /api/financial/debts/carrier/settle-shipping-fee
 * Xác nhận đã thanh toán cước phí cho GHN (Tất toán nợ cước)
 */
router.post(
  '/carrier/settle-shipping-fee',
  validateSettleCarrierShippingFeeRequest,
  debtManagementController.settleCarrierShippingFeePayment
);

export default router;

