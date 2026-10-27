/**
 * ============================================================================
 * @title        : Seller API Service Client
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
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
  addTag: (id, tag) => api.post(`/conversations/${id}/tags`, { tag }),
  removeTag: (id, tag) => api.delete(`/conversations/${id}/tags/${encodeURIComponent(tag)}`),

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
  confirmOrderReserve: (id) => api.post(`/orders/${id}/confirm`),
  updateOrderStatus: (id, data) => api.patch(`/orders/${id}/status`, data),
  cancelOrder: (id, cancelReason) => api.post(`/orders/${id}/cancel`, { cancelReason }),

  // === REVERSE LOGISTICS RMA (UC-82, UC-83) ===
  getRmaList: (params) => api.get('/returns/rma', { params }),
  getRmaById: (id) => api.get(`/returns/rma/${id}`),
  createReturnRequest: (data) => api.post('/returns/rma', data),
  createExchangeOrder: (rmaId, data) => api.post(`/returns/rma/${rmaId}/create-exchange-order`, data),
};

export default sellerService;
