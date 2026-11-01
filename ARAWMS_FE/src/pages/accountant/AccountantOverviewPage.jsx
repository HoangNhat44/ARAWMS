import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  ACCOUNTANT_NAV_GROUPS,
  FLATTENED_ACCOUNTANT_NAV,
} from '../../components/accountant/accountantNavConfig';

/**
 * Trang Tổng quan Kế toán & Khung điều hướng tuân thủ chuẩn AraStore Enterprise WMS Design System
 */
const AccountantOverviewPage = () => {
  const location = useLocation();
  const currentItem = FLATTENED_ACCOUNTANT_NAV.find((item) => item.path === location.pathname);
  const isRootOverview = location.pathname === '/accountant';

  if (!isRootOverview && currentItem) {
    return (
      <section aria-labelledby="section-page-heading">
        <div className="wms-page-header">
          <div>
            <h2 id="section-page-heading" className="wms-page-title">
              {currentItem.label}
            </h2>
            <p className="wms-page-subtitle">{currentItem.description}</p>
          </div>
          <span className="wms-status-badge wms-status-processing">
            Processing • {currentItem.ucCode}
          </span>
        </div>

        <div className="wms-card">
          <div className="wms-card-header">
            <h3 className="wms-section-title">Trạng thái Module Nghiệp vụ</h3>
            <span className="wms-status-badge wms-status-available">Available</span>
          </div>
          <div className="wms-empty-notice">
            Đường dẫn điều hướng <strong>{currentItem.path}</strong> đã được định cấu hình trên
            Sidebar và Header chuẩn Enterprise WMS. Khi triển khai nghiệp vụ{' '}
            <strong>{currentItem.ucCode}</strong>, chỉ cần gắn component trang tương ứng vào{' '}
            <code>src/routes/AccountantRoutes.jsx</code>.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="overview-page-heading">
      <div className="wms-page-header">
        <div>
          <h2 id="overview-page-heading" className="wms-page-title">
            Bảng điều khiển Phân hệ Kế toán (Accountant Workspace)
          </h2>
          <p className="wms-page-subtitle">
            Quản lý nhà cung ứng nguyên phụ liệu, khung hợp đồng, công nợ, dòng tiền, định giá tồn
            kho, giá vốn hàng bán (COGS), báo cáo Lãi/Lỗ (P&L) và đối soát COD vận chuyển.
          </p>
        </div>
        <span className="wms-status-badge wms-status-available">Available • 21 Use Cases</span>
      </div>

      <div className="wms-grid-cards">
        {ACCOUNTANT_NAV_GROUPS.filter((g) => g.groupKey !== 'overview').map((group) => (
          <div key={group.groupKey} className="wms-card">
            <div className="wms-card-header">
              <h3 className="wms-section-title">{group.groupTitle}</h3>
              <span className="wms-status-badge wms-status-reserved">
                {group.items.length} chức năng
              </span>
            </div>

            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.key} to={item.path} className="wms-module-link">
                  <div className="wms-module-link-left">
                    <Icon size={17} className="wms-module-link-icon" aria-hidden="true" />
                    <span>{item.label}</span>
                  </div>
                  <div className="wms-module-link-right">
                    <span className="ara-acc-header-uc-pill">{item.ucCode}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
};

export default AccountantOverviewPage;
