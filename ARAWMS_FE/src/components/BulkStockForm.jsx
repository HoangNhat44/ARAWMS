/*
 * File: BulkStockForm.jsx
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Collects finished-goods inspection, proposed bins, and stock documents with local draft recovery.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productService } from '../services/productService';
import { finishedGoodsOffline, syncFinishedGoodsConfirmations } from '../services/offlineFinishedGoods';
import RackAvailability from './RackAvailability';

const input = { width: '100%', padding: '.65rem', border: '1px solid var(--ara-border)', borderRadius: 8, font: 'inherit' };
/** Assigns a stable row key so local edits and proposed bins remain linked after a reload. */
const createEmptyStockLine = () => ({ key: crypto.randomUUID(), productId: '', skuId: '', expectedQty: '', receivedQty: '', quantity: '', repairQty: '' });

/** Validates the factory handoff and inspection counts before moving to bin selection.
 * Accepted units must be an integer subset of the physically received units; rejected units are derived. */
const receivingQuantityError = (line) => {
  const expected = Number(line.expectedQty);
  const received = Number(line.receivedQty);
  const accepted = Number(line.quantity);
  if (line.expectedQty === '' || !Number.isSafeInteger(expected) || expected < 1 || expected > 500)
    return 'Số xưởng bàn giao phải là số nguyên dương, tối đa 500.';
  if (line.receivedQty === '' || !Number.isSafeInteger(received) || received < 1 || received > expected)
    return 'Số thực nhận phải là số nguyên dương và không vượt số xưởng bàn giao.';
  if (line.quantity === '' || !Number.isSafeInteger(accepted) || accepted < 0 || accepted > received)
    return 'Số đạt nhập kho phải là số nguyên từ 0 đến số thực nhận.';
  return null;
};

/** Collects SKU quantities for a finished-goods receipt or issue.
 * Restores and saves drafts locally; only an explicit online confirmation enters the stock retry queue. */
export default function BulkStockForm({ direction, products, ownerId, sourceTicket = null,
  initialSkuIds = [], initialProductId = '', onDone, onQueued, onCancel }) {
  const draftKey = direction === 'IN' ? `IN:${sourceTicket?.id || 'missing'}` : direction;
  const requestLines = () => (sourceTicket?.lines || []).map((item) => ({
    key: item.skuId, productId: item.productId, skuId: item.skuId,
    expectedQty: String(item.expectedQty), receivedQty: String(item.expectedQty),
    quantity: String(item.expectedQty), repairQty: '0',
  }));
  const [documentCode, setDocumentCode] = useState('');
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([createEmptyStockLine()]);
  const [saving, setSaving] = useState(false);
  const [confirmationKey, setConfirmationKey] = useState(() => crypto.randomUUID());
  const [allocations, setAllocations] = useState([]);
  const [bins, setBins] = useState([]);
  const [racks, setRacks] = useState([]);
  const [binDiagnostics, setBinDiagnostics] = useState(null);
  const [loadingBins, setLoadingBins] = useState(false);
  const [binSearch, setBinSearch] = useState('');
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const [localStatus, setLocalStatus] = useState('');
  const [needsRevision, setNeedsRevision] = useState(false);
  // Restore the account's last draft before autosave starts, avoiding an empty form overwriting it.
  useEffect(() => {
    let active = true;
    if (!ownerId) return undefined;
    finishedGoodsOffline.getDraft(ownerId, draftKey).then((draft) => {
      if (!active) return;
      if (draft) {
        setDocumentCode(sourceTicket ? `NK-${sourceTicket.code}` : draft.documentCode || '');
        setRecipient(draft.recipient || '');
        setNote(draft.note || '');
        setLines(sourceTicket ? requestLines().map((line) => {
          const prior = (draft.lines || []).find((item) => item.skuId === line.skuId);
          return prior ? { ...line, receivedQty: prior.receivedQty, quantity: prior.quantity,
            repairQty: prior.repairQty } : line;
        }) : draft.lines?.length ? draft.lines : [createEmptyStockLine()]);
        setAllocations(draft.allocations || []);
        if (draft.confirmationKey) {
          setConfirmationKey(draft.confirmationKey);
          // A rejected confirmation keeps its original ID and payload for audit; editing needs a new ID.
          finishedGoodsOffline.confirmations(ownerId).then((items) => {
            if (active) setNeedsRevision(items.some((item) => item.operationId === draft.confirmationKey &&
              item.status === 'REVIEW'));
          }).catch(() => {});
        }
        setLocalStatus('Đã khôi phục bản nháp lưu trên thiết bị.');
      } else if (sourceTicket) {
        setDocumentCode(`NK-${sourceTicket.code}`);
        setLines(requestLines());
      }
      setRestored(true);
    }).catch((failure) => { if (active) { setError(failure.message); setRestored(true); } });
    return () => { active = false; };
  }, [ownerId, draftKey]);
  // Debounce local writes, but report success only after the IndexedDB transaction completes.
  useEffect(() => {
    if (!restored || !ownerId) return undefined;
    const timer = window.setTimeout(() => {
      finishedGoodsOffline.saveDraft(ownerId, draftKey, { documentCode, recipient, note, lines, allocations, confirmationKey })
        .then(() => setLocalStatus('Nháp · Đã lưu trên máy'))
        .catch((failure) => setError(`Không lưu được trên thiết bị: ${failure.message}`));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [restored, ownerId, draftKey, documentCode, note, lines, allocations, confirmationKey]);
  // Apply navigation defaults only to an empty draft, never over an inspection already in progress.
  useEffect(() => {
    if (!products.length || !restored || sourceTicket) return;
    if (documentCode || lines.some((line) => line.productId)) return;
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
  }, [initialSkuIds.join(','), initialProductId, products, restored]);
  const selectedSkuIds = [...new Set(lines.map((line) => line.skuId).filter(Boolean))];
  // Show cached bin capacity when disconnected; the backend rechecks actual capacity on confirmation.
  useEffect(() => {
    if (direction !== 'IN' || !selectedSkuIds.length) return;
    let active = true;
    setLoadingBins(true);
    finishedGoodsOffline.getCached(ownerId, 'bins', selectedSkuIds.join(',')).then((cached) => {
      if (active && cached) { setBins(cached.value.bins); setRacks(cached.value.racks || []);
        setBinDiagnostics(cached.value.diagnostics); }
    }).catch(() => {});
    if (!navigator.onLine) { setLoadingBins(false); return () => { active = false; }; }
    productService.binOptions(selectedSkuIds).then(async (response) => {
      if (active) { setBins(response.data.bins); setRacks(response.data.racks || []);
        setBinDiagnostics(response.data.diagnostics); }
      await finishedGoodsOffline.cache(ownerId, 'bins', selectedSkuIds.join(','), response.data);
    }).catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoadingBins(false); });
    return () => { active = false; };
  }, [direction, selectedSkuIds.join(','), ownerId]);
  // Start each accepted SKU with one editable destination; extra rows are for split placement.
  useEffect(() => {
    if (!restored || direction !== 'IN') return;
    setAllocations((current) => {
      const missing = lines.filter((line) => Number(line.quantity) > 0 &&
        !current.some((row) => row.lineKey === line.key));
      return missing.length ? [...current, ...missing.map((line) => ({
        key: crypto.randomUUID(), lineKey: line.key, skuId: line.skuId,
        locationId: '', quantity: line.quantity,
      }))] : current;
    });
  }, [restored, direction, lines]);

  /** Flushes the complete inspection and allocation draft before a network attempt or manual save. */
  const saveNow = async () => {
    if (!ownerId) throw new Error('Cần đăng nhập để lưu phiếu trên thiết bị.');
    await finishedGoodsOffline.saveDraft(ownerId, draftKey, { documentCode, recipient, note, lines, allocations, confirmationKey });
    setLocalStatus('Nháp · Đã lưu trên máy');
  };

  /** Updates one document line and clears a SKU that no longer belongs to its product.
   * The repair count is calculated from physical receipt minus accepted units, never entered separately. */
  const updateStockLine = (key, field, value) => {
    if (direction === 'IN' && field === 'quantity') setAllocations((current) => {
      const matching = current.filter((row) => row.lineKey === key);
      if (Number(value) === 0) return current.filter((row) => row.lineKey !== key);
      return matching.length === 1 ? current.map((row) => row.lineKey === key
        ? { ...row, quantity: value } : row) : current;
    });
    setLines((current) => current.map((line) => {
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
  };

  /** Validates quantities and planned bins, then saves locally before attempting server confirmation.
   * Offline submission remains a draft; an online attempt is queued with one immutable confirmation key.
   * A lost response is retried under that key, while business rejection stays visible for review. */
  const submitBulkStockDocument = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (direction === 'IN' && !sourceTicket?.id)
        throw new Error('Hãy chọn lệnh nhập kho do nhân viên kỹ thuật gửi.');
      if (direction === 'IN') {
        const invalidLine = lines.findIndex((line) => receivingQuantityError(line));
        if (invalidLine !== -1) throw new Error(`Dòng ${invalidLine + 1}: ${receivingQuantityError(lines[invalidLine])}`);
      }
      if (direction === 'IN' && lines.some((line) => !line.skuId))
        throw new Error('Lệnh kỹ thuật có SKU không hợp lệ. Hãy tải lại lệnh.');
      const requested = allocations;
      if (direction === 'IN') {
        // Allocation remains a proposal until the backend checks current capacity and reserves bins.
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
        for (const line of lines) if ((totals.get(line.skuId) || 0) !== Number(line.quantity))
          throw new Error('Cần chọn đủ ô kệ cho toàn bộ số lượng đạt của từng SKU.');
        for (const [binId, quantity] of byBin) if (quantity > bins.find((bin) => bin.id === binId).available)
          throw new Error('Ô đã chọn không đủ chỗ theo số liệu đang hiển thị.');
      }
      await saveNow();
      if (!navigator.onLine) {
        setError('Mất kết nối. Kết quả đã lưu trên thiết bị; cần kết nối và xác nhận lại để nhập/xuất kho chính thức.');
        return;
      }
      const payload = {
        direction, documentCode, recipient, note, confirmationKey,
        ...(direction === 'IN' ? { sourceTicketId: sourceTicket?.id, draftKey } : {}),
        ...(direction === 'IN' ? { allocations: requested.map((row) => ({
          skuId: row.skuId, targetLocationId: row.locationId, allocatedQuantity: Number(row.quantity) })) } : {}),
        items: lines.map(({ productId, skuId, expectedQty, quantity, receivedQty }) => ({ productId, skuId: skuId || undefined,
          quantity: Number(quantity), ...(direction === 'IN' ? { expectedQty: Number(expectedQty), receivedQty: Number(receivedQty) } : {}) })),
      };
      // Persist the exact request before sending; retry must never allocate stock under a fresh ID.
      await finishedGoodsOffline.queueConfirmation(ownerId, payload);
      await syncFinishedGoodsConfirmations(ownerId);
      const operation = (await finishedGoodsOffline.confirmations(ownerId)).find((item) => item.operationId === confirmationKey);
      if (operation?.status === 'DONE') onDone(operation.serverResult);
      else if (operation?.status === 'REVIEW') {
        setNeedsRevision(true);
        setError(`${operation.lastError} Phiếu đã giữ trên máy để đối chiếu.`);
      }
      else onQueued?.('Đang chờ đối chiếu kết quả xác nhận với server. Không tạo phiếu mới.');
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };

  const totalReceived = lines.reduce((sum, line) => sum + (Number(line.receivedQty) || 0), 0);
  const totalAccepted = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const totalRepair = lines.reduce((sum, line) => sum + (Number(line.repairQty) || 0), 0);
  const inspectionError = direction === 'IN' ? lines.map((line) =>
    [line.expectedQty, line.receivedQty, line.quantity].every((value) => value === '')
      ? null : receivingQuantityError(line)).find(Boolean) : null;
  const invalidInspection = Boolean(inspectionError);
  // Count every row sharing a bin so a plan cannot exceed its last downloaded capacity.
  const invalidAllocationRows = allocations.some((row) => {
    const accepted = Number(lines.find((line) => line.key === row.lineKey)?.quantity || 0);
    const allocated = allocations.filter((item) => item.lineKey === row.lineKey)
      .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const bin = bins.find((item) => item.id === row.locationId);
    const binAllocated = allocations.filter((item) => item.locationId === row.locationId)
      .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    return !bin || !Number.isSafeInteger(Number(row.quantity)) || Number(row.quantity) < 1 ||
      allocated > accepted || binAllocated > bin.available;
  });
  const allocationIncomplete = direction === 'IN' && lines.some((line) =>
    allocations.filter((row) => row.lineKey === line.key)
      .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0) !== Number(line.quantity));
  const invalidAllocation = direction === 'IN' && (invalidAllocationRows || allocationIncomplete);
  return <section className="product-card receiving-card">
    <div className="product-card-head"><div><span className="product-section-number">{direction === 'IN' ? '02' : '01'}</span><h2>{direction === 'IN' ? 'Kiểm nhận và chọn vị trí kho' : 'Tạo yêu cầu xuất kho hàng loạt'}</h2></div><span className="product-badge active">{direction === 'IN' ? 'Theo lệnh kỹ thuật' : 'Yêu cầu xuất kho'}</span></div>
    {direction === 'IN' ? (
      <p className="product-muted receiving-intro">Lệnh {sourceTicket?.code} ghi số lượng đạt KCS theo từng SKU. Nhập số thực nhận, số đạt và chọn kệ; chỉ số lượng đạt được cấp barcode riêng từng chiếc.</p>
    ) : (
      <p className="product-muted receiving-intro">Lập yêu cầu xuất kho thành phẩm gửi đến Nhân viên kho. Nhân viên kho sẽ lấy hàng trên kệ, quét mã barcode và hoàn tất xuất kho theo đúng yêu cầu.</p>
    )}
    <form onSubmit={submitBulkStockDocument} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ minWidth: 260, flex: 1 }}>{direction === 'IN' ? 'Mã biên bản nhập kho *' : 'Mã yêu cầu xuất kho *'}
          <input style={input} required maxLength={80} pattern="[A-Za-z0-9._\/\\-]{2,80}" title="2–80 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang" value={documentCode} readOnly={direction === 'IN'} onChange={(event) => setDocumentCode(event.target.value.toUpperCase())} placeholder={direction === 'IN' ? 'Theo lệnh kỹ thuật' : 'Ví dụ: YCXK-2026-001'} />
        </label>
        {direction !== 'IN' && (
          <label style={{ minWidth: 260, flex: 1 }}>Người nhận / Mục đích xuất
            <input style={input} maxLength={200} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Ví dụ: Showroom 1, Đơn hàng đối tác..." />
          </label>
        )}
      </div>
      <div className="product-table-scroll"><table className="product-table receiving-table">
        <thead><tr><th>Sản phẩm</th><th>SKU</th>{direction === 'IN' && <><th>Xưởng báo giao</th><th>Thực nhận</th></>}<th>{direction === 'IN' ? 'Đạt nhập kho' : 'Số lượng'}</th>{direction === 'IN' && <th>Trả xưởng sửa</th>}<th /></tr></thead>
        <tbody>{lines.map((line) => {
          const product = products.find((item) => item.id === line.productId);
          return <tr key={line.key}>
            <td style={{ padding: '.4rem' }}>{direction === 'IN' ? <strong>{product?.productCode} · {product?.productName}</strong> : <select style={input} required value={line.productId} onChange={(event) => updateStockLine(line.key, 'productId', event.target.value)}>
              <option value="">Chọn sản phẩm</option>
              {products.filter((item) => item.isActive && item.skus.some((sku) => sku.isActive && (direction === 'IN' || sku.availableQty > 0))).map((item) => <option key={item.id} value={item.id}>{item.productCode} · {item.productName}</option>)}
            </select>}</td>
            <td style={{ padding: '.4rem' }}>{direction === 'IN' ? <strong>{product?.skus.find((sku) => sku.id === line.skuId)?.skuCode || line.skuId}</strong> : product?.skus.length ? <select style={input} required value={line.skuId} onChange={(event) => updateStockLine(line.key, 'skuId', event.target.value)}>
              {product.skus.length > 1 && <option value="">Chọn SKU</option>}
              {product.skus.filter((sku) => sku.isActive && (direction === 'IN' || sku.availableQty > 0)).map((sku) => <option key={sku.id} value={sku.id}>{sku.skuCode} · {sku.color}/{sku.size} · khả dụng {sku.availableQty}</option>)}
            </select> : <small>Chưa có SKU — hãy cấu hình biến thể trước</small>}</td>
            {direction === 'IN' && <><td><input style={input} aria-label="Số đạt theo lệnh kỹ thuật" required readOnly type="number" min="1" max="500" step="1" value={line.expectedQty} /></td><td><input style={input} aria-label="Thực nhận" required type="number" min="1" max={line.expectedQty || '500'} step="1" value={line.receivedQty} onChange={(event) => updateStockLine(line.key, 'receivedQty', event.target.value)} /></td></>}
            <td style={{ padding: '.4rem' }}><input style={input} aria-label="Số lượng đạt" required type="number" min={direction === 'IN' ? '0' : '1'} max={direction === 'IN' ? line.receivedQty || '500' : '100000'} step="1" value={line.quantity} onChange={(event) => updateStockLine(line.key, 'quantity', event.target.value)} /></td>
            {direction === 'IN' && <td style={{ padding: '.4rem' }}><output aria-label="Trả xưởng sửa, tự tính" className="receiving-derived-quantity">{line.repairQty === '' ? '—' : line.repairQty}</output></td>}
            <td style={{ padding: '.4rem' }}>{direction !== 'IN' && <button className="btn-ara-secondary" type="button" disabled={lines.length === 1 || saving} onClick={() => {
              if (window.confirm('Xóa dòng sản phẩm này?')) setLines((current) => current.filter((item) => item.key !== line.key));
            }}>Xóa</button>}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {direction === 'IN' && <p className="product-muted">Trả xưởng sửa được tính tự động: thực nhận − đạt nhập kho.</p>}
      {invalidInspection &&
        <p role="alert" className="receiving-quantity-error">{inspectionError}</p>}
      {direction === 'IN' && <div className="receiving-totals"><span>Thực nhận <strong>{totalReceived}</strong></span><span>Đạt nhập kho <strong>{totalAccepted}</strong></span><span>Trả xưởng sửa <strong>{invalidInspection ? '—' : totalRepair}</strong></span></div>}
      {direction !== 'IN' && <button className="btn-ara-secondary" style={{ justifySelf: 'start' }} type="button" disabled={lines.length >= 100 || saving} onClick={() => setLines((current) => [...current, createEmptyStockLine()])}>+ Thêm dòng sản phẩm</button>}
      <label style={{ maxWidth: 580 }}>Ghi chú
        <input style={input} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Thông tin bổ sung cho phiếu" />
      </label>
      {error && <p role="alert" style={{ color: '#a32121' }}>{error}</p>}
      {needsRevision && <button className="btn-ara-secondary" type="button" onClick={() => {
        // Keep the rejected operation for review and bind subsequent edits to a new confirmation ID.
        setConfirmationKey(crypto.randomUUID()); setNeedsRevision(false); setError('');
      }}>Tạo bản điều chỉnh sau khi kiểm tra lỗi</button>}
      {localStatus && <p role="status">{localStatus}</p>}
      {direction === 'IN' && <section className="receiving-allocation" aria-label="Chọn vị trí kho">
        <h3>Chọn vị trí kho và xem chỗ còn trống</h3>
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
              const otherSkuQty = rows.filter((item) => item.key !== row.key)
                .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
              const otherBinQty = allocations.filter((item) => item.key !== row.key && item.locationId === row.locationId)
                .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
              const maxQuantity = Math.max(0, Math.min(Number(line.quantity) - otherSkuQty,
                bin ? bin.available - otherBinQty : Number(line.quantity)));
              return <div className="receiving-allocation-row" key={row.key}>
                <select style={input} aria-label={`Ô kệ cho ${sku?.skuCode}`} value={row.locationId} onChange={(event) => setAllocations((current) => current.map((item) => item.key === row.key ? { ...item, locationId: event.target.value } : item))}>
                  <option value="">Chọn ô kệ</option>
                  {eligible.map((item) => <option key={item.id} value={item.id}>{item.rackLabel || item.rackCode} · Tầng {item.floorNo} · Ô {item.binNo} ({item.locationCode}) · khả dụng {Math.max(0, item.available - allocations.filter((planned) => planned.key !== row.key && planned.locationId === item.id).reduce((sum, planned) => sum + (Number(planned.quantity) || 0), 0))}</option>)}
                  {bin && !eligible.some((item) => item.id === bin.id) && <option value={bin.id}>{bin.rackLabel || bin.rackCode} · Tầng {bin.floorNo} · Ô {bin.binNo} ({bin.locationCode})</option>}
                </select>
                <input style={input} aria-label="Số phân bổ lần này" type="number" min="1" max={maxQuantity} step="1" value={row.quantity} onChange={(event) => setAllocations((current) => current.map((item) => item.key === row.key ? { ...item, quantity: event.target.value && Number(event.target.value) > maxQuantity ? String(maxQuantity) : event.target.value } : item))} />
                <small>Tối đa {maxQuantity} chiếc đạt có thể phân bổ vào ô này.</small>
                {bin && <small>Sức chứa {bin.maxCapacity} · Đang có {bin.currentOccupancy} · Đã giữ {bin.plannedReservedQty} · Còn {bin.available}</small>}
                <button className="btn-ara-secondary" type="button" disabled={rows.length === 1} onClick={() => {
                  if (window.confirm('Xóa vị trí phân bổ này?')) setAllocations((current) => current.filter((item) => item.key !== row.key));
                }}>Xóa</button>
              </div>;
            })}
            <button className="btn-ara-secondary" type="button" disabled={!line.skuId || loadingBins} onClick={() => setAllocations((current) => [...current, { key: crypto.randomUUID(), lineKey: line.key, skuId: line.skuId, locationId: '', quantity: '' }])}>+ Thêm ô khác nếu cần chia số lượng</button>
          </div>;
        })}
      </section>}
      {invalidAllocation && <p role="alert" className="receiving-quantity-error">Chọn đủ ô kệ cho toàn bộ số lượng đạt của từng SKU. Số phân bổ phải hợp lệ và không vượt sức chứa ô.</p>}
      <div style={{ display: 'flex', gap: '.75rem' }}>
        <button className="btn-ara-secondary" disabled={saving || !restored} type="button" onClick={() => saveNow().catch((failure) => setError(failure.message))}>Lưu kết quả trên máy</button>
        <button className="btn-ara-primary" disabled={saving || !restored || invalidInspection || invalidAllocation || products.length === 0 || (direction === 'IN' && loadingBins)} type="submit">{saving ? 'Đang gửi...' : direction === 'IN' ? 'Xác nhận nhập kho' : 'Tạo yêu cầu xuất kho'}</button>
        <button className="btn-ara-secondary" disabled={saving} type="button" onClick={() => {
          if (window.confirm('Đóng phiếu đang nhập? Bản nháp đã lưu trên thiết bị vẫn được giữ lại.')) onCancel();
        }}>Hủy</button>
      </div>
    </form>
  </section>;
}
