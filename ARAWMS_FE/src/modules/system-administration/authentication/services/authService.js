/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-02, UC-03, UC-05 - Gọi API xác thực và khôi phục mật
 * khẩu.
 */

import api from '../../../../services/api';

/*
 * UC-01, UC-02, UC-03, UC-05: Gom các lời gọi API xác thực và hỗ trợ Quên mật
 * khẩu.
 */
export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  forgotPassword: (input) => api.post('/auth/forgot-password', input),
  resetPassword: (input) => api.post('/auth/reset-password', input),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/accounts/me'),
  googleConfig: () => api.get('/auth/google/config'),
  googleChallenge: () => api.post('/auth/google/challenge'),
  googleLogin: (input) => api.post('/auth/google/login', input),
};
