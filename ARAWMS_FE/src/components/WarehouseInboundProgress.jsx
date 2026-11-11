import React, { useMemo, useState } from 'react';
import { RefreshCw, Shirt, Package, Layers, CheckCircle2, Clock, Eye } from 'lucide-react';

const amount = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

/**
 * Hiển thị tiến độ nhập kho và xếp kệ liền mạch chuẩn WMS Enterprise.
 * Kế thừa phong cách trực quan từ TechnicalInboundPage:
 * - Khối Card Container nguyên vẹn với viền và bo góc đồng bộ
 * - Thanh công cụ lọc gọn gàng ở dải tiêu đề
 * - Danh sách nguyên phụ liệu / thành phẩm xếp liền nhau, không khoảng trắng đứt đoạn
 */
export default function WarehouseInboundProgress({
  finishedRequests = [],
  materialRequests = [],
  receipts = [],
  loading = false,
  error = '',
  onRefresh,
  onOpenRequest,
}) {
  const [warehouse, setWarehouse] = useState('');
  const [show, setShow] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const rows = useMemo(() => {
    const receiptByRequest = new Map();
    for (const receipt of receipts) {
      if (receipt.sourceRequestId) {
        const key = `${receipt.warehouse}:${receipt.sourceRequestId}`;
        receiptByRequest.set(key, [...(receiptByRequest.get(key) || []), receipt]);
      }
    }

    const requests = [
      ...finishedRequests.map((request) => ({
        ...request,
        warehouse: 'FINISHED_GOODS',
        id: request.id,
        code: request.code,
      })),
      ...materialRequests.map((request) => ({
        ...request,
        warehouse: 'RAW_MATERIAL',
        id: String(request._id),
        code: request.ticketCode,
      })),
    ];

    const linked = requests.map((request) => {
      const matched = receiptByRequest.get(`${request.warehouse}:${request.id}`) || [];
      return {
        id: request.id,
        warehouse: request.warehouse,
        code: request.code,
        createdAt: request.createdAt,
        request,
        receiptCodes: matched.map((item) => item.code),
        lines: matched.flatMap((item) => item.lines || []),
        status: request.status,
      };
    });

    const requestIds = new Set(requests.map((item) => `${item.warehouse}:${item.id}`));
    const direct = receipts
      .filter(
        (receipt) =>
          !receipt.sourceRequestId ||
          !requestIds.has(`${receipt.warehouse}:${receipt.sourceRequestId}`)
      )
      .filter((receipt) => !requestIds.has(`${receipt.warehouse}:${receipt.id}`))
      .map((receipt) => ({
        ...receipt,
        receiptCodes: [receipt.code],
        status: 'COMPLETED',
        request: null,
        lines: receipt.lines || [],
      }));

    return [...linked, ...direct].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }, [finishedRequests, materialRequests, receipts]);

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    return rows.filter((row) => {
      if (warehouse && row.warehouse !== warehouse) return false;
      if (show === 'remaining') {
        const hasRemaining = row.lines.some((line) => line.remaining > 0) || !row.receiptCodes.length;
        if (!hasRemaining) return false;
      } else if (show === 'placed') {
        const allPlaced = row.receiptCodes.length > 0 && row.lines.length > 0 && row.lines.every((line) => line.remaining === 0);
        if (!allPlaced) return false;
      }
      if (q) {
        const inCode = (row.code || '').toLowerCase().includes(q);
        const inReceipts = (row.receiptCodes || []).some((rc) => rc.toLowerCase().includes(q));
        const inLines = (row.lines || []).some(
          (l) => (l.code || '').toLowerCase().includes(q) || (l.name || '').toLowerCase().includes(q)
        );
        if (!inCode && !inReceipts && !inLines) return false;
      }
      return true;
    });
  }, [rows, warehouse, show, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid var(--ara-border, #C8B9A6)',
        boxShadow: 'var(--ara-shadow-sm)',
        overflow: 'hidden',
        marginBottom: '1.5rem',
      }}
    >
      {/* Header & Bộ lọc dải trên cùng */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--ara-border, #C8B9A6)',
          background: '#FAFAFA',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <Layers size={18} color="var(--wms-accent, #8A6A46)" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
              Tiến độ nhập kho & Xếp kệ lưu trữ
            </h2>
          </div>
          <p style={{ margin: 0, color: '#6B7280', fontSize: '0.85rem' }}>
            Theo dõi số lượng đã cất vào ô kệ theo từng phiếu và danh sách nguyên phụ liệu / thành phẩm liền mạch.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Lọc kho */}
          <select
            value={warehouse}
            onChange={(e) => {
              setWarehouse(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #D1D5DB',
              fontSize: '0.85rem',
              background: '#FFFFFF',
              color: '#374151',
              fontWeight: 500,
              outline: 'none',
            }}
          >
            <option value="">Cả hai kho</option>
            <option value="FINISHED_GOODS">Kho thành phẩm</option>
            <option value="RAW_MATERIAL">Kho nguyên phụ liệu</option>
          </select>

          {/* Lọc trạng thái tiến độ */}
          <select
            value={show}
            onChange={(e) => {
              setShow(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #D1D5DB',
              fontSize: '0.85rem',
              background: '#FFFFFF',
              color: '#374151',
              fontWeight: 500,
              outline: 'none',
            }}
          >
            <option value="">Tất cả tiến độ</option>
            <option value="remaining">Chờ xếp kệ / Còn tồn</option>
            <option value="placed">Đã xếp đủ 100%</option>
          </select>

          {/* Tìm kiếm nhanh */}
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm mã lệnh, phiếu, NPL..."
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #D1D5DB',
              fontSize: '0.85rem',
              minWidth: '180px',
              outline: 'none',
            }}
          />

          {/* Nút làm mới */}
          <button
            type="button"
            className="btn-ara-secondary"
            disabled={loading}
            onClick={onRefresh}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
            }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Thông báo lỗi nếu có */}
      {error && (
        <div style={{ padding: '0.85rem 1.25rem', background: '#FEF2F2', color: '#991B1B', fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      {/* Trạng thái trống hoặc đang tải */}
      {loading && !rows.length && (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: '#6B7280', fontSize: '0.9rem' }}>
          Đang tải dữ liệu tiến độ xếp kệ...
        </div>
      )}

      {!loading && !visible.length && (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: '#6B7280', fontSize: '0.9rem' }}>
          Không có lệnh hoặc phiếu nào phù hợp với bộ lọc hiện tại.
        </div>
      )}

      {/* Danh sách hiển thị liền mạch không khoảng trắng */}
      {visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visible.map((row, idx) => {
            const isFinished = row.warehouse === 'FINISHED_GOODS';
            const acceptedTotal = sum(row.lines, 'accepted');
            const placedTotal = sum(row.lines, 'placed');
            const remainingTotal = sum(row.lines, 'remaining');
            const isAllPlaced = row.lines.length > 0 && remainingTotal === 0;

            return (
              <div
                key={`${row.warehouse}:${row.id}`}
                style={{
                  borderBottom: idx === visible.length - 1 ? 'none' : '1px solid var(--ara-border, #E5E7EB)',
                  background: '#FFFFFF',
                  padding: '1.25rem 1.5rem',
                }}
              >
                {/* Header hàng lệnh: Mã, Phân loại, Trạng thái, Thao tác */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    marginBottom: row.lines.length > 0 ? '0.85rem' : '0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px',
                        background: isFinished ? '#EFF6FF' : '#FEF3C7',
                        color: isFinished ? '#1D4ED8' : '#B45309',
                        border: isFinished ? '1px solid #BFDBFE' : '1px solid #FDE68A',
                      }}
                    >
                      {isFinished ? <Shirt size={13} /> : <Package size={13} />}
                      {isFinished ? 'THÀNH PHẨM' : 'NGUYÊN PHỤ LIỆU'}
                    </span>

                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
                      {row.code}
                    </h3>

                    <span style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                      {row.receiptCodes.length
                        ? `Phiếu: ${row.receiptCodes.join(', ')}`
                        : row.status === 'COMPLETED'
                        ? 'Lệnh lịch sử chưa có phiếu nhập liên kết'
                        : 'Chưa có phiếu nhập xác nhận'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {row.lines.length > 0 && (
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          background: isAllPlaced ? '#ECFDF5' : '#FEF3C7',
                          color: isAllPlaced ? '#065F46' : '#92400E',
                          border: isAllPlaced ? '1px solid #A7F3D0' : '1px solid #FDE68A',
                        }}
                      >
                        {isAllPlaced ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                        {isAllPlaced ? 'Đã xếp đủ 100%' : `Còn chờ xếp (${amount(remainingTotal)})`}
                      </span>
                    )}

                    {row.request && (
                      <button
                        type="button"
                        className="btn-ara-secondary"
                        onClick={() => onOpenRequest(row.request)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.82rem',
                          borderRadius: '6px',
                        }}
                      >
                        <Eye size={14} /> Xem lệnh
                      </button>
                    )}
                  </div>
                </div>

                {/* Danh sách các nguyên phụ liệu hoặc thành phẩm LIỀN MẠCH KHÔNG KHOẢNG TRẮNG */}
                {row.lines.length > 0 && (
                  <div
                    style={{
                      borderRadius: '8px',
                      border: '1px solid #E5E7EB',
                      overflow: 'hidden',
                      background: '#F9FAFB',
                    }}
                  >
                    {row.lines.map((line, lineIdx) => {
                      const unitStr = line.unit === 'PIECE' ? 'chiếc' : line.unit || '';
                      const isPending = (line.remaining || 0) > 0;

                      return (
                        <div
                          key={`${line.code}-${lineIdx}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            padding: '0.65rem 1rem',
                            borderBottom: lineIdx === row.lines.length - 1 ? 'none' : '1px solid #E5E7EB',
                            background: isPending ? '#FFFBEB' : '#FFFFFF',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          {/* Mã & tên NPL */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '220px' }}>
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: isPending ? '#D97706' : '#10B981',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontSize: '0.88rem', color: '#1F2937' }}>
                              <strong style={{ fontWeight: 700 }}>{line.code}</strong>
                              {line.name ? ` · ${line.name}` : ''}
                            </span>
                          </div>

                          {/* Chi tiết tiến độ xếp: Đã xếp / Cần xếp / Còn lại */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '1.25rem',
                              fontSize: '0.84rem',
                              color: '#374151',
                            }}
                          >
                            <span>
                              Đã xếp:{' '}
                              <strong style={{ color: '#047857' }}>
                                {amount(line.placed)} / {amount(line.accepted)}
                              </strong>{' '}
                              {unitStr}
                            </span>

                            <span
                              style={{
                                fontWeight: 700,
                                color: isPending ? '#B45309' : '#059669',
                                background: isPending ? '#FEF3C7' : '#ECFDF5',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                              }}
                            >
                              {isPending ? `Còn: ${amount(line.remaining)} ${unitStr}` : 'Hoàn tất'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Dòng tóm tắt còn lại nếu có */}
                {row.lines.some((line) => line.remaining > 0) && (
                  <p
                    style={{
                      margin: '0.6rem 0 0 0',
                      color: '#B45309',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    Chưa xếp:{' '}
                    {row.lines
                      .filter((line) => line.remaining > 0)
                      .map(
                        (line) =>
                          `${line.code} (${amount(line.remaining)} ${
                            line.unit === 'PIECE' ? 'chiếc' : line.unit || ''
                          })`
                      )
                      .join(', ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Phân trang */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.85rem 1.5rem',
            borderTop: '1px solid var(--ara-border, #C8B9A6)',
            background: '#FAFAFA',
            fontSize: '0.85rem',
            color: '#6B7280',
          }}
        >
          <span>
            Hiển thị trang {currentPage} / {totalPages} ({filtered.length} kết quả)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-ara-secondary"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
            >
              Trang trước
            </button>
            <button
              type="button"
              className="btn-ara-secondary"
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
            >
              Trang sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
