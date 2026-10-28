/*
 * File: PendingReceiptAllocation.jsx
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Assigns still-unallocated accepted units from an existing receipt to eligible bins.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productService } from '../services/productService';
import RackAvailability from './RackAvailability';

const field = { width: '100%', padding: '.65rem', border: '1px solid var(--ara-border)', borderRadius: 8, font: 'inherit' };

export default function PendingReceiptAllocation({ receipt, products, onDone, onClose }) {
  const [progress, setProgress] = useState([]);
  const [bins, setBins] = useState([]);
  const [racks, setRacks] = useState([]);
  const [binDiagnostics, setBinDiagnostics] = useState(null);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [requestKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    setLoading(true);
    productService.receiptDetail(receipt.id).then(async (response) => {
      const available = response.data.progress.filter((item) => item.unallocated > 0);
      const options = available.length ? await productService.binOptions(available.map((item) => item.skuId)) : null;
      if (active) { setProgress(available); setBins(options?.data.bins || []);
        setRacks(options?.data.racks || []);
        setBinDiagnostics(options?.data.diagnostics || null); }
    }).catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [receipt.id]);
  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (!rows.length) throw new Error('Hãy chọn ít nhất một ô kệ.');
      const pairs = new Set();
      const bySku = new Map();
      const byBin = new Map();
      for (const row of rows) {
        const bin = bins.find((item) => item.id === row.locationId);
        const quantity = Number(row.quantity);
        const pair = `${row.skuId}:${row.locationId}`;
        if (!bin || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Chọn ô và nhập số nguyên dương.');
        if (pairs.has(pair)) throw new Error('Một SKU chỉ được chọn một lần cho mỗi ô.');
        pairs.add(pair);
        bySku.set(row.skuId, (bySku.get(row.skuId) || 0) + quantity);
        byBin.set(row.locationId, (byBin.get(row.locationId) || 0) + quantity);
      }
      for (const [skuId, quantity] of bySku) if (quantity > progress.find((item) => item.skuId === skuId).unallocated)
        throw new Error('Phân bổ vượt số hàng chưa phân bổ.');
      for (const [binId, quantity] of byBin) if (quantity > bins.find((item) => item.id === binId).available)
        throw new Error('Ô đã chọn không đủ chỗ theo số liệu đang hiển thị.');
      await productService.allocateReceipt(receipt.id, { idempotencyKey: requestKey,
        lines: rows.map((row) => ({ skuId: row.skuId, targetLocationId: row.locationId,
          allocatedQuantity: Number(row.quantity) })) });
      onDone();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };
  return <section className="receiving-allocation" aria-label="Hàng chờ phân bổ">
    <h3>Phân bổ hàng từ phiếu {receipt.documentCode}</h3>
    <p>Chỉ số hàng đạt còn ở khu chờ mới được phân bổ. Sức chứa được kiểm tra lại lúc lưu.</p>
    {loading ? <p role="status">Đang tải hàng và ô phù hợp...</p> : <form onSubmit={save} style={{ display: 'grid', gap: '1rem' }}>
      <RackAvailability bins={bins} racks={racks} rows={rows} />
      {progress.length > 0 && bins.length === 0 && <p role="status" className="receiving-setup-note">
        {binDiagnostics?.withCapacity === 0 ? 'Các ô kệ khu B chưa được đặt sức chứa.'
          : 'Chưa có ô kệ hoạt động và còn chỗ.'}
        {' '}Hãy mở <Link to="/warehouse/layout">Cấu hình vị trí kho</Link> để cập nhật sức chứa từng ô.
      </p>}
      <label>Tìm ô kệ<input style={field} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {progress.map((item) => {
        const sku = products.flatMap((product) => product.skus.map((variant) => ({ ...variant, product })))
          .find((variant) => variant.id === item.skuId);
        const chosen = rows.filter((row) => row.skuId === item.skuId);
        const selected = chosen.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
        const eligible = bins.filter((bin) =>
          `${bin.locationCode} ${bin.rackCode} ${bin.floorNo} ${bin.binNo}`.toLowerCase().includes(search.toLowerCase()));
        return <div className="receiving-allocation-sku" key={item.skuId}>
          <div className="receiving-allocation-heading">
            {sku?.product.thumbnailUrl && <img src={sku.product.thumbnailUrl} alt="" />}
            <div><strong>{sku?.product.productName} · {sku?.skuCode}</strong><small>{sku?.color} / {sku?.size}</small></div>
            <span>Chưa phân bổ {item.unallocated} · Lần này {selected}</span>
          </div>
          {chosen.map((row) => {
            const bin = bins.find((entry) => entry.id === row.locationId);
            return <div className="receiving-allocation-row" key={row.key}>
              <select style={field} aria-label={`Ô kệ cho ${sku?.skuCode}`} value={row.locationId} onChange={(event) => setRows((current) => current.map((entry) => entry.key === row.key ? { ...entry, locationId: event.target.value } : entry))}>
                <option value="">Chọn ô kệ</option>
                {eligible.map((entry) => <option key={entry.id} value={entry.id}>{entry.rackLabel || entry.rackCode} · Tầng {entry.floorNo} · Ô {entry.binNo} · còn {entry.available}</option>)}
                {bin && !eligible.some((entry) => entry.id === bin.id) && <option value={bin.id}>{bin.locationCode}</option>}
              </select>
              <input style={field} type="number" min="1" step="1" aria-label="Số phân bổ" value={row.quantity} onChange={(event) => setRows((current) => current.map((entry) => entry.key === row.key ? { ...entry, quantity: event.target.value } : entry))} />
              {bin && <small>Sức chứa {bin.maxCapacity} · Đang có {bin.currentOccupancy} · Đã giữ {bin.plannedReservedQty} · Còn {bin.available}</small>}
              <button className="btn-ara-secondary" type="button" onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}>Xóa</button>
            </div>;
          })}
          <button className="btn-ara-secondary" type="button" onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), skuId: item.skuId, locationId: '', quantity: '' }])}>+ Chọn ô kệ</button>
        </div>;
      })}
      {error && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: '.75rem' }}><button className="btn-ara-primary" type="submit" disabled={saving || !progress.length}>{saving ? 'Đang giữ chỗ...' : 'Xác nhận phân bổ'}</button><button className="btn-ara-secondary" type="button" onClick={onClose}>Đóng</button></div>
    </form>}
    {loading && error && <p role="alert">{error}</p>}
  </section>;
}
