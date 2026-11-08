/*
 * File: api.js
 * Author: Duy Anh & Nguyễn Ngọc Huy
 * Description: Shared Axios client for ARAWMS with token attachment and unified error handling.
 */
import axios from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '../utils/constants';
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
    const token = getToken() || localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Chuẩn hóa payload phản hồi và xử lý phiên hết hạn (401)
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (
      error.response?.status === 401 &&
      error.config?.headers?.Authorization &&
      error.config.headers.Authorization === `Bearer ${getToken()}`
    ) {
      clearAuth();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }

    const message = error.response?.data?.message || 'Có lỗi kết nối đến máy chủ';
    const apiError = new Error(message);
    apiError.status = error.response?.status;
    apiError.code =
      error.response?.data?.error?.code ||
      error.response?.data?.details?.code ||
      error.response?.data?.errors?.code;
    apiError.details = error.response?.data?.details || error.response?.data?.error || null;
    apiError.response = error.response; // Giữ full response cho màn hình kho & kiểm kê

    return Promise.reject(apiError);
  }
);

export default api;
