import React from 'react';

/**
 * Skeleton loading component - ARA Design System
 * Dùng để thay thế LoadingSpinner cho UX premium hơn
 */

// Base skeleton shimmer block
export const SkeletonBlock = ({ width = '100%', height = '16px', borderRadius = '6px', style = {} }) => (
  <div
    className="ara-skeleton"
    style={{ width, height, borderRadius, ...style }}
  />
);

// Skeleton cho conversation item (sidebar trái)
export const SkeletonConversationItem = () => (
  <div className="ara-conv-item" style={{ pointerEvents: 'none' }}>
    <div className="ara-skeleton ara-skeleton-avatar" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div className="d-flex justify-content-between">
        <SkeletonBlock width="55%" height="13px" />
        <SkeletonBlock width="18%" height="11px" />
      </div>
      <SkeletonBlock width="80%" height="11px" />
      <div className="d-flex gap-1">
        <SkeletonBlock width="40px" height="18px" borderRadius="9999px" />
        <SkeletonBlock width="50px" height="18px" borderRadius="9999px" />
      </div>
    </div>
  </div>
);

// Skeleton cho chat message bubble
export const SkeletonMessage = ({ align = 'left' }) => (
  <div
    className={`ara-msg-wrapper ${align === 'right' ? 'ara-msg-outbound' : 'ara-msg-inbound'}`}
    style={{ pointerEvents: 'none' }}
  >
    {align === 'left' && (
      <div className="ara-skeleton" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
    )}
    <div className="ara-msg-bubble" style={{ background: 'transparent', border: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 140 }}>
      <SkeletonBlock width={align === 'right' ? '180px' : '220px'} height="38px" borderRadius="14px" />
      <SkeletonBlock width="50px" height="10px" style={{ alignSelf: align === 'right' ? 'flex-end' : 'flex-start' }} />
    </div>
  </div>
);

// Skeleton cho CRM Profile Panel
export const SkeletonCrmPanel = () => (
  <div className="d-flex flex-column gap-3" style={{ padding: '0.5rem' }}>
    {/* Header card */}
    <div className="p-3 rounded" style={{ background: '#F8F4EE', border: '1px solid var(--ara-border)' }}>
      <div className="d-flex align-items-center gap-2 mb-3">
        <SkeletonBlock width="40px" height="40px" borderRadius="50%" />
        <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
          <SkeletonBlock width="60%" height="14px" />
          <SkeletonBlock width="40%" height="12px" borderRadius="9999px" />
        </div>
      </div>
      <div className="row g-2">
        <div className="col-6"><SkeletonBlock height="50px" borderRadius="8px" /></div>
        <div className="col-6"><SkeletonBlock height="50px" borderRadius="8px" /></div>
      </div>
    </div>
    {/* Info rows */}
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="d-flex align-items-start gap-2">
        <SkeletonBlock width="16px" height="16px" style={{ marginTop: 2, flexShrink: 0 }} />
        <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
          <SkeletonBlock width="30%" height="10px" />
          <SkeletonBlock width="70%" height="13px" />
        </div>
      </div>
    ))}
  </div>
);

// Skeleton cho Inventory SKU card
export const SkeletonSkuCard = () => (
  <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }}>
    <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
      <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
        <SkeletonBlock width="65%" height="14px" />
        <div className="d-flex gap-2">
          <SkeletonBlock width="50px" height="18px" borderRadius="9999px" />
          <SkeletonBlock width="60px" height="11px" />
          <SkeletonBlock width="45px" height="11px" />
        </div>
      </div>
      <SkeletonBlock width="80px" height="22px" borderRadius="9999px" />
    </div>
    <div className="d-flex align-items-center justify-content-between pt-2" style={{ borderTop: '1px solid #F2ECE4' }}>
      <SkeletonBlock width="90px" height="13px" />
      <div className="d-flex gap-1">
        <SkeletonBlock width="55px" height="28px" borderRadius="6px" />
        <SkeletonBlock width="65px" height="28px" borderRadius="6px" />
      </div>
    </div>
  </div>
);

// Skeleton cho Orders Table row
export const SkeletonOrderRow = () => (
  <tr style={{ pointerEvents: 'none' }}>
    <td>
      <SkeletonBlock width="110px" height="14px" style={{ marginBottom: 6 }} />
      <SkeletonBlock width="80px" height="10px" />
    </td>
    <td>
      <SkeletonBlock width="120px" height="13px" style={{ marginBottom: 5 }} />
      <SkeletonBlock width="90px" height="11px" style={{ marginBottom: 4 }} />
      <SkeletonBlock width="160px" height="10px" />
    </td>
    <td><SkeletonBlock width="80px" height="13px" /></td>
    <td><SkeletonBlock width="90px" height="14px" /></td>
    <td><SkeletonBlock width="90px" height="22px" borderRadius="9999px" /></td>
    <td className="text-end">
      <div className="d-flex justify-content-end gap-1">
        <SkeletonBlock width="80px" height="28px" borderRadius="6px" />
        <SkeletonBlock width="65px" height="28px" borderRadius="6px" />
      </div>
    </td>
  </tr>
);

// Skeleton cho Order History Card (Tab đơn mua của khách trong seller chat)
export const SkeletonOrderHistoryCard = () => (
  <div className="p-3 bg-white rounded border shadow-sm" style={{ borderColor: 'var(--ara-border, #E3D9CD)' }}>
    <div className="d-flex align-items-center justify-content-between mb-2">
      <SkeletonBlock width="110px" height="14px" />
      <SkeletonBlock width="85px" height="20px" borderRadius="9999px" />
    </div>
    <div className="mb-2 d-flex flex-column gap-1">
      <div className="d-flex justify-content-between">
        <SkeletonBlock width="45%" height="12px" />
        <SkeletonBlock width="25%" height="12px" />
      </div>
      <div className="d-flex justify-content-between">
        <SkeletonBlock width="40%" height="12px" />
        <SkeletonBlock width="20%" height="12px" />
      </div>
    </div>
    <div className="d-flex align-items-center justify-content-between pt-2 border-top">
      <SkeletonBlock width="80px" height="14px" />
      <SkeletonBlock width="70px" height="26px" borderRadius="6px" />
    </div>
  </div>
);

export default SkeletonBlock;
