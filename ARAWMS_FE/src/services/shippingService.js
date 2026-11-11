import api from './api';

export const shippingService = {
  getHandoverReady: () => api.get('/shipping/handover/ready'),
  getHandedOver: () => api.get('/shipping/handover/handed-over'),
  scanOrderHandover: (code) => api.post('/shipping/handover/scan', { code }),
  getOrders: () => api.get('/shipping/orders'),
  getShipments: () => api.get('/shipping/shipments'),
  getHandovers: () => api.get('/shipping/handovers'),
  createHandover: (payload) => api.post('/shipping/handovers', payload),
  scanHandoverParcel: (handoverId, code, scannedByName) => api.post(`/shipping/handovers/${handoverId}/scan`, { code, scannedByName }),
  removeHandoverParcel: (handoverId, waybillCode) => api.delete(`/shipping/handovers/${handoverId}/parcels/${encodeURIComponent(waybillCode)}`),
  confirmHandover: (handoverId) => api.post(`/shipping/handovers/${handoverId}/confirm`, { confirmed: true }),
  getProvinces: () => api.get('/shipping/ghn/provinces'),
  getWards: (provinceId) => api.get('/shipping/ghn/wards', { params: { provinceId } }),
  createShipment: (orderId, payload) => api.post(`/shipping/orders/${orderId}/shipments`, payload),
  getPrintToken: (shipmentId) => api.post(`/shipping/shipments/${shipmentId}/print-token`),
};
