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
  const ownerId = user?.roleCode === 'WAREHOUSE_MANAGER' ? user.id : null;
  useEffect(() => {
    if (!ownerId) return undefined;
    const run = () => syncCatalogChanges(ownerId).catch(() => {});
    run();
    window.addEventListener('online', run);
    window.addEventListener('focus', run);
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(run, 60000);
    return () => { window.removeEventListener('online', run); window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer); };
  }, [ownerId]);
  return null;
}
