/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * UC-12/13/17/19: Biểu đồ có trục, đơn vị, chú giải và số liệu đối chiếu. Cột/đường cho thời gian;
 * thanh ngang cho tên dài; hình tròn chỉ cho tỷ trọng không âm. Không thêm thư viện hoặc chuyển động.
 */
import { useState } from 'react';
import { money, quantity, labels } from './OwnerUI';
import { WmsField, WmsSelect } from '../../components/ui/WmsControls';
const colors = ['#315d48', '#a66c28', '#466c9b', '#8c4d78', '#59652a', '#80544a', '#626b75'];
const valueOf = (v) => Number.isFinite(v) ? v : 0;
const display = (v, currency) => currency ? money(v) : quantity(v);
const short = (text, n = 24) => text.length > n ? `${text.slice(0, n - 1)}…` : text;
// UC-13: Cùng thang đo, cột bắt đầu từ 0; hỗ trợ số âm, không dùng hai trục gây nhầm đơn vị.
export function SeriesPlot({ rows, series, kind = 'column', currency = false, title, categoryLabel = 'Nhóm so sánh', unitLabel = 'số lượng' }) {
  // Dành khoảng ngang cho từng nhãn; màn hình hẹp cuộn trong vùng biểu đồ thay vì làm tràn trang.
  const width = Math.max(720, rows.length * 76 + 100), height = 370;
  const left = 78, top = 36, bottom = 260, right = width - 24, plotHeight = bottom - top;
  // Dùng cùng một thang đo cho tất cả chuỗi, giữ mốc 0 và mở rộng xuống dưới khi có số âm.
  const values = rows.flatMap((r) => series.map((s) => valueOf(r[s.key])));
  const maxValue = Math.max(0, ...values), minValue = Math.min(0, ...values);
  // Làm tròn bước trục theo 1/2/5/10 để nhãn dễ đọc; dữ liệu đếm nguyên có bước tối thiểu là 1.
  const rough = (maxValue - minValue || 1) / 4, magnitude = 10 ** Math.floor(Math.log10(rough));
  const rawStep = [1, 2, 5, 10].find((v) => v * magnitude >= rough) * magnitude;
  const step = !currency && values.every(Number.isInteger) ? Math.max(1, rawStep) : rawStep;
  const min = Math.floor(minValue / step) * step, max = Math.max(step, Math.ceil(maxValue / step) * step);
  const y = (value) => bottom - (value - min) / (max - min) * plotHeight;
  const group = (right - left) / Math.max(rows.length, 1), x = (i) => left + group * (i + 0.5);
  // Đổi nhãn trục tiền sang nghìn/triệu đồng; giá trị thật trong tooltip vẫn dùng định dạng VND.
  const largest = Math.max(maxValue, Math.abs(minValue));
  const unit = currency && largest >= 1e6 ? 1e6 : currency && largest >= 1000 ? 1000 : 1;
  const unitName = currency ? unit === 1e6 ? 'triệu đồng' : unit === 1000 ? 'nghìn đồng' : 'đồng' : unitLabel;
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
  return <><div className="owner-chart-scroll" tabIndex={0} role="region" aria-label={`Cuộn ngang ${title}`}>
    <svg className="owner-series-svg" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${rows.map((r) => `${r.label}: ${series.map((s) => `${s.label} ${display(r[s.key], currency)}`).join(', ')}`).join('; ')}`}>
      <title>{title}</title><text className="owner-axis-title" x={left} y={18}>{unitName.charAt(0).toUpperCase() + unitName.slice(1)}</text><text className="owner-axis-title" x={(left + right) / 2} y={height - 8} textAnchor="middle">{categoryLabel}</text>{ticks.map((tick) => <g key={tick}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? '#707b75' : '#d8e0db'} /><text x={left - 10} y={y(tick) + 4} textAnchor="end">{quantity(tick / unit)}</text></g>)}
      {rows.map((r, i) => { const words = r.label.split(' '); const lines = []; let line = ''; const chars = Math.max(9, Math.floor(group / 8)); words.forEach((word) => { if ((line + ' ' + word).trim().length > chars && line) { lines.push(line); line = word; } else line = (line + ' ' + word).trim(); }); if (line) lines.push(line); return <text key={i} x={x(i)} y={bottom + 24} textAnchor="middle"><title>{r.label}</title>{lines.slice(0, 3).map((part, j) => <tspan key={j} x={x(i)} dy={j ? 15 : 0}>{short(part, chars + 6)}{j === 2 && lines.length > 3 ? '…' : ''}</tspan>)}</text>; })}
      {series.map((s, si) => kind === 'line' ? <g key={s.key}><polyline fill="none" stroke={colors[si]} strokeWidth="3" strokeDasharray={si ? '7 4' : undefined} points={rows.filter((r) => Number.isFinite(r[s.key])).map((r) => { const i = rows.indexOf(r); return `${x(i)},${y(r[s.key])}`; }).join(' ')} />{rows.map((r, i) => Number.isFinite(r[s.key]) && <circle key={i} cx={x(i)} cy={y(valueOf(r[s.key]))} r={4} fill={colors[si]}><title>{r.label} · {s.label}: {display(r[s.key], currency)}</title></circle>)}</g> : <g key={s.key}>{rows.map((r, i) => { const value = valueOf(r[s.key]); const bar = group * 0.72 / series.length; return <rect key={i} x={x(i) - group * 0.36 + si * bar} y={Math.min(y(value), y(0))} width={Math.max(2, bar - 3)} height={Math.max(value ? 1 : 0, Math.abs(y(value) - y(0)))} fill={colors[si]}><title>{r.label} · {s.label}: {display(value, currency)}</title></rect>; })}</g>)}
    </svg></div><div className="owner-chart-legend">{series.map((s, i) => <span key={s.key}><i style={{ background: colors[i] }} />{s.label}{kind === 'line' && i > 0 ? ' (nét đứt)' : ''}</span>)}</div></>;
}
/**
 * Thành phần chung cho biểu đồ cột, thanh ngang và tròn.
 * controls cho phép trang gọi truyền thêm bộ lọc vào cùng hàng với bộ chọn dạng biểu đồ.
 * Thành phần chỉ nhận số liệu đã tổng hợp; không tự truy vấn hoặc thay đổi dữ liệu MongoDB.
 */
export function Columns({ rows, title, currency = false, allowDonut = false, defaultKind = 'column', categoryLabel = 'Nhóm so sánh', unitLabel = 'số lượng', controls }) {
  const [kind, setKind] = useState(defaultKind);
  // Biểu đồ tỷ trọng chỉ hợp lệ nếu không có giá trị âm và tổng lớn hơn 0.
  const validDonut = allowDonut && rows.every((r) => r.value >= 0) && rows.some((r) => r.value > 0);
  // Khi đổi chỉ số làm tổng không còn hợp lệ cho hình tròn, chuyển về thanh ngang có nhãn tiếng Việt.
  const effectiveKind = kind === 'donut' && !validDonut ? 'horizontal' : kind;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  // Tổng dùng tính tỷ lệ các lát; offset ghi vị trí bắt đầu lát tiếp theo trên vòng tròn.
  const total = rows.reduce((s, r) => s + Math.max(0, valueOf(r.value)), 0);
  let offset = 0;
  return <section className="owner-content-panel owner-chart-panel"><div className="owner-chart-heading"><h2>{title}</h2><div className="owner-chart-controls">{controls}<WmsField>Dạng biểu đồ<WmsSelect aria-label={`Dạng biểu đồ: ${title}`} value={effectiveKind} onChange={(e) => setKind(e.target.value)}><option value="column">Biểu đồ cột</option><option value="horizontal">Biểu đồ thanh ngang</option>{validDonut && <option value="donut">Biểu đồ tròn</option>}</WmsSelect></WmsField></div></div>
    <div className="owner-chart-body">
    {!rows.length ? <p>Chưa có dữ liệu phù hợp.</p> : effectiveKind === 'column' ? <SeriesPlot rows={rows} series={[{ key: 'value', label: currency ? 'Giá trị (đồng)' : 'Số lượng' }]} currency={currency} title={title} categoryLabel={categoryLabel} unitLabel={unitLabel} />
      : effectiveKind === 'donut' && validDonut ? <div className="owner-donut-layout"><svg viewBox="0 0 240 240" role="img" aria-label={`${title}: ${rows.map((r) => `${r.label}: ${quantity(r.value / total * 100)}%`).join('; ')}`}><title>{title}</title>{rows.map((r, i) => { const size = r.value / total * 100; const start = offset; offset += size; return <circle key={i} cx="120" cy="120" r="85" fill="none" stroke={colors[i % colors.length]} strokeWidth="38" pathLength="100" strokeDasharray={`${size} ${100 - size}`} strokeDashoffset={-start} transform="rotate(-90 120 120)"><title>{r.label}: {display(r.value, currency)} ({quantity(size)}%)</title></circle>; })}<text x="120" y="116" textAnchor="middle">Tổng cộng</text><text x="120" y="140" textAnchor="middle">{display(total, currency)}</text></svg><ul className="owner-share-legend">{rows.map((r, i) => <li key={i}><i style={{ background: colors[i % colors.length] }} /><span>{r.label}: {display(r.value, currency)} · {quantity(r.value / total * 100)}%</span></li>)}</ul></div>
      : <div className="owner-horizontal-chart" role="img" aria-label={`${title}: ${rows.map((r) => `${r.label}: ${display(r.value, currency)}`).join('; ')}`}>{rows.map((r, i) => <div key={i}><span>{r.label}</span><div className="owner-horizontal-track"><div style={{ width: `${Math.abs(r.value) / max * 100}%`, background: r.value < 0 ? '#a22d34' : colors[0] }} /></div><strong>{display(r.value, currency)}</strong></div>)}</div>}
    </div>
  </section>;
}

/**
 * Lọc loại kho ngay trên dữ liệu tồn hiện tại đã nhận từ API.
 * Mỗi phần trên biểu đồ là số mã hàng thuộc một trạng thái; không cộng số lượng khác đơn vị.
 */
export function InventoryStatusChart({ inventory }) {
  const [warehouse, setWarehouse] = useState('');
  const rows = inventory.filter(row => !warehouse || row.type === warehouse);
  return <Columns title="Tình trạng tồn kho hiện tại" controls={<WmsField>Loại hàng trong kho<WmsSelect value={warehouse} onChange={e => setWarehouse(e.target.value)}><option value="">Tất cả mặt hàng</option><option value="RAW_MATERIAL">Nguyên liệu</option><option value="FINISHED_GOODS">Thành phẩm</option></WmsSelect></WmsField>} allowDonut defaultKind="donut" unitLabel="mã hàng" rows={['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'].map(status => ({ label: labels[status], value: rows.filter(row => row.status === status).length }))} />;
}
