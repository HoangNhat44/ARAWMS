/**
 * ============================================================================
 * @title        : Seller UI Primitives (UIDesign.md Compliance)
 * @author       : AraStore UI/UX Team
 * @description  : Các thành phần giao diện nhỏ dùng chung cho phân hệ Seller,
 *                 tuân thủ chặt chẽ AraStore UI/UX Design System (UIDesign.md).
 *                 Màu sắc, border, typography và badge trạng thái tuân thủ Section 4 & 6.
 * @module       : Conversational Commerce / Seller UI
 * @layer        : Front-end
 * ============================================================================
 */

import React from 'react';

/**
 * Định dạng số tiền VND chuẩn doanh nghiệp.
 * @param {number|string} n - Giá trị tiền.
 * @returns {string} Chuỗi tiền tệ dạng "1.000.000 đ".
 */
export const formatVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

/**
 * Ánh xạ trạng thái đơn hàng sang variant màu của Bootstrap (hỗ trợ fallback).
 * @constant {Object<string,string>}
 */
export const ORDER_STATUS_VARIANT = {
  PENDING: 'warning',
  CONFIRMED_RESERVED: 'secondary',
  PICKING: 'secondary',
  PACKED: 'secondary',
  HANDED_OVER_CARRIER: 'secondary',
  DELIVERED: 'success',
  COMPLETED: 'success',
  RETURN_REQUESTED: 'warning',
  CANCELLED: 'danger',
  RETURNED: 'dark',
};

/**
 * Ánh xạ trạng thái đơn hàng sang class Soft Tint Badge của AraStore Design System (UIDesign.md Section 6).
 * @constant {Object<string,string>}
 */
export const ORDER_STATUS_CLASS = {
  PENDING: 'ara-badge-pending',
  CONFIRMED_RESERVED: 'ara-badge-confirmed',
  PICKING: 'ara-badge-picking',
  PACKED: 'ara-badge-packed',
  HANDED_OVER_CARRIER: 'ara-badge-handed',
  DELIVERED: 'ara-badge-delivered',
  COMPLETED: 'ara-badge-completed',
  RETURN_REQUESTED: 'ara-badge-return',
  CANCELLED: 'ara-badge-cancelled',
  RETURNED: 'ara-badge-returned',
};

/**
 * Icon Bootstrap Icons.
 * @param {Object} props
 * @param {string} props.name - Tên icon (không kèm tiền tố "bi-"), ví dụ "bag".
 * @param {string} [props.className] - Class bổ sung.
 */
export const Icon = ({ name, className = '', ...rest }) => (
  <i className={`bi bi-${name} ${className}`} aria-hidden="true" {...rest} />
);

/**
 * Avatar tròn hiển thị chữ cái đầu tên khách hàng với phong cách Enterprise Deep Noir (#141210).
 * @param {Object} props
 * @param {string} [props.name] - Tên khách hàng.
 * @param {number} [props.size=36] - Kích thước (px).
 */
export const Avatar = ({ name, size = 36, className = '' }) => (
  <div
    className={`rounded-circle fw-bold d-flex align-items-center justify-content-center flex-shrink-0 ${className}`}
    style={{
      width: size,
      height: size,
      fontSize: Math.max(11, size * 0.4),
      backgroundColor: '#141210',
      color: '#D4B48C',
      border: '1px solid #C8B9A6',
      userSelect: 'none',
    }}
  >
    {(name || 'K').charAt(0).toUpperCase()}
  </div>
);

/**
 * Ảnh thu nhỏ sản phẩm, fallback icon hộp khi không có ảnh.
 * @param {Object} props
 * @param {string} [props.src] - URL ảnh.
 * @param {string} [props.alt] - Mô tả ảnh.
 * @param {number} [props.size=36] - Kích thước (px).
 */
export const SkuThumb = ({ src, alt, size = 36 }) =>
  src ? (
    <img
      src={src}
      alt={alt || 'SKU'}
      className="rounded flex-shrink-0 object-fit-cover"
      style={{ width: size, height: size, border: '1px solid #C8B9A6' }}
    />
  ) : (
    <div
      className="rounded flex-shrink-0 d-flex align-items-center justify-content-center"
      style={{
        width: size,
        height: size,
        backgroundColor: '#F3EDE4',
        border: '1px solid #C8B9A6',
        color: '#8A6A46',
      }}
    >
      <Icon name="box-seam" />
    </div>
  );

/**
 * Badge tồn kho khả dụng tuân thủ Section 6 của UIDesign.md:
 * - Còn hàng: Text #1E6B47, Bg #E3F5EC, Border #86CFA8
 * - Hết hàng: Text #574F46, Bg #DDD2C4, Border #AE9C86
 * @param {Object} props
 * @param {number} props.qty - Số lượng khả dụng.
 */
export const StockBadge = ({ qty }) =>
  qty > 0 ? (
    <span
      className="d-inline-flex align-items-center gap-1 px-2 py-0.5 rounded small fw-semibold"
      style={{
        backgroundColor: '#E3F5EC',
        color: '#1E6B47',
        border: '1px solid #86CFA8',
        fontSize: '11px',
      }}
    >
      <Icon name="check-circle" /> Còn {qty}
    </span>
  ) : (
    <span
      className="d-inline-flex align-items-center gap-1 px-2 py-0.5 rounded small fw-semibold"
      style={{
        backgroundColor: '#DDD2C4',
        color: '#574F46',
        border: '1px solid #AE9C86',
        fontSize: '11px',
      }}
    >
      <Icon name="x-circle" /> Hết hàng
    </span>
  );

/**
 * Trạng thái rỗng (empty state) chuẩn Enterprise AraStore.
 * @param {Object} props
 * @param {string} props.icon - Tên Bootstrap Icon.
 * @param {React.ReactNode} props.title - Tiêu đề.
 * @param {React.ReactNode} [props.children] - Mô tả phụ.
 */
export const EmptyState = ({ icon, title, children, className = '' }) => (
  <div className={`text-center py-5 px-3 ${className}`}>
    <div
      className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
      style={{
        width: 52,
        height: 52,
        backgroundColor: '#F3EDE4',
        border: '1px solid #C8B9A6',
        color: '#8A6A46',
      }}
    >
      <Icon name={icon} className="fs-4" />
    </div>
    <div className="fw-semibold fs-6 mb-1" style={{ color: '#141210' }}>{title}</div>
    {children && <div className="small" style={{ color: '#574F46' }}>{children}</div>}
  </div>
);
