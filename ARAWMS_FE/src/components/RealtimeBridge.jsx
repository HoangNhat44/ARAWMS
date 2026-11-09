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

/** Converts server warehouse events into app-wide browser events for active pages to refresh. */
export default function RealtimeBridge() {
  useEffect(() => {
    const socket = io(socketOrigin(), { path: '/socket.io', transports: ['websocket', 'polling'] });
    const onStock = (payload) => window.dispatchEvent(new CustomEvent('arawms-finished-goods-realtime', { detail: payload }));
    const onProduct = (payload) => window.dispatchEvent(new CustomEvent('arawms-product-description-realtime', { detail: payload }));
    const onPutaway = (payload) => window.dispatchEvent(new CustomEvent('arawms-putaway-realtime', { detail: payload }));
    const onMaterialRequest = (payload) => window.dispatchEvent(new CustomEvent('arawms-material-request-realtime', { detail: payload }));
    const onMaterialOutbound = (payload) => window.dispatchEvent(new CustomEvent('arawms-material-outbound-realtime', { detail: payload }));
    socket.on('finished-goods:changed', onStock);
    socket.on('catalog:product-updated', onProduct);
    socket.on('warehouse-putaway:changed', onPutaway);
    socket.on('material-inbound-request:changed', onMaterialRequest);
    socket.on('material-outbound:changed', onMaterialOutbound);
    return () => {
      socket.off('finished-goods:changed', onStock);
      socket.off('catalog:product-updated', onProduct);
      socket.off('warehouse-putaway:changed', onPutaway);
      socket.off('material-inbound-request:changed', onMaterialRequest);
      socket.off('material-outbound:changed', onMaterialOutbound);
      socket.disconnect();
    };
  }, []);
  return null;
}
