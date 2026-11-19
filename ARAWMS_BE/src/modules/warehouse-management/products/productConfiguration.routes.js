/*
 * File: productConfiguration.routes.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Product setup, Excel import, variant and pricing endpoints. Mounted under /products/configuration
 * for warehouse managers and owners (see product.routes.js). Handlers are in productConfiguration.controller.js.
 */
import express from 'express';
import {
  syncOperation, previewImport, commitImport, createProduct, discontinuedStock, productConfiguration,
  updateProduct, createVariants, updateVariantPrice,
} from './productConfiguration.controller.js';

const router = express.Router();
const excelBody = express.raw({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'], limit: '5mb' });

router.post('/sync', syncOperation);
router.post('/import/preview', excelBody, previewImport);
router.post('/import', excelBody, commitImport);
router.post('/new', createProduct);
// Declared before GET /:id so the path is not treated as a product ID.
router.get('/discontinued-stock', discontinuedStock);
router.get('/:id', productConfiguration);
router.patch('/:id', updateProduct);
router.post('/:id/variants', createVariants);
router.patch('/:id/variants/:skuId', updateVariantPrice);

export default router;
