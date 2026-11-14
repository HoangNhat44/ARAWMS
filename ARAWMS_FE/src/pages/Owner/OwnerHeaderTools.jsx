/*
 * Nguyễn Ngọc Huy - HE171157
 * Ngày: 14-11-2026
 * Tìm chức năng và hiển thị thông báo trên thanh đầu trang Owner.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AutoComplete, Badge, Button, Empty, Input, Popover, Skeleton } from 'antd';
import { Bell, FileText, Search, AlertTriangle, CheckCheck } from 'lucide-react';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import notificationService from '../../services/notificationService';
import { datetime, quantity } from './OwnerUI';
import { dateRangeError, defaultOwnerDates } from '../../utils/ownerValidation';
import { channelLabels } from './BusinessActivity';

const normalize = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();

export default function OwnerHeaderTools({ groups }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [seenAlerts, setSeenAlerts] = useState({});
  const dates = defaultOwnerDates();
  const filters = new URLSearchParams(location.pathname === '/owner/dashboard' ? location.search : '');
  const from = filters.get('from') || dates.from;
  const to = filters.get('to') || dates.to;
  const salesChannel = filters.get('salesChannel');
  const paymentStatus = filters.get('paymentStatus');
  const alertQuery = {
    ...(dateRangeError({ from, to }) ? dates : { from, to }),
    ...(Object.hasOwn(channelLabels, salesChannel) ? { salesChannel } : {}),
    ...(['PAID', 'UNPAID', 'PARTIAL', 'REFUNDED', 'UNKNOWN'].includes(paymentStatus) ? { paymentStatus } : {}),
  };
  const business = useOwnerResource('operations-report/business-activity', alertQuery);
  const alerts = businessAlerts(business.data, alertQuery);
  const unreadAlerts = alerts.filter(alert => !seenAlerts[alert.key]).length;

  // 1. Quản lý Báo cáo quản trị (Legacy reports)
  const reports = useOwnerResource('manager-reports', { limit: 10, status: 'SUBMITTED' });
  const reportsTotal = reports.data?.total || 0;

  // 2. Quản lý Thông báo hệ thống & Cảnh báo KCS (Universal Notifications)
  const [systemNotifs, setSystemNotifs] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const fetchSystemNotifications = async () => {
    try {
      setLoadingNotifs(true);
      const res = await notificationService.getNotifications({ role: 'OWNER', limit: 25 });
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res?.data) ? res.data : [];
      setSystemNotifs(items);
      setUnreadNotifCount(typeof res?.unreadCount === 'number' ? res.unreadCount : items.filter((n) => !n.isRead).length);
    } catch (err) {
      console.warn('Lỗi khi tải thông báo của Owner:', err);
    } finally {
      setLoadingNotifs(false);
    }
  };

  useEffect(() => {
    fetchSystemNotifications();
    const timer = setInterval(fetchSystemNotifications, 20000);
    return () => clearInterval(timer);
  }, []);

  const totalUnread = unreadNotifCount + reportsTotal + unreadAlerts;

  const handleNotificationClick = async (notif) => {
    try {
      if (!notif.isRead) {
        await notificationService.markAsRead(notif._id);
        setSystemNotifs((prev) =>
          prev.map((n) => (String(n._id) === String(notif._id) ? { ...n, isRead: true } : n))
        );
        setUnreadNotifCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Lỗi khi đánh dấu đã đọc thông báo:', err);
    }

    setNotificationsOpen(false);
    if (notif.targetUrl) {
      let dest = notif.targetUrl;
      const planId = notif.metadata?.planId;
      if (dest.startsWith('/accountant/contract-deviations')) {
        dest = planId ? `/owner/deviations/${planId}` : '/owner/plan-deviations';
      }
      navigate(dest);
    }
  };

  const handleMarkAllRead = async () => {
    setSeenAlerts(previous => ({ ...previous, ...Object.fromEntries(alerts.map(alert => [alert.key, true])) }));
    try {
      await notificationService.markAllAsRead('OWNER');
      setSystemNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotifCount(0);
    } catch (err) {
      console.error('Lỗi khi đánh dấu tất cả đã đọc:', err);
    }
  };

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

  const hasAnyItems = Boolean(alerts.length || systemNotifs.length || reports.data?.items?.length);

  const notifications = (
    <section className="owner-notifications" aria-label="Danh sách thông báo">
      <div className="owner-notifications-heading">
        <h2>Thông báo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748B' }}>
            {totalUnread > 0 ? `${totalUnread} chưa xem` : 'Đã xem hết'}
          </span>
          {unreadNotifCount + unreadAlerts > 0 && (
            <Button
              type="text"
              size="small"
              onClick={handleMarkAllRead}
              title="Đánh dấu tất cả đã đọc"
              style={{ fontSize: '11.5px', padding: '0 4px', height: '22px', color: '#0284c7' }}
            >
              <CheckCheck size={14} style={{ marginRight: '3px' }} /> Đã đọc
            </Button>
          )}
        </div>
      </div>

      <div className="owner-notifications-list" aria-busy={loadingNotifs || reports.loading || business.loading}>
        {!hasAnyItems && (loadingNotifs || reports.loading || business.loading) ? (
          <div className="owner-notifications-state" role="status">
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        ) : !hasAnyItems ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn không có thông báo mới" />
        ) : (
          <ul>
            {alerts.map(alert => <li key={alert.key}>
              <Link className="owner-notification-item" to={alert.to} onClick={() => {
                setSeenAlerts(previous => ({ ...previous, [alert.key]: true }));
                setNotificationsOpen(false);
              }}>
                <span className="owner-notification-icon owner-notification-warning"><AlertTriangle size={20} aria-hidden="true" /></span>
                <span className="owner-notification-copy"><strong>{alert.title}</strong><span>{alert.message}</span></span>
                {!seenAlerts[alert.key] && <span className="owner-notification-dot" aria-label="Chưa xem" />}
              </Link>
            </li>)}
            {/* 1. Danh sách thông báo hệ thống & sai lệch KCS */}
            {systemNotifs.map((notif) => {
              const isDeviation = notif.type === 'CONTRACT_DEVIATION';
              return (
                <li key={notif._id}>
                  <button type="button"
                    className="owner-notification-item"
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <span
                      className={`owner-notification-icon${isDeviation ? ' owner-notification-warning' : ''}`}
                    >
                      {isDeviation ? <AlertTriangle size={20} /> : <Bell size={20} />}
                    </span>
                    <span className="owner-notification-copy">
                      <strong>{notif.title}</strong>
                      <span>{notif.message}</span>
                      <time dateTime={notif.createdAt || undefined}>
                        {datetime(notif.createdAt)}
                      </time>
                    </span>
                    {!notif.isRead && (
                      <span
                        className="owner-notification-dot"
                        aria-label="Chưa xem"
                      />
                    )}
                  </button>
                </li>
              );
            })}

            {/* 2. Danh sách báo cáo quản lý kho */}
            {(reports.data?.items || []).map((report) => (
              <li key={report.id}>
                <Link
                  className="owner-notification-item"
                  to={`/owner/manager-reports/${report.id}`}
                  state={{ from: location.pathname + location.search }}
                  onClick={() => setNotificationsOpen(false)}
                >
                  <span className="owner-notification-icon">
                    <FileText size={22} aria-hidden="true" />
                  </span>
                  <span className="owner-notification-copy">
                    <strong>{report.title || report.code}</strong>
                    <span>Báo cáo {report.code} đang chờ bạn xem</span>
                    <time dateTime={report.submittedAt || undefined}>
                      {datetime(report.submittedAt)}
                    </time>
                  </span>
                  <span className="owner-notification-dot" aria-label="Chưa xem" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        className="owner-notifications-footer"
        to="/owner/manager-reports"
        onClick={() => setNotificationsOpen(false)}
      >
        Xem báo cáo quản lý kho
      </Link>
    </section>
  );

  return <>
    <div className="owner-header-search-desktop">{searchField}</div>
    <div className="owner-header-search-mobile"><Popover trigger="click" placement="bottomRight" open={searchOpen} overlayClassName="owner-search-popover"
      onOpenChange={(open) => { setSearchOpen(open); if (open) setNotificationsOpen(false); }} content={searchField}>
      <Button type="text" className="owner-icon-button" aria-label="Mở tìm kiếm" aria-expanded={searchOpen} icon={<Search size={20} />} />
    </Popover></div>
    <Popover trigger="click" placement="bottomRight" open={notificationsOpen} content={notifications} overlayClassName="owner-notifications-popover"
      onOpenChange={(open) => { setNotificationsOpen(open); if (open) { setSearchOpen(false); fetchSystemNotifications(); reports.reload(); business.reload(); } }}>
      <Button type="text" className={`owner-icon-button${notificationsOpen ? ' owner-notifications-active' : ''}`}
        aria-label={`Thông báo${totalUnread === 0 ? '' : `: ${totalUnread} chưa xem`}`} aria-expanded={notificationsOpen}>
        <Badge count={totalUnread || 0} size="small" overflowCount={99}><Bell size={20} /></Badge>
      </Button>
    </Popover>
  </>;
}

// Dùng chính khoảng thời gian và nguồn bán đã tạo cảnh báo khi mở phần chi tiết.
function businessAlerts(data, filters) {
  if (!data) return [];
  const { activity, policy, worklist } = data;
  const above = activity.channels.filter(row => row.turnbackRate >= policy.alertRate);
  const overall = activity.turnbackRate >= policy.alertRate;
  const overdue = worklist.filter(row => row.overdue);
  const search = new URLSearchParams(filters).toString();
  const target = section => `/owner/dashboard?${search}#${section}`;
  const alerts = [];
  if (overall || above.length) {
    const rates = [overall ? `Tổng ${quantity(activity.turnbackRate)}%` : '',
      ...above.map(row => `${channelLabels[row.channel]} ${quantity(row.turnbackRate)}%`)].filter(Boolean);
    alerts.push({ key: `returns:${search}:${rates.join(',')}`, title: `Tỷ lệ quay đầu từ ${policy.alertRate}%`,
      message: rates.join(' · '), to: target('owner-delivery-performance') });
  }
  if (overdue.length) {
    alerts.push({ key: `overdue:${search}:${overdue.map(row => row.id).sort().join(',')}`,
      title: `${quantity(overdue.length)} đơn hoàn quá hạn`,
      message: 'Xem các đơn còn chờ kiểm hàng hoặc nhập lại kho.', to: target('owner-return-processing') });
  }
  return alerts;
}
