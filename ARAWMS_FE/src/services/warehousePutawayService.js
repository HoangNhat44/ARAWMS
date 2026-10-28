/*
 * File: warehousePutawayService.js
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Calls staff putaway scanning and manager rack-content APIs. Every product scan carries its stable request ID for safe retry.
 */
import api from './api';

const root = '/warehouse-putaway';
const taskPath = (allocationId, lineId) => `${root}/tasks/${allocationId}/${lineId}`;

export const warehousePutawayService = {
  tasks: () => api.get(`${root}/tasks`),
  receiptLabels: (receiptId) => api.get(`${root}/receipts/${receiptId}/labels`),
  task: (allocationId, lineId) => api.get(taskPath(allocationId, lineId)),
  location: (allocationId, lineId, barcode) => api.post(
    `${taskPath(allocationId, lineId)}/location`, { barcode }),
  scan: (allocationId, lineId, data) => api.post(`${taskPath(allocationId, lineId)}/scan`, data),
  shortage: (allocationId, lineId, reason) => api.post(
    `${taskPath(allocationId, lineId)}/shortage`, { reason }),
  incident: (allocationId, lineId, data) => api.post(
    `${taskPath(allocationId, lineId)}/incident`, data),
  issues: () => api.get(`${root}/issues`),
  incidents: () => api.get(`${root}/incidents`),
  reviewIncident: (id, note) => api.post(`${root}/incidents/${id}/review`, { note }),
  resolveIssue: (allocationId, lineId, accept) => api.post(
    `${root}/issues/${allocationId}/${lineId}/resolve`, { accept }),
  rackContents: (rackId) => api.get(`${root}/racks/${rackId}/contents`),
  binUnits: (binId, page = 1) => api.get(`${root}/bins/${binId}/units`, { params: { page } }),
};
