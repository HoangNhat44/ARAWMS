/*
 * File: warehouseLayoutService.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Calls warehouse layout, label, and planned putaway APIs.
 */
import api from './api';
const root = '/warehouse-layout';
export const warehouseLayoutService = {
  layout: () => api.get(`${root}/layout`),
  openDraft: () => api.post(`${root}/layout/draft`),
  resetDraft: (version) => api.post(`${root}/layout/draft/reset`, { version }),
  saveDraft: (data) => api.patch(`${root}/layout/draft`, data),
  addRack: (data) => api.post(`${root}/layout/draft/racks`, data),
  removeRack: (id, version) => api.delete(`${root}/layout/draft/racks/${id}`, { params: { version } }),
  resizeRack: (id, data) => api.post(`${root}/layout/draft/racks/${id}/resize`, data),
  validate: () => api.post(`${root}/layout/draft/validate`),
  publish: (version) => api.post(`${root}/layout/draft/publish`, { version }),
  bin: (id) => api.get(`${root}/bins/${id}`),
  history: (id) => api.get(`${root}/bins/${id}/history`),
  label: (id) => api.get(`${root}/bins/${id}/label`),
  labelImage: (id) => api.get(`${root}/bins/${id}/label.png`, { responseType: 'blob' }),
  printIntent: (id) => api.post(`${root}/bins/${id}/print-intent`),
  rotate: (id, reason) => api.post(`${root}/bins/${id}/rotate`, { reason }),
  options: () => api.get(`${root}/allocation-options`),
  skus: () => api.get(`${root}/skus`),
  allocations: () => api.get(`${root}/allocations`),
  allocationHistory: (id) => api.get(`${root}/allocations/${id}/history`),
  createAllocation: (data) => api.post(`${root}/allocations`, data),
  updateAllocation: (id, data) => api.patch(`${root}/allocations/${id}`, data),
  confirmAllocation: (id, data) => api.post(`${root}/allocations/${id}/confirm`, data),
  cancelAllocation: (id, data) => api.post(`${root}/allocations/${id}/cancel`, data),
};
