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

// Matches the direct-URL warehouse operator used by the local API test routes.
export const LOCAL_WAREHOUSE_OPERATOR_ID = '507f1f77bcf86cd799439011';

// Fixed number of rows for Owner tables and server-paged lists.
export const OWNER_PAGE_SIZE = 15;
