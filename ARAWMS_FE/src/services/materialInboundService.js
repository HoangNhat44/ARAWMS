/*
 * File: materialInboundService.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Calls raw-material request, receipt, location, and confirmation APIs.
 */
import api from './api';

export const materialInboundService = {
  options: () => api.get('/raw-material-inbound/options'),
  technicianRequests: () => api.get('/raw-material-inbound/technician-requests'),
  reportTechnicianRequestDiscrepancy: (id, payload) => api.post(`/raw-material-inbound/technician-requests/${id}/discrepancies`, payload),
  legacyReceipt: (id) => api.get(`/raw-material-inbound/legacy-receipts/${id}`),
  updateLegacyReceipt: (id, values) => api.put(`/raw-material-inbound/legacy-receipts/${id}`, values),
  confirmLegacyReceipt: (id, values) => api.post(`/raw-material-inbound/legacy-receipts/${id}/confirm`, values),
  createMaterial: (values) => api.post('/raw-material-inbound/materials', values),
  createLocation: (values) => api.post('/raw-material-inbound/locations', values),
  receipts: (params = {}) => api.get('/raw-material-inbound/receipts', { params }),
  receipt: (id) => api.get(`/raw-material-inbound/receipts/${id}`),
  receiptByDraftKey: (key) => api.get(`/raw-material-inbound/receipts/by-draft-key/${encodeURIComponent(key)}`),
  create: (values) => api.post('/raw-material-inbound/receipts', values),
  update: (id, values) => api.put(`/raw-material-inbound/receipts/${id}`, values),
  uploadAttachment: (id, file) => api.post(`/raw-material-inbound/receipts/${id}/attachments`, file, {
    headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, timeout: 180000,
  }),
  confirm: (id, values) => api.post(`/raw-material-inbound/receipts/${id}/confirm`, values),
  cancel: (id, values) => api.post(`/raw-material-inbound/receipts/${id}/cancel`, values),
  labels: (id) => api.get(`/raw-material-inbound/receipts/${id}/labels`),
  syncBarcodes: (id) => api.post(`/raw-material-inbound/receipts/${id}/barcodes/sync`),
  putaway: (id, values) => api.post(`/raw-material-inbound/receipts/${id}/putaway`, values),
  requestSupplierReturn: (id, values) => api.post(`/raw-material-inbound/receipts/${id}/supplier-returns`, values),
  confirmSupplierReturn: (id, values) => api.post(`/raw-material-inbound/receipts/${id}/supplier-returns/confirm`, values),
  rollTemplate: () => api.get('/raw-material-inbound/roll-template', { responseType: 'blob' }),
  previewRolls: (file) => api.post('/raw-material-inbound/roll-import/preview', file, {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, timeout: 180000,
  }),
};
