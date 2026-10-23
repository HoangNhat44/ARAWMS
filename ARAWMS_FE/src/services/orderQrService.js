import api from "./api";

export const orderQrService = {
  listOrdersForQr: () => api.get('/order-qr/orders'),
  lookupOrderByCode: (code) => api.get('/order-qr/orders/lookup', { params: { code } }),
  issueQrForOrders: (orderIds) => api.post('/order-qr/orders/qr/bulk', { orderIds }),
  confirmOrder: (orderId) => api.post(`/order-qr/orders/${encodeURIComponent(orderId)}/confirm`),
  getOrderQr: (orderId) =>
    api.get(`/order-qr/orders/${encodeURIComponent(orderId)}/qr`),
  replaceOrderQr: (orderId) =>
    api.post(`/order-qr/orders/${encodeURIComponent(orderId)}/qr/replace`),
};
