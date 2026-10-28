import express from 'express';
import {
  createReturnRequest,
  getRmaList,
  getRmaById,
} from './returnMerchandiseAuthorization.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { validateCreateRma } from './returnMerchandiseAuthorization.validation.js';

const router = express.Router();

router.use(authenticate);

// Danh sách & chi tiết RMA
router.get('/', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ACCOUNTANT'), getRmaList);
router.get('/:id', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ACCOUNTANT'), getRmaById);

// UC-82: Tiếp nhận và tạo yêu cầu đổi/trả hàng (RMA)
router.post('/', authorizeRole('SELLER', 'OWNER'), validateCreateRma, createReturnRequest);

export default router;
