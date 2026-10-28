/*
 * File: PackingUploadRunner.jsx
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Runs the recording upload queue for signed-in users.
 */
import { useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { packingVideoUploadManager } from '../services/packingVideoUploadManager';

/** Keeps pending packing-video uploads running while the application is mounted.
 * It has no visible UI; upload status is exposed through the shared manager. */
export default function PackingUploadRunner() {
  const { user, loading } = useContext(AuthContext);
  useEffect(() => {
    if (loading || !user) return undefined;
    packingVideoUploadManager.start();
    return () => packingVideoUploadManager.stop();
  }, [loading, user]);
  return null;
}
