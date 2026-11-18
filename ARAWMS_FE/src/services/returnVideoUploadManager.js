/*
 * File: returnVideoUploadManager.js
 * Description: Coordinates background Cloudinary uploads and retries for return-inspection recordings.
 */

import garmentTechnicalService from './garmentTechnicalService';
import {
  cleanupCompletedReturnFiles,
  completePendingReturnVideo,
  deletePendingReturnVideo,
  listPendingReturnVideos,
  readPendingReturnVideo,
  returnStorageEstimate,
  updatePendingReturnVideo,
} from './localReturnVideoQueue';
import { retryPatch, selectRunnableJobs } from './packingQueuePolicy';

const LOCK_NAME = 'arawms-return-video-upload';
const CONCURRENCY = 2;
const PERMANENT_ERRORS = new Set([
  'CLOUDINARY_AUTH_FAILED',
  'CLOUDINARY_NOT_CONFIGURED',
  'UNSUPPORTED_VIDEO_TYPE',
  'VIDEO_TOO_LARGE',
  'VIDEO_ALREADY_SAVED',
  'SESSION_NOT_FOUND',
  'SESSION_CANCELLED',
  'FORBIDDEN',
  'LOCAL_FILE_MISSING',
  'AUTH_REQUIRED',
]);

/**
 * Owns the browser-side upload queue for return-unboxing recordings awaiting Cloudinary upload.
 */
class ReturnVideoUploadManager {
  listeners = new Set();
  completionListeners = new Set();
  running = false;
  busy = false;
  timer = null;
  lastProgressAt = new Map();
  progress = new Map();
  snapshot = { jobs: [], usage: 0, quota: 0, online: navigator.onLine, error: '' };

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  onUploadCompleted(listener) {
    this.completionListeners.add(listener);
    return () => this.completionListeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this.snapshot);
  }

  emitCompleted(job) {
    for (const listener of this.completionListeners) {
      try {
        listener(job);
      } catch {
        // ignore listener errors
      }
    }
  }

  async refresh() {
    const [jobs, { usage, quota }] = await Promise.all([listPendingReturnVideos(), returnStorageEstimate()]);
    this.snapshot = {
      ...this.snapshot,
      jobs: jobs.map((job) => ({
        ...job,
        blob: undefined,
        progress: this.progress.get(job.recordingId) ?? job.progress,
      })),
      usage,
      quota,
      online: navigator.onLine,
    };
    this.emit();
  }

  async start() {
    if (this.running) return;
    this.running = true;
    try {
      await cleanupCompletedReturnFiles();
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
    this.pump();
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    window.removeEventListener('online', this.onConnectivity);
    window.removeEventListener('offline', this.onConnectivity);
  }

  onConnectivity = () => {
    this.refresh().catch(() => {});
    if (navigator.onLine) this.pump();
  };

  async retry(recordingId) {
    const job = (await listPendingReturnVideos()).find((item) => item.recordingId === recordingId);
    if (!job || job.status === 'COMPLETED') return;
    await updatePendingReturnVideo(recordingId, {
      status: job.status === 'SYNC_PENDING' ? 'SYNC_PENDING' : 'QUEUED',
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
      autoRetry: true,
    });
    await this.refresh();
    this.pump();
  }

  async remove(recordingId) {
    const job = (await listPendingReturnVideos()).find((item) => item.recordingId === recordingId);
    if (!job || job.status === 'UPLOADING') return;
    await deletePendingReturnVideo(job);
    await this.refresh();
  }

  async pump() {
    if (!this.running || this.busy || !navigator.onLine) return;
    this.busy = true;
    try {
      if (navigator.locks?.request) {
        await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (lock) await this.processBatch();
        });
      } else {
        await this.processBatch();
      }
    } catch (error) {
      this.snapshot = { ...this.snapshot, error: error.message };
      this.emit();
    } finally {
      this.busy = false;
    }
  }

  async processBatch() {
    const jobs = selectRunnableJobs(await listPendingReturnVideos(), Date.now(), CONCURRENCY);
    await Promise.all(jobs.map((job) => this.processJob(job)));
    await this.refresh();
    if (jobs.length && this.running) queueMicrotask(() => this.pump());
  }

  async processJob(job) {
    try {
      await updatePendingReturnVideo(job.recordingId, {
        status: job.status === 'SYNC_PENDING' ? 'SYNC_PENDING' : 'UPLOADING',
        lastError: null,
      });
      await this.refresh();

      try {
        const synced = await garmentTechnicalService.returnInspection.syncVideo(job);
        if (synced.data?.status === 'COMPLETED') {
          await completePendingReturnVideo(job);
          this.emitCompleted(job);
          return;
        }
      } catch (error) {
        if (error.code !== 'VIDEO_NOT_UPLOADED') throw error;
      }

      const blob = await readPendingReturnVideo(job).catch((error) => {
        if (error.name === 'NotFoundError') {
          const missing = new Error('Video cục bộ không còn trên thiết bị.');
          missing.code = 'LOCAL_FILE_MISSING';
          throw missing;
        }
        throw error;
      });

      const result = await garmentTechnicalService.returnInspection.uploadVideo(job, blob, (event) => {
        if (!event.total) return;
        const now = Date.now();
        if (now - (this.lastProgressAt.get(job.recordingId) || 0) < 250 && event.loaded < event.total) return;
        this.lastProgressAt.set(job.recordingId, now);
        this.progress.set(job.recordingId, Math.min(99, Math.round((event.loaded / event.total) * 100)));
        this.refresh().catch(() => {});
      });

      if (result.data?.status === 'COMPLETED') {
        await completePendingReturnVideo(job);
        this.emitCompleted(job);
      } else {
        await updatePendingReturnVideo(job.recordingId, {
          ...retryPatch(
            { ...job, status: 'SYNC_PENDING' },
            result.data?.reason || 'DATABASE_SYNC_FAILED',
            Date.now(),
            PERMANENT_ERRORS.has(result.data?.reason)
          ),
          cloudinaryPublicId: result.data?.publicId,
        });
      }
    } catch (error) {
      const code = error.code || (error.status === 401 ? 'AUTH_REQUIRED' : error.status === 403 ? 'FORBIDDEN' : error.message);
      await updatePendingReturnVideo(
        job.recordingId,
        retryPatch(job, code, Date.now(), PERMANENT_ERRORS.has(code))
      );
    } finally {
      this.progress.delete(job.recordingId);
    }
  }
}

export const returnVideoUploadManager = new ReturnVideoUploadManager();
