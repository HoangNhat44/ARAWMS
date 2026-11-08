/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-02, UC-03 - Lưu, cập nhật và xóa phiên trên trình
 * duyệt.
 */

import { STORAGE_KEYS } from './constants';

export const AUTH_EXPIRED_EVENT = 'arawms:auth-expired';
export const getToken = () => sessionStorage.getItem(STORAGE_KEYS.TOKEN) || localStorage.getItem(STORAGE_KEYS.TOKEN);
// UC-02: Xóa thông tin đăng nhập ở cả bộ nhớ theo phiên và bộ nhớ ghi nhớ.
export const clearAuth = () => {
  for (const storage of [sessionStorage, localStorage]) {
    storage.removeItem(STORAGE_KEYS.TOKEN);
    storage.removeItem(STORAGE_KEYS.USER);
  }
};
// UC-01: Ghi nhớ thì lưu localStorage, ngược lại chỉ lưu sessionStorage.
export const saveAuth = (user, token, rememberMe) => {
  clearAuth();
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(STORAGE_KEYS.TOKEN, token);
  storage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};
// UC-03, UC-04: Cập nhật hồ sơ tại đúng nơi đang giữ token.
export const saveProfile = (user) => {
  const storage = sessionStorage.getItem(STORAGE_KEYS.TOKEN) ? sessionStorage : localStorage;
  storage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};
