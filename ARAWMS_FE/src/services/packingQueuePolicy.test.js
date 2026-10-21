import test from 'node:test';
import assert from 'node:assert/strict';
import { retryPatch, selectRunnableJobs } from './packingQueuePolicy.js';

test('100 video đang chờ chỉ cấp tối đa hai tác vụ theo thứ tự', () => {
  const jobs = Array.from({ length: 100 }, (_, i) => ({
    recordingId: `recording_${i}`, status: 'QUEUED', createdAt: new Date(i * 1000).toISOString(),
  }));
  assert.deepEqual(selectRunnableJobs(jobs, Date.now(), 2).map((job) => job.recordingId),
    ['recording_0', 'recording_1']);
});

test('video upload dở sau refresh được kiểm tra lại; lỗi xác thực chờ sửa thủ công', () => {
  const now = Date.now();
  const jobs = [{ status: 'UPLOADING', createdAt: '2026-01-01' },
    { status: 'FAILED', nextRetryAt: new Date(now + 5000).toISOString(), createdAt: '2026-01-02' }];
  assert.equal(selectRunnableJobs(jobs, now, 2).length, 1);
  const failure = retryPatch({ status: 'QUEUED', retryCount: 0 }, 'CLOUDINARY_AUTH_FAILED', now, true);
  assert.equal(failure.autoRetry, false);
  assert.equal(failure.nextRetryAt, null);
});

test('SYNC_PENDING giữ trạng thái và backoff; dừng tự thử sau giới hạn', () => {
  const now = Date.now();
  const pending = retryPatch({ status: 'SYNC_PENDING', retryCount: 0 }, 'DATABASE_SYNC_FAILED', now);
  assert.equal(pending.status, 'SYNC_PENDING');
  assert.equal(Date.parse(pending.nextRetryAt) - now, 5000);
  const exhausted = retryPatch({ status: 'SYNC_PENDING', retryCount: 5 }, 'DATABASE_SYNC_FAILED', now);
  assert.equal(exhausted.autoRetry, false);
  assert.equal(exhausted.nextRetryAt, null);
});
