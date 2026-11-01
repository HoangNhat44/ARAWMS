/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-12/13/14/17; GBR-17 - Dashboard, BI, lợi nhuận và dòng tiền Owner.
 */
import { WmsButton } from '../../components/ui/WmsControls';
import { Link } from 'react-router-dom';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { defaultOwnerDates } from '../../utils/ownerValidation';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { ResourceState, DateFilter, Metric, Table, Pagination, Status, money, quantity, datetime, labels } from './OwnerUI';
const titles = { dashboard: 'Tổng quan điều hành', bi: 'BI Dashboard', profit: 'Báo cáo lợi nhuận', cash: 'Dòng tiền vận hành' };
export default function FinancialPage({ mode = 'dashboard' }) {
  // UC-12/13/14/17: Mặc định kỳ hiện tại; đổi kỳ thì đưa bảng chứng từ về trang đầu.
  const [query, setQuery] = useOwnerQuery({ ...defaultOwnerDates(), page: 1 }); const { page, ...dates } = query;
  const setPage = (next) => setQuery({ ...query, page: next });
  // Dashboard cần thêm số vận hành; BI/lợi nhuận/dòng tiền dùng chung dữ liệu tài chính để tránh lệch số.
  const resource = useOwnerResource(mode === 'dashboard' ? 'dashboard' : 'financial-reports', dates);
  return <><header className="owner-page-heading"><div><p className="owner-eyebrow">Tài chính điều hành</p><h1>{titles[mode]}</h1><p>Đối chiếu chỉ số theo kỳ báo cáo và dữ liệu đã ghi nhận.</p></div><WmsButton onClick={resource.reload}>Tải lại</WmsButton></header>
    <DateFilter key={`${dates.from}-${dates.to}`} value={dates} onChange={(value) => setQuery({ ...value, page: 1 })} />
    <ResourceState resource={resource}>{resource.data && <FinancialContent mode={mode} data={resource.data} dates={dates} page={page} setPage={setPage} />}</ResourceState></>;
}
function FinancialContent({ mode, data, dates, page, setPage }) {
  // Không chia cho 0 khi chưa có doanh thu; trường hợp này chưa có biên lợi nhuận để hiển thị.
  const t = data.totals; const margin = t.netRevenue ? t.grossProfit / t.netRevenue * 100 : null;
  return <>
    <div className="owner-metrics">{mode === 'cash' ? <><Metric label="Tổng thu" value={money(t.cashIn)} /><Metric label="Tổng chi" value={money(t.cashOut)} /><Metric label="Dòng tiền thuần" value={money(t.netCashFlow)} /><Metric label="Giá vốn thực tế đã chốt" value={money(t.netCogs)} /></>
      : <><Metric label="Doanh thu thuần hàng hóa" value={money(t.netRevenue)} /><Metric label="Giá vốn sau hoàn hàng" value={money(t.netCogs)} /><Metric label="Lợi nhuận gộp" value={money(t.grossProfit)} /><Metric label="Lợi nhuận vận hành" value={money(t.netProfit)} note="Theo các khoản đã ghi nhận" /></>}</div>
    <p className="owner-method">{data.basis}</p>
    {data.dataQuality.ordersMissingCogsSnapshot > 0 && <div className="owner-notice owner-error" role="alert">Có {data.dataQuality.ordersMissingCogsSnapshot} đơn thiếu snapshot giá vốn; số lợi nhuận chưa đầy đủ. Cần đối soát trước khi sử dụng.</div>}
    {/* UC-12: Số vận hành và tồn kho là số hiện tại, không phải ảnh chụp tại cuối kỳ đã chọn. */}
    {mode === 'dashboard' && <>
      <h2>Tình hình vận hành hiện tại</h2><div className="owner-metrics"><Metric label="Nhân viên hoạt động" value={quantity(data.operations.activeEmployees)} />
        <Metric label="Báo cáo Manager chưa xem" value={quantity(data.operations.unreadManagerReports)} /><Metric label="Lệnh sản xuất đang chạy" value={quantity(data.operations.activeProductionOrders)} /><Metric label="Đơn cảnh báo COD" value={quantity(data.operations.codRedFlags)} /></div>
      <div className="owner-metrics"><Metric label="Tồn nguyên liệu" value={money(data.inventory.materialValue)} /><Metric label="Tồn thành phẩm" value={money(data.inventory.finishedGoodsValue)} /><Metric label="Hàng cách ly" value={money(data.inventory.quarantineValue)} />
        <Metric label="Mã dưới tồn an toàn" value={quantity(data.inventory.lowStockMaterials + data.inventory.lowStockSkus)} /></div>
      <div className="owner-actions"><Link to="/owner/manager-reports">Xem báo cáo Manager</Link><Link to="/owner/production">Xem tiến độ sản xuất</Link><Link to="/owner/asset-valuation">Xem tài sản kho</Link></div>
    </>}
    {/* UC-13: Xem xu hướng doanh thu và biên lợi nhuận; chưa có doanh thu thì không tính tỷ lệ. */}
    {mode === 'bi' && <><div className="owner-metrics"><Metric label="Đơn đã ghi nhận trong kỳ" value={quantity(data.orders)} /><Metric label="Đơn trả đã duyệt trong kỳ" value={quantity(data.approvedReturns)} />
      <Metric label="Biên lợi nhuận gộp" value={margin === null ? 'Chưa có doanh thu' : `${quantity(margin)}%`} /><Metric label="Giá trị hàng trả" value={money(t.returnedRevenue)} /></div>
      <h2>Doanh thu hàng hóa theo ngày đóng gói</h2><SalesBars rows={data.daily} /></>}
    {/* UC-14: Tách doanh thu, hàng trả, giá vốn và chi phí để kiểm tra nguồn của số lợi nhuận. */}
    {mode === 'profit' && <><h2>Đối chiếu kết quả kinh doanh</h2><Table headings={['Khoản mục', 'Giá trị']}>
      {[["Doanh thu hàng hóa sau chiết khấu", t.revenue], ['Giảm trừ hàng trả đã duyệt', -t.returnedRevenue], ['Doanh thu thuần', t.netRevenue], ['Giá vốn xuất kho', t.cogs], ['Giá vốn hàng nhập lại bán được', -t.returnedCogs], ['Giá vốn thuần', t.netCogs], ['Lợi nhuận gộp', t.grossProfit], ['Chi phí vận hành đã ghi nhận', -t.operatingExpenses], ['Thu nhập khác đã ghi nhận', t.otherIncome], ['Lợi nhuận vận hành', t.netProfit]].map(([label, amount]) => <tr key={label}><td>{label}</td><td className="owner-numeric">{money(amount)}</td></tr>)}
    </Table></>}
    {/* Bảng ngày chỉ có dữ liệu bán; giảm trừ và chi phí của kỳ được giữ ở bảng tổng hợp. */}
    {mode !== 'cash' && <><h2>Chi tiết bán hàng theo ngày</h2><Table headings={['Ngày', 'Số đơn', 'Doanh thu', 'Giá vốn', 'Lợi nhuận gộp trước hoàn hàng']} empty={!data.daily.length}>
      {data.daily.map((row) => <tr key={row.date}><td>{row.date}</td><td>{quantity(row.orders)}</td><td>{money(row.revenue)}</td><td>{money(row.cogs)}</td><td>{money(row.grossProfit)}</td></tr>)}
    </Table><p className="owner-method">Chi tiết ngày là dữ liệu bán; giảm trừ hoàn hàng và chi phí được thể hiện ở bảng tổng hợp của kỳ.</p></>}
    {/* UC-17: Dòng tiền có bảng hạng mục và từng phiếu nguồn, không được gọi tổng thu/chi là lợi nhuận. */}
    {mode === 'cash' && <><h2>Thu chi theo hạng mục</h2><Table headings={['Loại', 'Hạng mục', 'Số chứng từ', 'Số tiền']} empty={!data.cashCategories.length}>
      {data.cashCategories.map((row) => <tr key={`${labels[row.category] || row.category}-${row.flowType}`}><td><Status value={row.flowType} /></td><td>{labels[row.category] || row.category}</td><td>{quantity(row.count)}</td><td>{money(row.amount)}</td></tr>)}
    </Table><h2>Chứng từ dòng tiền</h2><CashVouchers dates={dates} page={page} setPage={setPage} /></>}
    <p className="owner-method">Cập nhật {datetime(data.generatedAt)} · Giờ Việt Nam (UTC+7). Chỉ số vận hành/tồn kho phản ánh thời điểm hiện tại.</p>
  </>;
}
// UC-17, GBR-14: Xem từng phiếu và chứng từ nguồn thay vì chỉ thấy số thu/chi tổng.
function CashVouchers({ dates, page, setPage }) {
  const resource = useOwnerResource('financial-reports/cash-vouchers', { ...dates, page });
  return <ResourceState resource={resource}>{resource.data && <><Table headings={['Mã phiếu', 'Ngày', 'Loại', 'Hạng mục', 'Số tiền', 'Chứng từ tham chiếu']} empty={!resource.data.items.length}>
    {resource.data.items.map((row) => <tr key={row.id}><td>{row.voucherCode}</td><td>{datetime(row.voucherDate)}</td><td><Status value={row.flowType} /></td><td>{labels[row.category] || row.category}</td><td>{money(row.amount)}</td>
      <td className="owner-id">{row.contractId || row.salesOrderId || row.returnRequestId || row.reconciliationBatchId || <span className="owner-warning">Chưa có tham chiếu chứng từ</span>}</td></tr>)}
  </Table><Pagination data={resource.data} onPage={setPage} /></>}</ResourceState>;
}
// UC-13: Cột được chia tỷ lệ theo ngày có doanh thu lớn nhất; bảng bên dưới giữ số liệu đầy đủ.
function SalesBars({ rows }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.revenue)));
  return rows.length ? <div className="owner-chart" role="img" aria-label="Biểu đồ doanh thu theo ngày; số liệu đầy đủ trong bảng chi tiết">{rows.map((row) => <div key={row.date} className="owner-bar-row"><span>{row.date}</span><div className="owner-bar-track"><div style={{ width: `${Math.abs(row.revenue) / max * 100}%` }} /></div><strong>{money(row.revenue)}</strong></div>)}</div> : <p className="owner-empty">Chưa có doanh thu trong kỳ.</p>;
}
