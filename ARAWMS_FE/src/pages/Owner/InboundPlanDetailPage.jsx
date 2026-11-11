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
    {items.map((item, index) => {
      const rolls = item.rollDetails || item.selectedRolls || [];
      return (
        <tr key={`${item.materialId}-${index}`}>
          <td>
            <strong>{item.code || 'Chưa có mã'}</strong>
            <small>{item.name}</small>
            {rolls.length > 0 && (
              <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: 600 }}>{rolls.length} cuộn:</span>
                {rolls.map((r, rIdx) => (
                  <span key={rIdx} style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '3px' }}>
                    {r.rollCode || `C-${rIdx + 1}`}: {r.lengthMeters}m {r.note ? `(${r.note})` : ''}
                  </span>
                ))}
              </div>
            )}
          </td>
          <td>{labels[item.unit] || item.unit || '—'}</td>
          <td>
            {quantity(item.plannedQty)}
            {rolls.length > 0 && <small style={{ display: 'block', color: '#0369a1' }}>({rolls.length} cuộn)</small>}
          </td>
          <td>{quantity(item.verifiedQty)}</td>
          <td>{quantity(item.defectiveOrShortQty)}</td>
        </tr>
      );
    })}
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

      {/* Banner Cảnh báo Sai lệch KCS & Trình báo lên Ban Quản trị */}
      {(plan.status === 'DEVIATION_REPORTED' || plan.reportedToOwner?.isReported || plan.technicianVerification) && (
        <section
          className="owner-content-panel"
          style={{
            border: '2px solid #FECDD3',
            backgroundColor: '#FFF1F2',
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#9F1239' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#9F1239' }}>
              Cảnh báo Sai lệch Kiểm định KCS & Trình báo Kế toán
            </h3>
          </div>
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#881337', lineHeight: 1.5 }}>
            <strong>Nội dung sai lệch KCS ghi nhận:</strong>{' '}
            {plan.technicianVerification?.deviationSummary || 'Giao nhận sai lệch số lượng hoặc tiêu chuẩn kỹ thuật cam kết theo kế hoạch.'}
          </p>
          <dl className="owner-detail" style={{ background: '#FFE4E6', padding: '10px 14px', borderRadius: '6px' }}>
            <dt>Thời gian kiểm KCS</dt>
            <dd>{datetime(plan.technicianVerification?.verifiedAt) || 'Chưa ghi nhận'}</dd>
            <dt>Kỹ thuật viên may</dt>
            <dd>{plan.technicianVerification?.verifiedByTechId?.fullName || 'KTV Kiểm định KCS'}</dd>
            {plan.reportedToOwner?.isReported && (
              <>
                <dt>Kế toán trình báo</dt>
                <dd>Đã gửi trình Ban Quản trị lúc {datetime(plan.reportedToOwner.reportedAt)}</dd>
                <dt>Ghi chú của Kế toán</dt>
                <dd>{plan.reportedToOwner.reportNotes || 'Đề nghị xem xét điều chỉnh phiên bản hoặc chấm dứt hợp đồng'}</dd>
              </>
            )}
          </dl>
          <div style={{ marginTop: '12px', fontSize: '12.5px', color: '#9F1239' }}>
            💡 Hợp đồng liên quan: <strong>{contract.code}</strong> ({contract.supplier?.name || 'NCC'}) hiện đang được phân loại <strong>{contract.status === 'DEVIATION_FLAGGED' ? 'Cảnh báo sai lệch (DEVIATION_FLAGGED)' : contract.status}</strong> để Kế toán và Ban Quản lý xử lý theo 2 phương án: <strong>Chấm dứt Hợp đồng</strong> hoặc <strong>Tạo Phiên bản mới (v2)</strong>.
          </div>
        </section>
      )}
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
