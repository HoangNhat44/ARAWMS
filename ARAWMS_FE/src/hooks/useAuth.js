/*
 * File: useAuth.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Reads the authentication context for React components. Rejects use outside the provider so callers always receive valid state.
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
