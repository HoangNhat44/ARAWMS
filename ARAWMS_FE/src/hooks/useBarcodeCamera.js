/*
 * File: useBarcodeCamera.js
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Shared camera barcode reader for warehouse screens. Owns the camera session
 * (start, stop, cleanup on unmount), ignores late callbacks from a stopped session, suppresses the
 * same code being read many times per second, and can stop after the first read.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const CAMERA_UNAVAILABLE_MESSAGE = 'Camera cần HTTPS hoặc localhost và quyền truy cập thiết bị.';
const RESOLUTIONS = { hd: { width: 1280, height: 720 }, fullhd: { width: 1920, height: 1080 } };

/**
 * @param {object} options
 * @param {(code: string) => void} options.onScan  Called with each accepted code (trimmed).
 * @param {(message: string) => void} [options.onError]  Called when the camera cannot start.
 * @param {string[]} [options.formats]  ZXing BarcodeFormat names, e.g. ['CODE_128', 'QR_CODE'].
 * @param {boolean} [options.stopAfterScan]  Close the camera after the first accepted code.
 * @param {number} [options.duplicateWindowMs]  Ignore the same code again within this time; 0 disables it.
 * @param {'hd'|'fullhd'} [options.resolution]  Requested camera resolution.
 * @returns {{ videoRef: object, cameraOn: boolean, startCamera: () => Promise<void>, stopCamera: () => void }}
 */
export function useBarcodeCamera({
  onScan,
  onError,
  formats = ['CODE_128', 'QR_CODE'],
  stopAfterScan = false,
  duplicateWindowMs = 3000,
  resolution = 'fullhd',
} = {}) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const lastReadRef = useRef({ code: '', at: 0 });
  const [cameraOn, setCameraOn] = useState(false);
  // Callbacks and options are read through a ref so a running session always uses the latest ones.
  const optionsRef = useRef({});
  optionsRef.current = { onScan, onError, formats, stopAfterScan, duplicateWindowMs, resolution };

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks?.().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    activeRef.current = false;
    setCameraOn(false);
  }, []);

  useEffect(() => () => {
    sessionRef.current += 1;
    controlsRef.current?.stop();
  }, []);

  const startCamera = useCallback(async () => {
    if (activeRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      optionsRef.current.onError?.(CAMERA_UNAVAILABLE_MESSAGE);
      return;
    }
    const session = ++sessionRef.current;
    activeRef.current = true;
    setCameraOn(true);
    try {
      const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
      if (session !== sessionRef.current) return;
      // The <video> may render only once cameraOn is true; give React one tick to mount it.
      if (!videoRef.current) await new Promise((resolve) => setTimeout(resolve, 50));
      if (!videoRef.current) throw new Error('Không tìm thấy khung hiển thị camera.');
      const options = optionsRef.current;
      const size = RESOLUTIONS[options.resolution] || RESOLUTIONS.fullhd;
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = options.formats.map((name) => BarcodeFormat[name]).filter((value) => value !== undefined);
      const controls = await reader.decodeFromConstraints({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: size.width }, height: { ideal: size.height } },
        audio: false,
      }, videoRef.current, (result) => {
        if (!result || session !== sessionRef.current) return;
        const code = result.getText().trim();
        if (!code) return;
        const { duplicateWindowMs: pause, stopAfterScan: stopOnRead, onScan: handler } = optionsRef.current;
        const now = Date.now();
        if (pause > 0 && lastReadRef.current.code === code && now - lastReadRef.current.at < pause) return;
        lastReadRef.current = { code, at: now };
        if (stopOnRead) stopCamera();
        handler?.(code);
      });
      if (session !== sessionRef.current) controls.stop();
      else controlsRef.current = controls;
    } catch (error) {
      if (session !== sessionRef.current) return;
      stopCamera();
      optionsRef.current.onError?.(`Không mở được camera: ${error?.message || error}`);
    }
  }, [stopCamera]);

  return { videoRef, cameraOn, startCamera, stopCamera };
}
