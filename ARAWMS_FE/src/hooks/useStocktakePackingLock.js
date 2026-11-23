/*
 * File: useStocktakePackingLock.js
 * Author: Duy Anh
 * Date: 2026-11-23
 * Description: Theo dõi lịch kiểm kê kho thành phẩm cho trang đóng hàng: lịch sắp tới (để báo trước)
 * và phiên đang diễn ra (để khóa đóng hàng đúng giờ, không chờ lần gọi API tiếp theo bị từ chối).
 */
import { useEffect, useState } from 'react';
import { stocktakeService } from '../services/stocktakeService';

const REFRESH_MS = 30_000;
const TICK_MS = 1_000;

/** Returns { active, upcoming, now }: active = phiên đang khóa đóng hàng, upcoming = phiên khóa sắp tới gần nhất. */
export function useStocktakePackingLock() {
  const [items, setItems] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = () => stocktakeService.announcements()
      .then((res) => { if (alive) setItems((res.data?.items || []).filter((item) => item.locksPacking)); })
      .catch(() => {});
    load();
    const refresh = setInterval(load, REFRESH_MS);
    // Tải lại ngay khi quay lại tab để không bỏ lỡ lệnh kiểm kê vừa phát.
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    // Lệnh kiểm kê mới / bắt đầu đếm phát qua socket → khóa đóng hàng cập nhật ngay
    window.addEventListener('arawms-stocktake-realtime', onFocus);
    return () => {
      alive = false; clearInterval(refresh);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('arawms-stocktake-realtime', onFocus);
    };
  }, []);

  // Đồng hồ cục bộ để chuyển sang trạng thái khóa đúng giây bắt đầu kiểm kê.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const time = (value) => new Date(value).getTime();
  const active = items.find((item) => time(item.scheduledAt) <= now && time(item.dueAt) > now) || null;
  const upcoming = items.filter((item) => time(item.scheduledAt) > now)
    .sort((a, b) => time(a.scheduledAt) - time(b.scheduledAt))[0] || null;
  return { active, upcoming, now };
}
