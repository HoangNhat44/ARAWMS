import api from '../../../../services/api';
export const accountService = {
  getProfile: () => api.get('/accounts/me'),
  updateProfile: (profile) => api.patch('/accounts/me', profile),
  changePassword: (passwords) => api.patch('/accounts/me/password', passwords),
  googleChallenge: (input) => api.post('/accounts/me/google/challenge', input),
  linkGoogle: (input) => api.post('/accounts/me/google', input),
  unlinkGoogle: (input) => api.delete('/accounts/me/google', { data: input }),
};
