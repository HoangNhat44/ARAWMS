/*
 * File: packingSessionService.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Calls packing session, scan, and recording APIs.
 */
import api from './api';

export const packingSessionService = {
  resolveOrderQr: (qrValue) => api.post('/order-qr/qr/resolve', { qrValue }),
  openSession: (qrValue, stationId) => api.post('/packing/prepare', { qrValue, stationId }),
  renewSessionLease: (sessionId, stationId, leaseVersion) => api.post(`/packing/sessions/${sessionId}/heartbeat`, { stationId, leaseVersion }),
  releaseSession: (sessionId, stationId, leaseVersion) => api.post(`/packing/sessions/${sessionId}/release`, { stationId, leaseVersion }),
  discardAttempt: (sessionId, stationId, leaseVersion) => api.post(`/packing/sessions/${sessionId}/cancel`, { stationId, leaseVersion }),
  scanProductBarcode: (sessionId, payload) => api.post(`/packing/sessions/${sessionId}/scan`, payload),
  removeScannedBarcode: (sessionId, payload) => api.post(`/packing/sessions/${sessionId}/scans/remove`, payload),
  // Send the raw recording with a stable ID so server retries remain idempotent.
  uploadRecording: (job, blob, onUploadProgress) => api.post(`/packing/sessions/${job.sessionId}/video`, blob, {
    headers: {
      'Content-Type': job.mimeType,
      'X-Recording-Id': job.recordingId,
      'X-Video-Duration-Ms': String(job.durationMs),
    },
    onUploadProgress,
  }),
  // Retry metadata synchronization when Cloudinary has the video but MongoDB does not.
  syncRecording: (job) => api.post(`/packing/sessions/${job.sessionId}/video/${job.recordingId}/sync`, {
    durationMs: job.durationMs,
  }),
  getSavedRecording: (sessionId) => api.get(`/packing/sessions/${sessionId}/video`, { responseType: 'blob' }),
};
