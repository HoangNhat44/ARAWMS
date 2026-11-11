import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AutoComplete, Badge, Button, Empty, Input, Popover, Skeleton } from 'antd';
import { Bell, FileText, Search } from 'lucide-react';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { datetime } from './OwnerUI';

const normalize = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();

export default function OwnerHeaderTools({ groups }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const reports = useOwnerResource('manager-reports', { limit: 10, status: 'SUBMITTED' });
  const total = reports.data?.total;
  const options = groups.flatMap((group) => group.items
    .filter(([path, label]) => normalize(`${label} ${group.title} ${path}`).includes(normalize(search)))
    .map(([path, label]) => ({ value: `/owner/${path}`, label })));

  useEffect(() => {
    setNotificationsOpen(false);
    setSearchOpen(false);
    setSearch('');
  }, [location.pathname, location.search]);

  const selectPage = (path) => {
    setSearch('');
    setSearchOpen(false);
    navigate(path);
  };
  const searchField = <AutoComplete className="owner-header-search" popupClassName="owner-search-popup" value={search} options={options}
    onChange={setSearch} onSelect={selectPage} notFoundContent="Không tìm thấy chức năng phù hợp"
    defaultActiveFirstOption aria-label="Tìm chức năng">
    <Input allowClear prefix={<Search size={18} aria-hidden="true" />} placeholder="Tìm chức năng…" maxLength={100} aria-label="Tìm chức năng" />
  </AutoComplete>;

  const notifications = <section className="owner-notifications" aria-label="Danh sách thông báo">
    <div className="owner-notifications-heading"><h2>Thông báo</h2><span>{total == null ? 'Báo cáo quản lý' : `${total} chưa xem`}</span></div>
    <div className="owner-notifications-list" aria-busy={reports.loading}>
      {reports.loading ? <div className="owner-notifications-state" role="status"><span className="wms-sr-only">Đang tải thông báo…</span><Skeleton active paragraph={{ rows: 3 }} /></div>
        : reports.error ? <div className="owner-notifications-state" role="alert"><p>Không tải được thông báo.</p><Button onClick={reports.reload}>Thử lại</Button></div>
          : !reports.data?.items?.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn không có thông báo mới" />
            : <ul>{reports.data.items.map((report) => <li key={report.id}>
              <Link className="owner-notification-item" to={`/owner/manager-reports/${report.id}`}
                state={{ from: location.pathname + location.search }} onClick={() => setNotificationsOpen(false)}>
                <span className="owner-notification-icon"><FileText size={22} aria-hidden="true" /></span>
                <span className="owner-notification-copy"><strong>{report.title || report.code}</strong><span>Báo cáo {report.code} đang chờ bạn xem</span><time dateTime={report.submittedAt || undefined}>{datetime(report.submittedAt)}</time></span>
                <span className="owner-notification-dot" aria-label="Chưa xem" />
              </Link>
            </li>)}</ul>}
    </div>
    <Link className="owner-notifications-footer" to="/owner/manager-reports?status=SUBMITTED" onClick={() => setNotificationsOpen(false)}>Xem tất cả báo cáo</Link>
  </section>;

  return <>
    <div className="owner-header-search-desktop">{searchField}</div>
    <div className="owner-header-search-mobile"><Popover trigger="click" placement="bottomRight" open={searchOpen} overlayClassName="owner-search-popover"
      onOpenChange={(open) => { setSearchOpen(open); if (open) setNotificationsOpen(false); }} content={searchField}>
      <Button type="text" className="owner-icon-button" aria-label="Mở tìm kiếm" aria-expanded={searchOpen} icon={<Search size={20} />} />
    </Popover></div>
    <Popover trigger="click" placement="bottomRight" open={notificationsOpen} content={notifications} overlayClassName="owner-notifications-popover"
      onOpenChange={(open) => { setNotificationsOpen(open); if (open) { setSearchOpen(false); reports.reload(); } }}>
      <Button type="text" className={`owner-icon-button${notificationsOpen ? ' owner-notifications-active' : ''}`}
        aria-label={`Thông báo${total == null ? '' : `: ${total} báo cáo chưa xem`}`} aria-expanded={notificationsOpen}>
        <Badge count={total || 0} size="small" overflowCount={99}><Bell size={20} /></Badge>
      </Button>
    </Popover>
  </>;
}
