/*
 * File: authService.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Wraps registration, login, current-user, and health API calls. Exposes authentication requests to React components.
 */
import api from './api';

export const authService = {
  async register(userData) {
    return await api.post('/auth/register', userData);
  },

  async login(credentials) {
    return await api.post('/auth/login', credentials);
  },

  async getMe() {
    return await api.get('/auth/me');
  },

  async checkHealth() {
    return await api.get('/health');
  },
};
