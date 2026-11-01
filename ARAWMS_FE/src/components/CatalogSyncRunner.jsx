/*
 * File: CatalogSyncRunner.jsx
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Resumes account-scoped catalog sync while any application page remains open.
 */
import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { syncCatalogChanges } from '../services/offlineCatalogSync';

export default function CatalogSyncRunner() {
  const { user } = useAuth();
  const ownerId = user?.id || user?._id;
  useEffect(() => {
    if (!ownerId) return undefined;
    const run = () => syncCatalogChanges(ownerId).catch(() => {});
    run();
    window.addEventListener('online', run);
    const timer = window.setInterval(run, 30000);
    return () => { window.removeEventListener('online', run); window.clearInterval(timer); };
  }, [ownerId]);
  return null;
}
