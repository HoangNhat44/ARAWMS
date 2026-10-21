const DB_NAME = 'arawms-packing-video-queue';
const STORE_NAME = 'uploads';
const FOLDER = 'packing-recordings';

const openDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'recordingId' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const transact = async (mode, operation) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

const folder = async () => {
  if (!navigator.storage?.getDirectory) throw new Error('OPFS_UNAVAILABLE');
  return (await navigator.storage.getDirectory()).getDirectoryHandle(FOLDER, { create: true });
};

const fileName = (recordingId, mimeType) => `${recordingId}.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;

const writeFile = async (name, blob) => {
  const handle = await (await folder()).getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
};

const removeFile = async (name) => {
  if (!name) return;
  await (await folder()).removeEntry(name).catch((error) => {
    if (error.name !== 'NotFoundError') throw error;
  });
};

export const storageEstimate = async () => {
  const estimate = await navigator.storage?.estimate?.();
  return { usage: estimate?.usage || 0, quota: estimate?.quota || 0 };
};

export const savePendingVideo = async ({ sessionId, orderId, recordingId, blob, durationMs }) => {
  if (!blob?.size) throw new Error('EMPTY_VIDEO');
  const { usage, quota } = await storageEstimate();
  if (quota && quota - usage < blob.size * 1.1) throw new Error('LOCAL_STORAGE_FULL');
  const name = fileName(recordingId, blob.type);
  await writeFile(name, blob);
  const job = {
    recordingId, sessionId, orderId: orderId || sessionId,
    fileName: `${orderId || sessionId}-${name}`, filePath: name,
    fileSize: blob.size, mimeType: blob.type, durationMs,
    status: 'QUEUED', progress: 0, retryCount: 0, nextRetryAt: null,
    createdAt: new Date().toISOString(), lastError: null, cloudinaryPublicId: null,
  };
  await transact('readwrite', (store) => store.put(job));
  return job;
};

export const listPendingVideos = () => transact('readonly', (store) => store.getAll());
export const updatePendingVideo = async (recordingId, patch) => {
  const current = await transact('readonly', (store) => store.get(recordingId));
  if (!current) return null;
  const next = { ...current, ...patch };
  await transact('readwrite', (store) => store.put(next));
  return next;
};
export const readPendingVideo = async (job) => {
  const handle = await (await folder()).getFileHandle(job.filePath);
  return handle.getFile();
};
export const completePendingVideo = async (job) => {
  await updatePendingVideo(job.recordingId, { status: 'COMPLETED', progress: 100, lastError: null });
  await removeFile(job.filePath).catch(() => {});
};

export const migrateLegacyVideos = async () => {
  const jobs = await listPendingVideos();
  for (const job of jobs) {
    if (!job.blob) continue;
    const name = fileName(job.recordingId, job.blob.type);
    await writeFile(name, job.blob);
    const { blob, ...metadata } = job;
    await transact('readwrite', (store) => store.put({
      ...metadata, orderId: metadata.orderId || metadata.sessionId,
      fileName: metadata.fileName || name, filePath: name,
      fileSize: blob.size, mimeType: blob.type,
      status: 'QUEUED', progress: 0, retryCount: 0, nextRetryAt: null,
      createdAt: new Date().toISOString(), lastError: null,
    }));
  }
};

export const cleanupCompletedFiles = async () => {
  for (const job of await listPendingVideos()) {
    if (job.status === 'COMPLETED') await removeFile(job.filePath);
  }
};
