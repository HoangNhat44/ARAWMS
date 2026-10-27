/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01 đến UC-05 - Gắn token vào API và xử lý phiên bị từ
 * chối.
 */

import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { AUTH_EXPIRED_EVENT, clearAuth, getToken } from '../utils/authStorage';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Tự động đính kèm Bearer Token vào Header nếu có
// UC-01: Đính kèm token để BE kiểm tra phiên khi gọi API tài khoản.
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Xử lý lỗi toàn cục (ví dụ Token hết hạn)
/*
 * UC-02, GBR-01: Khi BE từ chối phiên hiện tại, xóa trạng thái FE và báo phiên
 * đã hết.
 */
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401 && error.config?.headers?.Authorization
      && error.config.headers.Authorization === `Bearer ${getToken()}`) {
      clearAuth();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    const message = error.response?.data?.message || 'Có lỗi kết nối đến Server';
    return Promise.reject(Object.assign(new Error(message), {
      status: error.response?.status, code: error.response?.data?.details?.code,
    }));
  }
);

export default api;
