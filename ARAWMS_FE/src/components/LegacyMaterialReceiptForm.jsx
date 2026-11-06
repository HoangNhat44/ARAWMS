/* Edits an existing plan receipt without creating a second stock ticket. */
import { useEffect, useState } from 'react';
import { materialInboundService as api } from '../services/materialInboundService';

const valueId = (value) => String(value?._id || value || '');
const inputStyle = { width: '100%', padding: 9, border: '1px solid #ded0bf', borderRadius: 8 };
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 };
const editable = ['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM'];
const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';

export default function LegacyMaterialReceiptForm({ id, options, onClose, onChanged }) {
  const [receipt, setReceipt] = useState(null);
  const [plan, setPlan] = useState(null);
  const [savedSupplier, setSavedSupplier] = useState(null);
  const [labels, setLabels] = useState([]);
  const [detailBarcode, setDetailBarcode] = useState('');
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    api.legacyReceipt(id).then(({ data }) => {
      if (!active) return;
      setReceipt(data.receipt); setPlan(data.plan); setSavedSupplier(data.supplier);
      if (data.receipt.status === 'COMPLETED') api.labels(id).then((result) => {
        if (active) setLabels(result.data.labels || []);
      }).catch((failure) => { if (active) setError(failure.message); });
      setForm({ supplierDeliveryCode: data.receipt.supplierDeliveryCode || '',
        handoverName: data.receipt.handoverName || '', receivedAt: dateValue(data.receipt.receivedAt),
        receivingLocationId: valueId(data.receipt.receivingLocationId), receiptNote: data.receipt.receiptNote || '',
        receiptLines: data.receipt.receiptLines || [] });
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [id]);
  const canEdit = receipt && editable.includes(receipt.status) && Boolean(plan);
  const update = (patch) => { setForm((current) => ({ ...current, ...patch })); setDirty(true); };
  const updateLine = (index, patch) => update({ receiptLines: form.receiptLines.map((line, row) =>
    row === index ? { ...line, ...patch } : line) });
  const updateObject = (lineIndex, kind, objectIndex, patch) => {
    const line = form.receiptLines[lineIndex];
    updateLine(lineIndex, { [kind]: line[kind].map((item, index) =>
      index === objectIndex ? { ...item, ...patch } : item) });
  };
  const addObject = (lineIndex, fabric) => {
    const line = form.receiptLines[lineIndex];
    const amount = Number(line.acceptedQty) || 0;
    const key = crypto.randomUUID();
    if (fabric) updateLine(lineIndex, { rolls: [...(line.rolls || []), {
      clientLineId: key, widthCm: '', lengthMeters: amount, quality: 'ACCEPTED', locationId: '',
    }] });
    else updateLine(lineIndex, { lots: [...(line.lots || []), {
      clientLineId: key, packageCount: 1, unitsPerPackage: amount, countedQty: amount,
      quality: 'ACCEPTED', allocations: [{ locationId: '', quantity: amount }],
    }] });
  };
  const run = async (task) => {
    setBusy(true); setError(''); setNotice('');
    try { await task(); onChanged(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const updated = (await api.updateLegacyReceipt(id, { ...form,
      expectedVersion: receipt.receiptVersion })).data.receipt;
    setReceipt(updated); setDirty(false); setNotice('Đã lưu phiếu nhập.');
  });
  const confirm = () => run(async () => {
    const updated = (await api.confirmLegacyReceipt(id, { expectedVersion: receipt.receiptVersion,
      idempotencyKey: crypto.randomUUID() })).data.receipt;
    setLabels((await api.labels(id)).data.labels || []);
    setReceipt(updated); setNotice('Đã xác nhận nhập kho trên phiếu này.');
  });
  const printLabels = async (items) => {
    const tab = window.open('', '_blank');
    try { const { printMaterialLabels } = await import('../utils/materialLabelPrint'); printMaterialLabels(items, tab); }
    catch (failure) { tab?.close(); setError(failure.message); }
  };
  const materials = new Map((plan?.lines || []).map((line) => [valueId(line.rawMaterialId), line.material]));
  const locations = options.locations.filter((item) => item.warehouseType === 'RAW_MATERIAL' && item.layoutBin);
  const supplier = savedSupplier || options.suppliers.find((item) => valueId(item) === valueId(receipt?.supplierId || plan?.supplierId));
  const planAlreadyFull = canEdit && form?.receiptLines.some((line) =>
    Number(line.acceptedQty || 0) > Number(plan.lines.find((item) =>
      valueId(item.rawMaterialId) === valueId(line.rawMaterialId))?.remainingQty || 0) + 0.0001);
  return <div className="material-reference-overlay material-direct-overlay" role="dialog" aria-modal="true" aria-label="Form nhập kho nguyên liệu">
    <div className="material-reference-sheet"><div className="material-reference-sheet-head">
      <div><h2>Nhập kho nguyên liệu · {receipt?.ticketCode || ''}</h2>
        <p>{receipt?.status === 'COMPLETED' ? 'Phiếu đã hoàn thiện.' : 'Bổ sung thông tin và cây/lô vật tư, lưu rồi xác nhận nhập kho.'}</p></div>
      <button type="button" className="material-reference-close" aria-label="Đóng" onClick={onClose}>×</button>
    </div><div className="material-reference-sheet-content material-editor">
      {error && <p className="material-message error" role="alert">{error}</p>}
      {notice && <p className="material-message success" role="status">{notice}</p>}
      {planAlreadyFull && <p className="material-message error" role="alert">
        Kế hoạch đã ghi nhận đủ số lượng này. Cần đối chiếu kế hoạch và tồn kho trước khi xác nhận phiếu để tránh nhập trùng.
      </p>}
      {!form && !error && <p>Đang tải phiếu nhập…</p>}
      {form && <><section className="material-card"><h3>Thông tin yêu cầu nhập kho</h3><div style={gridStyle}>
        <div><small>Mã nhập kho</small><strong style={{ display: 'block' }}>{receipt.ticketCode}</strong></div>
        <div><small>Mã kế hoạch</small><strong style={{ display: 'block' }}>{plan?.planCode || '—'}</strong></div>
        <div><small>Nhà cung cấp</small><strong style={{ display: 'block' }}>{supplier?.supplierName || '—'}</strong></div>
        <div><small>Trạng thái</small><strong style={{ display: 'block' }}>{receipt.status}</strong></div>
      </div></section><section className="material-card"><h3>Thông tin nhận hàng</h3><div style={gridStyle}>
        <label>Mã giao hàng<input style={inputStyle} value={form.supplierDeliveryCode} disabled={!canEdit}
          onChange={(event) => update({ supplierDeliveryCode: event.target.value })} /></label>
        <label>Người giao<input style={inputStyle} value={form.handoverName} disabled={!canEdit}
          onChange={(event) => update({ handoverName: event.target.value })} /></label>
        <label>Ngày nhận<input style={inputStyle} type="date" value={form.receivedAt} disabled={!canEdit}
          onChange={(event) => update({ receivedAt: event.target.value })} /></label>
        <label>Vị trí nhận<select style={inputStyle} value={form.receivingLocationId} disabled={!canEdit}
          onChange={(event) => update({ receivingLocationId: event.target.value })}>
          <option value="">Chọn vị trí</option>{locations.map((item) => <option key={valueId(item)} value={valueId(item)}>{item.locationCode}</option>)}
        </select></label>
        <label>Ghi chú<input style={inputStyle} value={form.receiptNote} disabled={!canEdit}
          onChange={(event) => update({ receiptNote: event.target.value })} /></label>
      </div></section>
      {form.receiptLines.map((line, lineIndex) => {
        const material = materials.get(valueId(line.rawMaterialId)) || options.materials.find((item) => valueId(item) === valueId(line.rawMaterialId));
        const fabric = material?.materialType === 'FABRIC';
        const kind = fabric ? 'rolls' : 'lots';
        return <section className="material-card" key={`${valueId(line.rawMaterialId)}-${lineIndex}`}>
          <h3>{material?.materialName || 'Nguyên phụ liệu'} · {material?.materialCode || ''}</h3>
          <p>Số lượng yêu cầu: {plan?.lines?.find((item) => valueId(item.rawMaterialId) === valueId(line.rawMaterialId))?.plannedQty ?? line.actualQty ?? 0} {material?.unit || ''}
            {plan && <> · Còn được nhận theo kế hoạch: {plan.lines.find((item) => valueId(item.rawMaterialId) === valueId(line.rawMaterialId))?.remainingQty ?? 0} {material?.unit || ''}</>}
          </p>
          <div style={gridStyle}>{[['supplierDeclaredQty', 'NCC báo giao'], ['actualQty', 'Thực nhận'],
            ['acceptedQty', 'Đạt'], ['rejectedQty', 'Không đạt'], ['pendingQty', 'Chờ kiểm tra']]
            .map(([key, label]) => <label key={key}>{label} ({material?.unit || ''})
              <input style={inputStyle} type="number" min="0" step="any" value={line[key] ?? 0} disabled={!canEdit}
                onChange={(event) => updateLine(lineIndex, { [key]: event.target.value })} /></label>)}</div>
          {Number(line.rejectedQty || 0) > 0 && <label>Lý do không đạt<input style={inputStyle} value={line.defectReason || ''}
            disabled={!canEdit} onChange={(event) => updateLine(lineIndex, { defectReason: event.target.value })} /></label>}
          {(line[kind] || []).map((object, objectIndex) => <div key={object.clientLineId || objectIndex}
            style={{ ...gridStyle, borderTop: '1px solid #e8dccd', paddingTop: 12, marginTop: 12 }}>
            {fabric ? <><label>Chiều dài cây (m)<input style={inputStyle} type="number" min="0" step=".001"
              value={object.lengthMeters ?? ''} disabled={!canEdit}
              onChange={(event) => updateObject(lineIndex, kind, objectIndex, { lengthMeters: event.target.value })} /></label>
              <label>Khổ vải (cm)<input style={inputStyle} type="number" min="0" value={object.widthCm ?? ''} disabled={!canEdit}
                onChange={(event) => updateObject(lineIndex, kind, objectIndex, { widthCm: event.target.value })} /></label>
              {material?.requiresWeightKg && <label>Cân nặng (kg)<input style={inputStyle} type="number" min="0" step=".001"
                value={object.weightKg ?? ''} disabled={!canEdit}
                onChange={(event) => updateObject(lineIndex, kind, objectIndex, { weightKg: event.target.value })} /></label>}</> :
              <><label>Số bao gói<input style={inputStyle} type="number" min="1" value={object.packageCount ?? 1} disabled={!canEdit}
                onChange={(event) => updateObject(lineIndex, kind, objectIndex, { packageCount: event.target.value })} /></label>
                <label>Số lượng mỗi bao<input style={inputStyle} type="number" min="0" value={object.unitsPerPackage ?? ''} disabled={!canEdit}
                  onChange={(event) => updateObject(lineIndex, kind, objectIndex, { unitsPerPackage: event.target.value })} /></label>
                <label>Tổng số lượng lô<input style={inputStyle} type="number" min="0" value={object.countedQty ?? ''} disabled={!canEdit}
                  onChange={(event) => updateObject(lineIndex, kind, objectIndex, { countedQty: event.target.value,
                    allocations: [{ locationId: object.allocations?.[0]?.locationId || '', quantity: event.target.value }] })} /></label></>}
            <label>Kết quả<select style={inputStyle} value={object.quality || ''} disabled={!canEdit}
              onChange={(event) => updateObject(lineIndex, kind, objectIndex, { quality: event.target.value })}>
              <option value="">Chọn kết quả</option><option value="ACCEPTED">Đạt</option><option value="REJECTED">Không đạt</option>
            </select></label>
            <label>Vị trí<select style={inputStyle} value={valueId(fabric ? object.locationId : object.allocations?.[0]?.locationId)} disabled={!canEdit}
              onChange={(event) => updateObject(lineIndex, kind, objectIndex, fabric
                ? { locationId: event.target.value } : { allocations: [{ locationId: event.target.value, quantity: object.countedQty }] })}>
              <option value="">Chọn vị trí</option>{options.locations.filter((item) =>
                item.warehouseType === (object.quality === 'REJECTED' ? 'DEFECT_QUARANTINE' : 'RAW_MATERIAL') &&
                (object.quality === 'REJECTED' || item.layoutBin)).map((item) =>
                <option key={valueId(item)} value={valueId(item)}>{item.locationCode}</option>)}</select></label>
            {object.quality === 'REJECTED' && <label>Lý do không đạt<input style={inputStyle} value={object.defectReason || ''}
              disabled={!canEdit} onChange={(event) => updateObject(lineIndex, kind, objectIndex, { defectReason: event.target.value })} /></label>}
            {canEdit && <button type="button" onClick={() => updateLine(lineIndex, { [kind]: line[kind].filter((_, index) => index !== objectIndex) })}>
              Xóa {fabric ? 'cây' : 'lô'}
            </button>}
          </div>)}
          {canEdit && <button type="button" onClick={() => addObject(lineIndex, fabric)}>+ Thêm {fabric ? 'cây vải' : 'lô vật tư'}</button>}
        </section>;
      })}
      {!form.receiptLines.length && (receipt.items || []).map((item, index) =>
        <section className="material-card" key={index}><h3>{options.materials.find((material) => valueId(material) === valueId(item.rawMaterialId))?.materialName || 'Nguyên phụ liệu'}</h3>
          <p>Số lượng yêu cầu: {item.expectedQty || 0} · Đã quét: {item.scannedQty || 0}</p></section>)}</>}
      {receipt?.status === 'COMPLETED' && <section className="material-card"><h3>Barcode nguồn nhập</h3>
        <p>{labels.length} lô phụ liệu / cây vải. In lại dùng đúng barcode đã cấp.</p>
        <div className="material-table-wrap"><table className="material-inline-table"><thead><tr>
          <th>Nguyên phụ liệu</th><th>Nhà cung cấp</th><th>Lô / cây vải</th><th>Barcode</th><th>Nhập</th><th>Còn lại</th><th>Trạng thái</th><th>Thao tác</th>
        </tr></thead><tbody>{labels.map((label) => <tr key={label.barcode}>
          <td>{label.materialName}{label.color ? ` · ${label.color}` : ''}<small>{label.materialCode}{label.widthCm ? ` · ${label.widthCm} cm` : ''}</small></td>
          <td>{label.supplierName || supplier?.supplierName || 'Chưa xác định'}</td><td>{label.lotOrRollCode || '—'}</td>
          <td><code>{label.barcode}</code><small>Phiếu {label.receiptCode}</small></td>
          <td>{label.quantity} {label.unit}</td><td>{label.remainingQuantity} {label.unit}</td>
          <td>{label.quality === 'REJECTED' ? 'Cách ly' : label.putawayComplete ? 'Đã xếp kho' : 'Chờ xếp kho'}</td>
          <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setDetailBarcode(detailBarcode === label.barcode ? '' : label.barcode)}>Xem chi tiết</button>
            <button type="button" onClick={() => printLabels([label])}>In tem</button>
          </div></td>
        </tr>)}</tbody></table></div>
        {detailBarcode && (() => { const label = labels.find((item) => item.barcode === detailBarcode); if (!label) return null;
          return <div className="material-reference-summary"><h4>Chi tiết nguồn nhập · {label.barcode}</h4>
            <p>{label.materialCode} · {label.materialName} · Nhà cung cấp: {label.supplierName || supplier?.supplierName || 'Chưa xác định'}</p>
            <p>Phiếu nhập: {label.receiptCode} · Lô / cây: {label.lotOrRollCode || '—'} · Ngày nhận: {label.receivedAt?.slice(0, 10) || '—'}</p>
            <p>Đơn giá: {Number(label.unitCost || 0).toLocaleString('vi-VN')} / {label.unit} · Nhập: {label.quantity} {label.unit} · Còn: {label.remainingQuantity} {label.unit}</p>
            <p>Vị trí dự kiến: {label.plannedLocationCodes?.join(', ') || '—'} · Vị trí thực tế: {label.actualLocationCodes?.join(', ') || 'Chưa xếp kho'}</p>
          </div>;
        })()}
        <button type="button" className="btn-ara-primary" disabled={!labels.length} onClick={() => printLabels(labels)}>In tem hàng loạt</button>
      </section>}
    </div><div className="material-reference-actions">
      {canEdit && <button type="button" disabled={busy || !dirty} onClick={save}>Lưu phiếu nhập</button>}
      {canEdit && receipt.status === 'READY_TO_CONFIRM' && <button type="button" className="primary"
        disabled={busy || dirty} onClick={confirm}>Xác nhận nhập kho</button>}
      <button type="button" disabled={busy} onClick={onClose}>Đóng</button>
    </div></div>
  </div>;
}
