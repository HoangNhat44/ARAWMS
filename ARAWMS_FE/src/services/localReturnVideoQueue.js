/*
 * File: localReturnVideoQueue.js
 * Description: Stores return-inspection recordings in OPFS (with IndexedDB metadata) so videos survive page reloads and upload reliably to Cloudinary.
 */

const DB_NAME = 'arawms-return-video-queue';
const STORE_NAME = 'uploads';
const FOLDER = 'return-recordings';

const openDatabase = () =>
  new Promise((resolve, reject) => {
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

const hasOpfs = () => typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory);

const folder = async () => {
  if (!hasOpfs()) throw new Error('OPFS_UNAVAILABLE');
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
  if (!name || !hasOpfs()) return;
  await (await folder()).removeEntry(name).catch((error) => {
    if (error.name !== 'NotFoundError') throw error;
  });
};

export const returnStorageEstimate = async () => {
  const estimate = await navigator.storage?.estimate?.();
  return { usage: estimate?.usage || 0, quota: estimate?.quota || 0 };
};

/** Persists a recorded return-unboxing video locally before uploading in the background. */
export const savePendingReturnVideo = async ({
  sessionId,
  orderId,
  orderCode,
  inspectionCode,
  recordingId,
  blob,
  durationMs,
}) => {
  if (!blob?.size) throw new Error('EMPTY_VIDEO');
  const { usage, quota } = await returnStorageEstimate();
  if (quota && quota - usage < blob.size * 1.1) throw new Error('LOCAL_STORAGE_FULL');

  const name = fileName(recordingId, blob.type);
  let storedInOpfs = false;
  if (hasOpfs()) {
    await writeFile(name, blob);
    storedInOpfs = true;
  }

  const job = {
    recordingId,
    sessionId,
    orderId: orderId || sessionId,
    orderCode: orderCode || orderId || sessionId,
    inspectionCode: inspectionCode || '',
    fileName: `${orderCode || sessionId}-${name}`,
    filePath: storedInOpfs ? name : null,
    blob: storedInOpfs ? undefined : blob,
    fileSize: blob.size,
    mimeType: blob.type || 'video/webm',
    durationMs,
    status: 'QUEUED',
    progress: 0,
    retryCount: 0,
    nextRetryAt: null,
    createdAt: new Date().toISOString(),
    lastError: null,
    cloudinaryPublicId: null,
  };
  await transact('readwrite', (store) => store.put(job));
  return job;
};

export const listPendingReturnVideos = () => transact('readonly', (store) => store.getAll());

export const updatePendingReturnVideo = async (recordingId, patch) => {
  const current = await transact('readonly', (store) => store.get(recordingId));
  if (!current) return null;
  const next = { ...current, ...patch };
  await transact('readwrite', (store) => store.put(next));
  return next;
};

export const readPendingReturnVideo = async (job) => {
  if (job.filePath && hasOpfs()) {
    const handle = await (await folder()).getFileHandle(job.filePath);
    return handle.getFile();
  }
  if (job.blob) return job.blob;
  const missing = new Error('LOCAL_FILE_MISSING');
  missing.name = 'NotFoundError';
  throw missing;
};

export const completePendingReturnVideo = async (job) => {
  await updatePendingReturnVideo(job.recordingId, {
    status: 'COMPLETED',
    progress: 100,
    lastError: null,
    blob: undefined,
  });
  await removeFile(job.filePath).catch(() => {});
};

export const deletePendingReturnVideo = async (job) => {
  await removeFile(job.filePath).catch(() => {});
  await transact('readwrite', (store) => store.delete(job.recordingId));
};

export const cleanupCompletedReturnFiles = async () => {
  const jobs = await listPendingReturnVideos();
  for (const job of jobs) {
    if (job.status === 'COMPLETED' && job.filePath) {
      await removeFile(job.filePath).catch(() => {});
    }
  }
};
