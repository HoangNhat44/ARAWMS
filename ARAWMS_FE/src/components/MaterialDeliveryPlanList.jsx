/*
 * File: MaterialDeliveryPlanList.jsx
 * Description: Shows planned supplier deliveries, batch progress, receipt history, and manager actions.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { materialInboundService as api } from '../services/materialInboundService';
import { getDirectLocalDrafts } from './DirectMaterialReceiptModal';
import '../styles/materialDeliveryPlan.css';

const id = (value) => String(value || '');
const date = (value) => value ? value.slice(0, 10).split('-').reverse().join('/') : '—';
const qty = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const unit = { METER: 'm', KG: 'kg', PIECE: 'chiếc', SPOOL: 'cuộn', BOX: 'hộp' };
const progress = { NOT_RECEIVED: 'Chưa nhận', IN_PROGRESS: 'Đang nhận', RECEIVED_FULL: 'Đã nhận đủ',
  CLOSED_SHORT: 'Đã đóng thiếu', CANCELLED: 'Đã hủy' };
const deadline = { UPCOMING: 'Chưa đến hạn', WITHIN_WINDOW: 'Trong hạn', OVERDUE: 'Quá hạn',
  COMPLETED: 'Đã hoàn tất', COMPLETED_LATE: 'Hoàn tất trễ', CLOSED_SHORT: 'Đã đóng thiếu', CANCELLED: 'Đã hủy' };
const timing = { EARLY: 'Nhận sớm', ON_TIME: 'Đúng hạn', LATE: 'Nhận trễ' };
const emptyBatch = () => ({ expectedStart: '', expectedEnd: '', items: [{ rawMaterialId: '', plannedQty: '' }] });
const planCacheKey = 'arawms-material-plans:507f1f77bcf86cd799439011';
const planDetailKey = (planId) => `arawms-material-plan:507f1f77bcf86cd799439011:${planId}`;

export default function MaterialDeliveryPlanList({ options, onReceive, onOpenReceipt, onMaterialCreated,
  receiptEditor, onCloseReceipt, receiptRefreshKey, preparedPlan, activeBatchId,
  onDirectCreate, onDirectOpen, directRefreshKey, user }) {
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [catalogMaterials, setCatalogMaterials] = useState(options.materials);
  const [newMaterial, setNewMaterial] = useState({ materialCode: '', materialName: '', materialType: 'FABRIC',
    category: 'FABRIC_ROLL', unit: 'METER', color: '', widthCm: '', unitCost: 0 });
  const [receipts, setReceipts] = useState([]);
  const [receiptSourceFilter, setReceiptSourceFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [planPickerSearch, setPlanPickerSearch] = useState('');
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [filters, setFilters] = useState({ search: '', warehouseId: '', from: '', to: '', progress: '', deadline: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({ supplierId: '', warehouseLocationId: '', deliveryNote: '', batches: [emptyBatch()] });
  const [historyBatchId, setHistoryBatchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoadingPlans(true);
    try { const fresh = (await api.plans()).data.plans; setPlans(fresh);
      localStorage.setItem(planCacheKey, JSON.stringify(fresh)); }
    catch (failure) { const cached = JSON.parse(localStorage.getItem(planCacheKey) || 'null');
      if (!cached) throw failure;
      setPlans(cached); setNotice('Đang xem kế hoạch đã lưu trên thiết bị. Cần mạng để lưu và xác nhận phiếu.'); }
    finally { setLoadingPlans(false); }
  }, []);
  useEffect(() => { setCatalogMaterials(options.materials); }, [options.materials]);
  useEffect(() => { load().catch((failure) => setError(failure.message)); }, [load]);
  useEffect(() => { api.receipts().then((response) => setReceipts(response.data.receipts))
    .catch((failure) => setError(failure.message)); }, [directRefreshKey, receiptRefreshKey]);
  useEffect(() => {
    if (!receiptRefreshKey || !selected?.id) return;
    api.plan(selected.id).then((response) => { setSelected(response.data.plan); load().catch(() => {}); })
      .catch((failure) => setError(failure.message));
  }, [receiptRefreshKey]);
  useEffect(() => {
    if (preparedPlan?.id && selected?.id === preparedPlan.id && !preparedPlan.needsSetup)
      setSelected(preparedPlan);
  }, [preparedPlan?.id, preparedPlan?.version]);
  const visible = useMemo(() => plans.filter((plan) => {
    const text = `${plan.planCode} ${plan.supplier?.supplierName || ''} ${plan.batches.flatMap((batch) =>
      batch.lines.map((line) => `${line.material?.materialCode || ''} ${line.material?.materialName || ''}`)).join(' ')}`.toLocaleLowerCase('vi');
    return (!filters.search || text.includes(filters.search.toLocaleLowerCase('vi'))) &&
      (!filters.warehouseId || plan.warehouse?.zoneCode === filters.warehouseId) &&
      (!filters.progress || (filters.progress === 'NEEDS_SETUP' ? plan.needsSetup :
        !plan.needsSetup && plan.progress === filters.progress)) &&
      (!filters.deadline || plan.batches.some((batch) => batch.deadline.label === filters.deadline)) &&
      (!filters.from || plan.batches.some((batch) => batch.expectedEnd.slice(0, 10) >= filters.from)) &&
      (!filters.to || plan.batches.some((batch) => batch.expectedStart.slice(0, 10) <= filters.to));
  }), [plans, filters]);
  const receivingLocations = options.locations.filter((location) =>
    location.warehouseType === 'RAW_MATERIAL' && location.layoutBin === true);
  const zones = [...new Set(receivingLocations.map((location) => location.zoneCode))];
  const displayedLocation = selected?.warehouse || (selected?.needsSetup && receivingLocations.length === 1
    ? receivingLocations[0] : null);

  async function openPlan(planId) {
    setBusy(true); setError('');
    try { const fresh = (await api.plan(planId)).data.plan; setSelected(fresh);
      localStorage.setItem(planDetailKey(planId), JSON.stringify(fresh)); setHistoryBatchId('');
      const next = fresh.batches.find((batch) => ['NOT_RECEIVED', 'IN_PROGRESS'].includes(batch.progress));
      if (next) onReceive(fresh, next); }
    catch (failure) { try { const cached = JSON.parse(localStorage.getItem(planDetailKey(planId)) || 'null');
      if (!cached) throw failure;
      setSelected(cached);
      setHistoryBatchId(''); setNotice('Chi tiết kế hoạch đang là bản lưu trên thiết bị.');
      const next = cached.batches.find((batch) => ['NOT_RECEIVED', 'IN_PROGRESS'].includes(batch.progress));
      if (next) onReceive(cached, next); }
    catch { setError(failure.message); } }
    finally { setBusy(false); }
  }
  async function openPlannedReceipt(item) {
    setBusy(true); setError('');
    try { setSelected((await api.plan(id(item.inboundPlanId))).data.plan); await onOpenReceipt(item._id); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function choosePlanBatch(planId, batchId) {
    setBusy(true); setError('');
    try {
      let plan;
      try { plan = (await api.plan(planId)).data.plan;
        localStorage.setItem(planDetailKey(planId), JSON.stringify(plan)); }
      catch (failure) { plan = JSON.parse(localStorage.getItem(planDetailKey(planId)) || 'null');
        if (!plan) throw failure; }
      const batch = plan.batches.find((item) => item.id === batchId);
      if (!batch) throw new Error('Không tìm thấy đợt giao trong kế hoạch.');
      setSelected(plan); setPlanPickerOpen(false); onReceive(plan, batch);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function openReceiptDetail(receiptId) {
    setBusy(true); setError('');
    try { setReceiptDetail((await api.receipt(receiptId)).data); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function create() {
    setBusy(true); setError('');
    try {
      const result = await api.createPlan(newPlan);
      setCreateOpen(false); setNewPlan({ supplierId: '', warehouseLocationId: '', deliveryNote: '', batches: [emptyBatch()] });
      await load(); await openPlan(result.data.plan.id || result.data.plan._id);
      setNotice('Đã tạo kế hoạch nhập.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function createCatalogMaterial() {
    setBusy(true); setError('');
    try { const material = (await api.createMaterial(newMaterial)).data.material;
      setCatalogMaterials((current) => [...current, material]); onMaterialCreated(material);
      setNewMaterial({ materialCode: '', materialName: '', materialType: 'FABRIC', category: 'FABRIC_ROLL',
        unit: 'METER', color: '', widthCm: '', unitCost: 0 });
      setNotice('Đã thêm nguyên phụ liệu vào danh mục; giờ có thể chọn trong kế hoạch.'); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function updateBatch(index, patch) {
    setNewPlan((current) => ({ ...current, batches: current.batches.map((batch, row) => row === index ? { ...batch, ...patch } : batch) }));
  }
  function updateItem(batchIndex, itemIndex, patch) {
    const batch = newPlan.batches[batchIndex];
    updateBatch(batchIndex, { items: batch.items.map((item, row) => row === itemIndex ? { ...item, ...patch } : item) });
  }
  function closePlan() {
    if (receiptEditor && onCloseReceipt?.() === false) return;
    setSelected(null); setError('');
  }

  return <div className="material-plan-page">
    <header className="material-plan-hero"><div><nav><Link to="/">Trang chủ</Link> / Nguyên phụ liệu / Nhập kho</nav>
      <h1>Phiếu nhập nguyên phụ liệu</h1><p>Nhập theo đợt giao hoặc mua trực tiếp ngoài kế hoạch.</p></div>
      <div className="material-plan-actions"><button onClick={() => setPlanPickerOpen(true)}>
        Nhập theo kế hoạch</button><button className="primary" onClick={onDirectCreate}>Nhập ngoài kế hoạch</button></div></header>
    {error && <p className="material-plan-error" role="alert">{error}</p>}{notice && <p className="material-plan-notice">{notice}</p>}
    {planPickerOpen && <div className="material-plan-overlay top"><div className="material-plan-modal" role="dialog" aria-modal="true" aria-label="Chọn kế hoạch và đợt giao">
      <header><h2>Chọn kế hoạch và đợt giao</h2><button aria-label="Đóng" onClick={() => setPlanPickerOpen(false)}>×</button></header>
      <div className="material-plan-modal-body"><input aria-label="Tìm kế hoạch" placeholder="Tìm mã kế hoạch hoặc nhà cung cấp…"
        value={planPickerSearch} onChange={(event) => setPlanPickerSearch(event.target.value)} />
        {plans.filter((plan) => `${plan.planCode} ${plan.supplier?.supplierName || ''}`.toLocaleLowerCase('vi')
          .includes(planPickerSearch.toLocaleLowerCase('vi'))).map((plan) => <section className="material-plan-card" key={plan.id}>
          <h3>{plan.planCode} · {plan.supplier?.supplierName}</h3>
          <div className="material-plan-actions">{plan.batches.filter((batch) => ['NOT_RECEIVED', 'IN_PROGRESS'].includes(batch.progress))
            .map((batch) => <button key={batch.id} disabled={busy} onClick={() => choosePlanBatch(plan.id, batch.id)}>
              {batch.batchCode} · {date(batch.expectedStart)}–{date(batch.expectedEnd)}</button>)}</div>
        </section>)}
        {!plans.length && <p>Chưa có kế hoạch nhập để chọn.</p>}
      </div></div></div>}
    <section className="material-plan-card material-receipt-list" aria-label="Danh sách phiếu nhập nguyên phụ liệu">
      <div className="material-plan-actions material-receipt-list-heading"><h2>Danh sách phiếu nhập</h2>
        <label>Nguồn nhập<select value={receiptSourceFilter} onChange={(event) => setReceiptSourceFilter(event.target.value)}>
          <option value="">Tất cả</option><option value="PLAN">Theo kế hoạch</option><option value="DIRECT">Ngoài kế hoạch</option>
        </select></label></div>
      <div className="material-plan-table-wrap"><table><thead><tr><th>Mã phiếu</th><th>Ngày nhận</th><th>Nguồn nhập</th>
        <th>Nơi mua / Nhà cung cấp</th><th>Nguyên phụ liệu</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {receipts.filter((item) => !receiptSourceFilter || (item.inboundPlanId ? 'PLAN' : 'DIRECT') === receiptSourceFilter)
          .map((item) => <tr key={id(item._id)}><td><strong>{item.ticketCode}</strong></td>
            <td>{date(item.receivedAt)}</td><td><span className="material-ref-status">{item.inboundPlanId ? 'Theo kế hoạch' : 'Ngoài kế hoạch'}</span></td>
            <td>{item.purchaseSourceName || item.supplierId?.supplierName || '—'}</td>
            <td>{item.receiptLines?.map((line) => line.rawMaterialId?.materialName).filter(Boolean).join(', ') || '—'}</td>
            <td>{item.status === 'COMPLETED' ? 'Đã xác nhận' : 'Nháp'}</td>
            <td><button onClick={() => item.inboundPlanId ? openPlannedReceipt(item) : onDirectOpen({ kind: 'server', id: item._id })}>
              {item.status === 'COMPLETED' ? 'Xem / cất hàng' : 'Tiếp tục'}</button></td></tr>)}
        {(!receiptSourceFilter || receiptSourceFilter === 'DIRECT') && getDirectLocalDrafts(user).map((entry) => <tr key={entry.form.draftKey}>
          <td>Nháp thiết bị</td><td>{date(entry.form.receivedAt)}</td><td><span className="material-ref-status">Ngoài kế hoạch</span></td>
          <td>{entry.form.purchaseSourceName || '—'}</td><td>{entry.form.receiptLines.length} dòng</td><td>Chưa đồng bộ</td>
          <td><button onClick={() => onDirectOpen({ kind: 'local', id: entry.form.draftKey })}>Tiếp tục</button></td></tr>)}
      </tbody></table></div>
      {!receipts.length && !getDirectLocalDrafts(user).length && <p>Chưa có phiếu nhập.</p>}
    </section>
    <h2 id="material-plan-list">Kế hoạch nhập nguyên phụ liệu</h2>
    <section className="material-plan-card material-plan-filters"><input aria-label="Tìm kế hoạch" placeholder="Tìm mã kế hoạch, nguyên phụ liệu hoặc nhà cung cấp…" value={filters.search}
      onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
      <select aria-label="Khu nhận" value={filters.warehouseId} onChange={(event) => setFilters({ ...filters, warehouseId: event.target.value })}>
        <option value="">Tất cả khu nhận</option>{zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select>
      <label>Từ ngày<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>Đến ngày<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      <select aria-label="Tiến độ" value={filters.progress} onChange={(event) => setFilters({ ...filters, progress: event.target.value })}>
        <option value="">Tất cả tiến độ</option><option value="NEEDS_SETUP">Cần thiết lập</option>
        {Object.entries(progress).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="Thời hạn" value={filters.deadline} onChange={(event) => setFilters({ ...filters, deadline: event.target.value })}>
        <option value="">Tất cả thời hạn</option>{['UPCOMING', 'WITHIN_WINDOW', 'OVERDUE'].map((key) => <option key={key} value={key}>{deadline[key]}</option>)}</select>
      <button onClick={() => setFilters({ search: '', warehouseId: '', from: '', to: '', progress: '', deadline: '' })}>Xóa bộ lọc</button></section>
    <section className="material-plan-card"><div className="material-plan-table-wrap"><table><thead><tr><th>Kế hoạch</th><th>Nhà cung cấp</th><th>Vị trí nhận</th>
      <th>Nguyên phụ liệu</th><th>Các đợt giao</th><th>Đợt cần nhận tiếp</th><th>Tiến độ</th><th>Thời hạn</th><th>Thao tác</th></tr></thead>
      <tbody>{visible.map((plan) => { const next = plan.batches.find((batch) => ['NOT_RECEIVED', 'IN_PROGRESS'].includes(batch.progress));
        const names = [...new Set(plan.batches.flatMap((batch) => batch.lines.map((line) => line.material?.materialName).filter(Boolean)))];
        const overdue = plan.batches.find((batch) => batch.deadline.label === 'OVERDUE');
        return <tr key={plan.id}><td><strong>{plan.planCode}</strong></td><td>{plan.supplier?.supplierName || '—'}</td><td>{plan.warehouse ? `${plan.warehouse.zoneCode} · ${plan.warehouse.locationCode}` : 'Chưa chọn'}</td>
          <td>{names[0] || '—'}{names.length > 1 && <small>+{names.length - 1} mặt hàng</small>}</td>
          <td>{plan.needsSetup ? 'Kế hoạch cũ · Chưa có đợt giao' : `${plan.batches.length} đợt · Đã nhận đủ ${plan.batches.filter((batch) => batch.progress === 'RECEIVED_FULL').length} đợt`}</td>
          <td>{plan.needsSetup ? 'Chưa thiết lập đợt' : next ? `${next.batchCode} · ${date(next.expectedStart)}–${date(next.expectedEnd)}` : '—'}</td>
          <td>{plan.needsSetup ? 'Cần thiết lập' : progress[plan.progress]}</td><td>{plan.needsSetup ? 'Chưa xác định theo đợt' : overdue ? `Quá hạn · ${overdue.batchCode} còn thiếu` : next ? deadline[next.deadline.label] : 'Đã hoàn tất'}</td>
          <td><button onClick={() => openPlan(plan.id)}>Xem kế hoạch</button></td></tr>; })}</tbody></table></div>
      {!visible.length && <div className="material-plan-empty">{loadingPlans ? 'Đang tải kế hoạch nhập…' : 'Chưa có kế hoạch nhập phù hợp.'}</div>}
      <p>{loadingPlans ? 'Đang tải…' : `${visible.length} kết quả`}</p></section>

    {selected && <div className="material-plan-overlay"><div className="material-plan-modal" role="dialog" aria-modal="true" aria-label="Chi tiết kế hoạch nhập">
      <header><div><h2>{selected.planCode}</h2><span>{selected.supplier?.supplierName} · Vị trí nhận {displayedLocation?.locationCode || 'chưa xác định'}</span></div>
        <button aria-label="Đóng" onClick={closePlan}>×</button></header>
      <div className="material-plan-modal-body">{error && <p className="material-plan-error" role="alert">{error}</p>}
        <section className="material-plan-card"><h3>Thông tin kế hoạch</h3><p>Người lập: {selected.creator?.fullName || '—'} · Nhà cung cấp: {selected.supplier?.supplierName} · Vị trí nhận: {displayedLocation ? `${displayedLocation.zoneCode} · ${displayedLocation.locationCode}` : 'Chưa xác định'}</p>
          {selected.deliveryNote && <p>Ghi chú giao hàng: {selected.deliveryNote}</p>}</section>
        {selected.needsSetup && <p className="material-plan-notice">Kế hoạch cũ chưa lưu đợt giao và vị trí nhận. Form bên dưới dùng ngày kế hoạch và ô nhận duy nhất đang công bố; hệ thống sẽ gắn các thông tin này khi lưu phiếu. Trường lỗi/thiếu cũ không tách được hàng không đạt.</p>}
        {selected.batches.map((batch) => <details className="material-plan-card" key={batch.id} open><summary><strong>{batch.batchCode} · Dự kiến {date(batch.expectedStart)}–{date(batch.expectedEnd)}</strong>
          <span>{progress[batch.progress]} · {deadline[batch.deadline.label]}{batch.deadline.daysDifference ? ` ${batch.deadline.daysDifference} ngày` : ''}</span></summary>
          <div className="material-plan-table-wrap"><table><thead><tr><th>Nguyên phụ liệu</th><th>ĐVT</th><th>Kế hoạch</th><th>Đạt đã nhập</th><th>Không đạt đã nhận</th><th>Còn cần nhập đạt</th></tr></thead>
            <tbody>{batch.lines.map((line) => <tr key={line.id}><td>{line.material?.materialName} · {line.material?.materialCode}</td><td>{unit[line.material?.unit]}</td>
              <td>{qty(line.plannedQty)}</td><td>{qty(line.acceptedQty)}</td><td>{qty(line.rejectedQty)}</td><td><strong>{qty(line.remainingQty)}</strong></td></tr>)}</tbody></table></div>
          {batch.closedReason && <p>Lý do đóng thiếu: {batch.closedReason}</p>}
          <div className="material-plan-actions">{!selected.needsSetup && <button onClick={() => setHistoryBatchId(historyBatchId === batch.id ? '' : batch.id)}>Lịch sử nhận hàng</button>}
            {selected.batches.length > 1 && (selected.needsSetup ? selected.id : batch.id) !== activeBatchId &&
              ['NOT_RECEIVED', 'IN_PROGRESS'].includes(batch.progress) &&
              <button className="primary" onClick={() => onReceive(selected, batch)}>Nhập đợt này</button>}</div>
          {historyBatchId && historyBatchId === batch.id && <div className="material-plan-table-wrap"><table><thead><tr><th>Phiếu nhập</th><th>Ngày nhận</th><th>Nguyên phụ liệu</th><th>Thực nhận</th><th>Không đạt</th><th>Đạt nhập kho</th><th>Thời hạn</th><th>Thao tác</th></tr></thead>
            <tbody>{batch.history.flatMap((receipt) => receipt.receiptLines.map((line) => <tr key={`${receipt._id}-${line.rawMaterialId}`}>
              <td>{receipt.ticketCode}</td><td>{date(receipt.receivedAt)}</td>
              <td>{batch.lines.find((entry) => id(entry.rawMaterialId) === id(line.rawMaterialId))?.material?.materialName}</td>
              <td>{qty(line.actualQty)}</td><td>{qty(line.rejectedQty)}</td><td>{qty(line.acceptedQty)}</td>
              <td>{receipt.status === 'COMPLETED' ? `${timing[receipt.deliveryTimeliness?.label] || '—'}${receipt.deliveryTimeliness?.daysDifference ? ` ${receipt.deliveryTimeliness.daysDifference} ngày` : ''}` : 'Nháp'}</td>
              <td><button onClick={() => openReceiptDetail(receipt._id)}>Xem phiếu</button></td></tr>))}</tbody></table>
            {!batch.history.length && <p>Chưa có phiếu nhận hàng.</p>}</div>}
        </details>)}
        {!!selected.history.length && <details className="material-plan-card"><summary>Lịch sử điều chỉnh kế hoạch</summary>{selected.history.map((entry, index) =>
          <p key={index}>{entry.changeType === 'ITEMS' ? 'Điều chỉnh mặt hàng' : entry.changeType === 'LEGACY_SETUP' ? 'Thiết lập kế hoạch cũ' :
            `${date(entry.oldStart)}–${date(entry.oldEnd)} → ${date(entry.newStart)}–${date(entry.newEnd)}`} · {entry.reason}</p>)}</details>}
        {receiptEditor && <section className="material-plan-receipt-section" aria-label="Form nhập nguyên phụ liệu">{receiptEditor}</section>}
      </div></div></div>}

    {receiptDetail && <div className="material-plan-overlay receipt-detail"><div className="material-plan-modal" role="dialog" aria-modal="true" aria-label="Chi tiết phiếu nhập">
      <header><div><h2>Phiếu nhập {receiptDetail.receipt.ticketCode}</h2><span>Ngày nhận {date(receiptDetail.receipt.receivedAt)} · {receiptDetail.receipt.status === 'COMPLETED' ? 'Đã xác nhận' : 'Nháp'}</span></div>
        <button aria-label="Đóng chi tiết phiếu" onClick={() => setReceiptDetail(null)}>×</button></header>
      <div className="material-plan-modal-body"><section className="material-plan-card">
        <p>Nhà cung cấp: {receiptDetail.receipt.supplierId?.supplierName || selected?.supplier?.supplierName || '—'}</p>
        <p>Đợt giao: {selected?.batches.find((batch) => batch.id === id(receiptDetail.receipt.deliveryBatchId))?.batchCode || '—'} · Thời hạn: {timing[receiptDetail.receipt.deliveryTimeliness?.label] || '—'}</p>
        <div className="material-plan-table-wrap"><table><thead><tr><th>Nguyên phụ liệu</th><th>Thực nhận</th><th>Không đạt</th><th>Đạt nhập kho</th><th>Chi tiết vật lý</th></tr></thead><tbody>
          {receiptDetail.receipt.receiptLines.map((line, index) => { const material = receiptDetail.materials?.find((item) => id(item._id || item.id) === id(line.rawMaterialId));
            return <tr key={line._id || index}><td>{material?.materialName || '—'} · {material?.materialCode || ''}</td><td>{qty(line.actualQty)}</td><td>{qty(line.rejectedQty)}</td><td>{qty(line.acceptedQty)}</td>
              <td>{line.rolls?.length || 0} cây vải · {line.lots?.length || 0} lô</td></tr>; })}
        </tbody></table></div></section></div>
      <footer><button onClick={() => setReceiptDetail(null)}>Đóng</button>
        <button className="primary" onClick={() => { const receiptId = receiptDetail.receipt._id || receiptDetail.receipt.id;
          setReceiptDetail(null); onOpenReceipt(receiptId); }}>{receiptDetail.receipt.status === 'COMPLETED' ? 'Mở thao tác cất hàng' : 'Mở phiếu để sửa'}</button></footer>
    </div></div>}
    {createOpen && <div className="material-plan-overlay top"><div className="material-plan-modal" role="dialog" aria-modal="true" aria-label="Tạo kế hoạch nhập">
      <header><h2>Tạo kế hoạch nhập</h2><button aria-label="Đóng" onClick={() => setCreateOpen(false)}>×</button></header>
      <div className="material-plan-modal-body">{error && <p className="material-plan-error" role="alert">{error}</p>}
        <section className="material-plan-card material-plan-form"><label>Nhà cung cấp *<select value={newPlan.supplierId} onChange={(event) => setNewPlan({ ...newPlan, supplierId: event.target.value })}>
          <option value="">Chọn nhà cung cấp</option>{options.suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.supplierCode} · {supplier.supplierName}</option>)}</select></label>
          <label>Vị trí nhận *<select value={newPlan.warehouseLocationId} onChange={(event) => setNewPlan({ ...newPlan, warehouseLocationId: event.target.value })}>
            <option value="">Chọn vị trí</option>{receivingLocations.map((location) => <option key={location._id} value={location._id}>{location.zoneCode} · {location.locationCode}</option>)}</select></label>
          <label className="wide">Ghi chú giao hàng<input value={newPlan.deliveryNote} onChange={(event) => setNewPlan({ ...newPlan, deliveryNote: event.target.value })} /></label></section>
        <details className="material-plan-card"><summary>+ Thêm nguyên phụ liệu mới vào danh mục</summary>
          <div className="material-plan-form"><label>Mã *<input value={newMaterial.materialCode} onChange={(event) => setNewMaterial({ ...newMaterial, materialCode: event.target.value })} /></label>
            <label>Tên *<input value={newMaterial.materialName} onChange={(event) => setNewMaterial({ ...newMaterial, materialName: event.target.value })} /></label>
            <label>Màu<input value={newMaterial.color} onChange={(event) => setNewMaterial({ ...newMaterial, color: event.target.value })} /></label>
            <label>Loại<select value={newMaterial.materialType} onChange={(event) => setNewMaterial({ ...newMaterial,
              materialType: event.target.value, category: event.target.value === 'FABRIC' ? 'FABRIC_ROLL' : 'BUTTON',
              unit: event.target.value === 'FABRIC' ? 'METER' : 'PIECE' })}><option value="FABRIC">Vải</option><option value="AUXILIARY">Phụ liệu</option></select></label>
            <label>Danh mục<select value={newMaterial.category} onChange={(event) => setNewMaterial({ ...newMaterial, category: event.target.value })}>
              {(newMaterial.materialType === 'FABRIC' ? ['FABRIC_ROLL'] : ['BUTTON', 'THREAD', 'ZIPPER', 'CARE_LABEL', 'PACKAGING_BAG'])
                .map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>ĐVT<select value={newMaterial.unit} onChange={(event) => setNewMaterial({ ...newMaterial, unit: event.target.value })}>
              {(newMaterial.materialType === 'FABRIC' ? ['METER'] : ['KG', 'PIECE', 'SPOOL', 'BOX'])
                .map((value) => <option key={value} value={value}>{unit[value]}</option>)}</select></label>
            <label>Khổ vải (cm)<input type="number" min="0" value={newMaterial.widthCm} onChange={(event) => setNewMaterial({ ...newMaterial, widthCm: event.target.value })} /></label>
            <label>Đơn giá danh mục<input type="number" min="0" value={newMaterial.unitCost} onChange={(event) => setNewMaterial({ ...newMaterial, unitCost: event.target.value })} /></label></div>
          <button disabled={busy} onClick={createCatalogMaterial}>Lưu nguyên phụ liệu</button></details>
        {newPlan.batches.map((batch, batchIndex) => <section className="material-plan-card" key={batchIndex}><div className="material-plan-actions"><h3>Đợt {batchIndex + 1}</h3>
          {newPlan.batches.length > 1 && <button onClick={() => setNewPlan({ ...newPlan, batches: newPlan.batches.filter((_, index) => index !== batchIndex) })}>Xóa đợt</button>}</div>
          <div className="material-plan-form"><label>Từ ngày *<input type="date" value={batch.expectedStart} onChange={(event) => updateBatch(batchIndex, { expectedStart: event.target.value })} /></label>
            <label>Đến ngày *<input type="date" value={batch.expectedEnd} onChange={(event) => updateBatch(batchIndex, { expectedEnd: event.target.value })} /></label></div>
          {batch.items.map((item, itemIndex) => <div className="material-plan-form" key={itemIndex}><label>Nguyên phụ liệu *<select value={item.rawMaterialId}
            onChange={(event) => updateItem(batchIndex, itemIndex, { rawMaterialId: event.target.value })}><option value="">Chọn mặt hàng</option>
            {catalogMaterials.map((material) => <option key={material._id || material.id} value={material._id || material.id}>{material.materialCode} · {material.materialName} · {unit[material.unit]}</option>)}</select></label>
            <label>Lượng đạt cần nhập *<input type="number" min="0" step=".001" value={item.plannedQty} onChange={(event) => updateItem(batchIndex, itemIndex, { plannedQty: event.target.value })} /></label>
            {batch.items.length > 1 && <button onClick={() => updateBatch(batchIndex, { items: batch.items.filter((_, index) => index !== itemIndex) })}>Xóa hàng</button>}</div>)}
          <button onClick={() => updateBatch(batchIndex, { items: [...batch.items, { rawMaterialId: '', plannedQty: '' }] })}>+ Thêm mặt hàng</button></section>)}
        <button onClick={() => setNewPlan({ ...newPlan, batches: [...newPlan.batches, emptyBatch()] })}>+ Thêm đợt giao</button>
      </div><footer><button onClick={() => setCreateOpen(false)}>Đóng</button><button className="primary" disabled={busy} onClick={create}>{busy ? 'Đang lưu…' : 'Lưu kế hoạch'}</button></footer>
    </div></div>}
  </div>;
}
