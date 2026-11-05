/*
 * File: materialOutboundService.js
 * Description: Calls authenticated raw-material issue endpoints without caching official stock.
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
};
