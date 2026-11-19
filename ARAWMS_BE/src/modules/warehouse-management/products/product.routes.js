/*
 * File: product.routes.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Finished-goods warehouse endpoints under /api/products. Owners, warehouse managers and warehouse
 * staff may read; writes are limited to owners and warehouse managers. Handlers are in product.controller.js.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import bulkStockRoutes from './bulkStock.routes.js';
import productConfigurationRoutes from './productConfiguration.routes.js';
import {
  locations, createLocation, products, issueStock, uploadMedia, barcodeTimeline, productDetail, shelfStock,
  productReceipts, receiptUnits, productLabels,
} from './product.controller.js';
import { defectUnits, defectOutbound } from './defectWarehouse.controller.js';

const router = express.Router();
const manageProducts = authorizeRole('OWNER', 'WAREHOUSE_MANAGER');

router.use(authenticate, authorizeRole('OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'));
router.use('/bulk', bulkStockRoutes);
router.use('/configuration', manageProducts, productConfigurationRoutes);

router.get('/locations', locations);
router.post('/locations', manageProducts, createLocation);
router.get('/', products);

// Defect warehouse: everyone in the warehouse can view; taking defective units out is a manager action.
router.get('/defects', defectUnits);
router.post('/defects/outbound', manageProducts, defectOutbound);

// Product detail page and barcode tracking (read-only; labels are rendered on demand for printing).
router.get('/units/:barcode/timeline', barcodeTimeline);
router.get('/:id/detail', productDetail);
router.get('/:id/shelf-stock', shelfStock);
router.get('/:id/receipts', productReceipts);
router.get('/:id/receipts/:documentId/units', receiptUnits);
router.post('/:id/labels', productLabels);

router.post('/:id/stock', manageProducts, issueStock);
router.put('/:id/:kind(image|video)', manageProducts, uploadMedia);
router.post('/:id/:kind(additional-image)', manageProducts, uploadMedia);

export default router;
