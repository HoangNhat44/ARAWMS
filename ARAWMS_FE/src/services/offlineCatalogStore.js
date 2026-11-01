/*
 * File: offlineCatalogStore.js
 * Author: Duy Anh
 * Date: 2026-10-29
 * Description: Persists account-scoped catalog drafts, operations, files, and ID mappings in IndexedDB.
 */
const DB_NAME = 'arawms-offline-catalog';
const DB_VERSION = 1;
const STORES = ['drafts', 'operations', 'files', 'mappings', 'catalog'];

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
