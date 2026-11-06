import { useState } from 'react';
import { Select } from 'antd';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { WmsField, WmsSelect } from '../../components/ui/WmsControls';
import { ResourceState, Table, money, quantity } from './OwnerUI';
import { Columns } from './OwnerCharts';
const metricLabels = { quantity: 'Số lượng bán (cái)', grossAmount: 'Tiền hàng trước giảm giá / hoàn', orders: 'Số đơn có mặt hàng' };
export default function BestSellers({ from, to, salesChannel, paymentStatus }) {
  const resource = useOwnerResource('operations-report/best-sellers', { from, to, salesChannel, paymentStatus });
  const [group, setGroup] = useState('products'); const [metric, setMetric] = useState('quantity'); const [show, setShow] = useState('sold');
  const [selection, setSelection] = useState({ products: [], skus: [] });
  const all = resource.data?.[group] || [];
  const sorted = [...all].sort((a,b) => (b[metric] ?? -Infinity) - (a[metric] ?? -Infinity) || a.code.localeCompare(b.code, 'vi'));
  const selected = selection[group].filter(id => all.some(r => r.id === id));
  const chartRows = selected.length ? sorted.filter(r => selected.includes(r.id)) : sorted.filter(r => r.quantity > 0).slice(0,10);
  const tableRows = sorted.filter(r => selected.length ? selected.includes(r.id) : show === 'all' || r.quantity > 0);
  return <section className="owner-content-panel owner-best-sellers"><h2>Sản phẩm nào bán chạy hơn?</h2>
    <div className="owner-filters"><WmsField>Xem theo<WmsSelect value={group} onChange={e => setGroup(e.target.value)}><option value="products">Sản phẩm (gộp màu và kích cỡ)</option><option value="skus">Từng mã hàng (SKU)</option></WmsSelect></WmsField>
    <WmsField>Xếp hạng theo<WmsSelect value={metric} onChange={e => setMetric(e.target.value)}>{Object.entries(metricLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</WmsSelect></WmsField>
    <WmsField>Danh sách<WmsSelect value={show} onChange={e => setShow(e.target.value)}><option value="sold">Có phát sinh bán</option><option value="all">Tất cả, gồm chưa bán</option></WmsSelect></WmsField>
    <div className="owner-compare-product-select"><label id="best-seller-selection-label">Chọn tối đa 5 mặt hàng để so sánh</label><Select mode="multiple" allowClear showSearch optionFilterProp="label" aria-labelledby="best-seller-selection-label" maxCount={5} maxTagCount="responsive" placeholder="Để trống để xem Top 10 bán chạy" value={selected} onChange={ids => setSelection({ ...selection, [group]: ids.slice(0,5) })} options={all.map(r => ({ value:r.id, label:`${r.code} · ${r.name}` }))} /></div></div>
    <ResourceState resource={resource}>{resource.data && <><p className="owner-method">{resource.data.basis}</p>{resource.data.missingProductLinks > 0 && <p className="owner-notice">Có dòng bán chưa liên kết được với danh mục sản phẩm; hệ thống giữ mã hàng gốc để không bỏ sót số lượng.</p>}
      {metric === 'grossAmount' && chartRows.some(r => r.grossAmount === null) && <p className="owner-notice">Có mặt hàng thiếu giá bán lịch sử; biểu đồ tiền hàng chỉ hiển thị các mặt hàng đủ dữ liệu giá.</p>}
      <Columns key={`${group}-${metric}`} title={selected.length ? `So sánh ${selected.length} mặt hàng · ${metricLabels[metric]}` : `Top 10 bán chạy · ${metricLabels[metric]}`} rows={chartRows.filter(r => Number.isFinite(r[metric])).map(r => ({ label:`${r.code} · ${r.name}`, value:r[metric] }))} defaultKind="horizontal" currency={metric === 'grossAmount'} categoryLabel="Mặt hàng" unitLabel={metric === 'quantity' ? 'cái' : 'đơn hàng'} />
      <Table key={`${group}-${metric}-${show}-${selected.join(',')}-${from}-${to}`} headings={['Thứ hạng', 'Mã / tên hàng', 'Số lượng bán (cái)', 'Số đơn có mặt hàng', 'Tiền hàng trước giảm giá / hoàn']} empty={!tableRows.length}>{tableRows.map((r,i) => <tr key={r.id}><td>{i+1}</td><td><strong>{r.code}</strong><small>{r.name}{group === 'skus' ? ` · ${r.color || '—'} · ${r.size || '—'}` : ''}</small></td><td>{quantity(r.quantity)}</td><td>{quantity(r.orders)}</td><td>{money(r.grossAmount)}</td></tr>)}</Table>
      <p className="owner-method">{selected.length ? `${selected.length} mặt hàng được chọn` : 'Biểu đồ hiển thị tối đa 10 mặt hàng; bảng liệt kê đầy đủ kết quả và phân trang 15 dòng.'} · {quantity(resource.data.packedOrders)} đơn đã đóng gói trong kỳ.</p>
    </>}</ResourceState>
  </section>;
}
