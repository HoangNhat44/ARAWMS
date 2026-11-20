/*
 * File: StocktakeNoticeBanner.jsx
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: Dải thông báo lịch kiểm kê sắp tới / đang diễn ra cho nhân viên kỹ thuật (chuẩn bị đi kiểm)
 * và nhân viên kho (đóng hàng bị khóa trong khung giờ kiểm kho thành phẩm). Tự làm mới mỗi phút.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { stocktakeService } from '../../services/stocktakeService';
import '../../styles/stocktakeNotice.css';

const WAREHOUSE = { RAW_MATERIAL: 'Kho nguyên phụ liệu', FINISHED_GOODS: 'Kho thành phẩm', ALL: 'Toàn bộ kho' };
const clock = (value) => new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const day = (value) => new Date(value).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });

export default function StocktakeNoticeBanner({ role }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => stocktakeService.announcements()
      .then((res) => { if (alive) setItems(res.data?.items || []); })
      .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  if (!items.length) return null;
  return <div className="stocktake-notice-stack" role="status">{items.map((item) => {
    const where = `${WAREHOUSE[item.warehouseType] || 'Kho'}${item.zoneCode ? ` · khu ${item.zoneCode}` : ''}`;
    const when = `${day(item.scheduledAt)} · ${clock(item.scheduledAt)} – ${clock(item.dueAt)}`;
    return <div key={item._id} className={`stocktake-notice${item.active ? ' is-active' : ''}`}>
      <strong>{item.active ? 'Đang kiểm kê' : 'Lịch kiểm kê'} {item.sessionCode}{item.recountOfSessionId ? ' (kiểm lại)' : ''}</strong>
      <span>{where} · {when}</span>
      {role === 'GARMENT_TECHNICIAN'
        ? <span>Bạn được giao kiểm kê đợt này. <Link to="/garment/stocktake-execution">Mở danh sách kiểm kê</Link></span>
        : item.locksPacking && <span>{item.active ? 'Chức năng đóng hàng đang bị khóa.' : 'Đóng hàng sẽ bị khóa trong khung giờ này; đơn đang đóng dở lúc bắt đầu kiểm kê phải đóng lại.'}</span>}
    </div>;
  })}</div>;
}
