import { packingSessionService } from './packingSessionService';
import {
  cleanupCompletedFiles, completePendingVideo, deletePendingVideo, listPendingVideos, migrateLegacyVideos,
  readPendingVideo, storageEstimate, updatePendingVideo,
} from './localPackingVideoQueue';
import { retryPatch, selectRunnableJobs } from './packingQueuePolicy';

const LOCK_NAME = 'arawms-packing-video-upload';
const PAUSE_KEY = 'arawms_packing_upload_paused';
const CONCURRENCY = Math.max(1, Math.min(8, Number(import.meta.env.VITE_PACKING_UPLOAD_CONCURRENCY) || 2));
const permanentErrors = new Set([
  'CLOUDINARY_AUTH_FAILED', 'CLOUDINARY_NOT_CONFIGURED', 'UNSUPPORTED_VIDEO_TYPE',
  'VIDEO_TOO_LARGE', 'VIDEO_ALREADY_SAVED', 'FORBIDDEN', 'LOCAL_FILE_MISSING',
  'AUTH_REQUIRED',
]);

class PackingVideoUploadManager {
  listeners = new Set();
  running = false;
  busy = false;
  timer = null;
  lastProgressAt = new Map();
  progress = new Map();
  snapshot = { jobs: [], usage: 0, quota: 0, online: navigator.onLine, paused: localStorage.getItem(PAUSE_KEY) === '1', error: '' };

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  emit() { for (const listener of this.listeners) listener(this.snapshot); }

  async refresh() {
    const [jobs, { usage, quota }] = await Promise.all([listPendingVideos(), storageEstimate()]);
    this.snapshot = {
      ...this.snapshot, jobs: jobs.map((job) => ({ ...job, progress: this.progress.get(job.recordingId) ?? job.progress })),
      usage, quota, online: navigator.onLine, paused: localStorage.getItem(PAUSE_KEY) === '1',
    };
    this.emit();
  }

  async start() {
    if (this.running) return;
    this.running = true;
    // The warehouse screen no longer exposes pause; clear a value saved by older versions.
    localStorage.removeItem(PAUSE_KEY);
    try {
      await migrateLegacyVideos();
      // Older versions stopped transient retries after five failures. Resume those jobs on reopen.
      for (const job of await listPendingVideos()) {
        if (job.autoRetry !== false || !['FAILED', 'SYNC_PENDING'].includes(job.status)) continue;
        if (['VIDEO_TOO_LARGE', 'UNSUPPORTED_VIDEO_TYPE', 'VIDEO_ALREADY_SAVED',
          'FORBIDDEN', 'LOCAL_FILE_MISSING', 'ORDER_CHANGED'].includes(job.lastError)) continue;
        await updatePendingVideo(job.recordingId, {
          status: job.status === 'FAILED' ? 'QUEUED' : 'SYNC_PENDING',
          autoRetry: true, retryCount: 0, nextRetryAt: null,
        });
      }
      await cleanupCompletedFiles();
      await this.refresh();
      await navigator.storage?.persist?.().catch(() => {});
    } catch (error) {
      this.snapshot = { ...this.snapshot, error: error.message };
      this.emit();
    }
    if (!this.running) return;
    this.timer = setInterval(() => this.pump(), 3_000);
    window.addEventListener('online', this.onConnectivity);
    window.addEventListener('offline', this.onConnectivity);
    window.addEventListener('storage', this.onStorage);
    this.pump();
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    window.removeEventListener('online', this.onConnectivity);
    window.removeEventListener('offline', this.onConnectivity);
    window.removeEventListener('storage', this.onStorage);
  }

  onConnectivity = () => { this.refresh().catch(() => {}); if (navigator.onLine) this.pump(); };
  onStorage = (event) => { if (event.key === PAUSE_KEY) { this.refresh().catch(() => {}); this.pump(); } };

  async pause() { localStorage.setItem(PAUSE_KEY, '1'); await this.refresh(); }
  async resume() { localStorage.removeItem(PAUSE_KEY); await this.refresh(); this.pump(); }

  async retry(recordingId) {
    const job = (await listPendingVideos()).find((item) => item.recordingId === recordingId);
    if (!job || job.status === 'COMPLETED') return;
    await updatePendingVideo(recordingId, {
      status: job.status === 'SYNC_PENDING' ? 'SYNC_PENDING' : 'QUEUED',
      retryCount: 0, nextRetryAt: null, lastError: null, autoRetry: true,
    });
    await this.refresh();
    this.pump();
  }

  async retryAll() {
    for (const job of await listPendingVideos()) {
      if (job.status === 'FAILED' || job.status === 'SYNC_PENDING') await this.retry(job.recordingId);
    }
    this.pump();
  }

  async remove(recordingId) {
    const wasPaused = localStorage.getItem(PAUSE_KEY) === '1';
    await this.pause();
    try {
      const remove = async () => {
        const job = (await listPendingVideos()).find((item) => item.recordingId === recordingId);
        if (!job) return;
        if (job.status === 'UPLOADING') throw new Error('Video đang upload; hãy đợi upload kết thúc rồi xóa.');
        await deletePendingVideo(job);
      };
      if (navigator.locks?.request) await navigator.locks.request(LOCK_NAME, remove);
      else await remove();
      await this.refresh();
    } finally {
      if (!wasPaused) await this.resume();
    }
  }

  async pump() {
    if (!this.running || this.busy || !navigator.onLine || localStorage.getItem(PAUSE_KEY) === '1') return;
    this.busy = true;
    try {
      if (navigator.locks?.request) {
        await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (lock) await this.processBatch();
        });
      } else {
        // Browsers without Web Locks use a short localStorage lease, renewed during upload.
        await this.withLocalLease(() => this.processBatch());
      }
    } catch (error) {
      this.snapshot = { ...this.snapshot, error: error.message };
      this.emit();
    } finally {
      this.busy = false;
    }
  }

  async withLocalLease(work) {
    const key = `${LOCK_NAME}-lease`;
    const owner = crypto.randomUUID();
    const current = JSON.parse(localStorage.getItem(key) || 'null');
    if (current && current.until > Date.now()) return;
    localStorage.setItem(key, JSON.stringify({ owner, until: Date.now() + 30_000 }));
    if (JSON.parse(localStorage.getItem(key) || 'null')?.owner !== owner) return;
    const renew = setInterval(() => {
      if (JSON.parse(localStorage.getItem(key) || 'null')?.owner !== owner) {
        clearInterval(renew);
        return;
      }
      localStorage.setItem(key, JSON.stringify({ owner, until: Date.now() + 30_000 }));
    }, 10_000);
    try { await work(); } finally {
      clearInterval(renew);
      if (JSON.parse(localStorage.getItem(key) || 'null')?.owner === owner) localStorage.removeItem(key);
    }
  }

  async processBatch() {
    const jobs = selectRunnableJobs(await listPendingVideos(), Date.now(), CONCURRENCY);
    await Promise.all(jobs.map((job) => this.processJob(job)));
    await this.refresh();
    if (jobs.length && this.running) queueMicrotask(() => this.pump());
  }

  async processJob(job) {
    try {
      await updatePendingVideo(job.recordingId, { status: job.status === 'SYNC_PENDING' ? 'SYNC_PENDING' : 'UPLOADING', lastError: null });
      await this.refresh();
      try {
        const result = await packingSessionService.syncRecording(job);
        if (result.data.status === 'COMPLETED') {
          await completePendingVideo(job);
          return;
        }
        await updatePendingVideo(job.recordingId, {
          ...retryPatch({ ...job, status: 'SYNC_PENDING' }, result.data.reason || 'DATABASE_SYNC_FAILED',
            Date.now(), result.data.reason === 'ORDER_CHANGED'),
          cloudinaryPublicId: result.data.publicId,
        });
        return;
      } catch (error) {
        if (error.code !== 'VIDEO_NOT_UPLOADED') throw error;
      }
      const blob = await readPendingVideo(job).catch((error) => {
        if (error.name === 'NotFoundError') {
          const missing = new Error('Video cục bộ không còn trên thiết bị.');
          missing.code = 'LOCAL_FILE_MISSING';
          throw missing;
        }
        throw error;
      });
      const result = await packingSessionService.uploadRecording(job, blob, (event) => {
        if (!event.total) return;
        const now = Date.now();
        if (now - (this.lastProgressAt.get(job.recordingId) || 0) < 250 && event.loaded < event.total) return;
        this.lastProgressAt.set(job.recordingId, now);
        this.progress.set(job.recordingId, Math.min(99, Math.round(event.loaded / event.total * 100)));
        this.refresh().catch(() => {});
      });
      if (result.data.status === 'COMPLETED') {
        await completePendingVideo(job);
      } else {
        await updatePendingVideo(job.recordingId, {
          ...retryPatch({ ...job, status: 'SYNC_PENDING' }, result.data.reason || 'DATABASE_SYNC_FAILED',
            Date.now(), result.data.reason === 'ORDER_CHANGED'),
          cloudinaryPublicId: result.data.publicId,
        });
      }
    } catch (error) {
      const code = error.code || (error.status === 401 ? 'AUTH_REQUIRED' : error.status === 403 ? 'FORBIDDEN' : error.message);
      await updatePendingVideo(job.recordingId, retryPatch(job, code,
        Date.now(), permanentErrors.has(code) || code === 'ORDER_CHANGED'));
    } finally {
      this.progress.delete(job.recordingId);
    }
  }
}

export const packingVideoUploadManager = new PackingVideoUploadManager();
