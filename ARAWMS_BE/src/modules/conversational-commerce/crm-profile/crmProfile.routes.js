import express from 'express';
import {
  createCustomer,
  updateCustomer,
  getCustomerInteractionHistory,
  getCustomerPurchaseHistory,
} from './crmProfile.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { validateCreateCustomer } from './crmProfile.validation.js';

const router = express.Router();

router.use(authenticate);
router.use(authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER'));

// UC-71: Tạo hồ sơ khách hàng mới
router.post('/', validateCreateCustomer, createCustomer);

// UC-70: Cập nhật thông tin hồ sơ khách hàng
router.put('/:id', updateCustomer);

// UC-75: Tra cứu lịch sử tương tác của khách
router.get('/:customerId/interaction-history', getCustomerInteractionHistory);

// UC-76: Tra cứu lịch sử mua hàng của khách
router.get('/:customerId/purchase-history', getCustomerPurchaseHistory);

export default router;
