/**
 * ============================================================================
 * @title        : Seller UI Primitives (Bootstrap / React-Bootstrap)
 * @author       : Nguyễn Quang Huy & AraWMS Design Team
 * @createdDate  : 2026-10-28
 * @lastModified : 2026-10-29
 * @description  : Các thành phần giao diện nhỏ dùng chung cho phân hệ Seller, xây dựng hoàn toàn
 *                 bằng Bootstrap utilities + React-Bootstrap + Bootstrap Icons kết hợp
 *                 bộ Design Tokens Luxury Enterprise của AraWMS.
 * @module       : Conversational Commerce / Seller UI
 * @layer        : Front-end
 * ============================================================================
 */

import React from 'react';
import { Badge } from 'react-bootstrap';

/**
 * Định dạng số tiền VND.
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
  CONFIRMED_RESERVED: 'primary',
  PICKING: 'info',
  PACKED: 'info',
  HANDED_OVER_CARRIER: 'info',
  DELIVERED: 'success',
  COMPLETED: 'success',
  RETURN_REQUESTED: 'warning',
  CANCELLED: 'danger',
  RETURNED: 'secondary',
};

/**
 * Ánh xạ trạng thái đơn hàng sang class Soft Tint Badge của Ara Luxury Design System.
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
 * Avatar tròn hiển thị chữ cái đầu tên khách hàng với phong cách Luxury Atelier.
 * @param {Object} props
 * @param {string} [props.name] - Tên khách hàng.
 * @param {number} [props.size=40] - Kích thước (px).
 */
export const Avatar = ({ name, size = 40, className = '' }) => (
  <div
    className={`rounded-circle fw-bold d-flex align-items-center justify-content-center flex-shrink-0 ${className}`}
    style={{
      width: size,
      height: size,
      fontSize: size * 0.4,
      background: 'linear-gradient(135deg, #2D2926 0%, #1C1A17 100%)',
      color: '#E2D3C0',
      border: '1px solid rgba(159, 131, 101, 0.35)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
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
      className="rounded border flex-shrink-0 object-fit-cover"
      style={{ width: size, height: size, borderColor: '#E3D9CD' }}
    />
  ) : (
    <div
      className="rounded border flex-shrink-0 d-flex align-items-center justify-content-center"
      style={{
        width: size,
        height: size,
        backgroundColor: '#FAF7F2',
        borderColor: '#E3D9CD',
        color: '#9F8365',
      }}
    >
      <Icon name="box-seam" />
    </div>
  );

/**
 * Badge tồn kho khả dụng.
 * @param {Object} props
 * @param {number} props.qty - Số lượng khả dụng.
 */
export const StockBadge = ({ qty }) =>
  qty > 0 ? (
    <Badge bg="success-subtle" text="success-emphasis">Còn {qty}</Badge>
  ) : (
    <Badge bg="secondary-subtle" text="secondary-emphasis">Hết hàng</Badge>
  );

/**
 * Trạng thái rỗng (empty state) chuẩn với visual luxury tối giản.
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
        width: 56,
        height: 56,
        backgroundColor: '#FAF7F2',
        border: '1px solid #E3D9CD',
        color: '#9F8365',
      }}
    >
      <Icon name={icon} className="fs-3" />
    </div>
    <div className="fw-semibold text-dark fs-6 mb-1">{title}</div>
    {children && <div className="small text-secondary">{children}</div>}
  </div>
);
