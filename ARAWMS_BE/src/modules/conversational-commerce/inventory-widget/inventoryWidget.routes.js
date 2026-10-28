import express from 'express';
import { lookupRealtimeStock } from './inventoryWidget.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';

const router = express.Router();

router.use(authenticate);
router.use(authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'));

// UC-77: Tra cứu tồn kho khả dụng thời gian thực
router.get('/sku-lookup', lookupRealtimeStock);

export default router;
