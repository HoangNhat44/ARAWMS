/**
 * ============================================================================
 * @title        : Seller API Service Client
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-14
 * @description  : Module kết nối và đóng gói toàn bộ các cuộc gọi API từ Front-end
 *                 cho phân hệ Seller (UC-69 đến UC-83), tích hợp Axios client.
 * @module       : Conversational Commerce / Seller Service
 * @layer        : Front-end
 * ============================================================================
 */

import api from './api';

export const sellerService = {
  // === CONVERSATIONS & CHAT (UC-69, UC-72, UC-73, UC-74) ===
  getConversations: (params) => api.get('/conversations', { params }),
  getConversationById: (id) => api.get(`/conversations/${id}`),
  getConversationMessages: (id, params) => api.get(`/conversations/${id}/messages`, { params }),
  sendMessage: (id, data) => api.post(`/conversations/${id}/messages`, data),
  sendAttachments: (id, formData) => api.post(`/conversations/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  addTag: (id, tag) => api.post(`/conversations/${id}/tags`, { tag }),
  removeTag: (id, tag) => api.delete(`/conversations/${id}/tags/${encodeURIComponent(tag)}`),
  markConversationAsRead: (id) => api.patch(`/conversations/${id}/read`),

  // === TAG MANAGEMENT (UC-73 - Tags lưu DB) ===
  getTagList: () => api.get('/conversations/tags/list'),
  createCustomTag: (data) => api.post('/conversations/tags/create', data),
  deleteCustomTag: (tagId) => api.delete(`/conversations/tags/${tagId}`),

  // === CRM CUSTOMER (UC-70, UC-71, UC-75, UC-76) ===
  createCustomer: (data) => api.post('/conversations/customers', data),
  updateCustomer: (id, data) => api.put(`/conversations/customers/${id}`, data),
  getCustomerInteractionHistory: (customerId) => api.get(`/conversations/customers/${customerId}/interaction-history`),
  getCustomerPurchaseHistory: (customerId) => api.get(`/conversations/customers/${customerId}/purchase-history`),

  // === INVENTORY SKU WIDGET (UC-77) ===
  lookupRealtimeStock: (search) => api.get('/conversations/inventory/sku-lookup', { params: { search } }),

  // === RETAIL ORDER MANAGEMENT (UC-78, UC-79, UC-80, UC-81) ===
  getOrderList: (params) => api.get('/orders', { params }),
  getOrderById: (id) => api.get(`/orders/${id}`),
  createDirectOrder: (orderData) => api.post('/orders', orderData),
  createPosDirectOrder: (orderData) => api.post('/orders/pos-direct', orderData),
  updateOrderItems: (id, data) => api.put(`/orders/${id}/items`, data),
  confirmOrderReserve: (id) => api.post(`/orders/${id}/confirm`),
  sendOrderConfirmationReceipt: (id) => api.post(`/orders/${id}/send-confirmation`),
  simulateCustomerConfirm: (id) => api.post(`/orders/${id}/simulate-confirm`),
  syncOrderWithGhn: (id) => api.post(`/orders/${id}/sync-ghn`),
  switchOrderGhnStatus: (id, ghnStatus) => api.post(`/orders/${id}/ghn-status`, { ghnStatus }),
  cancelOrder: (id, cancelReason) => api.post(`/orders/${id}/cancel`, { cancelReason }),

  // === REVERSE LOGISTICS RMA (UC-82, UC-83 - GBR-11, GBR-12, GBR-13, GBR-23) ===
  getRmaList: (params) => api.get('/returns/rma', { params }),
  getRmaById: (id) => api.get(`/returns/rma/${id}`),
  createReturnRequest: (data) => api.post('/returns/rma', data),
  createExchangeOrder: (rmaId, data) => api.post(`/returns/rma/${rmaId}/create-exchange-order`, data),

  // === HOÀN TIỀN: Seller gửi yêu cầu -> Kế toán duyệt -> lập phiếu chi (GBR-14) ===
  submitRefundRequest: (rmaId, data) => api.post(`/returns/rma/${rmaId}/refund-request`, data),
  getRefundRequests: (params) => api.get('/returns/rma/refund-requests', { params }),
  approveRefundRequest: (rmaId, data) => api.post(`/returns/rma/${rmaId}/refund-approve`, data),
  rejectRefundRequest: (rmaId, data) => api.post(`/returns/rma/${rmaId}/refund-reject`, data),

  // === MARKETPLACE IMPORT & PROCESS (Mentor Feedback 4.3.3) ===
  getMarketplaceChannels: () => api.get('/orders/marketplace/channels'),
  downloadExcelTemplate: (channel) => api.get('/orders/marketplace/template', { params: { channel }, responseType: 'blob' }),
  previewExcelImport: (formData) => api.post('/orders/marketplace/preview-excel', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  autoProvisionSkus: (items) => api.post('/orders/marketplace/auto-provision-skus', { items }),
  processImportOrders: (data) => api.post('/orders/marketplace/process-orders', data),
  warehouseApproveOrder: (id) => api.post(`/orders/marketplace/${id}/warehouse-approve`),
  warehouseApproveOrdersBulk: (orderIds) => api.post('/orders/marketplace/warehouse-approve-bulk', { orderIds }),
};

export default sellerService;
