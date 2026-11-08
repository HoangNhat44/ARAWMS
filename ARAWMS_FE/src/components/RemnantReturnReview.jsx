import { useEffect, useState } from 'react';
import {
  RotateCcw, RefreshCw, Eye, CheckCircle2, AlertCircle,
  Clock, XCircle, Barcode, Printer, X, Box, Layers, User
} from 'lucide-react';
import { garmentTechnicalService } from '../services/garmentTechnicalService';
import { materialInboundService } from '../services/materialInboundService';
import '../styles/remnantReturnReview.css';

const amount = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const id = (value) => String(value?._id || value?.id || value || '');

const statusConfig = {
  WAITING_WAREHOUSE_CONFIRMATION: {
    label: 'Chờ kho xác nhận',
    color: '#9A5B06',
    bg: '#FEF0C7',
    border: '#F5B95F',
    icon: Clock,
  },
  WAITING_PUTAWAY_SCAN: {
    label: 'Chờ xếp kệ',
    color: '#0369A1',
    bg: '#E0F2FE',
    border: '#BAE6FD',
    icon: Box,
  },
  RESTOCKED: {
    label: 'Đã xếp kệ',
    color: '#1E6B47',
    bg: '#E3F5EC',
    border: '#86CFA8',
    icon: CheckCircle2,
  },
  DISCREPANCY_REPORTED: {
    label: 'Đã báo sai lệch',
    color: '#A62626',
    bg: '#FCE4E4',
    border: '#EDA1A1',
    icon: AlertCircle,
  },
  SCRAPPED_BELOW_THRESHOLD: {
    label: 'Phế liệu dưới ngưỡng',
    color: '#786E63',
    bg: '#F3EDE4',
    border: '#DDD2C4',
    icon: AlertCircle,
  },
  REJECTED: {
    label: 'Đã từ chối',
    color: '#A62626',
    bg: '#FCE4E4',
    border: '#EDA1A1',
    icon: XCircle,
  },
  CANCELLED: {
    label: 'Đã hủy',
    color: '#786E63',
    bg: '#F3EDE4',
    border: '#DDD2C4',
    icon: XCircle,
  },
  PENDING_RECEIPT_TICKET: {
    label: 'Phiếu cũ đang chờ xử lý',
    color: '#9A5B06',
    bg: '#FEF0C7',
    border: '#F5B95F',
    icon: Clock,
  },
};

function StatusBadge({ status }) {
  const config = statusConfig[status] || {
    label: status || '—',
    color: '#574F46',
    bg: '#FAF7F2',
    border: '#E3D9CD',
    icon: Clock,
  };
  const Icon = config.icon;
  return (
    <span
      className="remnant-status-badge"
      style={{
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
      }}
    >
      <Icon size={12} />
      <span>{config.label}</span>
    </span>
  );
}

/** Manager confirms the original issue and physical handover before stock is credited. */
export default function RemnantReturnReview({ locations = [] }) {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [barcode, setBarcode] = useState('');
  const [length, setLength] = useState('');
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await garmentTechnicalService.remnant.getReturnRequests();
      setRequests(response.data || []);
    } catch (failure) {
      setError(failure.response?.data?.message || failure.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = (request) => {
    setSelected(request);
    setBarcode('');
    setLength(String(request.measuredRemnantLengthMeters || ''));
    setLocationId('');
    setReason('');
    setError('');
    setNotice('');
  };

  const act = async (action) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (action === 'confirm') {
        const response = await garmentTechnicalService.remnant.confirmReturnRequest(id(selected), {
          barcode,
          lengthMeters: Number(length),
          locationId: locationId || undefined,
        });
        setNotice(`Đã xác nhận phiếu ${response.data?.receiptCode || ''}; hàng chờ quét kệ.`);
      } else if (action === 'discrepancy') {
        await garmentTechnicalService.remnant.reportReturnDiscrepancy(id(selected), reason);
        setNotice('Đã báo sai lệch cho kỹ thuật viên. Tồn kho chưa thay đổi.');
      } else {
        await garmentTechnicalService.remnant.closeReturnRequest(id(selected), 'REJECTED');
        setNotice('Đã từ chối yêu cầu; số mét chờ được giải phóng.');
      }
      await load();
      setSelected(null);
    } catch (failure) {
      setError(failure.response?.data?.message || failure.message);
    } finally {
      setBusy(false);
    }
  };

  const printLabels = async () => {
    const tab = window.open('', '_blank');
    try {
      const receiptId = id(selected.generatedInboundTicketId);
      const response = await materialInboundService.labels(receiptId);
      const { printMaterialLabels } = await import('../utils/materialLabelPrint');
      printMaterialLabels(response.data.labels || [], tab);
    } catch (failure) {
      tab?.close();
      setError(failure.response?.data?.message || failure.message);
    }
  };

  const rawLocations = (locations || []).filter(
    (item) => item.warehouseType === 'RAW_MATERIAL' && item.status === 'ACTIVE' && !item.isFrozenForStocktake
  );

  return (
    <section className="remnant-review-card" aria-label="Yêu cầu nhập lại vải thừa">
      {/* HEADER */}
      <div className="remnant-review-header">
        <div className="remnant-header-left">
          <div className="remnant-header-icon-box">
            <RotateCcw size={20} />
          </div>
          <div>
            <div className="remnant-card-title-row">
              <h2 className="remnant-card-title">Yêu cầu nhập lại vải thừa</h2>
              {requests.length > 0 && (
                <span className="remnant-counter-badge">{requests.length}</span>
              )}
            </div>
            <p className="remnant-card-subtitle">
              Đối chiếu cây gốc và số mét bàn giao trước khi xác nhận tồn.
            </p>
          </div>
        </div>
        <div className="remnant-header-actions">
          <button
            type="button"
            className="remnant-refresh-btn"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'remnant-spin' : ''} />
            <span>{loading ? 'Đang tải...' : 'Làm mới'}</span>
          </button>
        </div>
      </div>

      {/* ALERTS */}
      {notice && (
        <div className="remnant-alert-banner success" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
          <button type="button" className="remnant-alert-close" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="remnant-alert-banner error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" className="remnant-alert-close" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}

      {/* TABLE */}
      {requests.length > 0 ? (
        <div className="remnant-table-wrapper">
          <table className="remnant-table">
            <thead>
              <tr>
                <th>Yêu cầu</th>
                <th>Cây gốc</th>
                <th>Phiếu xuất</th>
                <th>Vải trả</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const rollCode = request.originalRollId?.rollBarcode || request.sourceBarcode || '—';
                const matName = request.rawMaterialId?.materialName || request.rawMaterialId?.materialCode;
                const ticketCode = request.outboundTicketId?.ticketCode || request.outboundTicketCodeSnapshot || id(request.outboundTicketId) || '—';
                const techName = request.technicianId?.fullName;

                return (
                  <tr key={id(request)}>
                    {/* Yêu cầu */}
                    <td>
                      <span className="remnant-code-badge">{request.requestCode}</span>
                    </td>

                    {/* Cây gốc */}
                    <td>
                      <div className="remnant-roll-cell">
                        <div className="remnant-barcode-line">
                          <Barcode size={13} style={{ color: '#8A6A46' }} />
                          <span>{rollCode}</span>
                        </div>
                        {matName && <span className="remnant-roll-sub">{matName}</span>}
                      </div>
                    </td>

                    {/* Phiếu xuất */}
                    <td>
                      <div className="remnant-ticket-cell">
                        <span className="remnant-ticket-code">{ticketCode}</span>
                        {techName && (
                          <span className="remnant-tech-sub">
                            <User size={11} /> {techName}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Vải trả */}
                    <td>
                      <div className="remnant-qty-cell">
                        <div>
                          <span className="remnant-qty-main">{amount(request.measuredRemnantLengthMeters)}</span>
                          <span className="remnant-qty-unit">m</span>
                        </div>
                        <span className={`remnant-kind-pill ${request.returnKind === 'SEPARATE_PIECES' ? 'pieces' : 'roll'}`}>
                          {request.returnKind === 'SEPARATE_PIECES'
                            ? `${request.pieces?.length || 0} khúc rời`
                            : 'Cây gốc'}
                        </span>
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td>
                      <StatusBadge status={request.status} />
                    </td>

                    {/* Thao tác */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="remnant-btn-view"
                        onClick={() => open(request)}
                      >
                        <Eye size={13} />
                        <span>Xem</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="remnant-empty-state">
          <div className="remnant-empty-icon-box">
            <RotateCcw size={24} />
          </div>
          <div className="remnant-empty-title">Chưa có yêu cầu nhập lại vải thừa</div>
          <div className="remnant-empty-desc">
            Khi bộ phận kỹ thuật may thực hiện trả vải dư từ các phiếu xuất cắt, thông tin đối chiếu sẽ hiển thị tại đây để kho kiểm tra và xác nhận nhập lại tồn.
          </div>
        </div>
      )}

      {/* DETAIL & ACTION MODAL */}
      {selected && (
        <div className="remnant-modal-overlay" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Yêu cầu trả vải ${selected.requestCode}`}
            className="remnant-modal-sheet"
          >
            {/* Modal Head */}
            <div className="remnant-modal-head">
              <div className="remnant-modal-title-wrap">
                <h3 className="remnant-modal-title">Chi tiết yêu cầu · {selected.requestCode}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <button
                type="button"
                className="remnant-modal-close-btn"
                onClick={() => setSelected(null)}
                aria-label="Đóng dialog"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="remnant-modal-body">
              {/* Info Grid */}
              <div className="remnant-info-grid">
                {/* Box 1: Cây gốc & NPL */}
                <div className="remnant-info-box">
                  <div className="remnant-info-box-title">Cây gốc & Nguyên phụ liệu</div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Mã cây vải:</span>
                    <span className="remnant-info-val" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                      {selected.originalRollId?.rollBarcode || selected.sourceBarcode || '—'}
                    </span>
                  </div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Nguyên phụ liệu:</span>
                    <span className="remnant-info-val">
                      {selected.rawMaterialId?.materialCode} · {selected.rawMaterialId?.materialName}
                      {selected.rawMaterialId?.color ? ` (${selected.rawMaterialId.color})` : ''}
                    </span>
                  </div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Nhà cung cấp:</span>
                    <span className="remnant-info-val">
                      {selected.originalRollId?.supplierId?.supplierName ||
                        selected.originalRollId?.supplierNameSnapshot ||
                        'Chưa lưu'}
                    </span>
                  </div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Lô nhập gốc:</span>
                    <span className="remnant-info-val">
                      {selected.originalRollId?.inboundTicketId?.ticketCode ||
                        selected.originalRollId?.supplierLotCode ||
                        'Chưa lưu'}
                    </span>
                  </div>
                </div>

                {/* Box 2: Phiếu xuất & Bàn giao */}
                <div className="remnant-info-box">
                  <div className="remnant-info-box-title">Phiếu xuất & Bàn giao</div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Phiếu xuất:</span>
                    <span className="remnant-info-val">
                      {selected.outboundTicketId?.ticketCode ||
                        selected.outboundTicketCodeSnapshot ||
                        id(selected.outboundTicketId)}
                    </span>
                  </div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Vị trí xuất:</span>
                    <span className="remnant-info-val">
                      Dòng {Number(selected.outboundLineIndex) + 1} · Cây {Number(selected.outboundSourceIndex) + 1}
                    </span>
                  </div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Đã xuất:</span>
                    <span className="remnant-info-val">
                      {amount(selected.issuedLengthMeters)} m
                    </span>
                  </div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Kỹ thuật viên:</span>
                    <span className="remnant-info-val">
                      {selected.technicianId?.fullName || '—'}
                    </span>
                  </div>
                </div>

                {/* Box 3: Số liệu đo đạc */}
                <div className="remnant-info-box">
                  <div className="remnant-info-box-title">Số liệu vải thừa trả</div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Đề nghị trả:</span>
                    <span className="remnant-info-val" style={{ color: 'var(--ara-gold, #8A6A46)', fontSize: 14 }}>
                      {amount(selected.measuredRemnantLengthMeters)} m
                    </span>
                  </div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Ngưỡng thu hồi:</span>
                    <span className="remnant-info-val">
                      {amount(selected.appliedThresholdMeters)} m
                    </span>
                  </div>
                  <div className="remnant-info-row">
                    <span className="remnant-info-label">Hình thức:</span>
                    <span className="remnant-info-val">
                      {selected.returnKind === 'SEPARATE_PIECES'
                        ? `Khúc rời (${(selected.pieces || []).length} khúc: ${(selected.pieces || []).map((p) => `${amount(p.lengthMeters)}m`).join(', ')})`
                        : 'Phần dư trên cây gốc (giữ barcode cũ)'}
                    </span>
                  </div>
                  {selected.conditionNote && (
                    <div className="remnant-info-row">
                      <span className="remnant-info-label">Tình trạng:</span>
                      <span className="remnant-info-val">{selected.conditionNote}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Discrepancy Note Callout */}
              {selected.discrepancyReason && (
                <div className="remnant-alert-banner error" style={{ margin: 0 }}>
                  <AlertCircle size={16} />
                  <span>
                    <strong>Sai lệch cần xử lý:</strong> {selected.discrepancyReason}
                  </span>
                </div>
              )}

              {/* Inbound Ticket & Label Print */}
              {selected.generatedInboundTicketId && (
                <div className="remnant-receipt-banner">
                  <p>
                    ✓ Đã tạo phiếu nhập kho: <strong>{selected.generatedInboundTicketId.ticketCode}</strong>
                  </p>
                  <button
                    type="button"
                    className="remnant-btn-view"
                    onClick={printLabels}
                  >
                    <Printer size={13} />
                    <span>In tem {selected.returnKind === 'SEPARATE_PIECES' ? 'khúc vải' : 'cây gốc'}</span>
                  </button>
                </div>
              )}

              {/* Physical Verification Form (Warehouse Confirmation) */}
              {selected.status === 'WAITING_WAREHOUSE_CONFIRMATION' && (
                <div className="remnant-form-section">
                  <h4 className="remnant-form-section-title">
                    <Box size={16} style={{ color: '#8A6A46' }} />
                    Đối chiếu vật lý & Xác nhận nhập lại
                  </h4>
                  <div className="remnant-form-grid">
                    <div className="remnant-form-field">
                      <label>Quét barcode cây gốc *</label>
                      <input
                        type="text"
                        className="remnant-form-input"
                        value={barcode}
                        onChange={(event) => setBarcode(event.target.value.toUpperCase())}
                        placeholder={selected.sourceBarcode || 'Quét hoặc nhập barcode'}
                      />
                    </div>

                    <div className="remnant-form-field">
                      <label>Số mét thực nhận *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        className="remnant-form-input"
                        value={length}
                        onChange={(event) => setLength(event.target.value)}
                        placeholder="Số mét thực tế"
                      />
                    </div>

                    <div className="remnant-form-field">
                      <label>Vị trí nhận (nếu cần)</label>
                      <select
                        className="remnant-form-select"
                        value={locationId}
                        onChange={(event) => setLocationId(event.target.value)}
                      >
                        <option value="">Vị trí hiện có / khu nhận mặc định</option>
                        {rawLocations.map((item) => (
                          <option key={id(item)} value={id(item)}>
                            {item.locationCode} · {item.rackName || item.rackCode || ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="remnant-form-field">
                      <label>Lý do sai lệch (nếu không khớp)</label>
                      <input
                        type="text"
                        className="remnant-form-input"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Barcode hoặc số mét không khớp"
                      />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="remnant-alert-banner error" style={{ margin: 0 }}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="remnant-modal-footer">
              <button
                type="button"
                className="remnant-btn-action close"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Đóng
              </button>

              {['WAITING_WAREHOUSE_CONFIRMATION', 'DISCREPANCY_REPORTED'].includes(selected.status) && (
                <button
                  type="button"
                  className="remnant-btn-action reject"
                  disabled={busy}
                  onClick={() => act('reject')}
                >
                  Từ chối
                </button>
              )}

              {selected.status === 'WAITING_WAREHOUSE_CONFIRMATION' && (
                <>
                  <button
                    type="button"
                    className="remnant-btn-action discrepancy"
                    disabled={busy || !reason.trim()}
                    onClick={() => act('discrepancy')}
                  >
                    Báo sai lệch
                  </button>
                  <button
                    type="button"
                    className="remnant-btn-action confirm"
                    disabled={busy || !barcode.trim()}
                    onClick={() => act('confirm')}
                  >
                    {busy ? 'Đang lưu...' : 'Xác nhận nhập lại'}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
