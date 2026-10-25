import api from '../../../../services/api';

export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/accounts/me'),
  googleConfig: () => api.get('/auth/google/config'),
  googleChallenge: () => api.post('/auth/google/challenge'),
  googleLogin: (input) => api.post('/auth/google/login', input),
};
