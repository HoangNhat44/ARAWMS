import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  AlertTriangle,
  FileSignature,
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  FileText,
  ShieldAlert,
  Layers,
  DollarSign,
  AlertOctagon,
  ExternalLink,
  GitBranch,
  Ban,
  User,
  Info,
} from 'lucide-react';
import { Skeleton, Result, Button, Tag } from 'antd';
import accountantProcurementApi from '../../services/accountantProcurementApi';
import OwnerDetailHeading from './OwnerDetailHeading';
import { Status, labels, money, quantity, datetime } from './OwnerUI';
import ContractLegalDocumentModal from '../../components/common/ContractLegalDocumentModal';

export default function OwnerDeviationDetailPage() {
  const { planId: paramPlanId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const planId = paramPlanId || searchParams.get('planId') || searchParams.get('id');

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State xem Văn bản Hợp đồng Kinh tế (Toàn văn 12 điều khoản)
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [fullContractDetail, setFullContractDetail] = useState(null);
  const [loadingContractDetail, setLoadingContractDetail] = useState(false);

  const handleOpenContractModal = async () => {
    const cId = plan?.contractId?._id || plan?.contractId?.id || plan?.contractId;
    if (!cId) return;
    try {
      setLoadingContractDetail(true);
      const detail = await accountantProcurementApi.getContractDetail(cId);
      setFullContractDetail(detail || plan.contractId);
      setIsContractModalOpen(true);
    } catch (err) {
      console.warn('Không thể tải chi tiết hợp đồng, dùng dữ liệu có sẵn:', err);
      setFullContractDetail(plan.contractId);
      setIsContractModalOpen(true);
    } finally {
      setLoadingContractDetail(false);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchPlanDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await accountantProcurementApi.getInboundPlanDetail(planId);
        setPlan(data);
      } catch (err) {
        console.error('Lỗi khi tải chi tiết sai lệch:', err);
        setError(err.response?.data?.message || 'Không thể tải chi tiết kế hoạch và sai lệch KCS.');
      } finally {
        setLoading(false);
      }
    };

    if (planId) {
      fetchPlanDetail();
    } else {
      setLoading(false);
      setError('Không tìm thấy mã kế hoạch tiếp nhận (planId) để hiển thị chi tiết.');
    }
  }, [planId]);

  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div style={{ padding: '40px 24px', maxWidth: '800px', margin: '0 auto' }}>
        <Result
          status="404"
          title="Không tìm thấy thông tin sai lệch"
          subTitle={error || 'Kế hoạch không tồn tại hoặc đã bị xóa.'}
          extra={
            <Button type="primary" onClick={() => navigate('/owner/dashboard')}>
              Quay lại Bảng điều khiển
            </Button>
          }
        />
      </div>
    );
  }

  const contract = plan.contractId || {};
  const supplier = plan.supplierId || {};
  const verification = plan.technicianVerification || {};
  const report = plan.reportedToOwner || {};
  const expectedItems = plan.expectedItems || [];
  const batches = plan.batches || [];
  const resolution = plan.deviationResolution || {};

  const contractId = contract._id || contract.id;

  return (
    <div style={{ padding: '16px 24px 48px', maxWidth: '1240px', margin: '0 auto' }}>
      {/* Heading Bar */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: 'none',
              color: '#0284c7',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              padding: 0,
              marginBottom: '6px',
            }}
          >
            <ArrowLeft size={16} /> Quay lại trang trước
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: 'normal' }}>
            Chi tiết Sai lệch KCS & Hợp đồng Mua sắm
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '13.5px' }}>
            Kế hoạch: <strong style={{ color: '#0F172A' }}>{plan.planCode}</strong> (v{plan.versionNumber || 1}) • Hợp đồng: <strong style={{ color: '#0F172A' }}>{contract.contractCode || '—'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Tag color="red" style={{ fontSize: '12.5px', padding: '4px 10px', fontWeight: 700 }}>
            <AlertTriangle size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            {plan.status === 'DEVIATION_REPORTED' ? 'Sai lệch KCS (DEVIATION_REPORTED)' : plan.status}
          </Tag>
          <Tag color="orange" style={{ fontSize: '12.5px', padding: '4px 10px', fontWeight: 700 }}>
            {contract.status === 'DEVIATION_FLAGGED' ? 'HĐ Cảnh báo sai lệch (DEVIATION_FLAGGED)' : `HĐ: ${contract.status || '—'}`}
          </Tag>
        </div>
      </div>

      {/* KHỐI 1: BIÊN BẢN SAI LỆCH KIỂM ĐỊNH KCS & TRÌNH BÁO KẾ TOÁN */}
      <section
        style={{
          border: '2px solid #FECDD3',
          backgroundColor: '#FFF1F2',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '28px',
          boxShadow: '0 4px 6px -1px rgba(225, 29, 72, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#DC2626',
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#9F1239' }}>
              1. Báo cáo Sai lệch Kiểm định Chất lượng (KCS) & Trình báo Ban Giám đốc
            </h2>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#BE123C' }}>
              Tiếp nhận phản ánh từ Kỹ thuật may KCS và đề xuất xử lý của Kế toán mua sắm
            </p>
          </div>
        </div>

        {/* Nội dung kết luận sai lệch KCS */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #FDA4AF',
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#9F1239', textTransform: 'uppercase', marginBottom: '4px' }}>
            Nội dung Sai lệch KCS ghi nhận:
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#881337', lineHeight: 1.5 }}>
            "{verification.deviationSummary || (batches.find((b) => b.technicianVerification?.deviationSummary)?.technicianVerification?.deviationSummary) || 'Giao nhận sai lệch số lượng hoặc tiêu chuẩn kỹ thuật cam kết theo kế hoạch.'}"
          </div>
        </div>

        {/* Thông tin 2 cột: Kỹ thuật may KCS & Kế toán trình báo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
          <div style={{ backgroundColor: '#FFE4E6', padding: '14px 16px', borderRadius: '8px', border: '1px solid #FECDD3' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#9F1239', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} /> Kỹ thuật viên May kiểm định KCS
            </div>
            <div style={{ fontSize: '13px', color: '#881337', lineHeight: 1.6 }}>
              <div>• Kỹ thuật viên: <strong>{verification.verifiedByTechId?.fullName || 'KTV Garment Technician'}</strong></div>
              <div>• Mã nhân viên: {verification.verifiedByTechId?.employeeCode || '—'}</div>
              <div>• Thời gian kiểm tra: <strong>{datetime(verification.verifiedAt) || 'Chưa ghi nhận'}</strong></div>
              <div>• Kết luận tuân thủ: <strong style={{ color: '#DC2626' }}>{plan.deliveryComplianceStatus || 'MISMATCHED'}</strong> (Không đúng cam kết)</div>
            </div>
          </div>

          <div style={{ backgroundColor: '#FFE4E6', padding: '14px 16px', borderRadius: '8px', border: '1px solid #FECDD3' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#9F1239', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={14} /> Ý kiến & Ghi chú Trình báo của Kế toán
            </div>
            <div style={{ fontSize: '13px', color: '#881337', lineHeight: 1.6 }}>
              <div>• Trạng thái trình báo: <strong>{report.isReported ? 'Đã gửi trình Owner' : 'Chưa gửi trình'}</strong></div>
              <div>• Thời gian trình báo: <strong>{datetime(report.reportedAt) || 'Vừa xong'}</strong></div>
              <div>• Người gửi trình: <strong>{report.reportedByUserId?.fullName || 'Kế toán Kho & Mua sắm'}</strong></div>
              <div style={{ marginTop: '4px', fontStyle: 'italic', color: '#9F1239' }}>
                • Ghi chú: "{report.reportNotes || 'Kế toán trình báo sai lệch giao nhận KCS, kính đề nghị Ban Quản trị phê duyệt phương án giải quyết.'}"
              </div>
            </div>
          </div>
        </div>

        {/* Bảng chi tiết nghiệm thu KCS từng mặt hàng trong đợt giao này */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#9F1239', marginBottom: '8px' }}>
            Chi tiết Nghiệm thu KCS từng mặt hàng trong Kế hoạch:
          </div>

          <div style={{ overflowX: 'auto', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #FECDD3' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#FFF1F2', borderBottom: '1px solid #FECDD3', color: '#9F1239' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Mã & Tên nguyên phụ liệu</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, width: '10%' }}>ĐVT</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, width: '14%' }}>SL Kế hoạch</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, width: '14%', color: '#16A34A' }}>SL Đạt KCS</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, width: '14%', color: '#DC2626' }}>SL Lỗi / Thiếu</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, width: '16%' }}>Chi tiết cuộn kiểm tra</th>
                </tr>
              </thead>
              <tbody>
                {expectedItems.map((item, idx) => {
                  const rawMat = item.rawMaterialId || {};
                  const rolls = item.rollDetails || item.selectedRolls || [];
                  const isShort = Number(item.actualDefectiveOrShortQty) > 0;

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: isShort ? '#FFF5F5' : '#FFFFFF' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          {rawMat.materialCode || item.materialCodeSnapshot || 'NVL'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>
                          {rawMat.materialName || item.materialNameSnapshot || 'Nguyên phụ liệu'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <Tag>{labels[item.unitSnapshot || item.unit] || item.unitSnapshot || item.unit || 'Mét'}</Tag>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>
                        {quantity(item.plannedQty)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>
                        {quantity(item.actualVerifiedPassedQty ?? item.plannedQty)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>
                        {quantity(item.actualDefectiveOrShortQty ?? 0)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {rolls.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
                            {rolls.map((r, rIdx) => (
                              <span
                                key={rIdx}
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: '#E0F2FE',
                                  color: '#0369A1',
                                  fontWeight: 600,
                                }}
                              >
                                {r.rollCode || `C-${rIdx + 1}`}: {r.lengthMeters}m
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ảnh bằng chứng sai lệch nếu có */}
        {verification.evidenceImages && verification.evidenceImages.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#9F1239', marginBottom: '8px' }}>
              Hình ảnh & Chứng từ Sai lệch đính kèm:
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {verification.evidenceImages.map((imgUrl, i) => (
                <a key={i} href={imgUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={imgUrl}
                    alt={`Bằng chứng sai lệch ${i + 1}`}
                    style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #FECDD3' }}
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* KHỐI 2: CHI TIẾT BẢN HỢP ĐỒNG CUNG ỨNG BAN ĐẦU CỦA KẾ HOẠCH NÀY */}
      <section
        style={{
          border: '1px solid #CBD5E1',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '28px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
              }}
            >
              <FileSignature size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                2. Thông tin Bản Hợp đồng Cung ứng Ban đầu
              </h2>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B' }}>
                Căn cứ pháp lý và các cam kết số lượng, đơn giá, lịch giao hàng ban đầu giữa AraStore và Nhà cung ứng
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleOpenContractModal}
              disabled={loadingContractDetail}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#0284c7',
                padding: '7px 14px',
                borderRadius: '6px',
                border: '1px solid #BAE6FD',
                backgroundColor: '#F0F9FF',
                cursor: 'pointer',
              }}
              title="Mở toàn văn bản Hợp đồng kinh tế chuẩn 12 điều khoản pháp lý"
            >
              <FileText size={15} />
              {loadingContractDetail ? 'Đang mở văn bản...' : 'Xem Văn bản Hợp đồng Kinh tế'}
            </button>
            <Link
              to={`/owner/contracts/${contractId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#475569',
                textDecoration: 'none',
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
              }}
              title="Xem trang quản lý hợp đồng"
            >
              <ExternalLink size={14} /> Trang HĐ
            </Link>
          </div>
        </div>

        {/* Grid thông tin chung Hợp đồng & Nhà cung ứng */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <div style={{ padding: '14px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>Số hợp đồng kinh tế</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>{contract.contractCode || '—'}</div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>{contract.contractTitle || 'Hợp đồng mua bán nguyên phụ liệu'}</div>
          </div>

          <div style={{ padding: '14px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>Nhà cung ứng đối tác</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{supplier.supplierName || '—'}</div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
              Mã: <strong>{supplier.supplierCode || '—'}</strong> • MST: {supplier.taxCode || '—'}
            </div>
          </div>

          <div style={{ padding: '14px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>Tổng giá trị Hợp đồng</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#16A34A' }}>
              {money(contract.totalContractAmount)}
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
              Đã cọc {contract.commercialTerms?.depositPercent ?? 30}% ({money(contract.commercialTerms?.depositAmount)})
            </div>
          </div>

          <div style={{ padding: '14px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>Thời hạn Hợp đồng</div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
              {datetime(contract.effectiveFrom)} → {datetime(contract.effectiveTo)}
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
              Ngày ký: {datetime(contract.signingDate || contract.createdAt)}
            </div>
          </div>
        </div>

        {/* Bảng danh mục nguyên phụ liệu cam kết ban đầu trên hợp đồng */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
            Danh mục Nguyên phụ liệu Cam kết trên Hợp đồng:
          </div>

          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Tên / Mã nguyên liệu</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, width: '10%' }}>ĐVT</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, width: '14%' }}>SL Cam kết</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, width: '14%' }}>Đơn giá</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, width: '14%' }}>VAT (%)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, width: '16%' }}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {(contract.contractedMaterials || []).map((mat, mIdx) => {
                  const qty = Number(mat.contractedQty) || 0;
                  const price = Number(mat.unitPrice) || 0;
                  const subtotal = qty * price;

                  return (
                    <tr key={mIdx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          {mat.materialNameSnapshot || 'Nguyên phụ liệu'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>
                          {mat.materialCodeSnapshot || 'NVL'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <Tag>{labels[mat.unitSnapshot] || mat.unitSnapshot || 'Mét'}</Tag>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                        {quantity(qty)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                        {money(price)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B' }}>
                        {mat.vatRatePct ? `${mat.vatRatePct}%` : '0%'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                        {money(subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lịch trình các đợt giao hàng ban đầu đã thỏa thuận */}
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
            Lịch trình các Đợt Giao hàng Cam kết ban đầu ({batches.length || 1} đợt):
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {batches.map((batch, bIdx) => (
              <div
                key={bIdx}
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FAFAFA',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#0F172A' }}>
                    Đợt {batch.batchNumber || bIdx + 1}: {batch.batchTitle || 'Tiếp nhận nguyên liệu'}
                  </span>
                  <Tag color={batch.status === 'DEVIATION_REPORTED' ? 'red' : 'blue'}>
                    {batch.status || 'SCHEDULED'}
                  </Tag>
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Ngày giao dự kiến: <strong>{datetime(batch.scheduledDeliveryDate)}</strong> • Tỷ lệ: <strong>{batch.batchPercentage || 50}%</strong>
                </div>
                {batch.notes && (
                  <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '4px' }}>
                    Ghi chú: {batch.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KHỐI 3: ĐỊNH HƯỚNG VÀ CÁC PHƯƠNG ÁN XỬ LÝ DOANH NGHIỆP */}
      <section
        style={{
          border: '1px solid #CBD5E1',
          backgroundColor: '#F8FAFC',
          borderRadius: '12px',
          padding: '20px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#0F172A' }}>
          <ShieldAlert size={18} color="#0284c7" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
            3. Hướng Xử lý Nghiệp vụ dành cho Kế toán & Ban Quản trị
          </h3>
        </div>

        <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: '0 0 16px' }}>
          Hợp đồng này hiện đã được hệ thống phân loại <strong>Cảnh báo Sai lệch (DEVIATION_FLAGGED)</strong>. Kế toán chịu trách nhiệm phối hợp với Nhà cung ứng và thực hiện 1 trong 2 giải pháp:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
          <div style={{ padding: '14px', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #BAE6FD' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0369A1', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitBranch size={16} /> Phương án A: Lập Phụ lục & Tạo HĐ Phiên bản mới (v2)
            </div>
            <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
              Nếu Nhà cung ứng cam kết khắc phục hoặc hai bên thống nhất dời ngày giao / bù số lượng: Kế toán sẽ lập Phiên bản mới (v2) cho hợp đồng. Kế hoạch tiếp nhận v2 sẽ tự động sinh ra tương ứng; phiên bản hiện tại chuyển sang Đã thay thế (SUPERSEDED).
            </p>
          </div>

          <div style={{ padding: '14px', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #FECDD3' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#DC2626', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Ban size={16} /> Phương án B: Chấm dứt Hợp đồng (TERMINATED)
            </div>
            <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
              Nếu Nhà cung ứng vi phạm nghiêm trọng và không thể bàn giao đúng hẹn: Kế toán sẽ xác nhận Chấm dứt Hợp đồng. Hợp đồng chuyển sang ĐÃ CHẤM DỨT, kế hoạch chuyển sang ĐÃ HỦY LỊCH và tự động tất toán lại công nợ.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button onClick={() => navigate('/owner/plan-deviations')}>
            Danh sách sai lệch kế hoạch
          </Button>
          <Button
            type="primary"
            onClick={handleOpenContractModal}
            loading={loadingContractDetail}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={14} />
            Xem Văn bản Hợp đồng Kinh tế (Toàn văn)
          </Button>
        </div>
      </section>

      {/* MODAL TOÀN VĂN VĂN BẢN HỢP ĐỒNG KINH TẾ (CHUẨN 12 ĐIỀU KHOẢN PHÁP LÝ THƯƠNG MẠI DỆT MAY) */}
      <ContractLegalDocumentModal
        contract={fullContractDetail || contract}
        isOpen={isContractModalOpen}
        onClose={() => setIsContractModalOpen(false)}
      />
    </div>
  );
}

