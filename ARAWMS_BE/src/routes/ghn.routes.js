import express from 'express';
import {
  createGhnOrder,
  getGhnOrderDetail,
  getGhnShops,
  testGhnFlow,
} from '../controllers/ghn.controller.js';

const router = express.Router();

// 1-Click Test endpoint
router.post('/test', testGhnFlow);

// Create order
router.post('/orders', createGhnOrder);

// Get order detail
router.get('/orders/:orderCode', getGhnOrderDetail);
router.post('/orders/detail', getGhnOrderDetail);

// Get shops
router.get('/shops', getGhnShops);

export default router;
