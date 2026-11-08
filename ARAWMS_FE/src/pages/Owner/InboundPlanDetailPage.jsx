import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Result } from 'antd';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import OwnerDetailHeading from './OwnerDetailHeading';
import { WmsLinkButton } from '../../components/ui/WmsControls';
import { ResourceState, Table, Status, labels, quantity, datetime } from './OwnerUI';

// Dùng cùng dữ liệu kế hoạch đã được API hợp đồng ghép từ material_inbound_plans và raw_materials.
// Không cộng số lượng các đơn vị khác nhau; mỗi nguyên liệu được thể hiện trên một dòng riêng.
function PlanItems({ items }) {
  return <Table headings={['Mã / tên nguyên liệu', 'Đơn vị', 'Số lượng dự kiến', 'Kiểm đạt', 'Lỗi / thiếu']} empty={!items.length}>
    {items.map((item, index) => <tr key={`${item.materialId}-${index}`}><td><strong>{item.code || 'Chưa có mã'}</strong><small>{item.name}</small></td><td>{labels[item.unit] || item.unit || '—'}</td><td>{quantity(item.plannedQty)}</td><td>{quantity(item.verifiedQty)}</td><td>{quantity(item.defectiveOrShortQty)}</td></tr>)}
  </Table>;
}

export default function InboundPlanDetailPage() {
  const { id, planId } = useParams(); const location = useLocation();
  // Tải mới khi mở trực tiếp URL; chỉ chấp nhận kế hoạch nằm trong hợp đồng đang xem.
  // ResourceState xử lý riêng lỗi mạng/404 hợp đồng; kế hoạch không thuộc hợp đồng báo không tìm thấy.
  const resource = useOwnerResource(`contracts/${id}`);
  const contract = resource.data; const plan = contract?.plans.find(item => item.id === planId);
  // Mở kế hoạch từ bảng ở cuối hợp đồng luôn bắt đầu tại đầu trang chi tiết mới.
  useEffect(() => { window.scrollTo(0, 0); }, [id, planId]);
  const backTo = `/owner/contracts/${id}`;
  return <><OwnerDetailHeading title="Chi tiết kế hoạch nhập" backTo={backTo} backState={location.state?.returnState} />
    <ResourceState resource={resource}>{contract && (plan ? <>
      <section className="owner-content-panel">
        <div className="owner-page-heading"><div><h2>{plan.code}</h2><p>Hợp đồng: {contract.code}</p></div><Status value={plan.status} /></div>
        <dl className="owner-detail"><dt>Nhà cung cấp</dt><dd>{contract.supplier?.name || 'Chưa ghi nhận'}</dd><dt>Dự kiến giao hàng</dt><dd>{datetime(plan.scheduledDeliveryDate)}</dd><dt>Số đợt giao</dt><dd>{plan.batches.length ? quantity(plan.batches.length) : 'Chưa chia đợt'}</dd><dt>Ghi chú</dt><dd>{plan.notes || 'Chưa ghi nhận'}</dd></dl>
      </section>
      <section className="owner-content-panel"><h2>Nguyên liệu dự kiến nhập</h2><PlanItems items={plan.items} /></section>
      {/* Các đợt giao hiển thị thành từng khối trên trang chi tiết, không mở chen vào bảng hợp đồng. */}
      {plan.batches.length > 0 && <section className="owner-content-panel owner-inbound-batches"><h2>Lịch giao từng đợt</h2>{plan.batches.map((batch, index) => <section className="owner-content-panel" key={`${batch.number}-${index}`}>
        <div className="owner-page-heading"><h3>{batch.title || `Đợt ${batch.number || index + 1}`}</h3><Status value={batch.status} /></div>
        <dl className="owner-detail"><dt>Dự kiến giao</dt><dd>{datetime(batch.scheduledDeliveryDate)}</dd><dt>Tỷ lệ kế hoạch</dt><dd>{Number.isFinite(batch.percentage) ? `${quantity(batch.percentage)}%` : 'Chưa ghi nhận'}</dd><dt>Ghi chú</dt><dd>{batch.notes || 'Chưa ghi nhận'}</dd></dl>
        <PlanItems items={batch.items} />
      </section>)}</section>}
    </> : <Result status="404" title="Không tìm thấy kế hoạch nhập" subTitle="Kế hoạch không tồn tại hoặc không thuộc hợp đồng này." extra={<WmsLinkButton to={backTo} state={location.state?.returnState}>Quay lại hợp đồng</WmsLinkButton>} />)}</ResourceState>
  </>;
}
