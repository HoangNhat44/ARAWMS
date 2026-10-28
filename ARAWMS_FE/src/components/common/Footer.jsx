/*
 * File: Footer.jsx
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Renders the shared application footer. Keeps footer content consistent across routes.
 */
import React from 'react';

/** Shows the shared product identity, current year, and application version. */
const Footer = () => {
  return (
    <footer className="ara-footer">
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/logo.png" alt="ARA" style={{ height: '24px', opacity: 0.8 }} />
          <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--ara-noir)', letterSpacing: '0.05em' }}>
            ARA WMS
          </span>
        </div>
        <p style={{ margin: 0 }}>
          © {new Date().getFullYear()} ARA Atelier & Warehouse Management System. All rights reserved.
        </p>
        <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-light)' }}>
          Phiên bản 1.0.0 — Production Ready
        </div>
      </div>
    </footer>
  );
};

export default Footer;
