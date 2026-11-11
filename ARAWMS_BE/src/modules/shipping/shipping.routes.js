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
// Quét bàn giao đổi trạng thái đơn nên bắt buộc đăng nhập đúng vai trò kho; chỉ ShippingPage gọi và luôn gửi token.
const warehouseAuth = [authenticate, authorizeRole('OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF')];
router.get('/handover/ready', ...warehouseAuth, getHandoverReadyOrders);
router.get('/handover/handed-over', ...warehouseAuth, getHandedOverOrders);
router.post('/handover/scan', ...warehouseAuth, postScanOrderHandover);
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
