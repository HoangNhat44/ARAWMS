/*
 * File: useRealtimeRefresh.js
 * Description: Gọi lại hàm tải dữ liệu của trang khi RealtimeBridge phát một trong các sự kiện được chỉ định
 * (vd. 'arawms-stocktake-realtime'). Gom nhiều sự kiện liên tiếp thành một lần tải (debounce) để tránh gọi API dồn dập.
 */
import { useEffect, useRef } from 'react';

export function useRealtimeRefresh(events, refresh, { delay = 400 } = {}) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const key = (Array.isArray(events) ? events : [events]).join('|');

  useEffect(() => {
    const names = key.split('|').filter(Boolean);
    let timer = null;
    const handler = (event) => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current?.(event.detail), delay);
    };
    names.forEach((name) => window.addEventListener(name, handler));
    return () => {
      clearTimeout(timer);
      names.forEach((name) => window.removeEventListener(name, handler));
    };
  }, [key, delay]);
}

export default useRealtimeRefresh;
