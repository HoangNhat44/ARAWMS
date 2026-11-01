/*
 * File: offlineCatalogSync.js
 * Author: Duy Anh
 * Date: 2026-10-29
 * Description: Queues immutable catalog changes and replays them in order after connectivity returns.
 */
import { offlineCatalogStore as store } from './offlineCatalogStore';
import { productService } from './productService';
import { STORAGE_KEYS } from '../utils/constants';

const listeners = new Set();
let running = false;
const leaseOwner = crypto.randomUUID();
const notify = () => listeners.forEach((listener) => listener());
const isNetworkFailure = (error) => !error.status || error.status >= 500;
const currentOwner = () => {
  try { const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || 'null'); return user?.id || user?._id || null; }
  catch { return null; }
};
const maySend = (ownerId) => Boolean(localStorage.getItem(STORAGE_KEYS.TOKEN)) && String(currentOwner()) === String(ownerId);

/** Saves a confirmed change before any network request; the payload never changes under this ID. */
export const queueCatalogChange = async (ownerId, change, files = []) => {
  if (files.length > 20) throw new Error('Mỗi lần lưu chỉ chọn tối đa 20 tệp.');
  const operationId = change.operationId || crypto.randomUUID();
  const existing = await store.get('operations', ownerId, operationId);
  if (existing) {
    if (existing.operationType !== change.operationType || JSON.stringify(existing.payload) !== JSON.stringify(change.payload)) {
      throw new Error('Mã thao tác đã gắn với nội dung khác.');
    }
    return existing;
  }
  for (const { file, kind } of files) {
    const allowed = kind === 'video' ? ['video/mp4', 'video/webm'] : ['image/jpeg', 'image/png', 'image/webp'];
    const limit = kind === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (!file || !allowed.includes(file.type) || file.size === 0 || file.size > limit) {
      throw new Error(`${file?.name || 'Tệp'} không đúng định dạng hoặc vượt giới hạn dung lượng.`);
    }
  }
  const operation = {
    operationId, localEntityId: change.localEntityId || crypto.randomUUID(),
    operationType: change.operationType, serverEntityId: change.serverEntityId || null,
    baseVersion: change.baseVersion ?? null, payload: change.payload,
    dependencyOperationIds: change.dependencyOperationIds || [], ownerUserId: String(ownerId),
    status: 'PENDING', retryCount: 0, lastError: '', createdAt: Date.now(), updatedAt: Date.now(),
    label: change.label || change.payload?.productName || 'Sản phẩm',
  };
  for (let index = 0; index < files.length; index += 1) {
    const { file, kind } = files[index];
    await store.put('files', ownerId, `${operation.operationId}:${index}`, {
      operationId: operation.operationId, index, kind, file, status: 'PENDING', name: file.name,
    });
  }
  await store.put('operations', ownerId, operation.operationId, operation);
  notify();
  return operation;
};

const save = async (ownerId, operation, changes) => {
  const next = { ...operation, ...changes, updatedAt: Date.now() };
  await store.put('operations', ownerId, operation.operationId, next);
  notify();
  return next;
};

const uploadFiles = async (ownerId, operation, productId) => {
  const files = (await store.list('files', ownerId)).filter((item) => item.operationId === operation.operationId && item.status !== 'DONE');
  for (const item of files) {
    if (!maySend(ownerId)) return;
    try {
      const bytes = await item.file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const fileId = `${operation.operationId}_${item.index}`;
      if (item.kind === 'additional') await productService.uploadAdditionalImage(productId, item.file, fileId, sha256);
      else await productService.upload(productId, item.kind, item.file, fileId, sha256);
      await store.put('files', ownerId, `${operation.operationId}:${item.index}`, { ...item, status: 'DONE', file: null });
    } catch (error) {
      await store.put('files', ownerId, `${operation.operationId}:${item.index}`, { ...item,
        status: isNetworkFailure(error) ? 'PENDING' : 'REVIEW', lastError: error.message });
      throw error;
    }
  }
};

/** Retries only queued work for the account currently signed in on this device. */
export const syncCatalogChanges = async (ownerId) => {
  if (running || !maySend(ownerId)) return;
  const processQueue = async () => {
    if (running) return;
    running = true;
    let completed = 0;
    try {
      const operations = (await store.list('operations', ownerId)).sort((a, b) => a.createdAt - b.createdAt);
      for (const operation of operations) {
        if (!maySend(ownerId)) break;
        if (!['PENDING', 'SYNCING'].includes(operation.status)) continue;
        if (operation.nextRetryAt && operation.nextRetryAt > Date.now()) continue;
        const dependencies = operation.dependencyOperationIds || [];
        if (dependencies.some((id) => operations.find((item) => item.operationId === id)?.status !== 'DONE')) continue;
        let current = await save(ownerId, operation, { status: 'SYNCING' });
        try {
          let result = current.serverResult;
          if (!result) {
            const response = await productService.syncCatalogOperation({
              operationId: current.operationId, operationType: current.operationType,
              serverEntityId: current.serverEntityId, baseVersion: current.baseVersion, payload: current.payload,
            });
            result = response.data;
            current = await save(ownerId, current, { serverResult: result });
          }
          const productId = result.product?.id || result.product?._id || result.productId || current.serverEntityId;
          if (['CREATE', 'IMPORT_PRODUCT'].includes(current.operationType)) {
            await store.put('mappings', ownerId, current.localEntityId, { localEntityId: current.localEntityId, serverEntityId: productId });
          }
          await uploadFiles(ownerId, current, productId);
          await save(ownerId, current, { status: 'DONE', lastError: '', serverResult: result });
          completed += 1;
        } catch (error) {
          if (error.status === 401) {
            localStorage.removeItem(STORAGE_KEYS.TOKEN);
            localStorage.removeItem(STORAGE_KEYS.USER);
            window.dispatchEvent(new Event('arawms-auth-expired'));
          }
          const transient = isNetworkFailure(error) || error.status === 401;
          const retryCount = current.retryCount + 1;
          await save(ownerId, current, { status: transient ? 'PENDING' : 'REVIEW', retryCount,
            nextRetryAt: transient ? Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(retryCount, 6)) : null,
            lastError: error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục đồng bộ.' : error.message,
            errorCode: error.code || '' });
          if (transient) break;
        }
      }
    } finally {
      running = false; notify();
      if (completed) window.dispatchEvent(new CustomEvent('arawms-catalog-synced', { detail: { ownerId } }));
    }
  };
  if (navigator.locks?.request) await navigator.locks.request(`arawms-catalog-${ownerId}`, processQueue);
  else {
    const leaseKey = `arawms-catalog-lock:${ownerId}`;
    const previous = JSON.parse(localStorage.getItem(leaseKey) || 'null');
    if (previous?.until > Date.now() && previous.owner !== leaseOwner) return;
    localStorage.setItem(leaseKey, JSON.stringify({ owner: leaseOwner, until: Date.now() + 15000 }));
    if (JSON.parse(localStorage.getItem(leaseKey) || 'null')?.owner !== leaseOwner) return;
    const renewal = window.setInterval(() => localStorage.setItem(leaseKey,
      JSON.stringify({ owner: leaseOwner, until: Date.now() + 15000 })), 5000);
    try { await processQueue(); }
    finally {
      window.clearInterval(renewal);
      if (JSON.parse(localStorage.getItem(leaseKey) || 'null')?.owner === leaseOwner) localStorage.removeItem(leaseKey);
    }
  }
};

export const getPendingCatalogChanges = (ownerId) => store.list('operations', ownerId);
export const subscribeCatalogChanges = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const retryCatalogChange = async (ownerId, operation) => {
  await save(ownerId, operation, { status: 'PENDING', lastError: '', nextRetryAt: null });
  await syncCatalogChanges(ownerId);
};
