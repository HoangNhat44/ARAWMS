import api from "./api";

export const orderQrService = {
  list: () => api.get('/orders/qr-list'),
  lookup: (code) => api.get("/orders/lookup", { params: { code } }),
  issueBulk: (orderIds) => api.post('/orders/packing-qr/bulk', { orderIds }),
  confirm: (orderId) => api.post(`/orders/${encodeURIComponent(orderId)}/confirm`),
  issue: (orderId) =>
    api.post(`/orders/${encodeURIComponent(orderId)}/packing-qr`),
  replace: (orderId) =>
    api.post(`/orders/${encodeURIComponent(orderId)}/packing-qr/replace`),
  resolve: (qrValue) => api.post("/packing/resolve-qr", { qrValue }),
  prepare: (qrValue, stationId) => api.post('/packing/prepare', { qrValue, stationId }),
  heartbeat: (sessionId, stationId, leaseVersion) => api.post(`/packing/sessions/${sessionId}/heartbeat`, { stationId, leaseVersion }),
  release: (sessionId, stationId, leaseVersion) => api.post(`/packing/sessions/${sessionId}/release`, { stationId, leaseVersion }),
  scan: (sessionId, payload) => api.post(`/packing/sessions/${sessionId}/scans`, payload),
};
