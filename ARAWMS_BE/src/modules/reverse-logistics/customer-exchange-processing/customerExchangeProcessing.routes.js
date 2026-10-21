import express from 'express';
import { createExchangeOrder } from './customerExchangeProcessing.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { validateCreateExchangeOrder } from './customerExchangeProcessing.validation.js';

const router = express.Router();

router.use(authenticate);

// UC-83: Tạo đơn hàng đổi sản phẩm mới
router.post('/:rmaId/create-exchange-order', authorizeRole('SELLER', 'OWNER'), validateCreateExchangeOrder, createExchangeOrder);

export default router;
