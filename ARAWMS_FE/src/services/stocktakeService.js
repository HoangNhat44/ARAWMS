import api from './api';

export const stocktakeService = {
  options: () => api.get('/stocktake/options'),
  list: () => api.get('/stocktake'),
  create: (payload) => api.post('/stocktake', payload),
  updateSchedule: (id, payload) => api.put(`/stocktake/schedules/${id}`, payload),
  setScheduleStatus: (id, payload) => api.patch(`/stocktake/schedules/${id}/status`, payload),
};
