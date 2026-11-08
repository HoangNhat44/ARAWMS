/*
 * File: WarehouseManagerLayout.jsx
 * Role: WAREHOUSE_MANAGER (Quản lý kho)
 * Description: Sidebar layout for Warehouse Manager module, providing navigation between raw materials inbound/outbound, finished goods, product configuration, warehouse layout, and stocktaking.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  SlidersHorizontal,
  PackagePlus,
  ArrowUpRight,
  Shirt,
  Sliders,
  LayoutGrid,
  ClipboardCheck,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function WarehouseManagerLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  const menuItems = [
    {
      to: '/warehouse/raw-materials/inbound',
      label: 'Nhập nguyên phụ liệu',
      subLabel: 'Duyệt & nhập kho từ NCC',
      icon: PackagePlus,
      match: (path) => path.startsWith('/warehouse/raw-materials/inbound'),
    },
    {
      to: '/warehouse/raw-materials/outbound',
      label: 'Xuất nguyên phụ liệu',
      subLabel: 'Duyệt cấp & phân bổ cuộn/lô',
      icon: ArrowUpRight,
      match: (path) => path.startsWith('/warehouse/raw-materials/outbound'),
    },
    {
      to: '/warehouse/finished-goods',
      label: 'Kho thành phẩm',
      subLabel: 'Tồn kho & xuất thành phẩm',
      icon: Shirt,
      match: (path) => path.startsWith('/warehouse/finished-goods'),
    },
    {
      to: '/warehouse/products/new',
      label: 'Cấu hình sản phẩm',
      subLabel: 'Thông số & định mức quy cách',
      icon: Sliders,
      match: (path) => path.startsWith('/warehouse/products'),
    },
    {
      to: '/warehouse/layout',
      label: 'Cấu hình vị trí kho',
      subLabel: 'Sơ đồ khu vực, kệ & ô lưu trữ',
      icon: LayoutGrid,
      match: (path) => path.startsWith('/warehouse/layout'),
    },
    {
      to: '/warehouse/stocktake',
      label: 'Tạo lịch kiểm kê',
      subLabel: 'Lập đợt kiểm kê & đối soát',
      icon: ClipboardCheck,
      match: (path) => path.startsWith('/warehouse/stocktake'),
    },
  ];

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 70px)', background: 'var(--ara-bg)' }}>
      {/* Sidebar for Warehouse Manager */}
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
            <SlidersHorizontal size={14} /> PHÂN HỆ QUẢN LÝ KHO
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
            Nghiệp Vụ & Kế Hoạch
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
            Quản lý kho trực ca
          </div>
          <div style={{ fontWeight: 700, color: 'var(--ara-noir)', marginTop: '2px' }}>
            {user?.fullName || user?.username || 'Quản lý kho'}
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
              {user?.roleCode || 'WAREHOUSE_MANAGER'}
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
              <CheckCircle2 size={11} /> Hoạt động
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

