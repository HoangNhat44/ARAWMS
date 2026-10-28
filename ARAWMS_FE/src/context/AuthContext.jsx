/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-02, UC-03, UC-04 - Quản lý tài khoản và phiên đăng
 * nhập trên giao diện.
 */

import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { authService } from '../modules/system-administration/authentication/services/authService';
import { AUTH_EXPIRED_EVENT, clearAuth, getToken, saveAuth, saveProfile } from '../utils/authStorage';
import { STORAGE_KEYS } from '../utils/constants';

export const AuthContext = createContext(null);

/** Restores the current user from a stored token and shares auth actions.
 * Descendant pages receive loading, login, and logout state from one provider. */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  /*
   * UC-01, UC-02: Đánh dấu lần cập nhật để kết quả API cũ không ghi đè phiên
   * mới.
   */
  const revision = useRef(0);

  /*
   * UC-02: Xóa token và hồ sơ khỏi trình duyệt, đồng thời cập nhật trạng thái
   * FE.
   */
  const clearSession = useCallback(() => {
    revision.current += 1;
    clearAuth(); setUser(null); setAuthError('');
  }, []);

  // UC-01, UC-03: Kiểm tra phiên đã lưu và tải hồ sơ khi mở lại trang.
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

  // UC-01, UC-05: Nhận kết quả xác thực từ BE và lưu theo lựa chọn ghi nhớ.
  const login = (profile, token, rememberMe = false) => {
    revision.current += 1;
    saveAuth(profile, token, rememberMe);
    setUser(profile); setAuthError(''); setLoading(false);
  };

  // UC-02: Yêu cầu BE thu hồi phiên trước khi xóa trạng thái đăng nhập trên FE.
  const logout = async () => {
    // Lỗi mạng thì giữ trạng thái để có thể gửi lại yêu cầu đăng xuất.
    try { await authService.logout(); }
    catch (error) { if (error.status !== 401) throw error; }
    clearSession();
  };

  /*
   * UC-03, UC-04: Giữ hồ sơ trong bộ nhớ và bộ lưu trữ khớp với kết quả cập
   * nhật.
   */
  const updateUser = (profile) => { saveProfile(profile); setUser(profile); };

  return <AuthContext.Provider value={{ user, loading, authError, refreshSession, login, logout, clearSession, updateUser }}>
    {children}
  </AuthContext.Provider>;
};
