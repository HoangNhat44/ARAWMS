import { STORAGE_KEYS } from './constants';

export const AUTH_EXPIRED_EVENT = 'arawms:auth-expired';
export const getToken = () => sessionStorage.getItem(STORAGE_KEYS.TOKEN) || localStorage.getItem(STORAGE_KEYS.TOKEN);
export const clearAuth = () => {
  for (const storage of [sessionStorage, localStorage]) {
    storage.removeItem(STORAGE_KEYS.TOKEN);
    storage.removeItem(STORAGE_KEYS.USER);
  }
};
export const saveAuth = (user, token, rememberMe) => {
  clearAuth();
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(STORAGE_KEYS.TOKEN, token);
  storage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};
export const saveProfile = (user) => {
  const storage = sessionStorage.getItem(STORAGE_KEYS.TOKEN) ? sessionStorage : localStorage;
  storage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};
