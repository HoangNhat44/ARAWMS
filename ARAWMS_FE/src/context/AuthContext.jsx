/*
 * File: AuthContext.jsx
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Owns browser authentication state and its provider. Restores saved sessions and exposes login and logout actions.
 */
import { createContext, useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../utils/constants';
import { authService } from '../services/authService';

export const AuthContext = createContext(null);

/** Restores the current user from a stored token and shares auth actions.
 * Descendant pages receive loading, login, and logout state from one provider. */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /** Rechecks the saved token with the backend before restoring the user. */
    const initAuth = async () => {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (token) {
        try {
          const res = await authService.getMe();
          if (res.success && res.data?.user) {
            setUser(res.data.user);
          }
        } catch (err) {
          console.error('Lỗi xác thực người dùng:', err);
          logout();
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  /** Persists the authenticated user and token for subsequent API requests. */
  const login = (userData, token) => {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
    setUser(userData);
  };

  /** Clears credentials and user state for every consumer of the context. */
  const logout = () => {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
