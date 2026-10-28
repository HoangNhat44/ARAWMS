/*
 * File: constants.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines the frontend API base path and browser storage keys. Keeps service requests and authentication storage consistent.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const STORAGE_KEYS = {
  TOKEN: 'arawms_auth_token',
  USER: 'arawms_user_info',
};
