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
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401 && error.config?.headers?.Authorization
      && error.config.headers.Authorization === `Bearer ${getToken()}`) {
      clearAuth();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    const message = error.response?.data?.message || 'Có lỗi kết nối đến Server';
    return Promise.reject(Object.assign(new Error(message), { status: error.response?.status }));
  }
);

export default api;
