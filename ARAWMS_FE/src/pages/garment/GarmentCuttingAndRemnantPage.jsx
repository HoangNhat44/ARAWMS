/*
 * File: GarmentCuttingAndRemnantPage.jsx
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Role: GARMENT_TECHNICIAN (Kỹ thuật viên may / KCS)
 * Description: Garment technicians directly perform fabric cutting, measure remnants, dynamically check threshold from DB, and request remnant return to Warehouse Manager.
 */
import React, { useState, useEffect } from 'react';
import {
  Scissors,
  Layers,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Trash2,
  HelpCircle,
  FileCheck,
  ChevronRight,
  Database,
  Printer,
  X,
} from 'lucide-react';
import { garmentTechnicalService } from '../../services/garmentTechnicalService';
import RemnantReturnEntry from '../../components/RemnantReturnEntry';
import { useAuth } from '../../hooks/useAuth';

export default function GarmentCuttingAndRemnantPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('CUTTING_QUEUE'); // 'CUTTING_QUEUE' or 'HISTORY'
  const [issuedRolls, setIssuedRolls] = useState([]);
  const [history, setHistory] = useState([]);
  const [threshold, setThreshold] = useState(2.0); // loaded dynamically from DB
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal cutting
  const [selectedRoll, setSelectedRoll] = useState(null);
  const [returnPrefill, setReturnPrefill] = useState(null);
  const [consumedCuttingLengthMeters, setConsumedCuttingLengthMeters] = useState('');
  const [measuredRemnantLengthMeters, setMeasuredRemnantLengthMeters] = useState('');
  const [measuredRemnantWeightKg, setMeasuredRemnantWeightKg] = useState('');

  // Result modal
  const [resultData, setResultData] = useState(null);

  // Load rolls, threshold from DB, and history
  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [thresholdRes, rollsRes, historyRes] = await Promise.all([
        garmentTechnicalService.remnant.getThreshold(),
        garmentTechnicalService.remnant.getIssuedRolls(),
        garmentTechnicalService.remnant.getHistory(),
      ]);

      const tVal = thresholdRes.data?.data?.thresholdMeters ?? thresholdRes.data?.thresholdMeters;
      if (tVal != null) {
        setThreshold(Number(tVal));
      }

      setIssuedRolls(rollsRes.data?.data || rollsRes.data || []);
      setHistory(historyRes.data?.data || historyRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể tải dữ liệu cuộn vải và ngưỡng hệ thống');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Open Cutting Modal for an issued roll
  const handleOpenCutModal = (roll) => {
    setReturnPrefill({ barcode: roll.rollBarcode, outboundTicketId: roll.outboundTicketId,
      nonce: crypto.randomUUID() });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Submit Cutting and Remnant measurement
  const handleSubmitCutting = async (e) => {
    e.preventDefault();
    if (!selectedRoll) return;

    const consumed = Number(consumedCuttingLengthMeters);
    const remnant = Number(measuredRemnantLengthMeters);

    if (Number.isNaN(consumed) || consumed < 0) {
      setError('Vui lòng nhập chiều dài vải đã cắt may (số không âm)');
      return;
    }

    if (Number.isNaN(remnant) || remnant < 0) {
      setError('Vui lòng nhập chiều dài vải thừa đo được (số không âm)');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const payload = {
        outboundTicketId: selectedRoll.outboundTicketId,
        rollId: selectedRoll.rollId,
        consumedCuttingLengthMeters: consumed,
        measuredRemnantLengthMeters: remnant,
        measuredRemnantWeightKg: measuredRemnantWeightKg ? Number(measuredRemnantWeightKg) : undefined,
      };

      const res = await garmentTechnicalService.remnant.recordCutting(payload);
      const data = res.data?.data || res.data;

      setSelectedRoll(null);
      setResultData(data);
      setNotice(data.message);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Lỗi khi ghi nhận cắt vải');
    } finally {
      setBusy(false);
    }
  };

  // Live threshold check evaluation
  const remnantValue = Number(measuredRemnantLengthMeters);
  const hasRemnantInput = measuredRemnantLengthMeters !== '' && !Number.isNaN(remnantValue);
  const isAboveThreshold = hasRemnantInput && remnantValue >= threshold;

  // Filtered rolls
  const filteredRolls = issuedRolls.filter((r) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      r.rollBarcode.toLowerCase().includes(s) ||
      r.outboundTicketCode.toLowerCase().includes(s) ||
      (r.materialName && r.materialName.toLowerCase().includes(s))
    );
  });

  return (
    <div className="ara-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Toast Messages */}
      {notice && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#006c4a',
          color: '#FFFFFF',
          padding: '12px 18px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 9999,
          fontSize: '0.9rem',
          fontWeight: 600,
        }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} style={{ background: 'none', border: 'none', color: '#FFF', fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {error && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#a31d1d',
          color: '#FFFFFF',
          padding: '12px 18px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 9999,
          fontSize: '0.9rem',
          fontWeight: 600,
        }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#FFF', fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ara-gold)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Scissors size={18} /> Phân hệ Kỹ thuật may · Cắt may & Thu hồi vải thừa
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ara-noir)', margin: '0.25rem 0' }}>
            Ghi nhận cắt may & Thu hồi vải thừa hoàn kho
          </h1>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Kỹ thuật viên trực tiếp thực hiện cắt vải, đo phần thừa còn lại và đối chiếu tự động với ngưỡng quy định từ hệ thống.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="btn-ara-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem' }}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* DYNAMIC THRESHOLD BANNER (Loaded from DB) */}
      <div style={{
        background: 'linear-gradient(135deg, #f8f6f0 0%, #f1ebdc 100%)',
        border: '1.5px solid var(--ara-gold)',
        borderRadius: 'var(--radius-md)',
        padding: '1.1rem 1.4rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: 'var(--ara-gold)',
            color: '#FFFFFF',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}>
            <Database size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ara-gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              CẤU HÌNH HỆ THỐNG TỪ CƠ SỞ DỮ LIỆU (DATABASE)
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
              Ngưỡng thu hồi vải thừa tối thiểu: <span style={{ color: '#006c4a', fontSize: '1.3rem' }}>{threshold} mét</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--ara-text-muted)', marginTop: '0.15rem' }}>
              • Phần vải thừa <strong>≥ {threshold}m</strong>: Gửi yêu cầu nhập lại; kho xác nhận rồi mới cộng tồn và cấp mã riêng cho khúc rời.
              <br />
              • Phần vải thừa <strong>&lt; {threshold}m</strong>: Ghi nhận là phế liệu/vụn vải cắt bỏ, không nhập kho.
            </div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--ara-border)',
          fontSize: '0.82rem',
          fontWeight: 600,
          color: 'var(--ara-noir)',
        }}>
          Nguồn dữ liệu: <code>SystemSetting.defaultFabricLeftoverThresholdMeters</code>
        </div>
      </div>

      <RemnantReturnEntry prefill={returnPrefill} onChanged={loadData}
        currentUserId={user?._id || user?.id || '507f1f77bcf86cd799439011'} />

      {/* Tabs Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.25rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('CUTTING_QUEUE')}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
              fontWeight: 700,
              border: '1px solid',
              borderColor: activeTab === 'CUTTING_QUEUE' ? 'var(--ara-gold)' : 'var(--ara-border)',
              background: activeTab === 'CUTTING_QUEUE' ? 'var(--ara-gold)' : '#FFFFFF',
              color: activeTab === 'CUTTING_QUEUE' ? '#FFFFFF' : 'var(--ara-text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <Scissors size={16} />
            <span>Cây vải đã xuất ({issuedRolls.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
              fontWeight: 700,
              border: '1px solid',
              borderColor: activeTab === 'HISTORY' ? 'var(--ara-gold)' : 'var(--ara-border)',
              background: activeTab === 'HISTORY' ? 'var(--ara-gold)' : '#FFFFFF',
              color: activeTab === 'HISTORY' ? '#FFFFFF' : 'var(--ara-text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <Layers size={16} />
            <span>Lịch sử cắt & Thu hồi vải thừa ({history.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#FFFFFF', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.8rem', minWidth: '280px' }}>
          <Search size={16} color="var(--ara-text-muted)" />
          <input
            type="text"
            placeholder="Tìm theo barcode cuộn vải, phiếu xuất..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.88rem' }}
          />
        </div>
      </div>

      {/* TAB 1: CUTTING QUEUE */}
      {activeTab === 'CUTTING_QUEUE' && (
        <div style={{ background: '#FFFFFF', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: 'var(--ara-shadow-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Mã Barcode cuộn</th>
                <th style={{ padding: '0.85rem 1rem' }}>Phiếu xuất gốc</th>
                <th style={{ padding: '0.85rem 1rem' }}>Loại vải & Màu sắc</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Chiều dài xuất kho</th>
                <th style={{ padding: '0.85rem 1rem' }}>Trạng thái cắt</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Thao tác Garment</th>
              </tr>
            </thead>
            <tbody>
              {filteredRolls.length > 0 ? (
                filteredRolls.map((roll, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--ara-border)' }}>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ara-noir)', fontSize: '0.95rem' }}>
                      {roll.rollBarcode}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <strong style={{ color: 'var(--ara-noir)' }}>{roll.outboundTicketCode}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', marginTop: '0.15rem' }}>
                        Mục đích: {roll.purpose || 'Cắt may sản xuất'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>{roll.materialName}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)' }}>
                        Mã: {roll.materialCode} · Màu: {roll.color || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 700, color: 'var(--ara-gold)', fontSize: '1rem' }}>
                      {roll.issuedLengthMeters} mét
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.65rem',
                        borderRadius: '999px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        background: roll.isRecovered ? '#e6f4ea' : '#fff0da',
                        color: roll.isRecovered ? '#137333' : '#b06000',
                      }}>
                        {roll.isRecovered ? 'Đã có ghi nhận vải thừa' : 'Chưa ghi nhận vải thừa'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {(
                        <button
                          type="button"
                          onClick={() => handleOpenCutModal(roll)}
                          className="btn-ara-primary"
                          style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <Scissors size={14} /> Tra nguồn / trả vải
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--ara-text-muted)' }}>
                    <Layers size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                    <div>Hiện không có cuộn vải nào trong hàng chờ cắt.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: HISTORY */}
      {activeTab === 'HISTORY' && (
        <div style={{ background: '#FFFFFF', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: 'var(--ara-shadow-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Mã biên bản thu hồi</th>
                <th style={{ padding: '0.85rem 1rem' }}>Cuộn vải & Phiếu xuất gốc</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Chiều dài xuất → Đã cắt</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Vải thừa đo được</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Ngưỡng áp dụng (từ DB)</th>
                <th style={{ padding: '0.85rem 1rem' }}>Kết quả & Phiếu gửi QL kho</th>
                <th style={{ padding: '0.85rem 1rem' }}>Người thực hiện</th>
              </tr>
            </thead>
            <tbody>
              {history.length > 0 ? (
                history.map((h) => {
                  const isRestocked = h.status !== 'SCRAPPED_BELOW_THRESHOLD';
                  return (
                    <tr key={h._id} style={{ borderBottom: '1px solid var(--ara-border)' }}>
                      <td style={{ padding: '1rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ara-noir)' }}>
                        {h.requestCode}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 600 }}>{h.originalRollId?.rollBarcode || '—'}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)' }}>
                          Phiếu xuất: {h.outboundTicketId?.ticketCode || '—'} · {h.rawMaterialId?.materialName || ''}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <strong>{h.issuedLengthMeters}m</strong> → Đã cắt: <strong>{h.consumedCuttingLengthMeters}m</strong>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 700, color: isRestocked ? '#006c4a' : '#5f6368', fontSize: '0.95rem' }}>
                        {h.measuredRemnantLengthMeters} mét
                        {h.measuredRemnantWeightKg ? ` (${h.measuredRemnantWeightKg}kg)` : ''}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, color: 'var(--ara-text-muted)' }}>
                        ≥ {h.appliedThresholdMeters} mét
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {isRestocked ? (
                          <div>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: '#e6f4ea',
                              color: '#137333',
                            }}>
                              ✓ ĐẠT NGƯỠNG → YÊU CẦU NHẬP LẠI KHO
                            </span>
                            <div style={{ fontSize: '0.8rem', color: 'var(--ara-noir)', marginTop: '0.2rem' }}>
                              Phiếu nhập: <strong>{h.generatedInboundTicketId?.ticketCode || 'PNTH-...'}</strong>
                              {h.generatedRemnantRollId?.rollBarcode && (
                                <span> · Cuộn thừa: <code>{h.generatedRemnantRollId.rollBarcode}</code></span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#b06000', fontStyle: 'italic' }}>
                              (Chờ Quản lý kho duyệt & cất kệ)
                            </div>
                          </div>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: '#f1f3f4',
                            color: '#5f6368',
                          }}>
                            DƯỚI NGƯỠNG → PHẾ LIỆU / VỤN CẮT BỎ
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{h.technicianId?.fullName || 'Kỹ thuật viên may'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                          {h.createdAt ? new Date(h.createdAt).toLocaleDateString('vi-VN') : '—'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--ara-text-muted)' }}>
                    Chưa có biên bản thu hồi vải thừa nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CUTTING MODAL */}
      {selectedRoll && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)',
          display: 'grid',
          placeItems: 'center',
          padding: '1rem',
          zIndex: 10000,
        }}>
          <form
            onSubmit={handleSubmitCutting}
            style={{
              background: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              width: '620px',
              maxWidth: '96vw',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--ara-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ara-gold)', textTransform: 'uppercase' }}>GARMENT TRỰC TIẾP CẮT MAY</span>
                <h3 style={{ margin: '0.15rem 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
                  Ghi nhận cắt vải & đo đạc phần thừa
                </h3>
              </div>
              <button type="button" onClick={() => setSelectedRoll(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--ara-text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Roll Overview */}
              <div style={{ background: 'var(--ara-bg-surface)', padding: '1rem', borderRadius: 'var(--radius-sm)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.88rem' }}>
                <div>Mã cuộn vải: <strong style={{ fontFamily: 'monospace' }}>{selectedRoll.rollBarcode}</strong></div>
                <div>Loại vải: <strong>{selectedRoll.materialName}</strong></div>
                <div>Phiếu xuất gốc: <strong>{selectedRoll.outboundTicketCode}</strong></div>
                <div>Tổng chiều dài đã xuất: <strong style={{ color: 'var(--ara-gold)' }}>{selectedRoll.issuedLengthMeters} mét</strong></div>
              </div>

              {/* Form Inputs */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  1. Chiều dài thực tế Garment đã cắt may (mét) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="VD: 42.5"
                  value={consumedCuttingLengthMeters}
                  onChange={(e) => setConsumedCuttingLengthMeters(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', fontSize: '1rem' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  2. Chiều dài phần vải thừa còn lại đo được (mét) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="VD: 7.5"
                  value={measuredRemnantLengthMeters}
                  onChange={(e) => setMeasuredRemnantLengthMeters(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', fontSize: '1rem' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  3. Khối lượng phần vải thừa (kg, tùy chọn)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="VD: 1.8"
                  value={measuredRemnantWeightKg}
                  onChange={(e) => setMeasuredRemnantWeightKg(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}
                />
              </div>

              {/* LIVE DYNAMIC THRESHOLD CHECK INDICATOR */}
              {hasRemnantInput && (
                <div style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-sm)',
                  border: `1.5px solid ${isAboveThreshold ? '#006c4a' : '#d97706'}`,
                  background: isAboveThreshold ? '#e6f4ea' : '#fffbeb',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem', color: isAboveThreshold ? '#006c4a' : '#b45309' }}>
                    {isAboveThreshold ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    <span>
                      {isAboveThreshold
                        ? `✓ ĐẠT NGƯỠNG QUY ĐỊNH (${remnantValue}m ≥ ${threshold}m)`
                        : `⚠ DƯỚI NGƯỠNG QUY ĐỊNH (${remnantValue}m < ${threshold}m)`}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: isAboveThreshold ? '#137333' : '#92400e', marginTop: '0.35rem' }}>
                    {isAboveThreshold
                      ? `Phần vải thừa đủ chuẩn tái sử dụng. Khi bấm xác nhận, hệ thống sẽ tự động tạo cuộn vải thừa mới và gửi phiếu yêu cầu nhập lại kho cho Quản lý kho phê duyệt.`
                      : `Phần vải thừa không đủ chuẩn tái sử dụng. Hệ thống sẽ ghi nhận vào báo cáo phế liệu/vụn cắt hao hụt (không tạo phiếu nhập kho).`}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--ara-border)', background: 'var(--ara-bg-surface)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setSelectedRoll(null)}
                className="btn-ara-secondary"
                style={{ padding: '0.55rem 1.1rem' }}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn-ara-primary"
                disabled={busy}
                style={{ padding: '0.55rem 1.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem', background: isAboveThreshold ? '#006c4a' : undefined, borderColor: isAboveThreshold ? '#006c4a' : undefined }}
              >
                <Scissors size={15} />
                <span>{busy ? 'Đang ghi nhận...' : isAboveThreshold ? 'Xác nhận & Gửi yêu cầu nhập kho' : 'Xác nhận ghi nhận cắt'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RESULT MODAL */}
      {resultData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)',
          display: 'grid',
          placeItems: 'center',
          padding: '1rem',
          zIndex: 10000,
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            width: '540px',
            maxWidth: '96vw',
            padding: '1.75rem',
            boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: resultData.isAboveThreshold ? '#e6f4ea' : '#fef7e0',
                color: resultData.isAboveThreshold ? '#137333' : '#b06000',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 0.75rem',
              }}>
                {resultData.isAboveThreshold ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, color: 'var(--ara-noir)' }}>
                {resultData.isAboveThreshold ? 'Đã gửi yêu cầu nhập lại vải thừa!' : 'Đã ghi nhận cắt & phế liệu'}
              </h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--ara-text-muted)', margin: '0.35rem 0 0' }}>
                {resultData.message}
              </p>
            </div>

            {resultData.isAboveThreshold && (
              <div style={{
                background: 'var(--ara-bg-surface)',
                borderRadius: 'var(--radius-sm)',
                padding: '1rem',
                marginBottom: '1.25rem',
                fontSize: '0.88rem',
                display: 'grid',
                gap: '0.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Mã cuộn vải thừa mới:</span>
                  <strong style={{ fontFamily: 'monospace' }}>{resultData.remnantRoll?.rollBarcode}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Phiếu yêu cầu nhập kho:</span>
                  <strong style={{ color: 'var(--ara-gold)' }}>{resultData.inboundTicket?.ticketCode}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Người phê duyệt:</span>
                  <strong>Quản lý kho</strong>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setResultData(null)}
                className="btn-ara-primary"
                style={{ width: '100%', padding: '0.65rem' }}
              >
                Đã hiểu & Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

