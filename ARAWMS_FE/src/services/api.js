/*
 * File: api.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Configures the shared Axios client and converts API failures into messages for the interface.
 */
import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';
import { STORAGE_KEYS } from '../utils/constants';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Keep the API payload shape used by the warehouse screens.
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || 'Có lỗi kết nối đến Server';
    const apiError = new Error(message);
    apiError.code = error.response?.data?.error?.code || error.response?.data?.errors?.code;
    apiError.status = error.response?.status;
    apiError.response = error.response; // Keep full response for detailed error handling
    return Promise.reject(apiError);
  }
);

export default api;
