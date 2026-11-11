/*
 * File: GarmentLayout.jsx
 * Role: GARMENT_TECHNICIAN (Kỹ thuật viên may / KCS)
 * Description: Sidebar layout for Garment Technician module, providing quick navigation between Material Inbound Verification and Finished Goods Inspection.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ClipboardCheck, Shirt, ShieldCheck, CheckCircle2, ScanLine, ArrowUpRight, Scissors, Package, RotateCcw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function GarmentLayout({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  const menuItems = [
    {
      to: '/garment/raw-materials',
      label: 'Kho nguyên phụ liệu',
      subLabel: 'Danh mục, định mức & thông số NPL',
      icon: Package,
    },
    {
      to: '/garment/material-inbound-verification',
      label: 'Kế hoạch & Nhập NPL',
      subLabel: 'Đối soát & nhập kho nguyên phụ liệu',
      icon: ClipboardCheck,
    },
    {
      to: '/garment/finished-goods-inspection',
      label: 'KCS & Nhập thành phẩm',
      subLabel: 'Kiểm định may & nhập thành phẩm',
      icon: Shirt,
    },
    {
      to: '/garment/return-inspection',
      label: 'Kiểm tra hàng hoàn/trả',
      subLabel: 'Quét đơn, kiểm định KCS & nhập kho hoàn',
      icon: RotateCcw,
    },
    {
      to: '/garment/stocktake-execution',
      label: 'Kiểm kê theo yêu cầu',
      subLabel: 'Quét mã kệ & đếm kho theo lệnh',
      icon: ScanLine,
    },
    {
      to: '/garment/material-outbound-request',
      label: 'Yêu cầu xuất NPL',
      subLabel: 'Gửi yêu cầu xuất kho cho xưởng',
      icon: ArrowUpRight,
    },
    {
      to: '/garment/remnant-recovery',
      label: 'Cắt & Thu hồi vải thừa',
      subLabel: 'Đo vải thừa, kiểm tra ngưỡng & hoàn kho',
      icon: Scissors,
    },
  ];

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 70px)', background: 'var(--ara-bg)' }}>
      {/* Sidebar for Garment Technician */}
      <aside style={{
        width: '260px',
        background: '#FFFFFF',
        borderRight: '1px solid var(--ara-border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        boxShadow: 'var(--ara-shadow-sm)',
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: '1.25rem 1.25rem',
          borderBottom: '1px solid var(--ara-border)',
          background: 'var(--ara-bg-surface)',
        }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: 'var(--ara-gold)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}>
            <ShieldCheck size={14} /> PHÂN HỆ KỸ THUẬT XƯỞNG
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
            KCS & Nghiệm Thu
          </div>
        </div>

        {/* Navigation Links */}
        <nav style={{ padding: '1rem 0.75rem', flex: 1 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
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
                    <div style={{
                      padding: '0.4rem',
                      borderRadius: '6px',
                      background: isActive ? 'rgba(159, 131, 101, 0.15)' : 'var(--ara-bg-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon size={17} color={isActive ? 'var(--ara-gold)' : 'var(--ara-text-muted)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.88rem', lineHeight: 1.25 }}>{item.label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--ara-text-light)', marginTop: '2px' }}>
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
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--ara-border)',
          background: 'var(--ara-bg-surface)',
          fontSize: '0.8rem',
        }}>
          <div style={{ color: 'var(--ara-text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
            Kỹ thuật viên trực xưởng
          </div>
          <div style={{ fontWeight: 700, color: 'var(--ara-noir)', marginTop: '2px' }}>
            {user?.fullName || user?.username || 'Kỹ thuật viên KCS'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '4px' }}>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              background: 'var(--ara-noir)',
              color: 'var(--ara-gold)',
              padding: '0.15rem 0.45rem',
              borderRadius: '4px',
              letterSpacing: '0.04em',
            }}>
              {user?.roleCode || 'GARMENT_TECHNICIAN'}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#047857', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <CheckCircle2 size={11} /> Sẵn sàng
            </span>
          </div>
        </div>
      </aside>

      {/* Main Page Area */}
      <div style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

