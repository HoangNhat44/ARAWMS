/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-03, UC-04 - Gọi API hồ sơ, mật khẩu và liên kết Google.
 */

import api from '../../../../services/api';
/*
 * UC-03, UC-04: Gọi API của tài khoản hiện tại; không nhận ID tài khoản khác từ
 * giao diện.
 */
export const accountService = {
  getProfile: () => api.get('/accounts/me'),
  updateProfile: (profile) => api.patch('/accounts/me', profile),
  changePassword: (passwords) => api.patch('/accounts/me/password', passwords),
  googleChallenge: (input) => api.post('/accounts/me/google/challenge', input),
  linkGoogle: (input) => api.post('/accounts/me/google', input),
  unlinkGoogle: (input) => api.delete('/accounts/me/google', { data: input }),
};
