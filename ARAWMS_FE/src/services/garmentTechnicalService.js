/*
 * File: garmentTechnicalService.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Client API calls for Garment Technician (KCS) features: Inbound Verification & Finished Goods Inspection.
 */
import api from './api';

export const garmentTechnicalService = {
  // 0. Garment Technician Analytics Dashboard
  dashboard: {
    getSummary: (params = {}) => api.get('/garment-technical/dashboard', { params }),
  },

  // 1. Material Inbound Verification & Requests
  inbound: {
    getOptions: () => api.get('/garment-technical/inbound-verification/options'),
    getPlans: (params = {}) => api.get('/garment-technical/inbound-verification/plans', { params }),
    getPlan: (id) => api.get(`/garment-technical/inbound-verification/plans/${id}`),
    verifyPlan: (id, payload) => api.post(`/garment-technical/inbound-verification/plans/${id}/verify`, payload),
    getRequests: (params = {}) => api.get('/garment-technical/inbound-verification/requests', { params }),
    createRequest: (payload) => api.post('/garment-technical/inbound-verification/requests', payload),
  },

  // 2. Finished Goods Quality Inspection & Inbound Tickets
  finishedGoods: {
    getOptions: () => api.get('/garment-technical/finished-inspection/options'),
    getTickets: (params = {}) => api.get('/garment-technical/finished-inspection/tickets', { params }),
    getTicket: (id) => api.get(`/garment-technical/finished-inspection/tickets/${id}`),
    createTicket: (payload) => api.post('/garment-technical/finished-inspection/tickets', payload),
  },

  // 3. Inventory Stocktake Execution (Requested by Warehouse Manager)
  stocktake: {
    getSessions: (params = {}) => api.get('/garment-technical/stocktake-execution/sessions', { params }),
    getSession: (id) => api.get(`/garment-technical/stocktake-execution/sessions/${id}`),
    verifyShelf: (id, payload) => api.post(`/garment-technical/stocktake-execution/sessions/${id}/verify-shelf`, payload),
    scanItem: (id, payload) => api.post(`/garment-technical/stocktake-execution/sessions/${id}/scan-item`, payload),
    updateRecordQty: (id, payload) => api.patch(`/garment-technical/stocktake-execution/records/${id}`, payload),
    completeSession: (id, payload) => api.post(`/garment-technical/stocktake-execution/sessions/${id}/complete`, payload),
  },

  // 4. Raw Material Outbound Request & Remnant Recovery (Dynamic Threshold from DB)
  remnant: {
    getOptions: () => api.get('/garment-technical/remnant-recovery/options'),
    getThreshold: () => api.get('/garment-technical/remnant-recovery/threshold'),
    getOutboundRequests: (params = {}) => api.get('/garment-technical/remnant-recovery/outbound-requests', { params }),
    createOutboundRequest: (payload) => api.post('/garment-technical/remnant-recovery/outbound-requests', payload),
    getOutboundDetail: (id) => api.get(`/garment-technical/remnant-recovery/outbound-requests/${id}`),
    getIssuedRolls: (params = {}) => api.get('/garment-technical/remnant-recovery/issued-rolls', { params }),
    recordCutting: (payload) => api.post('/garment-technical/remnant-recovery/record-cutting', payload),
    lookupReturnSources: (params) => api.get('/garment-technical/remnant-recovery/return-sources', { params }),
    reportUnknownReturnSource: (id, payload) => api.post(`/garment-technical/remnant-recovery/outbound-requests/${id}/source-discrepancies`, payload),
    getReturnRequests: () => api.get('/garment-technical/remnant-recovery/return-requests'),
    confirmReturnRequest: (id, payload) => api.post(`/garment-technical/remnant-recovery/return-requests/${id}/confirm`, payload),
    reportReturnDiscrepancy: (id, reason) => api.post(`/garment-technical/remnant-recovery/return-requests/${id}/discrepancy`, { reason }),
    closeReturnRequest: (id, status) => api.post(`/garment-technical/remnant-recovery/return-requests/${id}/close`, { status }),
    getHistory: (params = {}) => api.get('/garment-technical/remnant-recovery/history', { params }),
  },

  // 5. Raw Material Warehouse / Catalog Management (CRUD)
  materials: {
    getMeta: () => api.get('/garment-technical/raw-materials/meta'),
    getCategories: () => api.get('/garment-technical/raw-materials/categories'),
    createCategory: (payload) => api.post('/garment-technical/raw-materials/categories', payload),
    updateCategory: (id, payload) => api.put(`/garment-technical/raw-materials/categories/${id}`, payload),
    deleteCategory: (id) => api.delete(`/garment-technical/raw-materials/categories/${id}`),
    getMaterials: (params = {}) => api.get('/garment-technical/raw-materials', { params }),
    getMaterial: (id) => api.get(`/garment-technical/raw-materials/${id}`),
    createMaterial: (payload) => api.post('/garment-technical/raw-materials', payload),
    updateMaterial: (id, payload) => api.put(`/garment-technical/raw-materials/${id}`, payload),
    deleteMaterial: (id) => api.delete(`/garment-technical/raw-materials/${id}`),
    toggleStatus: (id) => api.patch(`/garment-technical/raw-materials/${id}/toggle-status`),
  },

  // 6. Return / Exchange Goods Quality Inspection (Kiểm tra hàng hoàn/trả)
  returnInspection: {
    getRecentOrders: () => api.get('/garment-technical/return-inspection/recent-orders'),
    lookupOrder: (code) => api.get(`/garment-technical/return-inspection/lookup/${encodeURIComponent(code)}`),
    openSession: (code) => api.post('/garment-technical/return-inspection/sessions/open', { code }),
    scanUnit: (sessionId, barcode) => api.post(`/garment-technical/return-inspection/sessions/${sessionId}/scan-unit`, { barcode }),
    removeUnit: (sessionId, barcode) => api.post(`/garment-technical/return-inspection/sessions/${sessionId}/remove-unit`, { barcode }),
    finishRecording: (sessionId) => api.post(`/garment-technical/return-inspection/sessions/${sessionId}/finish-recording`),
    cancelSession: (sessionId) => api.post(`/garment-technical/return-inspection/sessions/${sessionId}/cancel`),
    uploadVideo: (job, blob, onUploadProgress) =>
      api.post(`/garment-technical/return-inspection/sessions/${job.sessionId}/video`, blob, {
        headers: {
          'Content-Type': job.mimeType || 'video/webm',
          'X-Recording-Id': job.recordingId,
          'X-Video-Duration-Ms': String(job.durationMs || 1),
        },
        onUploadProgress,
      }),
    syncVideo: (job) =>
      api.post(`/garment-technical/return-inspection/sessions/${job.sessionId}/video/${job.recordingId}/sync`, {
        durationMs: job.durationMs || 1,
      }),
    getSavedVideo: (sessionId) =>
      api.get(`/garment-technical/return-inspection/sessions/${sessionId}/video`, { responseType: 'blob' }),
    finalizeAndRequestInbound: (payload) =>
      api.post('/garment-technical/return-inspection/finalize-and-request-inbound', payload),
    submitInspection: (payload) => api.post('/garment-technical/return-inspection/submit', payload),
    getInspections: (params = {}) => api.get('/garment-technical/return-inspection', { params }),
    requestInboundTicket: (payload) => api.post('/garment-technical/return-inspection/inbound-ticket', payload),
  },

  // 7. Garment Lot Management (Quản lý Lô Thành phẩm & Nguyên phụ liệu -> Gửi Quản lý kho gen QR lô)
  lots: {
    getOptions: () => api.get('/garment-technical/lots/options'),
    getLots: (params = {}) => api.get('/garment-technical/lots', { params }),
    getLot: (id) => api.get(`/garment-technical/lots/${id}`),
    createLot: (payload) => api.post('/garment-technical/lots', payload),
    updateLot: (id, payload) => api.put(`/garment-technical/lots/${id}`, payload),
    deleteLot: (id) => api.delete(`/garment-technical/lots/${id}`),
    sendInboundRequest: (payload) => api.post('/garment-technical/lots/send-inbound-request', payload),
  },
};

export default garmentTechnicalService;

