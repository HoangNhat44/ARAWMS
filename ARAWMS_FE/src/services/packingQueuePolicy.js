/*
 * File: packingQueuePolicy.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Selects eligible recording uploads and retry delays.
 */
export const RETRY_DELAYS = [5_000, 15_000, 30_000, 60_000, 60_000];

/** Selects due uploads oldest first, capped by the concurrency limit. */
export const selectRunnableJobs = (jobs, now, concurrency) => jobs
  .filter((job) => ['QUEUED', 'FAILED', 'UPLOADING', 'SYNC_PENDING'].includes(job.status))
  .filter((job) => job.autoRetry !== false)
  .filter((job) => job.status === 'UPLOADING' ||
    (job.nextRetryAt ? Date.parse(job.nextRetryAt) <= now : job.status !== 'FAILED'))
  .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  .slice(0, concurrency);

/** Schedules transient failures for retry and leaves permanent failures for manual action. */
export const retryPatch = (job, errorCode, now, permanent = false) => {
  const retryCount = (job.retryCount || 0) + 1;
  const autoRetry = !permanent;
  return {
    status: job.status === 'SYNC_PENDING' ? 'SYNC_PENDING' : 'FAILED',
    retryCount, autoRetry, lastError: errorCode,
    nextRetryAt: autoRetry ? new Date(now + RETRY_DELAYS[Math.min(retryCount - 1, RETRY_DELAYS.length - 1)]).toISOString() : null,
  };
};
