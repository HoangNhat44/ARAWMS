/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01 đến UC-05 - Cung cấp trạng thái xác thực cho các thành
 * phần giao diện.
 */

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/** Returns the active auth context or reports an invalid provider setup. */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được sử dụng bên trong AuthProvider');
  }
  return context;
};
