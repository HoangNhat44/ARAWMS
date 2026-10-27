/**
 * ============================================================================
 * @title        : Order Detail Modal (Pancake-style)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Modal xem chi tiết đơn hàng, cập nhật trạng thái đơn (UC-80, UC-81)
 *                 và kích hoạt quy trình đổi trả hàng bán lẻ RMA (UC-82).
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState } from 'react';
import { Modal, Badge } from 'react-bootstrap';
import {
  X, Package, User, Phone, MapPin, ShoppingBag, RotateCcw,
  CheckCircle2, Clock, Calendar, Truck, ArrowRight
} from 'lucide-react';
import { sellerService } from '../../services/sellerService';

/**
 * Danh sách trạng thái đơn hàng bán lẻ chuẩn Database (khớp SalesOrder.model & enums.js)
 * @constant {Array<Object>}
 */
const ORDER_STATUSES = [
  { value: 'PENDING',             label: 'Chờ xác nhận',     color: '#8B5CF6', bg: '#F3E8FF' },
  { value: 'CONFIRMED_RESERVED',  label: 'Đã giữ chỗ kho',   color: '#2563EB', bg: '#EFF6FF' },
  { value: 'PACKED',              label: 'Đã đóng gói',      color: '#D97706', bg: '#FEF3C7' },
  { value: 'HANDED_OVER_CARRIER', label: 'Đang giao hàng',   color: '#0891B2', bg: '#ECFEFF' },
  { value: 'DELIVERED',           label: 'Đã giao hàng',     color: '#059669', bg: '#ECFDF5' },
  { value: 'CANCELLED',           label: 'Đã hủy đơn',       color: '#DC2626', bg: '#FEF2F2' },
  { value: 'RETURNED',            label: 'Đã trả hàng',      color: '#4B5563', bg: '#F3F4F6' },
];

/**
 * Modal hiển thị toàn diện thông tin đơn hàng, thay đổi trạng thái và tạo yêu cầu RMA.
 * Giao diện phong cách Atelier Pancake sang trọng, rộng rãi và tối ưu trải nghiệm.
 *
 * @component
 * @param {Object} props - Thuộc tính truyền vào component.
 * @param {boolean} props.isOpen - Cờ kiểm soát hiển thị modal.
 * @param {Object} props.order - Dữ liệu chi tiết đơn hàng từ API.
 * @param {Function} props.onClose - Callback đóng modal.
 * @param {Function} [props.onStatusUpdated] - Callback khi trạng thái đơn được cập nhật.
 * @param {Function} [props.onOpenRma] - Callback mở modal tạo yêu cầu đổi trả (RMA).
 * @returns {JSX.Element|null} Modal chi tiết đơn hàng.
 */
const OrderDetailModal = ({ isOpen, order, onClose, onStatusUpdated, onOpenRma }) => {
  const [status, setStatus] = useState(order?.status || 'PENDING');
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !order) return null;

  const currentStatusObj = ORDER_STATUSES.find((s) => s.value === status) || {
    value: status,
    label: status,
    color: '#6B7280',
    bg: '#F3F4F6',
  };

  /**
   * Cập nhật trạng thái đơn hàng theo ma trận chuyển trạng thái hợp lệ.
   * [BR: GBR-10] Chuyển sang CONFIRMED_RESERVED sẽ tự động kích hoạt giữ chỗ kho.
   * [BR: GBR-11] Nếu chuyển sang CANCELLED, BE tự động hoàn trả tồn giữ chỗ về tồn khả dụng.
   * [BR: GBR-13] Chuyển sang HANDED_OVER_CARRIER yêu cầu có mã vận đơn (Waybill code).
   */
  const handleUpdateStatus = async (newStatus) => {
    if (newStatus === status) return;
    try {
      setUpdating(true);
      setError('');

      const payload = { status: newStatus };

      // [BR: GBR-13] Bàn giao vận chuyển yêu cầu mã vận đơn
      if (newStatus === 'HANDED_OVER_CARRIER') {
        const existingWaybill = order.warehouseFulfillment?.waybillCode;
        let waybill = existingWaybill;
        if (!waybill) {
          waybill = window.prompt('Nhập mã vận đơn bưu tá bàn giao (ví dụ GHN_82063):', `GHN_${order.orderCode || Date.now()}`);
          if (!waybill) {
            setUpdating(false);
            return;
          }
        }
        payload.waybillCode = waybill;
      }

      // [BR: GBR-11] Hủy đơn yêu cầu lý do
      if (newStatus === 'CANCELLED') {
        const reason = window.prompt('Nhập lý do hủy đơn hàng:', 'Khách đổi ý hủy đơn');
        if (!reason) {
          setUpdating(false);
          return;
        }
        payload.cancelReason = reason;
      }

      // Gọi API cập nhật trạng thái đơn hàng (UC-81)
      const res = await sellerService.updateOrderStatus(order._id || order.id, payload);
      if (res.success) {
        setStatus(newStatus);
        if (onStatusUpdated) onStatusUpdated(res.data || { ...order, status: newStatus });
      }
    } catch (err) {
      setError(err.message || 'Lỗi cập nhật trạng thái');
    } finally {
      setUpdating(false);
    }
  };

  const items = order.items || [];
  const financial = order.financialSummary || {};
  const recipient = order.shippingRecipient || {};

  // Tính đúng tổng COD từ expectedCodAmount hoặc totalOrderAmount
  const totalCodAmount = financial.expectedCodAmount ?? financial.totalOrderAmount ?? financial.totalAmountDue ?? financial.grandTotal ?? 0;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${d.toLocaleDateString('vi-VN')}`;
  };

  return (
    <Modal show={isOpen} onHide={onClose} centered size="lg" className="ara-order-detail-modal">
      {/* Header sang trọng chuẩn Atelier */}
      <Modal.Header
        closeButton
        closeVariant="white"
        style={{
          background: 'linear-gradient(135deg, #1C1A17 0%, #2A2622 100%)',
          color: '#FFFFFF',
          borderBottom: '1px solid rgba(159, 131, 101, 0.35)',
          padding: '16px 22px',
        }}
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="d-flex align-items-center justify-content-center rounded-circle"
            style={{ width: '38px', height: '38px', background: 'rgba(159, 131, 101, 0.2)', border: '1px solid rgba(159, 131, 101, 0.4)' }}
          >
            <ShoppingBag size={18} color="var(--ara-gold, #C6B39C)" />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2">
              <span className="font-monospace fw-bold fs-5 text-white" style={{ letterSpacing: '0.05em' }}>
                #{order.orderCode || order._id?.slice(-6)}
              </span>
              <span
                className="badge rounded-pill px-3 py-1 fw-bold"
                style={{
                  background: currentStatusObj.color,
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  letterSpacing: '0.03em',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}
              >
                {currentStatusObj.label || status}
              </span>
            </div>
            {order.createdAt && (
              <div className="text-secondary small d-flex align-items-center gap-1 mt-0.5" style={{ fontSize: '0.76rem', color: '#B5ADA4' }}>
                <Calendar size={12} /> Đặt lúc: {formatDate(order.createdAt)}
              </div>
            )}
          </div>
        </div>
      </Modal.Header>

      {/* Body: Thoáng đãng, chia 2 cột rõ ràng */}
      <Modal.Body className="p-4 d-flex flex-column gap-3" style={{ background: '#FAF7F2' }}>
        {error && (
          <div className="alert alert-danger py-2 px-3 small rounded-3 mb-1 shadow-sm">
            {error}
          </div>
        )}

        {/* Khối 1: Thông tin người nhận & Thanh toán COD */}
        <div className="row g-3">
          {/* Cột trái: Người nhận */}
          <div className="col-md-6">
            <div className="p-3 bg-white rounded-3 border h-100 shadow-sm" style={{ borderColor: 'var(--ara-border, #E3D9CD)' }}>
              <div
                className="d-flex align-items-center gap-2 fw-bold mb-2 pb-1.5 border-bottom text-uppercase"
                style={{ fontSize: '0.74rem', letterSpacing: '0.06em', color: 'var(--ara-gold-hover, #7A5C3A)' }}
              >
                <User size={14} /> Thông Tin Người Nhận
              </div>
              <div className="d-flex flex-column gap-1.5" style={{ fontSize: '0.84rem' }}>
                <div className="fw-bold text-dark fs-6">
                  {recipient.name || 'Khách vãng lai'}
                </div>
                <div className="text-secondary d-flex align-items-center gap-2">
                  <Phone size={13} className="text-muted" />
                  <span className="fw-semibold text-dark">{recipient.phone || 'Chưa có SĐT'}</span>
                </div>
                <div className="text-secondary d-flex align-items-start gap-2 mt-1">
                  <MapPin size={13} className="text-muted mt-1 flex-shrink-0" />
                  <span>{recipient.address || 'Chưa cung cấp địa chỉ nhận hàng'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cột phải: Tài chính & Tiền COD */}
          <div className="col-md-6">
            <div className="p-3 bg-white rounded-3 border h-100 shadow-sm" style={{ borderColor: 'var(--ara-border, #E3D9CD)' }}>
              <div
                className="d-flex align-items-center gap-2 fw-bold mb-2 pb-1.5 border-bottom text-uppercase"
                style={{ fontSize: '0.74rem', letterSpacing: '0.06em', color: 'var(--ara-gold-hover, #7A5C3A)' }}
              >
                <Clock size={14} /> Tóm Tắt Thanh Toán
              </div>
              <div className="d-flex flex-column gap-1.5" style={{ fontSize: '0.82rem' }}>
                <div className="d-flex justify-content-between text-secondary">
                  <span>Tiền hàng ({items.length} món)</span>
                  <span className="fw-semibold text-dark">{Number(financial.itemsSubtotal || 0).toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="d-flex justify-content-between text-secondary">
                  <span>Phí giao hàng</span>
                  <span className="fw-semibold text-dark">{Number(financial.shippingFee || 0).toLocaleString('vi-VN')} đ</span>
                </div>
                {financial.discountAmount > 0 && (
                  <div className="d-flex justify-content-between text-success">
                    <span>Khuyến mãi / Giảm giá</span>
                    <span className="fw-semibold">-{Number(financial.discountAmount).toLocaleString('vi-VN')} đ</span>
                  </div>
                )}
                <div
                  className="d-flex justify-content-between align-items-center pt-2 mt-1 border-top fw-bold"
                  style={{ background: 'linear-gradient(180deg, transparent 0%, #FBF9F6 100%)' }}
                >
                  <span className="text-dark">Tổng thu hộ (COD):</span>
                  <span className="fs-5 fw-bold" style={{ color: 'var(--ara-gold-hover, #846B50)' }}>
                    {Number(totalCodAmount).toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Khối 2: Danh sách sản phẩm chi tiết */}
        <div className="p-3 bg-white rounded-3 border shadow-sm" style={{ borderColor: 'var(--ara-border, #E3D9CD)' }}>
          <div
            className="d-flex align-items-center justify-content-between mb-2 pb-1.5 border-bottom text-uppercase fw-bold"
            style={{ fontSize: '0.74rem', letterSpacing: '0.06em', color: 'var(--ara-gold-hover, #7A5C3A)' }}
          >
            <span className="d-flex align-items-center gap-2">
              <Package size={14} /> Danh Sách Kiện Hàng ({items.length})
            </span>
            <span className="text-muted fw-normal text-none" style={{ textTransform: 'none', fontSize: '0.75rem' }}>
              Bán buôn & bán lẻ tại quầy
            </span>
          </div>

          <div className="d-flex flex-column gap-2">
            {items.map((it, idx) => {
              const sku = it.skuId || it;
              const subtotal = (it.orderedQty || 1) * Number(it.unitSalePrice || it.finalPrice || 0);

              return (
                <div
                  key={idx}
                  className="d-flex align-items-center justify-content-between p-2 rounded-2"
                  style={{ background: idx % 2 === 0 ? '#FAF7F2' : '#FFFFFF', border: '1px solid #EFE8DF' }}
                >
                  <div className="d-flex align-items-center gap-3 min-w-0 pe-2">
                    <div
                      className="rounded-2 d-flex align-items-center justify-content-center text-secondary fw-bold flex-shrink-0"
                      style={{ width: '36px', height: '36px', background: '#EAE3D8', fontSize: '0.8rem' }}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="fw-bold text-dark text-truncate" style={{ fontSize: '0.86rem', maxWidth: '380px' }}>
                        {sku.styleName || sku.skuCode || it.skuCode}
                      </div>
                      <div className="text-muted d-flex align-items-center gap-2" style={{ fontSize: '0.74rem' }}>
                        <span className="font-monospace text-secondary">{sku.skuCode || it.skuCode}</span>
                        <span>·</span>
                        <span>Size: <strong className="text-dark">{sku.size || it.size || 'F'}</strong></span>
                        {sku.color && (
                          <>
                            <span>·</span>
                            <span>Màu: <strong className="text-dark">{sku.color}</strong></span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-end flex-shrink-0 ps-3">
                    <div className="fw-bold fs-6" style={{ color: 'var(--ara-gold-hover, #7A5C3A)' }}>
                      {Number(subtotal).toLocaleString('vi-VN')} đ
                    </div>
                    <div className="text-muted small" style={{ fontSize: '0.72rem' }}>
                      {Number(it.unitSalePrice || it.finalPrice || 0).toLocaleString('vi-VN')} đ × <strong>{it.orderedQty}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Khối 3: Cập nhật trạng thái đơn (Pancake Flow) */}
        <div className="p-3 bg-white rounded-3 border shadow-sm" style={{ borderColor: 'var(--ara-border, #E3D9CD)' }}>
          <div
            className="d-flex align-items-center justify-content-between mb-2.5 pb-1.5 border-bottom text-uppercase fw-bold"
            style={{ fontSize: '0.74rem', letterSpacing: '0.06em', color: 'var(--ara-gold-hover, #7A5C3A)' }}
          >
            <span className="d-flex align-items-center gap-2">
              <Truck size={14} /> Chuyển Đổi Trạng Thái Đơn Hàng (Pancake)
            </span>
            {updating && <span className="spinner-border spinner-border-sm text-secondary" />}
          </div>

          <div className="d-flex flex-wrap gap-2">
            {ORDER_STATUSES.map((s) => {
              const isCurrent = status === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  className={`btn btn-sm d-flex align-items-center gap-1.5 rounded-pill px-3 py-1.5 transition-all ${
                    isCurrent ? 'shadow-sm' : ''
                  }`}
                  style={{
                    background: isCurrent ? s.color : s.bg,
                    borderColor: s.color,
                    color: isCurrent ? '#FFFFFF' : s.color,
                    fontSize: '0.78rem',
                    fontWeight: isCurrent ? 700 : 500,
                    opacity: updating ? 0.6 : 1,
                  }}
                  onClick={() => handleUpdateStatus(s.value)}
                  disabled={updating}
                  title={`Chuyển trạng thái sang "${s.label}"`}
                >
                  {isCurrent && <CheckCircle2 size={13} />}
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Modal.Body>

      {/* Footer rõ ràng, nút bấm nổi bật */}
      <Modal.Footer className="p-3 border-top bg-white d-flex align-items-center justify-content-between">
        <div className="text-muted small">
          Mã giao dịch nội bộ: <span className="font-monospace text-dark">{order._id}</span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary px-4 py-1.5 rounded-2"
            style={{ fontSize: '0.84rem' }}
            onClick={onClose}
          >
            Đóng
          </button>
          {/* [BR: GBR-14] [BR: GBR-15] Cho phép tạo yêu cầu đổi/trả RMA nếu đơn hàng hợp lệ */}
          {onOpenRma && !['CANCELLED', 'RETURNED'].includes(status) && (
            <button
              type="button"
              className="btn btn-warning px-3 py-1.5 rounded-2 d-flex align-items-center gap-1.5 fw-bold text-dark border-0 shadow-sm"
              style={{ background: '#FDE68A', fontSize: '0.84rem' }}
              onClick={() => { onClose(); onOpenRma(order); }}
            >
              <RotateCcw size={14} /> Tạo Đổi / Trả Hàng (RMA)
            </button>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default OrderDetailModal;
