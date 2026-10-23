import api from '../../../../services/api';
export const accountService = {
  getProfile: () => api.get('/accounts/me'),
  updateProfile: (profile) => api.patch('/accounts/me', profile),
  changePassword: (passwords) => api.patch('/accounts/me/password', passwords),
};
