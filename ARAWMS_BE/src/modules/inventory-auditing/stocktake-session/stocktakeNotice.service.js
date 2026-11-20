/*
 * File: stocktakeNotice.service.js
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: Báo lịch kiểm kê cho nhân viên kỹ thuật được giao (chuẩn bị đi kiểm) và nhân viên kho
 * (kho thành phẩm khóa đóng hàng trong khung giờ đó). Kèm danh sách lịch sắp tới / đang diễn ra cho dải thông báo.
 */
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import { createNotification } from '../../notifications/notification.service.js';

const WAREHOUSE = { RAW_MATERIAL: 'kho nguyên phụ liệu', FINISHED_GOODS: 'kho thành phẩm', ALL: 'toàn bộ kho' };
export const locksPacking = (session) => ['FINISHED_GOODS', 'ALL'].includes(session.warehouseType);
const vnClock = (date) => new Date(date).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
const vnDate = (date) => new Date(date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });
// Vd "22/11/2026 · 07:30 – 09:30"; khung giờ qua ngày khác thì ghi rõ ngày kết thúc.
export const windowText = (session) => vnDate(session.scheduledAt) === vnDate(session.dueAt)
  ? `${vnDate(session.scheduledAt)} · ${vnClock(session.scheduledAt)} – ${vnClock(session.dueAt)}`
  : `${vnDate(session.scheduledAt)} ${vnClock(session.scheduledAt)} – ${vnDate(session.dueAt)} ${vnClock(session.dueAt)}`;

/** Gửi thông báo khi phát lệnh kiểm kê (hoặc kiểm lại). Lỗi gửi thông báo không làm hỏng việc tạo lệnh. */
export async function notifyStocktakeScheduled(session, user, { recount = false } = {}) {
  const where = `${WAREHOUSE[session.warehouseType] || 'kho'}${session.zoneCode ? ` · khu ${session.zoneCode}` : ''}`;
  const common = { type: 'STOCKTAKE_SCHEDULED', priority: 'HIGH', senderUserId: user?._id, senderRole: user?.roleCode || 'WAREHOUSE_MANAGER',
    metadata: { stocktakeSessionId: session._id, sessionCode: session.sessionCode, from: session.scheduledAt, to: session.dueAt, locksPacking: locksPacking(session) } };
  const jobs = [];
  if (session.inspectorId) {
    jobs.push(createNotification({ ...common, recipientRole: 'GARMENT_TECHNICIAN', recipientUserId: session.inspectorId,
      title: `${recount ? 'Kiểm kê lại' : 'Lịch kiểm kê'} ${session.sessionCode}: ${windowText(session)}`,
      message: `Bạn được giao kiểm kê ${where} lúc ${windowText(session)}. Chuẩn bị máy quét và có mặt đúng giờ.${session.instructions ? ` Hướng dẫn: ${session.instructions}` : ''}`.slice(0, 2000),
      targetUrl: '/garment/stocktake-execution' }));
  }
  jobs.push(createNotification({ ...common, recipientRole: 'WAREHOUSE_STAFF',
    title: `Kiểm kê ${where}: ${windowText(session)}`,
    message: locksPacking(session)
      ? `Kho sẽ kiểm kê lúc ${windowText(session)}. Trong khung giờ này chức năng đóng hàng bị khóa; đơn đang đóng dở khi bắt đầu kiểm kê sẽ không được ghi nhận và phải đóng lại sau.`
      : `Kho sẽ kiểm kê lúc ${windowText(session)}. Hạn chế di chuyển hàng trong khu được kiểm.` }));
  const results = await Promise.allSettled(jobs);
  for (const result of results) if (result.status === 'rejected') console.error('[stocktake] Không gửi được thông báo:', result.reason?.message);
}

/** Lịch kiểm kê sắp tới (7 ngày) hoặc đang diễn ra, cho dải thông báo của nhân viên kho / kỹ thuật. */
export async function upcomingStocktakes(user) {
  const now = new Date();
  const filter = { isDeleted: { $ne: true }, status: { $in: ['WAITING', 'FROZEN_COUNTING'] },
    dueAt: { $gt: now }, scheduledAt: { $lte: new Date(now.getTime() + 7 * 86400000) } };
  // Kỹ thuật chỉ cần lịch mình được giao; kho cần mọi lịch (để biết khi nào khóa đóng hàng).
  if (user?.roleCode === 'GARMENT_TECHNICIAN') filter.inspectorId = user._id;
  const sessions = await StocktakeSession.find(filter).sort({ scheduledAt: 1 }).limit(10)
    .select('sessionCode name warehouseType zoneCode scheduledAt dueAt status recountOfSessionId').lean();
  return sessions.map((session) => ({ ...session, locksPacking: locksPacking(session),
    active: session.scheduledAt <= now && session.dueAt > now }));
}
