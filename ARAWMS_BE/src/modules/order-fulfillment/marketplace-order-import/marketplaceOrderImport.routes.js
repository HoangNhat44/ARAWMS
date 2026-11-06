/**
 * ============================================================================
 * @title        : Marketplace Order Import Routes
 * @author       : AraStore Backend Team
 * @createdDate  : 2026-11-02
 * @description  : Định tuyến các API phục vụ import đơn hàng sàn Shopee/TikTok/Excel
 *                 và quy trình phê duyệt kho.
 * ============================================================================
 */

import express from 'express';
import multer from 'multer';
import {
  getSalesChannels,
  getChannelsSummary,
  previewExcelImport,
  processImportOrders,
  approveImportedOrder,
  approveImportedOrdersBulk,
  downloadExcelTemplate,
  autoProvisionSkus,
} from './marketplaceOrderImport.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const router = express.Router();

router.use(authenticate);

// 1. Lấy danh sách kênh bán hàng đa nguồn thực tế từ DB
router.get('/channels', getSalesChannels);

// 1.1 Lấy tóm tắt trạng thái kết nối đa kênh từ DB (dùng cho TopHeader Chips)
router.get('/channels/summary', getChannelsSummary);

// 2. Tải file template Excel mẫu
router.get('/template', downloadExcelTemplate);

// 3. Seller upload và preview file Excel trước khi xử lý
router.post(
  '/preview-excel',
  authorizeRole('SELLER', 'OWNER'),
  upload.single('file'),
  previewExcelImport
);

// 4. Seller thực hiện "Xử lý đơn" (Tạo các đơn hàng vào hệ thống)
router.post(
  '/process-orders',
  authorizeRole('SELLER', 'OWNER'),
  processImportOrders
);

// 4b. Tự động tạo sản phẩm & SKU kho cho các sản phẩm chưa có
router.post(
  '/auto-provision-skus',
  authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'),
  autoProvisionSkus
);

// 5. Warehouse / Quản lý / Seller duyệt 1 đơn hàng import
router.post(
  '/:id/warehouse-approve',
  authorizeRole('WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER', 'OWNER', 'SELLER'),
  approveImportedOrder
);

// 6. Warehouse / Quản lý / Seller duyệt hàng loạt đơn hàng import
router.post(
  '/warehouse-approve-bulk',
  authorizeRole('WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER', 'OWNER', 'SELLER'),
  approveImportedOrdersBulk
);

export default router;
