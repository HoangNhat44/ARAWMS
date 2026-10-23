import { useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { packingVideoUploadManager } from '../services/packingVideoUploadManager';

export default function PackingUploadRunner() {
  const { user, loading } = useContext(AuthContext);
  useEffect(() => {
    if (loading || !user) return undefined;
    packingVideoUploadManager.start();
    return () => packingVideoUploadManager.stop();
  }, [loading, user]);
  return null;
}
