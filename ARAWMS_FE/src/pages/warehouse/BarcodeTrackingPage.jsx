/*
 * File: BarcodeTrackingPage.jsx
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Tracks one finished-goods unit barcode through the warehouse: entered, placed on a
 * shelf, left, and re-entered after a return. The barcode is scanned with the camera or typed
 * (a handheld scanner types into the same field).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BarcodeScanner from '../../components/scanner/BarcodeScanner';
import { productService } from '../../services/productService';
import '../../styles/finishedGoods.css';
import '../../styles/barcodeTracking.css';

const dateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN') : 'Không rõ thời gian');
const EVENT_CLASS = { IN: 'in', REENTRY: 'reentry', PUTAWAY: 'putaway', OUT: 'out', HANDOVER: 'out', STOCKTAKE: 'reentry', WRITE_OFF: 'out' };

/** Barcode tracking for warehouse managers and staff. */
export default function BarcodeTrackingPage({ isStaffMode = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const productBase = isStaffMode ? '/warehouse/staff/finished-goods' : '/warehouse/finished-goods';
  const activeBarcode = searchParams.get('barcode') || '';

  const lookup = useCallback(async (barcode) => {
    const value = String(barcode || '').trim();
    if (!value) return;
    setLoading(true); setError('');
    try { setResult((await productService.barcodeTimeline(value)).data); }
    catch (requestError) { setResult(null); setError(requestError.message); }
    finally { setLoading(false); }
  }, []);

  // The barcode lives in the URL so a lookup can be shared or reopened.
  useEffect(() => { if (activeBarcode) lookup(activeBarcode); }, [activeBarcode, lookup]);
  const search = (barcode) => {
    const value = String(barcode || '').trim();
    if (!value) return;
    if (value === activeBarcode) lookup(value); else setSearchParams({ barcode: value });
  };

  return <main className="finished-goods-page barcode-tracking-page" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
    <nav className="product-breadcrumb" aria-label="Đường dẫn">
      <Link to="/">Trang chủ</Link>
      <span>/</span>
      {isStaffMode && <><Link to="/warehouse/putaway">Nhân viên kho</Link><span>/</span></>}
      <strong>Tra cứu barcode</strong>
    </nav>

    <div className="product-page-head finished-goods-hero">
      <div className="finished-goods-intro">
        <p className="product-eyebrow">KHO THÀNH PHẨM</p>
        <h1>Tra cứu barcode</h1>
        <p>Quét hoặc nhập barcode sản phẩm để xem chiếc đó vào kho, lên kệ, ra kho và vào lại kho khi nào.</p>
      </div>
    </div>

    <section className="fg-stock-card bt-search-card" aria-label="Tìm barcode">
      <BarcodeScanner onScan={search} onError={setError} formats={['CODE_128']} busy={loading} refocusKey={result}
        placeholder="Nhập barcode, hoặc dùng máy quét cầm tay (VD: ARA0188ADBC69C74782AA86)"
        cameraHint='Camera chưa mở. Bấm "Mở camera" rồi hướng vào tem barcode sản phẩm.' />
    </section>

    {error && <p className="finished-goods-message error" role="alert">{error}</p>}
    {loading && !result && <p className="fg-empty">Đang tra cứu barcode...</p>}

    {result && <>
      <section className="fg-stock-card bt-summary" aria-label="Thông tin barcode">
        <div>
          <small>BARCODE</small>
          <h2><code>{result.barcode}</code></h2>
          <p>{result.product.productName} · {result.product.skuCode} · {result.product.color} / {result.product.size}</p>
          {result.product.id && <Link to={`${productBase}/${result.product.id}`}>Xem chi tiết sản phẩm</Link>}
        </div>
        <div className={`bt-current ${result.current.code.toLowerCase()}`}>
          <small>HIỆN TẠI</small>
          <strong>{result.current.label}</strong>
          {result.current.barcode !== result.barcode && <span>theo barcode {result.current.barcode}</span>}
        </div>
      </section>

      {result.notes.map((note) => <p key={note} className="bt-note">{note}</p>)}

      <section className="fg-stock-card" aria-label="Hành trình trong kho">
        <div className="fg-stock-heading"><div><h2>Hành trình trong kho</h2>
          <p>{result.segments.length > 1 ? 'Chiếc hàng được cấp barcode mới mỗi lần vào lại kho; các barcode được nối theo thứ tự.' : 'Các mốc ra vào kho của barcode này.'}</p></div></div>
        {result.segments.map((segment, index) => <div key={segment.barcode} className="bt-segment">
          {result.segments.length > 1 && <h3>
            Barcode {index + 1}: <code>{segment.barcode}</code>{segment.searched && <span className="bt-tag">đang tra</span>}
          </h3>}
          <ol className="bt-timeline">{segment.events.map((event, eventIndex) => <li key={`${event.type}:${eventIndex}`} className={EVENT_CLASS[event.type]}>
            <span className="bt-dot" aria-hidden="true" />
            <div>
              <time>{dateTime(event.at)}</time>
              <strong>{event.title}</strong>
              <p>{event.details.join(' · ')}</p>
              {event.candidateBarcodes && <div className="bt-candidates">
                {event.candidateBarcodes.map((code) => <button key={code} type="button" onClick={() => search(code)}><code>{code}</code></button>)}
              </div>}
            </div>
          </li>)}</ol>
        </div>)}
      </section>
    </>}
  </main>;
}
