/*
 * File: authService.js
 * Author: Duy Anh & Nguyễn Ngọc Huy
 * Description: Wraps registration, login, current-user, and health API calls. Exposes authentication requests to React components.
 */
import api from './api';

/*
 * UC-01, UC-02, UC-03, UC-05: Gom các lời gọi API xác thực và hỗ trợ Quên mật
 * khẩu.
 */
export const authService = {
  checkHealth: () => api.get('/health'),
  login: (credentials) => api.post('/auth/login', credentials),
  forgotPassword: (input) => api.post('/auth/forgot-password', input),
  resetPassword: (input) => api.post('/auth/reset-password', input),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/accounts/me'),
  googleConfig: () => api.get('/auth/google/config'),
  googleChallenge: () => api.post('/auth/google/challenge'),
  googleLogin: (input) => api.post('/auth/google/login', input),
};

export default authService;
