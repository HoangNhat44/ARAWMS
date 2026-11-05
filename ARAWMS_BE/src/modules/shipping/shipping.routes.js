import express from 'express';
import { deleteHandoverParcel, getCarrierHandovers, getGhnProvinceOptions, getGhnWardOptions, getShippingOrders, getShippingShipments, postConfirmHandover, postCreateHandover, postCreateShipment, postGhnWebhook, postPrintToken, postScanHandoverParcel } from './shipping.controller.js';

const router = express.Router();
router.post('/webhooks/ghn', postGhnWebhook);
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
