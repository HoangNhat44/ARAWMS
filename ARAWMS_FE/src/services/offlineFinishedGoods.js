/*
 * File: offlineFinishedGoods.js
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Stores account-scoped finished-goods snapshots, drafts, and confirmation retries.
 */
import { offlineCatalogStore as store } from './offlineCatalogStore';
import { productService } from './productService';
import { getStoredProfile, getToken } from '../utils/authStorage';

const listeners = new Set();
let running = false;
/** Notifies the stock page after a local draft or queued operation changes. */
const notify = () => listeners.forEach((listener) => listener());
/** Namespaces finished-goods records inside the shared catalog IndexedDB stores. */
const ownKey = (kind, id) => `finished-goods:${kind}:${id}`;
/** Prevents a retry from using another account's token after a login switch. */
const signedInAs = (ownerId) => {
  const user = getStoredProfile();
  return Boolean(getToken()) && String(user?.id || user?._id) === String(ownerId);
};

export const finishedGoodsOffline = {
  /** Saves an already loaded server response with its capture time; it is reference data, not live stock. */
  async cache(ownerId, kind, id, value) {
    const snapshot = { value, updatedAt: Date.now() };
    await store.put('catalog', ownerId, ownKey(kind, id), snapshot);
    return snapshot;
  },
  /** Reads a cached response from the requested owner's IndexedDB namespace. */
  getCached(ownerId, kind, id) { return store.get('catalog', ownerId, ownKey(kind, id)); },
  /** Persists inspection and proposed allocation before reporting a local save to the user. */
  async saveDraft(ownerId, direction, draft) {
    const value = { ...draft, direction, updatedAt: Date.now() };
    await store.put('drafts', ownerId, ownKey('draft', direction), value);
    notify();
    return value;
  },
  /** Restores the most recent inbound or outbound draft for this account. */
  getDraft(ownerId, direction) { return store.get('drafts', ownerId, ownKey('draft', direction)); },
  /** Removes a local draft; the sync caller first checks its matching confirmation ID. */
  async removeDraft(ownerId, direction) {
    await store.remove('drafts', ownerId, ownKey('draft', direction));
    notify();
  },
  /** Fixes one confirmed payload to one ID so retries cannot submit altered stock movements. */
  async queueConfirmation(ownerId, payload) {
    const operationId = payload.confirmationKey;
    const key = ownKey('confirmation', operationId);
    const prior = await store.get('operations', ownerId, key);
    if (prior) {
      if (JSON.stringify(prior.payload) !== JSON.stringify(payload))
        throw new Error('Mã xác nhận đã gắn với nội dung khác. Hãy đối chiếu phiếu trước khi tiếp tục.');
      return prior;
    }
    const operation = { operationId, operationType: 'FINISHED_GOODS_CONFIRM', payload,
      ownerUserId: String(ownerId), status: 'PENDING', retryCount: 0,
      createdAt: Date.now(), updatedAt: Date.now(), lastError: '' };
    await store.put('operations', ownerId, key, operation);
    notify();
    return operation;
  },
  /** Lists stock confirmations separately from catalog operations in the shared queue. */
  async confirmations(ownerId) {
    const candidates = (await store.list('operations', ownerId)).filter((item) =>
      item.operationType === 'FINISHED_GOODS_CONFIRM' && item.operationId);
    // The old catalog migration wrote a second, unprefixed copy. Always prefer the
    // finished-goods key so a stale copy cannot reopen a completed confirmation.
    const ids = [...new Set(candidates.map((item) => item.operationId))];
    const operations = await Promise.all(ids.map(async (id) =>
      await store.get('operations', ownerId, ownKey('confirmation', id)) ||
      candidates.find((item) => item.operationId === id)));
    return operations.sort((a, b) => a.createdAt - b.createdAt);
  },
  /** Lets stock screens refresh local status without polling IndexedDB. */
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
};

/** Replays stock confirmations that the user explicitly submitted while online.
 * A locally saved draft is never queued for confirmation, and every retry uses the same payload and ID. */
export const syncFinishedGoodsConfirmations = async (ownerId) => {
  if (running || !signedInAs(ownerId) || !navigator.onLine) return;
  /** Serializes this account's operations and preserves rejected records for manual review. */
  const run = async () => {
    if (running) return;
    running = true;
    try {
      for (const operation of await finishedGoodsOffline.confirmations(ownerId)) {
        if (!signedInAs(ownerId) || !navigator.onLine) break;
        // Older catalog migrations also touched this shared store. Reconcile those
        // legacy statuses without handing stock confirmations to catalog sync.
        if (!['PENDING', 'SYNCING', 'REVIEW', 'QUEUED', 'RETRY_WAIT',
          'NEEDS_ACTION', 'AUTH_REQUIRED'].includes(operation.status)) continue;
        const key = ownKey('confirmation', operation.operationId);
        /** Persists each state transition before exposing it to the UI. */
        const save = async (changes) => {
          Object.assign(operation, changes, { updatedAt: Date.now() });
          await store.put('operations', ownerId, key, operation);
          notify();
        };
        const complete = async (document, status = 'DONE') => {
          await save({ status, serverResult: document, lastError: '', nextRetryAt: null });
          // A cleanup failure must not turn a server-confirmed receipt back into pending work.
          try {
            if (status === 'DONE') {
              const draftKey = operation.payload.draftKey || operation.payload.direction;
              const draft = await finishedGoodsOffline.getDraft(ownerId, draftKey);
              if (draft?.confirmationKey === operation.operationId)
                await finishedGoodsOffline.removeDraft(ownerId, draftKey);
            }
          } catch { /* The confirmed document remains authoritative. */ }
          window.dispatchEvent(new CustomEvent('arawms-finished-goods-synced', { detail: { ownerId } }));
        };
        // Reconcile every queued receipt before replay. Another attempt may already have
        // received its unique technical ticket, even when this device has a different key.
        try {
          const confirmed = await productService.confirmationStatus(operation.payload);
          const data = confirmed.data;
          if (data?.document && data?.confirmed !== false) {
            await complete(data.document,
              data.matchType === 'SOURCE_TICKET' ? 'SUPERSEDED' : 'DONE');
            continue;
          }
        } catch (error) {
          if (error.code === 'CONFIRMATION_REUSED') {
            await save({ status: 'REVIEW', lastError: error.message, nextRetryAt: null });
            continue;
          }
          if (error.code !== 'CONFIRMATION_NOT_FOUND') continue;
        }
        if (['NEEDS_ACTION', 'AUTH_REQUIRED'].includes(operation.status)) {
          await save({ status: 'REVIEW', nextRetryAt: null });
          continue;
        }
        if (operation.status === 'REVIEW' ||
            operation.nextRetryAt && operation.nextRetryAt > Date.now()) continue;
        await save({ status: 'SYNCING' });
        try {
          const response = await productService.bulkMoveStock(operation.payload);
          await complete(response.data.document);
        } catch (error) {
          // Transport and server failures may hide a committed result; retry the unchanged ID.
          // Business conflicts need review because changing the payload under that ID is unsafe.
          const transient = !error.status || error.status >= 500 || error.status === 401;
          const retryCount = operation.retryCount + 1;
          await save({ status: transient ? 'PENDING' : 'REVIEW', retryCount,
            nextRetryAt: transient ? Date.now() + Math.min(60000, 1000 * 2 ** Math.min(retryCount, 6)) : null,
            lastError: error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để đồng bộ.' : error.message,
            errorCode: error.code || '' });
          if (transient) break;
        }
      }
    } finally { running = false; notify(); }
  };
  // Web Locks prevents two tabs from replaying the same account's queue at once.
  if (navigator.locks?.request) await navigator.locks.request(`arawms-finished-goods-${ownerId}`, run);
  else await run();
};
