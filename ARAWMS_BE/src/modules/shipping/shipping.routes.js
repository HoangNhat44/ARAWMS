import express from 'express';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../common/middlewares/authorizeRole.js';
import {
  deleteHandoverParcel,
  getCarrierHandovers,
  getGhnProvinceOptions,
  getGhnWardOptions,
  getHandedOverOrders,
  getHandoverReadyOrders,
  getShippingOrders,
  getShippingShipments,
  postConfirmHandover,
  postCreateHandover,
  postCreateShipment,
  postGhnWebhook,
  postPrintToken,
  postScanHandoverParcel,
  postScanOrderHandover,
} from './shipping.controller.js';

const router = express.Router();
// Gắn người thao tác nếu có token; không bắt buộc để giữ tương thích các màn hình cũ.
const optionalAuth = (req, res, next) => (/^Bearer\s+\S+$/i.test(req.headers.authorization || '') ? authenticate(req, res, next) : next());
router.get('/handover/ready', optionalAuth, getHandoverReadyOrders);
router.get('/handover/handed-over', optionalAuth, getHandedOverOrders);
router.post('/handover/scan', optionalAuth, postScanOrderHandover);
router.post('/webhooks/ghn', postGhnWebhook);
router.use(authenticate, authorizeRole('OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'));
router.get('/orders', getShippingOrders);
router.get('/shipments', getShippingShipments);
router.get('/handovers', getCarrierHandovers);
router.post('/handovers', postCreateHandover);
router.post('/handovers/:id/scan', postScanHandoverParcel);
router.delete('/handovers/:id/parcels/:waybillCode', deleteHandoverParcel);
router.post('/handovers/:id/confirm', postConfirmHandover);
router.get('/ghn/provinces', getGhnProvinceOptions);
router.get('/ghn/wards', getGhnWardOptions);
router.post('/orders/:orderId/shipments', postCreateShipment);
router.post('/shipments/:id/print-token', postPrintToken);
export default router;
