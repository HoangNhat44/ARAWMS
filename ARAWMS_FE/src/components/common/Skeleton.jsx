import React from 'react';
import { Placeholder, Card } from 'react-bootstrap';

/**
 * Skeleton loading component - ARA Design System
 * Dùng để thay thế LoadingSpinner cho UX premium hơn
 * (Refactor: dùng <Placeholder> của React-Bootstrap thay cho animation CSS tự viết)
 */

// Base skeleton shimmer block
export const SkeletonBlock = ({ width = '100%', height = '16px', borderRadius = '6px', style = {} }) => (
  <Placeholder as="div" animation="glow">
    <Placeholder className="d-block bg-secondary" style={{ width, height, borderRadius, ...style }} />
  </Placeholder>
);

// Skeleton cho conversation item (sidebar trái)
export const SkeletonConversationItem = () => (
  <div className="d-flex gap-2 p-3 border-bottom">
    <SkeletonBlock width="42px" height="42px" borderRadius="50%" />
    <div className="flex-grow-1 d-flex flex-column gap-2">
      <div className="d-flex justify-content-between">
        <SkeletonBlock width="120px" height="13px" />
        <SkeletonBlock width="36px" height="11px" />
      </div>
      <SkeletonBlock width="80%" height="11px" />
    </div>
  </div>
);

// Skeleton cho chat message bubble
export const SkeletonMessage = ({ align = 'left' }) => (
  <div className={`d-flex mb-3 ${align === 'right' ? 'justify-content-end' : ''}`}>
    <SkeletonBlock width={align === 'right' ? '180px' : '220px'} height="38px" borderRadius="14px" />
  </div>
);

// Skeleton cho CRM Profile Panel
export const SkeletonCrmPanel = () => (
  <div className="d-flex flex-column gap-3 p-2">
    <Card body>
      <div className="d-flex align-items-center gap-2 mb-3">
        <SkeletonBlock width="40px" height="40px" borderRadius="50%" />
        <div className="flex-grow-1 d-flex flex-column gap-1">
          <SkeletonBlock width="60%" height="14px" />
          <SkeletonBlock width="40%" height="12px" />
        </div>
      </div>
      <SkeletonBlock height="50px" />
    </Card>
    {[1, 2, 3, 4].map((i) => (
      <SkeletonBlock key={i} width="70%" height="13px" />
    ))}
  </div>
);

// Skeleton cho Inventory SKU card
export const SkeletonSkuCard = () => (
  <Card body>
    <SkeletonBlock width="65%" height="14px" style={{ marginBottom: 8 }} />
    <SkeletonBlock width="40%" height="11px" style={{ marginBottom: 12 }} />
    <div className="d-flex justify-content-between">
      <SkeletonBlock width="90px" height="13px" />
      <SkeletonBlock width="120px" height="28px" />
    </div>
  </Card>
);

// Skeleton cho Orders Table row (nội dung bên trong 1 ô colSpan)
export const SkeletonOrderRow = () => (
  <div className="d-flex align-items-center gap-3">
    <SkeletonBlock width="90px" height="14px" />
    <SkeletonBlock width="120px" height="14px" />
    <SkeletonBlock width="160px" height="14px" />
    <SkeletonBlock width="25%" height="14px" />
    <SkeletonBlock width="90px" height="22px" borderRadius="9999px" />
  </div>
);

// Skeleton cho Order History Card (Tab đơn mua của khách trong seller chat)
export const SkeletonOrderHistoryCard = () => (
  <Card body>
    <div className="d-flex justify-content-between mb-2">
      <SkeletonBlock width="110px" height="14px" />
      <SkeletonBlock width="85px" height="20px" borderRadius="9999px" />
    </div>
    <SkeletonBlock width="60%" height="12px" style={{ marginBottom: 6 }} />
    <SkeletonBlock width="45%" height="12px" style={{ marginBottom: 10 }} />
    <div className="d-flex justify-content-between pt-2 border-top">
      <SkeletonBlock width="80px" height="14px" />
      <SkeletonBlock width="70px" height="26px" />
    </div>
  </Card>
);

export default SkeletonBlock;
