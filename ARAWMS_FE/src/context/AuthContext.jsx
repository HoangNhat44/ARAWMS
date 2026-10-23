import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { authService } from '../modules/system-administration/authentication/services/authService';
import { AUTH_EXPIRED_EVENT, clearAuth, getToken, saveAuth, saveProfile } from '../utils/authStorage';
import { STORAGE_KEYS } from '../utils/constants';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const revision = useRef(0);

  const clearSession = useCallback(() => {
    revision.current += 1;
    clearAuth(); setUser(null); setAuthError('');
  }, []);

  const refreshSession = useCallback(async () => {
    const currentRevision = ++revision.current;
    setLoading(true); setAuthError('');
    try {
      const response = getToken() ? await authService.getMe() : null;
      if (revision.current === currentRevision) setUser(response?.data?.user || null);
    } catch (error) {
      if (revision.current === currentRevision) {
        setUser(null);
        if (error.status !== 401) setAuthError(error.message);
      }
    } finally {
      if (revision.current === currentRevision) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
    const expire = () => { clearSession(); setLoading(false); };
    const sync = (event) => { if (event.key === STORAGE_KEYS.TOKEN || event.key === null) refreshSession(); };
    window.addEventListener(AUTH_EXPIRED_EVENT, expire);
    window.addEventListener('storage', sync);
    return () => {
      revision.current += 1;
      window.removeEventListener(AUTH_EXPIRED_EVENT, expire);
      window.removeEventListener('storage', sync);
    };
  }, [clearSession, refreshSession]);

  const login = (profile, token, rememberMe = false) => {
    revision.current += 1;
    saveAuth(profile, token, rememberMe);
    setUser(profile); setAuthError(''); setLoading(false);
  };

  const logout = async () => {
    // Keep the session on network failure so server-side revocation can be retried.
    try { await authService.logout(); }
    catch (error) { if (error.status !== 401) throw error; }
    clearSession();
  };

  const updateUser = (profile) => { saveProfile(profile); setUser(profile); };

  return <AuthContext.Provider value={{ user, loading, authError, refreshSession, login, logout, clearSession, updateUser }}>
    {children}
  </AuthContext.Provider>;
};
