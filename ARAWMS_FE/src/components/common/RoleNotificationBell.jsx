/*
 * File: RoleNotificationBell.jsx
 * Description: Chuông thông báo realtime trên header WMS (Quản lý kho, Nhân viên kho, Nhân viên kỹ thuật).
 * Dữ liệu lấy từ useRoleNotifications: lịch sử + sự kiện socket `new_notification`, không cần tải lại trang.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Badge, Button, Empty, Popover, Spin } from 'antd';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { useRoleNotifications } from '../../hooks/useRoleNotifications';

const PRIORITY_COLOR = { URGENT: '#cf1322', HIGH: '#d46b08', NORMAL: '#1677ff', LOW: '#8c8c8c' };

const timeAgo = (value) => {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return new Date(value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export default function RoleNotificationBell() {
  const location = useLocation();
  const [openPanel, setOpenPanel] = useState(false);
  const { items, unreadCount, loading, error, reload, open, markAllRead } = useRoleNotifications();

  useEffect(() => { setOpenPanel(false); }, [location.pathname]);

  const content = (
    <div style={{ width: 360, maxWidth: '86vw' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 8px', borderBottom: '1px solid #f0f0f0' }}>
        <strong style={{ fontSize: 14 }}>Thông báo{unreadCount ? ` (${unreadCount} chưa đọc)` : ''}</strong>
        <span style={{ display: 'flex', gap: 4 }}>
          <Button size="small" type="text" icon={<RefreshCw size={14} />} onClick={reload} aria-label="Tải lại thông báo" />
          <Button size="small" type="text" icon={<CheckCheck size={14} />} disabled={!unreadCount} onClick={markAllRead}>
            Đọc hết
          </Button>
        </span>
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {loading && !items.length ? <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>
          : error && !items.length ? <div style={{ padding: 16, color: '#cf1322', fontSize: 13 }}>{error}</div>
            : !items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông báo" />
              : items.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => { setOpenPanel(false); open(item); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 0, cursor: 'pointer',
                    padding: '10px 8px', borderBottom: '1px solid #f5f5f5',
                    background: item.isRead ? 'transparent' : '#f0f7ff',
                    borderLeft: `3px solid ${item.isRead ? 'transparent' : PRIORITY_COLOR[item.priority] || PRIORITY_COLOR.NORMAL}`,
                  }}
                >
                  <div style={{ fontWeight: item.isRead ? 500 : 700, fontSize: 13, color: '#1f1f1f' }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#595959', marginTop: 2, lineHeight: 1.45 }}>{item.message}</div>
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>{timeAgo(item.createdAt)}</div>
                </button>
              ))}
      </div>
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomRight" open={openPanel} onOpenChange={setOpenPanel} content={content}>
      <Button
        type="text"
        className="wms-icon-button"
        aria-label={`Thông báo${unreadCount > 0 ? `: ${unreadCount} chưa xem` : ''}`}
      >
        <Badge count={unreadCount} size="small" overflowCount={99}>
          <Bell size={18} />
        </Badge>
      </Button>
    </Popover>
  );
}
