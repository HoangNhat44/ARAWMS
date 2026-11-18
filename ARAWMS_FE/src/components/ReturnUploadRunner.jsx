/*
 * File: ReturnUploadRunner.jsx
 * Description: Keeps pending return-inspection video uploads running in the background while authenticated.
 */
import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { returnVideoUploadManager } from '../services/returnVideoUploadManager';

const ALLOWED_ROLES = new Set(['GARMENT_TECHNICIAN', 'WAREHOUSE_MANAGER', 'OWNER']);

export default function ReturnUploadRunner() {
  const { user } = useAuth();
  const userId = ALLOWED_ROLES.has(user?.roleCode) ? user.id : null;

  useEffect(() => {
    if (!userId) return undefined;
    returnVideoUploadManager.start();
    return () => returnVideoUploadManager.stop();
  }, [userId]);

  return null;
}
