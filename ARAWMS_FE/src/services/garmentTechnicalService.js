/*
 * File: garmentTechnicalService.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Client API calls for Garment Technician (KCS) features: Inbound Verification & Finished Goods Inspection.
 */
import api from './api';

export const garmentTechnicalService = {
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
};

export default garmentTechnicalService;

