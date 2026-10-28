/*
 * File: BulkStockForm.jsx
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Collects finished goods stock document details.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productService } from '../services/productService';
import RackAvailability from './RackAvailability';

const input = { width: '100%', padding: '.65rem', border: '1px solid var(--ara-border)', borderRadius: 8, font: 'inherit' };
const createEmptyStockLine = () => ({ key: crypto.randomUUID(), productId: '', skuId: '', expectedQty: '', receivedQty: '', quantity: '', repairQty: '' });

/** Collects SKU quantities for a finished-goods inbound or outbound document.
 * Validates the selected stock lines before submitting them through the product API. */
export default function BulkStockForm({ direction, products, initialSkuIds = [], initialProductId = '', onDone, onCancel }) {
  const [documentCode, setDocumentCode] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([createEmptyStockLine()]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('inspection');
  const [confirmationKey] = useState(() => crypto.randomUUID());
  const [allocations, setAllocations] = useState([]);
  const [bins, setBins] = useState([]);
  const [racks, setRacks] = useState([]);
  const [binDiagnostics, setBinDiagnostics] = useState(null);
  const [loadingBins, setLoadingBins] = useState(false);
  const [binSearch, setBinSearch] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!products.length) return;
    if (!initialSkuIds.length) {
      const product = products.find((item) => item.id === initialProductId);
      if (product) setLines([{ ...createEmptyStockLine(), productId: product.id, skuId: product.skus.length === 1 ? product.skus[0].id : '' }]);
      return;
    }
    const selected = initialSkuIds.map((id) => {
      const product = products.find((item) => item.skus.some((sku) => sku.id === id));
      return product ? { ...createEmptyStockLine(), productId: product.id, skuId: id } : null;
    }).filter(Boolean);
    if (selected.length) setLines(selected);
  }, [initialSkuIds.join(','), initialProductId, products]);
  const selectedSkuIds = [...new Set(lines.map((line) => line.skuId).filter(Boolean))];
  useEffect(() => {
    if (direction !== 'IN' || step !== 'allocation' || !selectedSkuIds.length) return;
    let active = true;
    setLoadingBins(true);
    productService.binOptions(selectedSkuIds).then((response) => {
      if (active) { setBins(response.data.bins); setRacks(response.data.racks || []);
        setBinDiagnostics(response.data.diagnostics); }
    }).catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoadingBins(false); });
    return () => { active = false; };
  }, [direction, step, selectedSkuIds.join(',')]);

  /** Updates one document line and clears a SKU that no longer belongs to its product. */
  const updateStockLine = (key, field, value) => setLines((current) => current.map((line) => {
    if (line.key !== key) return line;
    if (field === 'productId') {
      const product = products.find((item) => item.id === value);
      return { ...line, productId: value, skuId: product?.skus.length === 1 ? product.skus[0].id : '' };
    }
    if (direction === 'IN' && (field === 'receivedQty' || field === 'quantity')) {
      const updated = { ...line, [field]: value };
      const received = Number(updated.receivedQty);
      const accepted = Number(updated.quantity);
      return { ...updated, repairQty: updated.receivedQty !== '' && updated.quantity !== '' &&
        Number.isSafeInteger(received) && Number.isSafeInteger(accepted) && accepted <= received
        ? String(received - accepted) : '' };
    }
    return { ...line, [field]: value };
  }));

  /** Sends the stock document after checking received = accepted + repair per line. */
  const submitBulkStockDocument = async (event, deferAllocation = false) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (direction === 'IN' && lines.some((line) => Number(line.receivedQty) !== Number(line.quantity) + Number(line.repairQty))) {
        throw new Error('Mỗi dòng phải có thực nhận = đạt nhập kho + trả sửa.');
      }
      if (direction === 'IN' && step === 'inspection') {
        if (lines.some((line) => !line.skuId)) throw new Error('Hãy chọn SKU cho từng dòng.');
        setStep('allocation');
        return;
      }
      const requested = deferAllocation ? [] : allocations;
      if (direction === 'IN' && !deferAllocation) {
        const used = new Set();
        const totals = new Map();
        const byBin = new Map();
        for (const row of requested) {
          const pair = `${row.skuId}:${row.locationId}`;
          const bin = bins.find((item) => item.id === row.locationId);
          const quantity = Number(row.quantity);
          if (!bin || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Chọn ô và nhập số nguyên dương cho từng dòng phân bổ.');
          if (used.has(pair)) throw new Error('Một SKU chỉ được chọn một lần cho mỗi ô.');
          used.add(pair);
          totals.set(row.skuId, (totals.get(row.skuId) || 0) + quantity);
          byBin.set(row.locationId, (byBin.get(row.locationId) || 0) + quantity);
        }
        for (const line of lines) if ((totals.get(line.skuId) || 0) > Number(line.quantity))
          throw new Error('Số phân bổ vượt số lượng đạt của SKU.');
        for (const [binId, quantity] of byBin) if (quantity > bins.find((bin) => bin.id === binId).available)
          throw new Error('Ô đã chọn không đủ chỗ theo số liệu đang hiển thị.');
      }
      const response = await productService.bulkMoveStock({
        direction, documentCode, note,
        ...(direction === 'IN' ? { confirmationKey, allocations: requested.map((row) => ({
          skuId: row.skuId, targetLocationId: row.locationId, allocatedQuantity: Number(row.quantity) })) } : {}),
        items: lines.map(({ productId, skuId, expectedQty, quantity, receivedQty, repairQty }) => ({ productId, skuId: skuId || undefined,
          quantity: Number(quantity), ...(direction === 'IN' ? { expectedQty: expectedQty === '' ? undefined : Number(expectedQty), receivedQty: Number(receivedQty), repairQty: Number(repairQty) } : {}) })),
      });
      onDone(response.data.document);
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };

  const totalReceived = lines.reduce((sum, line) => sum + (Number(line.receivedQty) || 0), 0);
  const totalAccepted = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const totalRepair = lines.reduce((sum, line) => sum + (Number(line.repairQty) || 0), 0);
  const invalidInspection = direction === 'IN' && lines.some((line) => line.receivedQty !== '' &&
    line.quantity !== '' && Number(line.quantity) > Number(line.receivedQty));
  return <section className="product-card receiving-card">
    <div className="product-card-head"><div><span className="product-section-number">{step === 'allocation' ? '03' : '02'}</span><h2>{direction === 'IN' ? step === 'allocation' ? 'Phân bổ vị trí' : 'Kiểm nhận hàng từ xưởng' : 'Phiếu xuất kho'}</h2></div><span className="product-badge active">{direction === 'IN' ? `Bước ${step === 'allocation' ? 3 : 2} / 4` : 'Xuất kho'}</span></div>
    {direction === 'IN' && <p className="product-muted receiving-intro">Ghi số xưởng báo giao để đối chiếu, sau đó nhập số thực nhận. Chỉ số lượng đạt mới được cộng vào tồn kho và cấp barcode riêng từng chiếc.</p>}
    <form onSubmit={submitBulkStockDocument} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
      <label style={{ maxWidth: 400 }}>{direction === 'IN' ? 'Mã biên bản nhập kho *' : 'Mã phiếu xuất kho *'}
        <input style={input} required maxLength={80} pattern="[A-Za-z0-9._/-]{2,80}" title="2–80 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang" value={documentCode} onChange={(event) => setDocumentCode(event.target.value.toUpperCase())} placeholder={direction === 'IN' ? 'Ví dụ: NK-2026-001' : 'Ví dụ: XK-2026-001'} />
      </label>
      <div className="product-table-scroll"><table className="product-table receiving-table">
        <thead><tr><th>Sản phẩm</th><th>SKU</th>{direction === 'IN' && <><th>Xưởng báo giao</th><th>Thực nhận</th></>}<th>{direction === 'IN' ? 'Đạt nhập kho' : 'Số lượng'}</th>{direction === 'IN' && <th>Trả xưởng sửa</th>}<th /></tr></thead>
        <tbody>{lines.map((line) => {
          const product = products.find((item) => item.id === line.productId);
          return <tr key={line.key}>
            <td style={{ padding: '.4rem' }}><select style={input} required value={line.productId} onChange={(event) => updateStockLine(line.key, 'productId', event.target.value)}>
              <option value="">Chọn sản phẩm</option>
              {products.filter((item) => item.isActive && item.skus.some((sku) => sku.isActive && (direction === 'IN' || sku.availableQty > 0))).map((item) => <option key={item.id} value={item.id}>{item.productCode} · {item.productName}</option>)}
            </select></td>
            <td style={{ padding: '.4rem' }}>{product?.skus.length ? <select style={input} required value={line.skuId} onChange={(event) => updateStockLine(line.key, 'skuId', event.target.value)}>
              {product.skus.length > 1 && <option value="">Chọn SKU</option>}
              {product.skus.filter((sku) => sku.isActive && (direction === 'IN' || sku.availableQty > 0)).map((sku) => <option key={sku.id} value={sku.id}>{sku.skuCode} · {sku.color}/{sku.size} · khả dụng {sku.availableQty}</option>)}
            </select> : <small>Chưa có SKU — hãy cấu hình biến thể trước</small>}</td>
            {direction === 'IN' && <><td><input style={input} aria-label="Xưởng báo giao" type="number" min="0" max="500" step="1" value={line.expectedQty} onChange={(event) => updateStockLine(line.key, 'expectedQty', event.target.value)} /></td><td><input style={input} aria-label="Thực nhận" required type="number" min="1" max="500" step="1" value={line.receivedQty} onChange={(event) => updateStockLine(line.key, 'receivedQty', event.target.value)} /></td></>}
            <td style={{ padding: '.4rem' }}><input style={input} aria-label="Số lượng đạt" required type="number" min={direction === 'IN' ? '0' : '1'} max={direction === 'IN' ? '500' : '100000'} step="1" value={line.quantity} onChange={(event) => updateStockLine(line.key, 'quantity', event.target.value)} /></td>
            {direction === 'IN' && <td style={{ padding: '.4rem' }}><output aria-label="Trả xưởng sửa, tự tính" className="receiving-derived-quantity">{line.repairQty === '' ? '—' : line.repairQty}</output></td>}
            <td style={{ padding: '.4rem' }}><button className="btn-ara-secondary" type="button" disabled={lines.length === 1 || saving} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>Xóa</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      {direction === 'IN' && <p className="product-muted">Trả xưởng sửa được tính tự động: thực nhận − đạt nhập kho.</p>}
      {invalidInspection &&
        <p role="alert" className="receiving-quantity-error">Số đạt nhập kho không được lớn hơn số thực nhận.</p>}
      {direction === 'IN' && <div className="receiving-totals"><span>Thực nhận <strong>{totalReceived}</strong></span><span>Đạt nhập kho <strong>{totalAccepted}</strong></span><span>Trả xưởng sửa <strong>{invalidInspection ? '—' : totalRepair}</strong></span></div>}
      <button className="btn-ara-secondary" style={{ justifySelf: 'start' }} type="button" disabled={lines.length >= 100 || saving} onClick={() => setLines((current) => [...current, createEmptyStockLine()])}>+ Thêm dòng sản phẩm</button>
      <label style={{ maxWidth: 580 }}>Ghi chú
        <input style={input} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Thông tin bổ sung cho phiếu" />
      </label>
      {error && <p role="alert" style={{ color: '#a32121' }}>{error}</p>}
      {direction === 'IN' && step === 'allocation' && <section className="receiving-allocation" aria-label="Phân bổ vị trí">
        <h3>03 · Phân bổ vị trí</h3>
        <p>Chọn ô trong kệ dựa trên sức chứa còn lại. Một kệ có thể nhận nhiều SKU; hệ thống kiểm tra lại chỗ trống khi xác nhận nhập.</p>
        {loadingBins && <p role="status">Đang tải ô kệ phù hợp...</p>}
        <RackAvailability bins={bins} racks={racks} rows={allocations} />
        {!loadingBins && bins.length === 0 && <p role="status" className="receiving-setup-note">
          {binDiagnostics?.totalBins === 0 ? 'Kho thành phẩm chưa có ô kệ đang áp dụng.'
            : binDiagnostics?.withCapacity === 0 ? `Có ${binDiagnostics.totalBins} ô kệ nhưng chưa ô nào được đặt sức chứa lớn hơn 0.`
              : 'Chưa có ô hoạt động và còn chỗ.'}
          {' '}Vào <Link to="/warehouse/layout">Cấu hình vị trí kho</Link> để đặt sức chứa cho ô khu B, rồi quay lại phân bổ.
        </p>}
        <label>Tìm ô kệ<input style={input} value={binSearch} onChange={(event) => setBinSearch(event.target.value)} placeholder="Kệ, tầng hoặc mã ô" /></label>
        {lines.map((line) => {
          const product = products.find((item) => item.id === line.productId);
          const sku = product?.skus.find((item) => item.id === line.skuId);
          const rows = allocations.filter((row) => row.lineKey === line.key);
          const allocated = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
          const eligible = bins.filter((bin) =>
            `${bin.locationCode} ${bin.rackCode} ${bin.floorNo} ${bin.binNo}`.toLowerCase().includes(binSearch.toLowerCase()));
          return <div className="receiving-allocation-sku" key={line.key}>
            <div className="receiving-allocation-heading">
              {product?.thumbnailUrl && <img src={product.thumbnailUrl} alt="" />}
              <div><strong>{product?.productName} · {sku?.skuCode}</strong><small>{sku?.color} / {sku?.size}</small></div>
              <span>Đạt {Number(line.quantity) || 0} · Đã phân bổ {allocated} · Chưa phân bổ {Math.max(0, (Number(line.quantity) || 0) - allocated)}</span>
            </div>
            {rows.map((row) => {
              const bin = bins.find((item) => item.id === row.locationId);
              return <div className="receiving-allocation-row" key={row.key}>
                <select style={input} aria-label={`Ô kệ cho ${sku?.skuCode}`} value={row.locationId} onChange={(event) => setAllocations((current) => current.map((item) => item.key === row.key ? { ...item, locationId: event.target.value } : item))}>
                  <option value="">Chọn ô kệ</option>
                  {eligible.map((item) => <option key={item.id} value={item.id}>{item.rackLabel || item.rackCode} · Tầng {item.floorNo} · Ô {item.binNo} ({item.locationCode}) · còn {item.available}</option>)}
                  {bin && !eligible.some((item) => item.id === bin.id) && <option value={bin.id}>{bin.rackLabel || bin.rackCode} · Tầng {bin.floorNo} · Ô {bin.binNo} ({bin.locationCode})</option>}
                </select>
                <input style={input} aria-label="Số phân bổ lần này" type="number" min="1" step="1" value={row.quantity} onChange={(event) => setAllocations((current) => current.map((item) => item.key === row.key ? { ...item, quantity: event.target.value } : item))} />
                {bin && <small>Sức chứa {bin.maxCapacity} · Đang có {bin.currentOccupancy} · Đã giữ {bin.plannedReservedQty} · Còn {bin.available}</small>}
                <button className="btn-ara-secondary" type="button" onClick={() => setAllocations((current) => current.filter((item) => item.key !== row.key))}>Xóa</button>
              </div>;
            })}
            <button className="btn-ara-secondary" type="button" disabled={!line.skuId || loadingBins} onClick={() => setAllocations((current) => [...current, { key: crypto.randomUUID(), lineKey: line.key, skuId: line.skuId, locationId: '', quantity: '' }])}>+ Chọn ô kệ</button>
          </div>;
        })}
      </section>}
      <div style={{ display: 'flex', gap: '.75rem' }}>
        {direction === 'IN' && step === 'allocation' && <button className="btn-ara-secondary" disabled={saving} type="button" onClick={() => setStep('inspection')}>Quay lại kiểm nhận</button>}
        {direction === 'IN' && step === 'allocation' && <button className="btn-ara-secondary" disabled={saving || invalidInspection} type="button" onClick={(event) => submitBulkStockDocument(event, true)}>Phân bổ sau</button>}
        <button className="btn-ara-primary" disabled={saving || invalidInspection || products.length === 0 || (direction === 'IN' && step === 'allocation' && loadingBins)} type="submit">{saving ? 'Đang lưu phiếu...' : direction === 'IN' && step === 'inspection' ? 'Tiếp tục phân bổ vị trí' : `Xác nhận ${direction === 'IN' ? 'nhập' : 'xuất'} kho`}</button>
        <button className="btn-ara-secondary" disabled={saving} type="button" onClick={onCancel}>Hủy</button>
      </div>
    </form>
  </section>;
}
