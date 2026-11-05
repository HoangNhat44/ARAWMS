/*
 * File: offlineCatalogStore.js
 * Author: Duy Anh
 * Date: 2026-10-29
 * Description: Persists account-scoped catalog drafts, operations, files, and ID mappings in IndexedDB.
 */
const DB_NAME = 'arawms-offline-catalog';
const DB_VERSION = 2;
const STORES = ['drafts', 'operations', 'files', 'mappings', 'catalog', 'migrationBackups'];

const openDatabase = () => new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) return reject(new Error('Trình duyệt không hỗ trợ lưu dữ liệu ngoại tuyến.'));
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    for (const name of STORES) {
      if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'key' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Không mở được bộ nhớ trên thiết bị.'));
});

const transact = async (storeName, mode, action) => {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('Không lưu được dữ liệu trên thiết bị.'));
      transaction.onabort = () => reject(transaction.error || new Error('Bộ nhớ trên thiết bị đã từ chối thao tác.'));
    });
  } finally { db.close(); }
};

const scopedKey = (ownerId, key) => `${ownerId}:${key}`;
const requireOwner = (ownerId) => {
  if (!ownerId) throw new Error('Cần đăng nhập để lưu và đồng bộ dữ liệu riêng của tài khoản.');
  return String(ownerId);
};

export const offlineCatalogStore = {
  async put(store, ownerId, key, value) {
    const owner = requireOwner(ownerId);
    return transact(store, 'readwrite', (objectStore) => objectStore.put({ key: scopedKey(owner, key), ownerId: owner, value }));
  },
  async get(store, ownerId, key) {
    const owner = requireOwner(ownerId);
    const record = await transact(store, 'readonly', (objectStore) => objectStore.get(scopedKey(owner, key)));
    return record?.value ?? null;
  },
  async remove(store, ownerId, key) {
    const owner = requireOwner(ownerId);
    return transact(store, 'readwrite', (objectStore) => objectStore.delete(scopedKey(owner, key)));
  },
  async list(store, ownerId) {
    const owner = requireOwner(ownerId);
    const range = IDBKeyRange.bound(`${owner}:`, `${owner}:\uffff`);
    const records = await transact(store, 'readonly', (objectStore) => objectStore.getAll(range));
    return records.map((record) => record.value);
  },
};

// Preserve the pre-migration records before normalizing legacy queue flags. A failed backup
// leaves the original records untouched so the migration can safely be attempted again.
export const migrateOfflineCatalogQueue = async (ownerId) => {
  const operations = await offlineCatalogStore.list('operations', ownerId);
  const legacy = operations.filter((item) => !item.status || ['PENDING', 'SYNCING', 'REVIEW'].includes(item.status) ||
    (item.status === 'DONE' && (item.lastError || item.errorCode || item.activeError || item.nextRetryAt)));
  if (!legacy.length) return;
  const backupKey = `queue-v2-${ownerId}`;
  const existingBackup = await offlineCatalogStore.get('migrationBackups', ownerId, backupKey);
  if (!existingBackup) {
    const files = await offlineCatalogStore.list('files', ownerId);
    await offlineCatalogStore.put('migrationBackups', ownerId, backupKey, {
      createdAt: Date.now(), operations: structuredClone(operations), files: structuredClone(files),
    });
  }
  for (const item of legacy) {
    let status = item.status;
    if (status === 'PENDING') status = item.retryCount > 0 ? 'RETRY_WAIT' : 'QUEUED';
    else if (status === 'SYNCING') status = item.serverResult ? 'QUEUED' : 'RETRY_WAIT';
    else if (status === 'REVIEW') status = 'NEEDS_ACTION';
    else if (['DONE', 'DISCARDED', 'SUPERSEDED'].includes(status)) status = item.status;
    else status = 'NEEDS_ACTION';
    const migrated = { ...item, status, attempts: item.attempts ?? item.retryCount ?? 0,
      updatedAt: item.updatedAt || Date.now() };
    if (status === 'DONE') { delete migrated.lastError; delete migrated.errorCode; delete migrated.nextRetryAt; }
    await offlineCatalogStore.put('operations', ownerId, item.operationId, migrated);
  }
};
