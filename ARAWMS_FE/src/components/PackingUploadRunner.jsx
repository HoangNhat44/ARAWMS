/*
 * File: PackingUploadRunner.jsx
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Runs the recording upload queue while the app is open.
 */
import { useEffect } from 'react';
import { packingVideoUploadManager } from '../services/packingVideoUploadManager';

/** Keeps pending packing-video uploads running while the application is mounted.
 * It has no visible UI; upload status is exposed through the shared manager. */
export default function PackingUploadRunner() {
  useEffect(() => {
    packingVideoUploadManager.start();
    return () => packingVideoUploadManager.stop();
  }, []);
  return null;
}
