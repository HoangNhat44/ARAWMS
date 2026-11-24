import { useEffect } from 'react';
import { io } from 'socket.io-client';

const socketOrigin = () => {
  const configured = import.meta.env.VITE_SOCKET_URL;
  if (configured) return configured;
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase?.startsWith('http')) return new URL(apiBase).origin;
  // In dev, connect straight to the backend instead of through Vite's ws proxy,
  // which logs "write ECONNABORTED" every time the browser drops the socket (reload/HMR).
  if (import.meta.env.DEV) return `${window.location.protocol}//${window.location.hostname}:5000`;
  return undefined;
};

/** Sự kiện socket của server → sự kiện trình duyệt mà các trang đang mở lắng nghe để tự tải lại. */
export const REALTIME_EVENTS = {
  'finished-goods:changed': 'arawms-finished-goods-realtime',
  'catalog:product-updated': 'arawms-product-description-realtime',
  'warehouse-putaway:changed': 'arawms-putaway-realtime',
  'material-inbound-request:changed': 'arawms-material-request-realtime',
  'material-outbound:changed': 'arawms-material-outbound-realtime',
  // Luồng giữa Kế toán / Quản lý kho / Nhân viên kho / Kỹ thuật
  'material-inbound:changed': 'arawms-material-inbound-realtime',
  'inbound-plan:changed': 'arawms-inbound-plan-realtime',
  'technical-inbound:changed': 'arawms-technical-inbound-realtime',
  'remnant-return:changed': 'arawms-remnant-return-realtime',
  'stocktake:changed': 'arawms-stocktake-realtime',
};

/** Converts server warehouse events into app-wide browser events for active pages to refresh. */
export default function RealtimeBridge() {
  useEffect(() => {
    const socket = io(socketOrigin(), { path: '/socket.io', transports: ['websocket', 'polling'] });
    const handlers = Object.entries(REALTIME_EVENTS).map(([serverEvent, browserEvent]) => {
      const handler = (payload) => window.dispatchEvent(new CustomEvent(browserEvent, { detail: payload }));
      socket.on(serverEvent, handler);
      return [serverEvent, handler];
    });
    return () => {
      handlers.forEach(([serverEvent, handler]) => socket.off(serverEvent, handler));
      socket.disconnect();
    };
  }, []);
  return null;
}
