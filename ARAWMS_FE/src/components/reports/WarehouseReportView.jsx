/*
 * File: WarehouseReportView.jsx
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Renders a warehouse statistics report (ManagerReport INVENTORY, content schema
 * warehouse-report-v1): A = finished goods, B = raw materials, C = shared activity, each with the warehouse
 * manager's comment. Used by the warehouse manager (editable comments while drafting, preview) and by the
 * Owner (read-only). Reuses the finished-goods page look (fg-metric, fg-stock-card, product-table, fg-status).
 * All figures come from the report snapshot; nothing here is computed from live data.
 */
import { Fragment, useState } from 'react';
import { MATERIAL_UNIT_OPTIONS } from '../../utils/materialUnits';
import '../../styles/finishedGoods.css';
import '../../styles/warehouseReport.css';

export const WAREHOUSE_REPORT_SCHEMA = 'warehouse-report-v1';
export const isWarehouseReportContent = (content) => content?.schema === WAREHOUSE_REPORT_SCHEMA;

const nf = (value) => (Number(value) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const vnd = (value) => `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} đ`;
const date = (value) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—');
const unitLabel = (unit) => MATERIAL_UNIT_OPTIONS.find((option) => option.value === unit)?.label.replace(/^.*\((.*)\)$/, '$1') || unit || '';
const STATUS = { SELLING: ['Đang bán', 'ready'], STOPPED: ['Ngừng bán', 'muted'], DRAFT: ['Nháp (bản cũ)', 'empty'] };
const WAREHOUSE = { FINISHED_GOODS: 'Kho thành phẩm', RAW_MATERIAL: 'Kho nguyên phụ liệu', DEFECT_QUARANTINE: 'Khu hàng lỗi', ALL: 'Cả hai kho' };
const ROLL = { PENDING_QC: 'Chờ kiểm', QC_PASSED: 'Đạt, chờ lên kệ', IN_STOCK: 'Trong kho', REMNANT_RETURNED: 'Vải thừa trả về',
  DEFECTIVE: 'Lỗi cách ly', ISSUED_FOR_CUTTING: 'Đã cấp cắt', DEPLETED: 'Đã hết', RETURNED_TO_SUPPLIER: 'Đã trả NCC' };
const STOCKTAKE = { WAITING: 'Chờ kiểm', FROZEN_COUNTING: 'Đang đếm', VARIANCE_REVIEW: 'Chờ duyệt chênh lệch', APPROVED_PENDING_ADJUSTMENT: 'Đã duyệt, chờ điều chỉnh', RECOUNT_REQUESTED: 'Đã yêu cầu kiểm lại',
  APPROVED_COMPLETED: 'Đã duyệt', CANCELLED: 'Đã hủy' };
const CONDITION = { GOOD_INTACT: 'Nguyên vẹn', MISSING_TAG: 'Mất tem', DIRTY_OR_DAMAGED: 'Bẩn / hỏng', DEFECTIVE_SEWING: 'Lỗi may',
  WRONG_ITEM: 'Sai sản phẩm', USED: 'Đã qua sử dụng' };
const MATERIAL_TYPE = { FABRIC: 'Vải', AUXILIARY: 'Phụ liệu' };

/** The 7 finished-goods attention groups, in the order the warehouse handles them. */
const FG_GROUPS = [
  { key: 'overReserved', title: 'Giữ vượt tồn', hint: 'Đơn đã giữ nhiều hơn số đang có',
    columns: [['SKU', (row) => row.skuCode], ['Tồn', (row) => nf(row.onHand)], ['Đang giữ', (row) => nf(row.reserved)], ['Thiếu', (row) => nf(row.missing)]] },
  { key: 'belowSafety', title: 'Dưới ngưỡng an toàn', hint: 'Có thể xuất thấp hơn ngưỡng',
    columns: [['SKU', (row) => row.skuCode], ['Có thể xuất', (row) => nf(row.available)], ['Ngưỡng', (row) => nf(row.threshold)]] },
  { key: 'aging', title: 'Tồn lâu (FIFO)', hint: 'Lô nằm kho quá số ngày cho phép',
    columns: [['SKU', (row) => row.skuCode], ['Số lượng', (row) => nf(row.quantity)], ['Lâu nhất', (row) => `${row.oldestDays} ngày`], ['Ngưỡng', (row) => `${row.limitDays} ngày`]] },
  { key: 'stoppedWithStock', title: 'Ngừng bán còn tồn', hint: 'Màu đã ngừng bán vẫn còn hàng',
    columns: [['SKU', (row) => row.skuCode], ['Tồn', (row) => nf(row.onHand)], ['Đang giữ', (row) => nf(row.reserved)], ['Giá trị', (row) => vnd(row.value)]] },
  { key: 'draftWithStock', title: 'Nháp nhưng có tồn', hint: 'Sản phẩm nháp bản cũ đã có hàng',
    columns: [['SKU', (row) => row.skuCode], ['Tồn', (row) => nf(row.onHand)]] },
  { key: 'defective', title: 'Hàng lỗi / cách ly', hint: 'Hàng hoàn bị đánh giá lỗi',
    columns: [['SKU', (row) => row.skuCode], ['Trong kho lỗi', (row) => nf(row.inStock)], ['Chờ nhập kho lỗi', (row) => nf(row.pending)]] },
  { key: 'unlabeled', title: 'Chưa dán barcode', hint: 'Chiếc trong lô chưa có tem',
    columns: [['SKU', (row) => row.skuCode], ['Số chiếc chưa có tem', (row) => nf(row.quantity)]] },
];
/** The 4 raw-material attention groups. */
const RM_GROUPS = [
  { key: 'belowSafety', title: 'Dưới ngưỡng an toàn', hint: 'Có thể xuất thấp hơn ngưỡng',
    columns: [['Mã', (row) => row.materialCode], ['Tên', (row) => row.materialName], ['Có thể xuất', (row) => `${nf(row.available)} ${unitLabel(row.unit)}`], ['Ngưỡng', (row) => nf(row.threshold)]] },
  { key: 'aging', title: 'Tồn lâu', hint: 'Cuộn / lô nằm kho quá hạn',
    columns: [['Mã cuộn / lô', (row) => row.code], ['Nguyên liệu', (row) => row.name], ['Còn lại', (row) => `${nf(row.quantity)} ${unitLabel(row.unit)}`], ['Số ngày', (row) => `${row.ageDays} / ${row.limitDays}`]] },
  { key: 'pendingPutaway', title: 'Chờ lên kệ', hint: 'Đã nhận, chưa xếp vị trí',
    columns: [['Mã', (row) => row.code], ['Nguyên liệu', (row) => row.name], ['Số lượng', (row) => `${nf(row.quantity)} ${unitLabel(row.unit)}`], ['Nguồn', (row) => row.source]] },
  { key: 'pendingCheckOrDefect', title: 'Chờ kiểm / hàng lỗi', hint: 'Cuộn chờ kiểm, cuộn lỗi, lô cách ly',
    columns: [['Mã', (row) => row.code], ['Nguyên liệu', (row) => row.name], ['Số lượng', (row) => `${nf(row.quantity)} ${unitLabel(row.unit)}`], ['Tình trạng', (row) => row.source]] },
];

/** Same tile as the finished-goods overview (fg-metric). */
function Metric({ label, value, hint, tone }) {
  return <div className={`fg-metric ${tone ? `fg-metric-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

function Table({ columns, rows, empty = 'Không có dữ liệu.' }) {
  if (!rows?.length) return <p className="fg-empty">{empty}</p>;
  return <div className="product-table-scroll"><table className="product-table wr-table">
    <thead><tr>{columns.map(([title]) => <th key={title}>{title}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{columns.map(([title, render]) => <td key={title}>{render(row)}</td>)}</tr>)}</tbody>
  </table></div>;
}

/** Attention groups as tiles; a tile opens its list. */
function AttentionGroups({ groups, data }) {
  const [open, setOpen] = useState(null);
  const active = groups.find((group) => group.key === open);
  return <>
    <div className="wr-attention-grid">{groups.map((group) => {
      const count = data?.[group.key]?.length || 0;
      return <button type="button" key={group.key} className={`wr-attention ${count ? 'has-items' : ''} ${open === group.key ? 'is-open' : ''}`}
        aria-expanded={open === group.key} onClick={() => setOpen(open === group.key ? null : group.key)}>
        <span>{group.title}</span><strong>{count}</strong><small>{group.hint}</small>
      </button>;
    })}</div>
    {active && <div className="wr-attention-list"><h3>{active.title}</h3>
      <Table columns={active.columns} rows={data?.[active.key]} empty="Không có mục nào." /></div>}
  </>;
}

function Status({ value }) {
  const [label, tone] = STATUS[value] || STATUS.SELLING;
  return <span className={`fg-status ${tone}`}>{label}</span>;
}

/** A2: product -> color -> size; opening a variant shows its physical lots. */
function ProductTree({ products }) {
  const [openProducts, setOpenProducts] = useState({});
  const [openLots, setOpenLots] = useState({});
  if (!products?.length) return <p className="fg-empty">Chưa có sản phẩm nào có tồn.</p>;
  return <div className="product-table-scroll"><table className="product-table wr-table wr-tree">
    <thead><tr><th>Sản phẩm / Màu / Size</th><th>Trạng thái</th><th>Tồn</th><th>Đang giữ</th><th>Có thể xuất</th><th>Hàng lỗi</th><th>Giá trị (giá bán)</th></tr></thead>
    <tbody>{products.map((product) => {
      const opened = openProducts[product.productCode];
      return <Fragment key={product.productCode}>
        <tr className="wr-tree-product" onClick={() => setOpenProducts((state) => ({ ...state, [product.productCode]: !opened }))}>
          <td><button type="button" className="wr-toggle" aria-expanded={Boolean(opened)} aria-label={opened ? 'Thu gọn' : 'Mở rộng'}>{opened ? '▾' : '▸'}</button>
            <strong>{product.productCode}</strong> <span className="wr-muted">{product.productName}</span></td>
          <td><Status value={product.status} /></td>
          <td>{nf(product.onHand)}</td><td>{nf(product.reserved)}</td><td>{nf(product.available)}</td><td>{nf(product.defect)}</td><td>{vnd(product.value)}</td>
        </tr>
        {opened && product.colors.map((color) => <Fragment key={color.color}>
          <tr className="wr-tree-color"><td>Màu {color.color}</td><td /><td>{nf(color.onHand)}</td><td>{nf(color.reserved)}</td>
            <td>{nf(color.available)}</td><td>{nf(color.defect)}</td><td>{vnd(color.value)}</td></tr>
          {color.variants.map((variant) => {
            const lotsOpen = openLots[variant.skuCode];
            return <Fragment key={variant.skuCode}>
              <tr className="wr-tree-variant">
                <td>{variant.lots.length > 0 && <button type="button" className="wr-toggle" aria-expanded={Boolean(lotsOpen)}
                  aria-label={lotsOpen ? 'Ẩn lô' : 'Xem lô'} onClick={() => setOpenLots((state) => ({ ...state, [variant.skuCode]: !lotsOpen }))}>{lotsOpen ? '▾' : '▸'}</button>}
                  Size {variant.size} · <code>{variant.skuCode}</code></td>
                <td><Status value={variant.status} /></td>
                <td>{nf(variant.onHand)}</td><td>{nf(variant.reserved)}</td><td>{nf(variant.available)}</td><td>{nf(variant.defect)}</td><td>{vnd(variant.value)}</td>
              </tr>
              {lotsOpen && <tr className="wr-tree-lots"><td colSpan={7}>
                <Table rows={variant.lots} columns={[['Lô', (lot) => lot.batchCode], ['Vị trí', (lot) => lot.locationCode || '—'],
                  ['Ban đầu', (lot) => nf(lot.initialQty)], ['Còn lại', (lot) => nf(lot.remainingQty)], ['Đã dán tem', (lot) => nf(lot.labeledQty)],
                  ['Ngày nhập', (lot) => date(lot.inboundAt)], ['Số ngày', (lot) => lot.ageDays ?? '—']]} />
              </td></tr>}
            </Fragment>;
          })}
        </Fragment>)}
      </Fragment>;
    })}</tbody>
  </table></div>;
}

function Comment({ label, value, editable, onChange, placeholder }) {
  return <div className="wr-comment"><h3>{label}</h3>
    {editable ? <textarea rows={3} maxLength={2000} value={value || ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      : <p>{value || <span className="wr-muted">Không có nhận xét.</span>}</p>}
  </div>;
}

function Section({ tag, title, description, children }) {
  return <section className="fg-stock-card wr-section">
    <div className="fg-stock-heading"><div><h2>{tag} · {title}</h2>{description && <p>{description}</p>}</div></div>
    {children}
  </section>;
}

/** Ratio shown in the UI; same rule as the backend (1 decimal, 0 when the whole is 0). */
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const sumBy = (rows, field) => (rows || []).reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
const countGroups = (groups) => Object.values(groups || {}).reduce((acc, list) => ({
  items: acc.items + (list?.length || 0), groups: acc.groups + (list?.length ? 1 : 0) }), { items: 0, groups: 0 });

/** Detail block, collapsed by default: the report opens on the key figures only. */
function Details({ children }) {
  const [open, setOpen] = useState(false);
  return <div className="wr-details">
    <button type="button" className="wr-details-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? 'Thu gọn chi tiết ▴' : 'Xem chi tiết ▾'}</button>
    {open && <div className="wr-details-body">{children}</div>}
  </div>;
}

/** One-line highlights under the key figures (attention items, period activity). */
function Highlights({ items }) {
  return <ul className="wr-highlights">{items.filter(Boolean).map((item) => <li key={item.label} className={item.tone || ''}>
    <span>{item.label}</span><strong>{item.value}</strong></li>)}</ul>;
}

/**
 * @param {object} props
 * @param {object} props.content Report content (warehouse-report-v1).
 * @param {object} [props.comments] Comments to show (defaults to content.comments).
 * @param {boolean} [props.editable] Comments can be typed (draft only).
 * @param {(key: string, value: string) => void} [props.onCommentChange]
 */
export default function WarehouseReportView({ content, comments = content?.comments || {}, editable = false, onCommentChange }) {
  if (!isWarehouseReportContent(content)) return <p className="fg-empty">Báo cáo chưa có số liệu.</p>;
  const { finishedGoods: fg, materials: rm, common } = content;
  const change = (key) => (value) => onCommentChange?.(key, value);
  const fabric = rm.overview.totals.filter((row) => row.materialType === 'FABRIC');
  const auxiliary = rm.overview.totals.filter((row) => row.materialType !== 'FABRIC');
  const perUnit = (rows, field) => rows.filter((row) => row[field]).map((row) => `${nf(row[field])} ${unitLabel(row.unit)}`).join(' · ') || '0';
  const fgFlags = countGroups(fg.attention.groups);
  const rmFlags = countGroups(rm.attention);
  const fgDefect = fg.overview.defect + fg.overview.defectPending;
  const stock = common.stocktake;
  const counted = stock.lines - stock.notCounted;
  const movementCount = sumBy(common.movements, 'count');
  const freeBins = sumBy(common.locations.byType, 'empty');

  return <div className="wr-report">
    <p className="fg-stock-note">Số tồn và giá trị là số tại thời điểm tổng hợp ({new Date(content.generatedAt).toLocaleString('vi-VN')}).
      Hàng hoàn, xuất cắt, kiểm kê và nhập – xuất tính theo kỳ {date(content.period.from)} – {date(new Date(content.period.to) - 1)}.</p>

    {/* Tổng quan: the few numbers the Owner reads first. */}
    <section className="fg-metrics wr-summary" aria-label="Tổng quan báo cáo">
      <Metric label="Giá trị tồn kho" value={vnd(fg.overview.value + rm.overview.value)}
        hint={`Thành phẩm ${vnd(fg.overview.value)} · NPL ${vnd(rm.overview.value)}`} tone="value" />
      <Metric label="Thành phẩm có thể xuất" value={`${pct(fg.overview.available, fg.overview.onHand)}%`}
        hint={`${nf(fg.overview.available)} / ${nf(fg.overview.onHand)} chiếc (có thể xuất ÷ tổng tồn)`} tone="available" />
      <Metric label="Việc cần xử lý" value={nf(fgFlags.items + rmFlags.items)}
        hint={`Thành phẩm ${nf(fgFlags.items)} · Nguyên phụ liệu ${nf(rmFlags.items)}`} tone={fgFlags.items + rmFlags.items ? 'defect' : ''} />
      <Metric label="Lấp đầy kho" value={`${common.locations.fillPercent}%`}
        hint={`Đang chứa ÷ sức chứa · ${nf(freeBins)}/${nf(common.locations.total)} ô trống`} />
    </section>

    <Section tag="Phần A" title="Kho thành phẩm" description="Tồn kho, hàng cần xử lý và hàng hoàn về kho">
      <div className="fg-metrics wr-metrics">
        <Metric label="Tổng tồn" value={nf(fg.overview.onHand)} hint={`${nf(fg.overview.skuCount.selling)} SKU đang bán`} />
        <Metric label="Có thể xuất" value={nf(fg.overview.available)} hint={`Tồn − đang giữ (${nf(fg.overview.reserved)} giữ cho đơn)`} tone="available" />
        <Metric label="Hàng lỗi / cách ly" value={nf(fgDefect)} hint={`${nf(fg.overview.defect)} trong kho lỗi · ${nf(fg.overview.defectPending)} chờ nhập`} tone="defect" />
        <Metric label="Giá trị tồn" value={vnd(fg.overview.value)} hint="Tồn × giá bán niêm yết của SKU" tone="value" />
      </div>
      <div className="wr-split" role="img" aria-label="Phân loại tồn kho thành phẩm">
        {fg.overview.split.map((part) => part.percent > 0 && <span key={part.key} className={`wr-split-${part.key}`} style={{ width: `${part.percent}%` }} />)}
      </div>
      <ul className="wr-legend">{fg.overview.split.map((part) => <li key={part.key}><i className={`wr-split-${part.key}`} />
        {part.label}: <strong>{part.percent}%</strong> ({nf(part.quantity)} chiếc)</li>)}</ul>
      <p className="wr-formula">Tỷ lệ = số chiếc của nhóm ÷ tổng 4 nhóm.</p>
      <Highlights items={[
        { label: 'Cần xử lý', value: fgFlags.items ? `${nf(fgFlags.items)} mục ở ${fgFlags.groups} nhóm` : 'Không có', tone: fgFlags.items ? 'warn' : 'ok' },
        { label: 'SKU an toàn', value: `${fg.attention.safeRate}% (${nf(fg.attention.checkedSkus - fg.attention.flaggedSkus)}/${nf(fg.attention.checkedSkus)} SKU không có cảnh báo)` },
        { label: 'Hàng hoàn trong kỳ', value: fg.returns.total
          ? `${nf(fg.returns.total)} chiếc · ${fg.returns.restockedPercent}% nhập lại · ${fg.returns.defectivePercent}% lỗi` : 'Không có' },
      ]} />
      <Details>
        <h3>Tồn kho chi tiết (Sản phẩm → Màu → Size → Lô)</h3>
        <ProductTree products={fg.products} />
        <h3>Hàng cần xử lý</h3>
        <AttentionGroups groups={FG_GROUPS} data={fg.attention.groups} />
        <h3>Hàng hoàn về kho trong kỳ</h3>
        {fg.returns.total ? <Table rows={[...fg.returns.byCondition, { key: 'RESULTS' }]} columns={[
          ['Tình trạng', (row) => (row.key === 'RESULTS' ? 'Kết quả theo phiếu (đạt / một phần / không đạt)' : CONDITION[row.key] || row.key)],
          ['Số lượng', (row) => (row.key === 'RESULTS'
            ? `${nf(fg.returns.results.PASSED)} / ${nf(fg.returns.results.PARTIAL)} / ${nf(fg.returns.results.FAILED)}` : nf(row.quantity))]]} />
          : <p className="fg-empty">Không có phiếu kiểm hàng hoàn trong kỳ.</p>}
      </Details>
      <Comment label="Nhận xét của quản lý kho – Phần A" value={comments.finishedGoods} editable={editable} onChange={change('finishedGoods')}
        placeholder="Nguyên nhân hàng hoàn, kiến nghị Owner duyệt thanh lý các mã ngừng bán…" />
    </Section>

    <Section tag="Phần B" title="Kho nguyên phụ liệu" description="Tồn kho vải, phụ liệu và xuất cho xưởng cắt">
      <div className="fg-metrics wr-metrics">
        <Metric label="Vải" value={perUnit(fabric, 'onHand')} hint={`${nf(rm.overview.rollCount)} cuộn · ${nf(rm.overview.remnantRollCount)} cuộn vải thừa`} />
        <Metric label="Phụ liệu" value={perUnit(auxiliary, 'onHand')} hint={`${nf(rm.overview.materialCount)} mã nguyên phụ liệu`} />
        <Metric label="Cần xử lý" value={nf(rmFlags.items)} hint={rmFlags.items ? `${rmFlags.groups} nhóm có mục cần xử lý` : 'Không có mục nào'} tone={rmFlags.items ? 'defect' : ''} />
        <Metric label="Giá trị tồn" value={vnd(rm.overview.value)} hint="Tồn × đơn giá nguyên liệu" tone="value" />
      </div>
      <Highlights items={[
        { label: 'Xuất cho xưởng cắt trong kỳ', value: rm.cutting.lines ? `${nf(rm.cutting.documents)} phiếu · `
          + rm.cutting.byUnit.map((row) => `${nf(row.quantity)} ${unitLabel(row.unit)}`).join(' · ') : 'Không có' },
        { label: 'Chờ lên kệ', value: perUnit(rm.overview.totals, 'pendingPutaway') },
        { label: 'Cách ly / lỗi', value: perUnit(rm.overview.totals, 'quarantine') },
      ]} />
      <Details>
        <h3>Tồn kho chi tiết</h3>
        <Table rows={rm.items} empty="Chưa có nguyên phụ liệu." columns={[['Mã', (row) => row.materialCode], ['Tên', (row) => row.materialName],
          ['Loại', (row) => MATERIAL_TYPE[row.materialType] || row.materialType], ['Tồn', (row) => `${nf(row.onHand)} ${unitLabel(row.unit)}`],
          ['Đang giữ', (row) => nf(row.reserved)], ['Có thể xuất', (row) => nf(row.available)], ['Chờ lên kệ', (row) => nf(row.pendingPutaway)],
          ['Đơn giá', (row) => vnd(row.unitCost)], ['Giá trị', (row) => vnd(row.value)]]} />
        <h3>Sổ cuộn vải</h3>
        <Table rows={rm.rolls} empty="Không có cuộn vải nào trong kho." columns={[['Mã cuộn', (row) => <code>{row.rollBarcode}</code>],
          ['Vải', (row) => `${row.materialCode} ${row.materialName}`], ['Khổ (cm)', (row) => nf(row.widthCm)], ['Ban đầu (m)', (row) => nf(row.initialMeters)],
          ['Còn lại (m)', (row) => nf(row.remainingMeters)], ['Đã dùng (m)', (row) => nf(row.usedMeters)],
          ['Vải thừa', (row) => (row.isRemnant ? 'Có' : '—')], ['Vị trí', (row) => row.locationCode || '—'], ['Trạng thái', (row) => ROLL[row.status] || row.status]]} />
        <h3>Hàng cần xử lý</h3>
        <AttentionGroups groups={RM_GROUPS} data={rm.attention} />
      </Details>
      <Comment label="Nhận xét của quản lý kho – Phần B" value={comments.materials} editable={editable} onChange={change('materials')}
        placeholder="Thiếu hụt, hàng lỗi, đề xuất với nhà cung cấp…" />
    </Section>

    <Section tag="Phần C" title="Hoạt động chung của hai kho" description="Vị trí kho, kiểm kê và nhập – xuất trong kỳ">
      <div className="fg-metrics wr-metrics">
        <Metric label="Lấp đầy kho" value={`${common.locations.fillPercent}%`} hint="Đang chứa ÷ sức chứa các ô có giới hạn" />
        <Metric label="Ô còn trống" value={`${nf(freeBins)} / ${nf(common.locations.total)}`} hint={`${nf(common.locations.unplacedFinishedUnits)} chiếc thành phẩm chưa xếp kệ`} />
        <Metric label="Kiểm kê khớp" value={counted > 0 ? `${stock.matchedPercent}%` : '—'}
          hint={stock.sessions.length ? `${nf(stock.sessions.length)} đợt · khớp ÷ dòng đã đếm` : 'Không có đợt kiểm kê trong kỳ'} tone="available" />
        <Metric label="Giao dịch kho" value={nf(movementCount)} hint="Số giao dịch nhập – xuất trong kỳ" />
      </div>
      {stock.sessions.length > 0 && <Highlights items={[
        { label: 'Chênh lệch kiểm kê', value: `Thừa ${nf(stock.over)} dòng (${vnd(stock.overValue)}) · Thiếu ${nf(stock.short)} dòng (${vnd(stock.shortValue)})`,
          tone: stock.over + stock.short ? 'warn' : 'ok' },
      ]} />}
      <Details>
        <h3>Tình trạng vị trí kho</h3>
        <Table rows={common.locations.byType} columns={[['Kho', (row) => WAREHOUSE[row.warehouseType] || row.warehouseType],
          ['Tổng vị trí', (row) => nf(row.total)], ['Đang dùng', (row) => nf(row.used)], ['Còn trống', (row) => nf(row.empty)],
          ['Đã đầy', (row) => nf(row.full)], ['Bảo trì', (row) => nf(row.maintenance)], ['Khóa', (row) => nf(row.locked)],
          ['Khóa kiểm kê', (row) => nf(row.frozen)], ['Lấp đầy', (row) => (row.capacity ? `${row.fillPercent}%` : '—')]]} />
        <h3>Kết quả kiểm kê trong kỳ</h3>
        <Table rows={stock.sessions} empty="Không có đợt kiểm kê nào trong kỳ." columns={[['Mã đợt', (row) => row.sessionCode], ['Tên', (row) => row.name || '—'],
          ['Kho', (row) => WAREHOUSE[row.warehouseType] || row.warehouseType], ['Ngày', (row) => date(row.scheduledAt)],
          ['Người kiểm', (row) => row.inspector || '—'], ['Trạng thái', (row) => STOCKTAKE[row.status] || row.status],
          ['Khớp / Thừa / Thiếu', (row) => `${nf(row.matched)} / ${nf(row.over)} / ${nf(row.short)}`]]} />
        <h3>Tổng hợp nhập – xuất trong kỳ</h3>
        <Table rows={common.movements} empty="Không có giao dịch kho nào trong kỳ." columns={[['Kho', (row) => WAREHOUSE[row.warehouseType] || row.warehouseType],
          ['Nghiệp vụ', (row) => row.label], ['Số giao dịch', (row) => nf(row.count)], ['Tổng số lượng', (row) => nf(row.quantity)]]} />
      </Details>
      <Comment label="Nhận xét hoạt động chung" value={comments.common} editable={editable} onChange={change('common')}
        placeholder="Tổng kết vận hành kho trong kỳ…" />
    </Section>

    <p className="fg-stock-note wr-seal">
      {content.seal ? <>Số liệu đã khóa khi gửi Owner lúc {new Date(content.seal.sealedAt).toLocaleString('vi-VN')}{content.seal.sealedBy ? ` bởi ${content.seal.sealedBy}` : ''}.
        Dấu kiểm tra: <code>{content.seal.hash.slice(0, 16)}…</code></>
        : <>Số liệu do hệ thống tự tổng hợp, không sửa tay. Khi gửi Owner, số liệu được đóng băng và đóng dấu kiểm tra, lưu vĩnh viễn.</>}
    </p>
  </div>;
}
