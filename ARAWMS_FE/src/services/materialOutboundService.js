/*
 * File: materialOutboundService.js
 * Description: Calls authenticated raw-material issue endpoints and workflow operations.
 */
import api from './api';

const root = '/raw-material-outbound';

export const materialOutboundService = {
  options: () => api.get(`${root}/options`),
  list: (params) => api.get(`${root}/tickets`, { params }),
  detail: (id) => api.get(`${root}/tickets/${id}`),
  create: (values) => api.post(`${root}/tickets`, values),
  update: (id, values) => api.put(`${root}/tickets/${id}`, values),
  check: (id, values) => api.post(`${root}/tickets/${id}/check`, values),
  confirm: (id, values) => api.post(`${root}/tickets/${id}/confirm`, values),
  cancel: (id) => api.post(`${root}/tickets/${id}/cancel`),

  // Workflow: Garment Request -> Manager Approve & Assign -> Staff Pick & Scan -> Handover & Outbound
  listRequests: (params) => api.get(`${root}/requests`, { params }),
  staffUsers: () => api.get(`${root}/staff-users`),
  requestDetail: (id) => api.get(`${root}/requests/${id}`),
  approveAndAssign: (id, data) => api.post(`${root}/requests/${id}/approve-and-assign`, data),
  reallocate: (id, data) => api.post(`${root}/requests/${id}/reallocate`, data),
  resolveShortage: (id, data) => api.post(`${root}/requests/${id}/resolve-shortage`, data),
  staffTasks: () => api.get(`${root}/staff-tasks`),
  startPicking: (id) => api.post(`${root}/requests/${id}/start-picking`),
  scanBarcode: (id, data) => api.post(`${root}/requests/${id}/scan`, data),
  recordQuantity: (id, data) => api.post(`${root}/requests/${id}/record-quantity`, data),
  recordPickedQuantity: (id, data) => api.post(`${root}/requests/${id}/record-quantity`, data),
  removeSource: (id, data) => api.post(`${root}/requests/${id}/remove-source`, data),
  reportShortage: (id, data) => api.post(`${root}/requests/${id}/report-shortage`, data),
  pause: (id) => api.post(`${root}/requests/${id}/pause`),
  confirmHandover: (id, data) => api.post(`${root}/requests/${id}/confirm-handover`, data),
};
