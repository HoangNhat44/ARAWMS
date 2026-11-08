/*
 * File: FinishedGoodsSyncRunner.jsx
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Resumes acknowledged stock confirmation attempts for the signed-in account.
 */
import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { syncFinishedGoodsConfirmations } from '../services/offlineFinishedGoods';
import { LOCAL_WAREHOUSE_OPERATOR_ID, STORAGE_KEYS } from '../utils/constants';

/** Runs the account's stock retry queue on mount, reconnect, and a short timer.
 * It does not promote locally saved drafts into confirmed stock movements. */
export default function FinishedGoodsSyncRunner() {
  const { user } = useAuth();
  const localOperator = import.meta.env.DEV &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
    !localStorage.getItem(STORAGE_KEYS.TOKEN);
  const ownerId = user?.id || user?._id || (localOperator ? LOCAL_WAREHOUSE_OPERATOR_ID : null);
  // Rebind listeners when the authenticated account changes so old work cannot be sent as a new user.
  useEffect(() => {
    if (!ownerId) return undefined;
    /** Resumes only queued confirmations already authorized by a user click. */
    const run = () => syncFinishedGoodsConfirmations(ownerId).catch(() => {});
    run();
    window.addEventListener('online', run);
    const timer = window.setInterval(run, 30000);
    return () => { window.removeEventListener('online', run); window.clearInterval(timer); };
  }, [ownerId]);
  return null;
}
