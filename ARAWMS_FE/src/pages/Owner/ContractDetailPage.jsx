import { useParams, useLocation } from 'react-router-dom';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import OwnerDetailHeading from './OwnerDetailHeading';
import { WmsLinkButton } from '../../components/ui/WmsControls';
import { ResourceState, Table, Metric, Status, labels, money, quantity, datetime } from './OwnerUI';
const fieldLabels = {
  companyName: 'Tên doanh nghiệp', taxCode: 'Mã số thuế', representativeName: 'Người đại diện', representativeRole: 'Chức vụ', receivingWarehouseAddress: 'Địa chỉ kho nhận hàng',
  currency: 'Loại tiền', subtotalAmount: 'Tiền hàng trước thuế', vatRatePct: 'Thuế VAT (%)', vatAmount: 'Tiền thuế VAT', depositPercent: 'Tỷ lệ đặt cọc (%)', depositAmount: 'Tiền đặt cọc', paymentInstallmentsCount: 'Số đợt thanh toán', paymentSchedule: 'Lịch thanh toán', paymentMethod: 'Phương thức thanh toán', paymentCreditDays: 'Thời hạn công nợ (ngày)', deliveryTerm: 'Điều kiện giao hàng', partialDeliveryAllowed: 'Cho phép giao từng phần',
  inspectionStandard: 'Tiêu chuẩn kiểm tra', maxDefectPointsPer100SqYards: 'Điểm lỗi tối đa / 100 yard vuông', maxRollJoints: 'Số mối nối tối đa mỗi cuộn', requirePreShipmentSample: 'Yêu cầu mẫu trước khi giao', returnExchangeWarrantyDays: 'Thời hạn đổi trả (ngày)',
  composition: 'Thành phần', colorSpec: 'Yêu cầu màu', widthCm: 'Khổ vải (cm)', gsm: 'Định lượng (g/m²)', shrinkageTolerancePct: 'Độ co cho phép (%)', colorFastnessGrade: 'Cấp bền màu', qtyTolerancePct: 'Dung sai số lượng (%)', moq: 'Lượng đặt tối thiểu', leadTimeDays: 'Thời gian giao (ngày)', packagingSpec: 'Quy cách đóng gói', technicalNote: 'Ghi chú kỹ thuật',
  installmentNumber: 'Đợt thanh toán', installmentNo: 'Đợt thanh toán', installmentLabel: 'Tên đợt', installment: 'Đợt', label: 'Tên đợt', description: 'Nội dung', paymentPercent: 'Tỷ lệ thanh toán (%)', paymentAmount: 'Số tiền thanh toán', percent: 'Tỷ lệ (%)', percentage: 'Tỷ lệ (%)', amount: 'Số tiền', dueDate: 'Hạn thanh toán', dueDays: 'Số ngày đến hạn', trigger: 'Điều kiện thanh toán', condition: 'Điều kiện', note: 'Ghi chú', status: 'Trạng thái', paidAmount: 'Đã thanh toán', paidAt: 'Ngày thanh toán',
};
const values = { CONFIRMED: 'Đã xác nhận, chưa thanh toán', SUPPLIER_PAYMENT: 'Thanh toán nhà cung cấp', BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt', COD_BALANCE_OFFSET: 'Bù trừ thu hộ', VND: 'VND', PAID: 'Đã thanh toán', UNPAID: 'Chưa thanh toán', PARTIAL: 'Thanh toán một phần' };
function FieldValue({ name, value }) {
  if (value === null || value === undefined || value === '') return 'Chưa ghi nhận';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.length ? <div className="owner-contract-terms">{value.map((v, i) => <div key={i}><strong>Đợt {i + 1}</strong><FieldValue value={v} /></div>)}</div> : 'Chưa ghi nhận';
  if (typeof value === 'object') return <DataFields data={value} />;
  if (/At$|Date$/.test(name || '')) return datetime(value);
  if (/amount|subtotal/i.test(name || '')) return money(value);
  return typeof value === 'number' ? quantity(value) : values[value] || labels[value] || String(value);
}
function DataFields({ data }) {
  const entries = Object.entries(data || {}).filter(([key, value]) => !['_id', 'id', 'materialId'].includes(key) && value !== undefined && value !== null && value !== '');
  return entries.length ? <dl className="owner-detail">{entries.map(([key, value]) => <div key={key} className="owner-contract-field"><dt>{fieldLabels[key] || 'Thông tin bổ sung'}</dt><dd><FieldValue name={key} value={value} /></dd></div>)}</dl> : <p>Chưa ghi nhận.</p>;
}
export default function ContractDetailPage() {
  const location = useLocation();
  const { id } = useParams(); const resource = useOwnerResource(`contracts/${id}`); const data = resource.data;
  return <><OwnerDetailHeading title="Chi tiết hợp đồng" backTo="/owner/purchases" /><ResourceState resource={resource}>{data && <>
    <section className="owner-content-panel"><div className="owner-page-heading"><div><h2>{data.code}</h2><p>{data.title}</p></div><Status value={data.status} /></div>
      <div className="owner-metrics"><Metric label="Tổng giá trị hợp đồng" value={money(data.total)} /><Metric label="Đã thanh toán" value={money(data.paid)} /><Metric label="Còn phải thanh toán" value={money(data.debt)} /></div>
      <dl className="owner-detail"><dt>Ngày ký</dt><dd>{datetime(data.signingDate)}</dd><dt>Hiệu lực</dt><dd>{datetime(data.effectiveFrom)} – {datetime(data.effectiveTo)}</dd><dt>Ngày lập</dt><dd>{datetime(data.createdAt)}</dd><dt>Người lập</dt><dd>{data.draftedBy || 'Chưa ghi nhận'}</dd><dt>Người phê duyệt</dt><dd>{data.finalizedBy || 'Chưa ghi nhận'} · {datetime(data.finalizedAt)}</dd><dt>Phiên bản</dt><dd>{data.versionNumber ?? 'Chưa ghi nhận'}</dd></dl>
      {data.amendmentReason && <p>Lý do sửa đổi: {data.amendmentReason}</p>}{data.terminationReason && <p>Lý do chấm dứt: {data.terminationReason} · {datetime(data.terminatedAt)}</p>}
    </section>
    <div className="owner-report-chart-grid"><section className="owner-content-panel"><h2>Nhà cung cấp</h2>{data.supplier ? <dl className="owner-detail"><dt>Mã / tên</dt><dd>{data.supplier.code} · {data.supplier.name}</dd><dt>Mã số thuế</dt><dd>{data.supplier.taxCode || '—'}</dd><dt>Người liên hệ</dt><dd>{data.supplier.contact || '—'}</dd><dt>Điện thoại</dt><dd>{data.supplier.phone || '—'}</dd><dt>Email</dt><dd>{data.supplier.email || '—'}</dd><dt>Địa chỉ</dt><dd>{data.supplier.address || '—'}</dd></dl> : <p>Không còn thông tin nhà cung cấp.</p>}</section><section className="owner-content-panel"><h2>Bên mua</h2><DataFields data={data.buyerInfo} /></section></div>
    <section className="owner-content-panel"><h2>Nguyên liệu trong hợp đồng</h2><Table headings={['Mã / tên nguyên liệu', 'Đơn vị', 'Số lượng', 'Đơn giá', 'Tiền hàng trước thuế', 'VAT (%)', 'Quy cách']} empty={!data.items.length}>{data.items.map((i, n) => { const { materialId, code, name, unit, quantity: qty, unitPrice, vatRatePct, ...spec } = i; return <tr key={`${materialId}-${n}`}><td>{code || 'Chưa có mã'}<small>{name}</small></td><td>{labels[unit] || unit || '—'}</td><td>{quantity(qty)}</td><td>{money(unitPrice)}</td><td>{money(Number.isFinite(qty) && Number.isFinite(unitPrice) ? qty * unitPrice : null)}</td><td>{quantity(vatRatePct)}</td><td><details><summary>Xem quy cách</summary><DataFields data={spec} /></details></td></tr>; })}</Table></section>
    <section className="owner-content-panel"><h2>Điều khoản thanh toán và giao hàng</h2><DataFields data={data.commercialTerms} /><h3>Tiêu chuẩn chất lượng</h3><DataFields data={data.qualityStandards} />{data.breachPenaltyClause && <p>Điều khoản phạt: {data.breachPenaltyClause}</p>}{data.disputeResolutionClause && <p>Giải quyết tranh chấp: {data.disputeResolutionClause}</p>}{data.notes && <p>Ghi chú: {data.notes}</p>}<div className="owner-actions">{data.signedContractDocumentUrl && <a href={data.signedContractDocumentUrl} target="_blank" rel="noopener noreferrer">Bản hợp đồng đã ký</a>}</div></section>
    {/* Mỗi kế hoạch mở bằng URL riêng; giữ trạng thái quay lại để không mất bộ lọc danh sách hợp đồng. */}
    <section className="owner-content-panel"><h2>Kế hoạch nhập liên quan ({data.plans.length})</h2><Table headings={['Kế hoạch', 'Dự kiến giao', 'Trạng thái', 'Chi tiết kế hoạch']} empty={!data.plans.length}>{data.plans.map(p => <tr key={p.id}><td>{p.code}<small>{p.notes}</small></td><td>{datetime(p.scheduledDeliveryDate)}</td><td><Status value={p.status} /></td><td><WmsLinkButton to={`/owner/contracts/${data.id}/plans/${p.id}`} state={{ from: location.pathname + location.search, returnState: location.state }}>Xem kế hoạch nhập</WmsLinkButton></td></tr>)}</Table></section>
    <section className="owner-content-panel"><h2>Lịch sử phiếu chi hợp đồng</h2><p className="owner-method">{data.basis}</p><Table headings={['Phiếu chi', 'Ngày lập', 'Nội dung', 'Số tiền', 'Hình thức', 'Trạng thái', 'Ngày trả']} empty={!data.payments.length}>{data.payments.map(v => <tr key={v.id}><td>{v.code}</td><td>{datetime(v.date)}</td><td>{values[v.category] || labels[v.category] || v.category}<small>{v.note}</small></td><td>{money(v.amount)}</td><td>{values[v.method] || 'Chưa ghi nhận'}</td><td>{v.status ? <FieldValue value={v.status} /> : 'Chưa ghi nhận'}</td><td>{datetime(v.paidAt)}</td></tr>)}</Table></section>
  </>}</ResourceState></>;
}
