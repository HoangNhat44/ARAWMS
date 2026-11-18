import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AlertTriangle,
  FileSignature,
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Eye,
  ShieldAlert,
  ArrowRight,
  GitBranch,
  Ban,
  Package,
  Layers,
  AlertOctagon,
} from 'lucide-react';
import { Skeleton, Tag, Empty, Button } from 'antd';
import accountantProcurementApi from '../../services/accountantProcurementApi';
import { Status, labels, money, quantity, datetime } from './OwnerUI';

export default function OwnerPlanDeviationsPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | UNRESOLVED | RESOLVED_SUPERSEDED | TERMINATED

  const fetchDeviations = async () => {
    try {
      setLoading(true);
      setError(null);
      const allPlans = await accountantProcurementApi.getInboundPlans();

      // Lọc các kế hoạch có phát sinh sai lệch KCS hoặc được trình báo lên Owner
      const deviationPlans = (allPlans || []).filter((p) => {
        return (
          p.status === 'DEVIATION_REPORTED' ||
          p.deliveryComplianceStatus === 'MISMATCHED' ||
          p.technicianVerification?.isMatchedWithPlan === false ||
          p.reportedToOwner?.isReported === true ||
          (p.contractId?.status === 'DEVIATION_FLAGGED') ||
          p.status === 'RESOLVED_SUPERSEDED' ||
          p.status === 'CANCELLED'
        );
      });

      // Sắp xếp theo ngày phát hiện / tạo mới nhất lên đầu
      deviationPlans.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      setPlans(deviationPlans);
    } catch (err) {
      console.error('Lỗi khi tải danh sách sai lệch kế hoạch:', err);
      setError(err.response?.data?.message || 'Không thể tải danh sách kế hoạch sai lệch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeviations();
  }, []);

  // Filtered plans
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      const matchSearch =
        !searchTerm.trim() ||
        (p.planCode && p.planCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.contractId?.contractCode && p.contractId.contractCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.supplierId?.supplierName && p.supplierId.supplierName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.technicianVerification?.deviationSummary && p.technicianVerification.deviationSummary.toLowerCase().includes(searchTerm.toLowerCase()));

      let matchStatus = true;
      if (statusFilter === 'UNRESOLVED') {
        matchStatus = p.status === 'DEVIATION_REPORTED' || p.contractId?.status === 'DEVIATION_FLAGGED';
      } else if (statusFilter === 'RESOLVED_SUPERSEDED') {
        matchStatus = p.status === 'RESOLVED_SUPERSEDED' || p.contractId?.status === 'SUPERSEDED' || p.contractId?.status === 'ACTIVE';
      } else if (statusFilter === 'TERMINATED') {
        matchStatus = p.status === 'CANCELLED' || p.contractId?.status === 'TERMINATED';
      }

      return matchSearch && matchStatus;
    });
  }, [plans, searchTerm, statusFilter]);

  // KPIs
  const totalDeviations = plans.length;
  const pendingCount = plans.filter((p) => p.status === 'DEVIATION_REPORTED' || p.contractId?.status === 'DEVIATION_FLAGGED').length;
  const amendedCount = plans.filter((p) => p.status === 'RESOLVED_SUPERSEDED' || p.contractId?.status === 'SUPERSEDED').length;
  const terminatedCount = plans.filter((p) => p.status === 'CANCELLED' || p.contractId?.status === 'TERMINATED').length;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ backgroundColor: '#FEE2E2', color: '#DC2626', padding: '6px 10px', borderRadius: '8px', display: 'inline-flex' }}>
              <AlertTriangle size={20} />
            </span>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#0F172A' }}>
              Quản lý Sai lệch Kế hoạch Tiếp nhận (Plan Deviations)
            </h1>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748B' }}>
            Theo dõi, giám sát toàn bộ các biên bản kiểm định KCS phát hiện thiếu hụt, lỗi vải hoặc sai quy cách giao nhận so với Hợp đồng kinh tế.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchDeviations}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            backgroundColor: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            color: '#334155',
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Làm mới dữ liệu
        </button>
      </div>

      {/* KPI Cards Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Tổng vụ việc sai lệch</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>{totalDeviations}</div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>Tất cả các đợt tiếp nhận có sai số</div>
        </div>

        <div style={{ backgroundColor: '#FFF1F2', padding: '16px', borderRadius: '8px', border: '1px solid #FECDD3', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#BE123C', fontWeight: 600, textTransform: 'uppercase' }}>Chờ giải quyết / Cảnh báo</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#E11D48', marginTop: '6px' }}>{pendingCount}</div>
          <div style={{ fontSize: '12px', color: '#BE123C', marginTop: '4px' }}>Cần theo dõi xử lý hoặc lập phụ lục v2</div>
        </div>

        <div style={{ backgroundColor: '#F0F9FF', padding: '16px', borderRadius: '8px', border: '1px solid #BAE6FD', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#0369A1', fontWeight: 600, textTransform: 'uppercase' }}>Đã tạo Version mới (v2, v3)</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0284c7', marginTop: '6px' }}>{amendedCount}</div>
          <div style={{ fontSize: '12px', color: '#0369A1', marginTop: '4px' }}>Đã nâng cấp phụ lục & bảo lưu lịch sử</div>
        </div>

        <div style={{ backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '12px', color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>Đã chấm dứt HĐ</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#64748B', marginTop: '6px' }}>{terminatedCount}</div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>Chấm dứt do vi phạm nghiêm trọng</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '20px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            placeholder="Tìm theo mã kế hoạch, mã hợp đồng, tên nhà cung ứng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '13.5px',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={15} color="#64748B" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <option value="ALL">Tất cả trạng thái ({plans.length})</option>
            <option value="UNRESOLVED">Chờ xử lý / Đang cảnh báo ({pendingCount})</option>
            <option value="RESOLVED_SUPERSEDED">Đã tạo Version mới ({amendedCount})</option>
            <option value="TERMINATED">Đã chấm dứt hợp đồng ({terminatedCount})</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {loading ? (
          <div style={{ padding: '30px' }}>
            <Skeleton active paragraph={{ rows: 8 }} />
          </div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#DC2626' }}>
            <AlertTriangle size={36} style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 700, fontSize: '15px' }}>{error}</div>
            <Button onClick={fetchDeviations} style={{ marginTop: '12px' }}>Thử lại</Button>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Empty
              description={
                <span style={{ color: '#64748B', fontSize: '14px' }}>
                  Không tìm thấy kế hoạch tiếp nhận nào có sai lệch KCS phù hợp với tiêu chí lọc.
                </span>
              }
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                  <th style={{ padding: '12px 16px' }}>Mã Kế hoạch & Đợt</th>
                  <th style={{ padding: '12px 16px' }}>Hợp đồng Kinh tế</th>
                  <th style={{ padding: '12px 16px' }}>Nhà cung ứng</th>
                  <th style={{ padding: '12px 16px' }}>Ngày giao / Kiểm định</th>
                  <th style={{ padding: '12px 16px' }}>Tóm tắt Sai lệch KCS</th>
                  <th style={{ padding: '12px 16px' }}>Trạng thái</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((p) => {
                  const contract = p.contractId || {};
                  const supplier = p.supplierId || contract.supplierId || {};
                  const isUnresolved = p.status === 'DEVIATION_REPORTED' || contract.status === 'DEVIATION_FLAGGED';
                  const isSuperseded = p.status === 'RESOLVED_SUPERSEDED' || contract.status === 'SUPERSEDED';
                  const isTerminated = p.status === 'CANCELLED' || contract.status === 'TERMINATED';

                  return (
                    <tr
                      key={p._id || p.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: isUnresolved ? '#FFFDFD' : '#FFFFFF',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isUnresolved ? '#FFFDFD' : '#FFFFFF')}
                    >
                      {/* Mã Kế hoạch & Phiên bản */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>{p.planCode}</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 6px', borderRadius: '4px' }}>
                            v{p.versionNumber || 1}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                          Đợt {p.batchNumber || 1}/{p.totalBatches || 1}
                        </div>
                      </td>

                      {/* Hợp đồng Kinh tế */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#0284c7' }}>
                          {contract.contractCode || '—'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {contract.contractTitle || 'Hợp đồng mua bán NVL'}
                        </div>
                      </td>

                      {/* Nhà cung ứng */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{supplier.supplierName || '—'}</div>
                        <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                          Mã: {supplier.supplierCode || '—'}
                        </div>
                      </td>

                      {/* Ngày giao */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <div style={{ color: '#0F172A', fontWeight: 600 }}>{datetime(p.scheduledDeliveryDate)}</div>
                        {p.technicianVerification?.inspectionDate && (
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                            KCS: {datetime(p.technicianVerification.inspectionDate)}
                          </div>
                        )}
                      </td>

                      {/* Tóm tắt Sai lệch KCS */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top', maxWidth: '320px' }}>
                        <div
                          style={{
                            fontSize: '12.5px',
                            color: isUnresolved ? '#BE123C' : '#334155',
                            fontWeight: isUnresolved ? 600 : 400,
                            lineHeight: '1.5',
                            backgroundColor: isUnresolved ? '#FFF1F2' : '#F8FAFC',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: `1px solid ${isUnresolved ? '#FECDD3' : '#E2E8F0'}`,
                          }}
                        >
                          {p.technicianVerification?.deviationSummary ||
                            p.deviationSummary ||
                            (p.deliveryComplianceStatus === 'MISMATCHED' ? 'Sai lệch số lượng hoặc chất lượng so với cam kết' : 'Ghi nhận sai lệch KCS')}
                        </div>
                        {p.reportedToOwner?.isReported && (
                          <div style={{ fontSize: '11px', color: '#E11D48', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <ShieldAlert size={12} /> Đã trình báo lên Owner
                          </div>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        {isUnresolved ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#FFE4E6', color: '#BE123C' }}>
                            <AlertTriangle size={12} /> Chờ giải quyết
                          </span>
                        ) : isSuperseded ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#F0F9FF', color: '#0284c7' }}>
                            <GitBranch size={12} /> Đã tạo Version mới
                          </span>
                        ) : isTerminated ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                            <Ban size={12} /> Đã chấm dứt
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#F1F5F9', color: '#475569' }}>
                            {labels[p.status] || p.status}
                          </span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => navigate(`/owner/deviations?planId=${p._id || p.id}`)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #BAE6FD',
                            backgroundColor: '#F0F9FF',
                            color: '#0284c7',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Eye size={13} />
                          Chi tiết sai lệch
                          <ArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

