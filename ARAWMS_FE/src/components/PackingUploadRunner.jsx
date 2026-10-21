import { useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { packingUploadManager } from '../services/packingUploadManager';

export default function PackingUploadRunner() {
  const { user, loading } = useContext(AuthContext);
  useEffect(() => {
    if (loading || !user) return undefined;
    packingUploadManager.start();
    return () => packingUploadManager.stop();
  }, [loading, user]);
  return null;
}
