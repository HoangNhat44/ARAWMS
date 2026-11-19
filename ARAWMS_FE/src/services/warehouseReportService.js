/*
 * File: warehouseReportService.js
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Calls the warehouse statistics report API (/api/warehouse-reports).
 */
import api from './api';

export const warehouseReportService = {
  list: () => api.get('/warehouse-reports'),
  get: (id) => api.get(`/warehouse-reports/${id}`),
  create: (values) => api.post('/warehouse-reports', values),
  refresh: (id, values) => api.post(`/warehouse-reports/${id}/refresh`, values),
  saveDraft: (id, comments) => api.patch(`/warehouse-reports/${id}`, { comments }),
  submit: (id, comments) => api.post(`/warehouse-reports/${id}/submit`, { comments }),
  remove: (id) => api.delete(`/warehouse-reports/${id}`),
};
