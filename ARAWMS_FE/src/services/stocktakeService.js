import api from './api';

export const stocktakeService = {
  options: () => api.get('/stocktake/options'),
  list: () => api.get('/stocktake'),
  create: (payload) => api.post('/stocktake', payload),
  updateSchedule: (id, payload) => api.put(`/stocktake/schedules/${id}`, payload),
  setScheduleStatus: (id, payload) => api.patch(`/stocktake/schedules/${id}/status`, payload),
  report: (id) => api.get(`/stocktake/sessions/${id}`),
  approve: (id, payload) => api.post(`/stocktake/sessions/${id}/approve`, payload),
  recount: (id, payload) => api.post(`/stocktake/sessions/${id}/recount`, payload),
  announcements: () => api.get('/stocktake/announcements'),
  adjust: (id, payload) => api.post(`/stocktake/sessions/${id}/adjust`, payload),
};
