/*
 * File: WarehouseStaffLayout.jsx
 * Role: WAREHOUSE_STAFF (Nhân viên kho)
 * Description: Sidebar layout for Warehouse Staff module, providing direct navigation between Putaway (Xếp hàng vào kệ), Packing (Đóng hàng), Order QR, and Shipping (Vận chuyển và bàn giao).
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Grid,
  QrCode,
  Truck,
  CheckCircle2,
  Shirt,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function WarehouseStaffLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  const menuItems = [
    {
      to: '/warehouse/putaway',
      label: 'Nhập nguyên phụ liệu và thành phẩm',
      subLabel: 'Quét mã & cất hàng vào ô kệ',
      icon: Grid,
      match: (path) => path.startsWith('/warehouse/putaway'),
    },
    {
      to: '/warehouse/staff/outbound',
      label: 'Lệnh xuất nguyên phụ liệu và thành phẩm',
      subLabel: 'Lấy hàng theo FIFO & xuất kho',
      icon: ArrowUpRight,
      match: (path) => path.startsWith('/warehouse/staff/outbound'),
    },
    {
      to: '/warehouse/staff/finished-goods',
      label: 'Kho thành phẩm',
      subLabel: 'Tra cứu tồn kho theo SKU',
      icon: Shirt,
      match: (path) => path === '/warehouse/staff/finished-goods',
    },
    {
      to: '/warehouse/staff/inbound-progress',
      label: 'Tiến độ nhập kho',
      subLabel: 'Theo dõi cất hàng & phân bổ kệ',
      icon: TrendingUp,
      match: (path) => path.startsWith('/warehouse/staff/inbound-progress'),
    },
    {
      to: '/packing/qr',
      label: 'Đóng hàng',
      subLabel: 'Quét QR đóng gói & video',
      icon: Box,
      match: (path) => path.startsWith('/packing'),
    },
    {
      to: '/orders/qr',
      label: 'Đơn hàng & Quét QR',
      subLabel: 'Tra cứu đơn & in/quét mã QR',
      icon: QrCode,
      match: (path) => path.startsWith('/orders'),
    },
    {
      to: '/warehouse/shipping',
      label: 'Vận chuyển & Bàn giao',
      subLabel: 'Điều phối & bàn giao đơn',
      icon: Truck,
      match: (path) => path.startsWith('/warehouse/shipping'),
    },
  ];

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 70px)', background: 'var(--ara-bg)' }}>
      {/* Sidebar for Warehouse Staff */}
      <aside
        style={{
          width: '260px',
          background: '#FFFFFF',
          borderRight: '1px solid var(--ara-border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          boxShadow: 'var(--ara-shadow-sm)',
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            padding: '1.25rem 1.25rem',
            borderBottom: '1px solid var(--ara-border)',
            background: 'var(--ara-bg-surface)',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--ara-gold)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Box size={14} /> PHÂN HỆ NHÂN VIÊN KHO
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
            Tác Nghiệp & Vận Hành
          </div>
        </div>

        {/* Navigation Links */}
        <nav style={{ padding: '1rem 0.75rem', flex: 1 }}>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
            }}
          >
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.match
                ? item.match(location.pathname)
                : location.pathname === item.to;

              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      textDecoration: 'none',
                      background: isActive ? 'var(--ara-bg-surface)' : 'transparent',
                      color: isActive ? 'var(--ara-gold)' : 'var(--ara-text)',
                      fontWeight: isActive ? 700 : 500,
                      border: isActive ? '1px solid var(--ara-gold)' : '1px solid transparent',
                      boxShadow: isActive ? 'var(--ara-shadow-sm)' : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div
                      style={{
                        padding: '0.4rem',
                        borderRadius: '6px',
                        background: isActive ? 'rgba(159, 131, 101, 0.15)' : 'var(--ara-bg-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={17} color={isActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.88rem', lineHeight: 1.25 }}>{item.label}</div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--ara-text-light)',
                          marginTop: '2px',
                        }}
                      >
                        {item.subLabel}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar Footer Info */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid var(--ara-border)',
            background: 'var(--ara-bg-surface)',
            fontSize: '0.8rem',
          }}
        >
          <div
            style={{
              color: 'var(--ara-text-muted)',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Nhân viên kho trực ca
          </div>
          <div style={{ fontWeight: 700, color: 'var(--ara-noir)', marginTop: '2px' }}>
            {user?.fullName || user?.username || 'Nhân viên vận hành kho'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '4px' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                background: 'var(--ara-noir)',
                color: 'var(--ara-gold)',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                letterSpacing: '0.04em',
              }}
            >
              {user?.roleCode || 'WAREHOUSE_STAFF'}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                color: '#047857',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <CheckCircle2 size={11} /> Sẵn sàng
            </span>
          </div>
        </div>
      </aside>

      {/* Main Page Area */}
      <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

