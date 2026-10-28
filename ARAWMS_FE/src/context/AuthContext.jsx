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
    let active = true;
    let request = 0;
    /** Rechecks the token so the displayed account always matches API requests. */
    const syncAuth = async () => {
      const currentRequest = ++request;
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const res = await authService.getMe();
        if (!active || currentRequest !== request) return;
        if (token !== localStorage.getItem(STORAGE_KEYS.TOKEN)) return syncAuth();
        setUser(res.success && res.data?.user ? res.data.user : null);
      } catch (err) {
        if (!active || currentRequest !== request) return;
        // Axios can clear an expired token before this handler runs.
        if (token !== localStorage.getItem(STORAGE_KEYS.TOKEN)) return syncAuth();
        console.error('Lỗi xác thực người dùng:', err);
        logout();
      } finally {
        if (active && currentRequest === request) setLoading(false);
      }
    };

    syncAuth();
    // A second tab may replace the token while this tab still shows the old user.
    const onStorage = (event) => {
      if (event.key === STORAGE_KEYS.TOKEN || event.key === null) {
        setLoading(true);
        syncAuth();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { active = false; window.removeEventListener('storage', onStorage); };
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
