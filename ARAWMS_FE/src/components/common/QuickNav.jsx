/*
 * File: QuickNav.jsx
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Quick navigation menu for testing - appears on all pages
 */
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Home, Package, QrCode, Video, Warehouse, MapPin, Settings, Truck } from 'lucide-react';

const QuickNav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/orders/qr', label: 'Order QR', icon: QrCode },
    { path: '/packing/qr', label: 'Packing', icon: Video },
    { path: '/warehouse/shipping', label: 'Vận chuyển', icon: Truck },
    { path: '/warehouse/finished-goods', label: 'Finished Goods', icon: Package },
    { path: '/warehouse/raw-materials/inbound', label: 'Raw Material', icon: Truck },
    { path: '/warehouse/raw-materials/outbound', label: 'Xuất nguyên phụ liệu', icon: Truck },
    { path: '/warehouse/layout', label: 'Layout', icon: MapPin },
    { path: '/warehouse/putaway', label: 'Putaway', icon: Warehouse },
    { path: '/warehouse/products/new', label: 'Products', icon: Settings },
  ];

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #9F8365 0%, #c4a677 100%)',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          transition: 'all 0.3s ease',
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Navigation Menu */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '90px',
            right: '20px',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            padding: '1rem',
            zIndex: 999,
            minWidth: '220px',
            border: '2px solid #9F8365',
          }}
        >
          <div style={{ 
            fontSize: '0.85rem', 
            fontWeight: 700, 
            color: '#856404',
            marginBottom: '0.75rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid #e0e0e0'
          }}>
            🧭 Quick Navigation
          </div>
          
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '0.75rem',
                  marginBottom: '0.25rem',
                  textDecoration: 'none',
                  color: isActive ? '#9F8365' : '#333',
                  background: isActive ? 'rgba(159, 131, 101, 0.1)' : 'transparent',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.2s ease',
                  border: isActive ? '1px solid #9F8365' : '1px solid transparent',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(159, 131, 101, 0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = isActive ? 'rgba(159, 131, 101, 0.1)' : 'transparent';
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
};

export default QuickNav;
