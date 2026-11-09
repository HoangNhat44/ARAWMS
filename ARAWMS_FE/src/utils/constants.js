/*
 * File: constants.js
 * Author: Duy Anh & Nguyễn Ngọc Huy
 * Description: Defines frontend API base path, browser storage keys, and shared constants.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const STORAGE_KEYS = {
  TOKEN: 'arawms_auth_token',
  USER: 'arawms_user_info',
};

// Fixed number of rows for Owner tables and server-paged lists.
export const OWNER_PAGE_SIZE = 15;
