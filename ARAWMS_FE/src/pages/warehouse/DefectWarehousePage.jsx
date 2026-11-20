/*
 * File: DefectWarehousePage.jsx
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Finished-goods defect warehouse. Shows defective units inside the defect warehouse
 * (DEFECTIVE) and units waiting for the warehouse to receive them (DEFECT_PENDING, set by the garment
 * technician's return inspection), and lets a warehouse manager take defective units out with a reason.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BarcodeScanner from '../../components/scanner/BarcodeScanner';
import { productService } from '../../services/productService';
import '../../styles/finishedGoods.css';
import '../../styles/defectWarehouse.css';

const date = (value) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—');
const TABS = [
  { key: 'DEFECTIVE', label: 'Trong kho hàng lỗi' },
  { key: 'DEFECT_PENDING', label: 'Chờ nhập kho lỗi' },
];

/** Defect warehouse for warehouse managers: view and take out defective units. */
export default function DefectWarehousePage() {
  const [data, setData] = useState({ summary: { pending: 0, inStock: 0 }, units: [] });
  const [tab, setTab] = useState('DEFECTIVE');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await productService.defectUnits()).data); setError(''); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi-VN');
    return data.units.filter((unit) => unit.status === tab && (!query ||
      [unit.barcode, unit.skuCode, unit.productName, unit.productCode, unit.color, unit.defectReason, unit.orderCode]
        .join(' ').toLocaleLowerCase('vi-VN').includes(query)));
  }, [data.units, tab, search]);
  const inStockBarcodes = useMemo(() => new Set(data.units.filter((unit) => unit.status === 'DEFECTIVE').map((unit) => unit.barcode)), [data.units]);
  const allVisibleSelected = tab === 'DEFECTIVE' && rows.length > 0 && rows.every((unit) => selected.includes(unit.barcode));

  const toggle = (barcode) => setSelected((current) => current.includes(barcode)
    ? current.filter((item) => item !== barcode) : [...current, barcode]);
  /** A scanned label is added to the outbound list only if it is inside the defect warehouse. */
  const addScanned = (raw) => {
    const barcode = String(raw || '').trim();
    if (!barcode) return;
    setMessage('');
    if (!inStockBarcodes.has(barcode)) {
      const pending = data.units.some((unit) => unit.barcode === barcode && unit.status === 'DEFECT_PENDING');
      setError(pending ? `Tem ${barcode} chưa được nhập vào kho hàng lỗi.` : `Tem ${barcode} không có trong kho hàng lỗi.`);
      return;
    }
    setError('');
    setTab('DEFECTIVE');
    setSelected((current) => (current.includes(barcode) ? current : [...current, barcode]));
  };

  const takeOut = async () => {
    if (!selected.length || busy) return;
    if (!reason.trim()) { setError('Vui lòng nhập lý do xuất hàng lỗi.'); return; }
    if (!window.confirm(`Xuất ${selected.length} chiếc hàng lỗi khỏi kho?\nLý do: ${reason.trim()}`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = (await productService.defectOutbound({ barcodes: selected, reason: reason.trim() })).data;
      setMessage(`Đã xuất ${result.quantity} chiếc hàng lỗi (phiếu ${result.ticketCode}).`);
      setSelected([]); setReason('');
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  return <main className="finished-goods-page defect-warehouse-page" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
    <nav className="product-breadcrumb" aria-label="Đường dẫn">
      <Link to="/">Trang chủ</Link><span>/</span>
      <Link to="/warehouse/finished-goods">Kho thành phẩm</Link><span>/</span>
      <strong>Kho hàng lỗi</strong>
    </nav>

    <div className="product-page-head finished-goods-hero">
      <div className="finished-goods-intro">
        <p className="product-eyebrow">KHO THÀNH PHẨM</p>
        <h1>Kho hàng lỗi</h1>
        <p>Hàng hoàn bị kỹ thuật đánh giá lỗi. Hàng lỗi không tính vào tồn bán; kho chỉ xem và xuất hàng lỗi khi cần.</p>
      </div>
    </div>

    <div className="dw-summary" aria-label="Tổng quan kho hàng lỗi">
      <button type="button" className={`dw-summary-card ${tab === 'DEFECTIVE' ? 'is-active' : ''}`} onClick={() => setTab('DEFECTIVE')}>
        <small>Trong kho hàng lỗi</small><strong>{data.summary.inStock}</strong><span>chiếc</span>
      </button>
      <button type="button" className={`dw-summary-card pending ${tab === 'DEFECT_PENDING' ? 'is-active' : ''}`} onClick={() => setTab('DEFECT_PENDING')}>
        <small>Chờ nhập kho lỗi</small><strong>{data.summary.pending}</strong><span>chiếc · xác nhận ở Lệnh nhập thành phẩm</span>
      </button>
    </div>

    {error && <p className="finished-goods-message error" role="alert">{error}</p>}
    {message && <p className="finished-goods-message success" role="status">{message}</p>}

    <section className="fg-stock-card dw-outbound" aria-label="Xuất hàng lỗi">
      <div className="fg-stock-heading"><div><h2>Xuất hàng lỗi</h2>
        <p>Quét tem hoặc tích chọn trong danh sách bên dưới, nhập lý do rồi xuất.</p></div></div>
      <BarcodeScanner onScan={addScanned} onError={setError} formats={['CODE_128']} busy={busy} submitLabel="Thêm"
        placeholder="Quét hoặc nhập tem hàng lỗi" cameraHint='Camera chưa mở. Bấm "Mở camera" rồi hướng vào tem hàng lỗi.' />
      <div className="dw-outbound-form">
        <label className="dw-reason"><span>Lý do xuất <b>*</b></span>
          <textarea rows={2} maxLength={500} value={reason} disabled={busy}
            placeholder="Ví dụ: Trả xưởng sửa / Thanh lý cho đối tác / Tiêu hủy"
            onChange={(event) => { setReason(event.target.value); if (event.target.value.trim()) setError(''); }} />
        </label>
        <div className="dw-outbound-actions">
          <span>Đã chọn <strong>{selected.length}</strong> chiếc</span>
          {selected.length > 0 && <button type="button" className="btn-ara-secondary" disabled={busy} onClick={() => setSelected([])}>Bỏ chọn</button>}
          <button type="button" className="btn-ara-primary" disabled={busy || !selected.length} onClick={takeOut}>
            {busy ? 'Đang xuất...' : selected.length ? `Xuất ${selected.length} chiếc` : 'Xuất hàng lỗi'}
          </button>
        </div>
      </div>
    </section>

    <section className="fg-stock-card" aria-label="Danh sách hàng lỗi">
      <div className="fg-stock-heading dw-list-head">
        <div role="tablist" className="dw-tabs">{TABS.map((item) => <button key={item.key} type="button" role="tab"
          aria-selected={tab === item.key} className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}>
          {item.label} ({item.key === 'DEFECTIVE' ? data.summary.inStock : data.summary.pending})</button>)}</div>
        <input className="dw-search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm tem, SKU, sản phẩm, lý do, đơn hoàn…" aria-label="Tìm hàng lỗi" />
      </div>
      {loading ? <p className="fg-empty">Đang tải kho hàng lỗi...</p>
        : !rows.length ? <p className="fg-empty">{tab === 'DEFECTIVE' ? 'Kho hàng lỗi đang trống.' : 'Không có hàng lỗi chờ nhập.'}</p>
          : <div className="product-table-scroll"><table className="product-table dw-table">
            <thead><tr>
              {tab === 'DEFECTIVE' && <th><input type="checkbox" aria-label="Chọn tất cả" checked={allVisibleSelected}
                onChange={(event) => setSelected((current) => event.target.checked
                  ? [...new Set([...current, ...rows.map((unit) => unit.barcode)])]
                  : current.filter((barcode) => !rows.some((unit) => unit.barcode === barcode)))} /></th>}
              <th>Tem</th><th>Sản phẩm</th><th>Màu / Size</th><th>Lý do lỗi</th><th>Đơn hoàn</th>
              <th>{tab === 'DEFECTIVE' ? 'Ngày nhập kho lỗi' : 'Ngày kỹ thuật kiểm'}</th><th>Số ngày</th>
              {tab === 'DEFECTIVE' && <th>Vị trí</th>}
            </tr></thead>
            <tbody>{rows.map((unit) => <tr key={unit.barcode} className={selected.includes(unit.barcode) ? 'is-selected' : ''}>
              {tab === 'DEFECTIVE' && <td><input type="checkbox" aria-label={`Chọn ${unit.barcode}`}
                checked={selected.includes(unit.barcode)} onChange={() => toggle(unit.barcode)} /></td>}
              <td><code>{unit.barcode}</code></td>
              <td><strong>{unit.skuCode}</strong><small>{unit.productName}</small></td>
              <td>{unit.color} / {unit.size}</td>
              <td>{unit.defectReason || '—'}</td>
              <td>{unit.orderCode || '—'}{unit.inspectionCode && <small>{unit.inspectionCode}</small>}</td>
              <td>{date(tab === 'DEFECTIVE' ? unit.receivedAt : unit.inspectedAt)}</td>
              <td>{unit.daysHeld ?? '—'}</td>
              {tab === 'DEFECTIVE' && <td>{unit.locationCode || '—'}</td>}
            </tr>)}</tbody>
          </table></div>}
    </section>
  </main>;
}
