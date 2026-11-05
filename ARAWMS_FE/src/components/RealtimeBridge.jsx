import { useEffect } from 'react';
import { io } from 'socket.io-client';

const socketOrigin = () => {
  const configured = import.meta.env.VITE_SOCKET_URL;
  if (configured) return configured;
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  return apiBase?.startsWith('http') ? new URL(apiBase).origin : undefined;
};

/** Converts server warehouse events into app-wide browser events for active pages to refresh. */
export default function RealtimeBridge() {
  useEffect(() => {
    const socket = io(socketOrigin(), { path: '/socket.io', transports: ['websocket', 'polling'] });
    const onStock = (payload) => window.dispatchEvent(new CustomEvent('arawms-finished-goods-realtime', { detail: payload }));
    const onProduct = (payload) => window.dispatchEvent(new CustomEvent('arawms-product-description-realtime', { detail: payload }));
    const onPutaway = (payload) => window.dispatchEvent(new CustomEvent('arawms-putaway-realtime', { detail: payload }));
    socket.on('finished-goods:changed', onStock);
    socket.on('catalog:product-updated', onProduct);
    socket.on('warehouse-putaway:changed', onPutaway);
    return () => { socket.off('finished-goods:changed', onStock); socket.off('catalog:product-updated', onProduct);
      socket.off('warehouse-putaway:changed', onPutaway); socket.disconnect(); };
  }, []);
  return null;
}
