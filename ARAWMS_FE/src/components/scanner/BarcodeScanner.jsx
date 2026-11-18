/*
 * File: BarcodeScanner.jsx
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Reusable barcode input with two modes: typing (also used by handheld scanners,
 * which type the code and press Enter) and camera scanning via useBarcodeCamera.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, ScanBarcode, Search } from 'lucide-react';
import { useBarcodeCamera } from '../../hooks/useBarcodeCamera';
import '../../styles/barcodeScanner.css';

/**
 * @param {object} props
 * @param {(code: string) => void} props.onScan  Receives each typed or scanned code (trimmed).
 * @param {(message: string) => void} [props.onError]  Camera errors.
 * @param {string[]} [props.formats]  ZXing format names for the camera.
 * @param {boolean} [props.keepCameraOpen]  Keep scanning after a read (default true).
 * @param {'manual'|'camera'} [props.initialMode]
 * @param {boolean} [props.busy]  Disables the submit button while a lookup runs.
 * @param {string} [props.placeholder]
 * @param {string} [props.submitLabel]
 * @param {string} [props.cameraHint]  Text shown while the camera is off.
 * @param {*} [props.refocusKey]  Changing it puts the cursor back in the input (e.g. after a result).
 */
export default function BarcodeScanner({
  onScan, onError, formats = ['CODE_128'], keepCameraOpen = true, initialMode = 'manual', busy = false,
  placeholder = 'Nhập barcode, hoặc dùng máy quét cầm tay', submitLabel = 'Tra cứu',
  cameraHint = 'Camera chưa mở. Bấm "Mở camera" rồi hướng vào tem barcode.', refocusKey,
}) {
  const [mode, setMode] = useState(initialMode);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const { videoRef, cameraOn, startCamera, stopCamera } = useBarcodeCamera({
    onScan, onError, formats, stopAfterScan: !keepCameraOpen,
  });

  useEffect(() => { if (mode === 'manual') inputRef.current?.focus(); }, [mode, refocusKey]);

  const switchMode = (next) => {
    if (next === mode) return;
    if (next === 'manual') stopCamera();
    setMode(next);
  };
  const submit = (event) => {
    event.preventDefault();
    const code = value.trim();
    if (!code) return;
    setValue('');
    onScan(code);
  };

  return <div className="bs-scanner">
    <div className="bs-mode-switch" role="tablist" aria-label="Cách nhập barcode">
      <button type="button" role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'active' : ''}
        onClick={() => switchMode('manual')}><Keyboard size={16} /> Nhập barcode</button>
      <button type="button" role="tab" aria-selected={mode === 'camera'} className={mode === 'camera' ? 'active' : ''}
        onClick={() => switchMode('camera')}><ScanBarcode size={16} /> Quét barcode</button>
    </div>

    {mode === 'manual' ? <form className="bs-manual" onSubmit={submit}>
      <label className="bs-input"><Search size={19} />
        <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off"
          placeholder={placeholder} aria-label="Barcode" />
      </label>
      <button type="submit" className="bs-primary" disabled={!value.trim() || busy}>{busy ? 'Đang xử lý...' : submitLabel}</button>
    </form> : <div className="bs-camera">
      <div className="bs-camera-view">
        <video ref={videoRef} muted playsInline className={cameraOn ? '' : 'hidden'} />
        {!cameraOn && <p>{cameraHint}</p>}
      </div>
      <button type="button" className={cameraOn ? 'bs-secondary' : 'bs-primary'} onClick={cameraOn ? stopCamera : startCamera}>
        {cameraOn ? <><CameraOff size={16} /> Tắt camera</> : <><Camera size={16} /> Mở camera</>}
      </button>
    </div>}
  </div>;
}
