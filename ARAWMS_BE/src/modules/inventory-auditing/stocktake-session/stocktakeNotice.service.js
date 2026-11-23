/*
 * File: stocktakeNotice.service.js
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: Báo lịch kiểm kê cho nhân viên kỹ thuật được giao (chuẩn bị đi kiểm) và nhân viên kho
 * (kho thành phẩm khóa đóng hàng trong khung giờ đó). Kèm danh sách lịch sắp tới / đang diễn ra cho dải thông báo.
 */
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import { createNotification } from '../../notifications/notification.service.js';
import { publishRealtime } from '../../../common/services/realtime.js';
import { notifyWorkflow, ROLE_PAGES } from '../../../common/services/workflowNotify.js';

/** Phát `stocktake:changed` để trang kiểm kê (quản lý, kỹ thuật) và dải lịch kiểm kê tự tải lại. */
export const publishStocktakeChanged = (session, step) => {
  if (!session) return;
  publishRealtime('stocktake:changed', { sessionId: String(session._id), sessionCode: session.sessionCode,
    status: session.status, warehouseType: session.warehouseType, step });
};

/**
 * Thông báo các bước sau khi kiểm: kỹ thuật nộp báo cáo → Quản lý kho; Quản lý duyệt → kỹ thuật;
 * điều chỉnh tồn → Kế toán (giá trị tồn kho thay đổi) và kỹ thuật.
 */
export function announceStocktakeStep(session, step, user, extra = {}) {
  if (!session) return;
  publishStocktakeChanged(session, step);
  const code = session.sessionCode;
  const where = `${WAREHOUSE[session.warehouseType] || 'kho'}${session.zoneCode ? ` · khu ${session.zoneCode}` : ''}`;
  const inspector = session.inspectorId
    ? [{ userId: session.inspectorId, role: 'GARMENT_TECHNICIAN', url: ROLE_PAGES.GARMENT_TECHNICIAN.stocktake }] : [];
  const base = { actor: user, metadata: { stocktakeSessionId: String(session._id), sessionCode: code, status: session.status } };
  if (step === 'SUBMITTED') {
    notifyWorkflow({ ...base, type: 'INVENTORY_VARIANCE', priority: extra.hasIssues ? 'HIGH' : 'NORMAL',
      roles: { WAREHOUSE_MANAGER: `${ROLE_PAGES.WAREHOUSE_MANAGER.stocktake}/${session._id}` },
      title: `Báo cáo kiểm kê chờ duyệt: ${code}`,
      message: `${user?.fullName || 'Nhân viên kỹ thuật'} đã nộp báo cáo kiểm kê ${where}${extra.discrepancies ? `, ${extra.discrepancies} dòng lệch` : ', không có chênh lệch'}.` });
  } else if (step === 'APPROVED') {
    notifyWorkflow({ ...base, type: 'INVENTORY_VARIANCE', users: inspector,
      title: `Báo cáo kiểm kê đã được duyệt: ${code}`,
      message: `Quản lý kho đã duyệt báo cáo kiểm kê ${code} (${where}).` });
  } else if (step === 'RECOUNT') {
    notifyWorkflow({ ...base, type: 'INVENTORY_VARIANCE', priority: 'HIGH', users: inspector,
      title: `Báo cáo kiểm kê bị trả về: ${code}`,
      message: `Quản lý kho yêu cầu kiểm kê lại ${code}${extra.reason ? `. Lý do: ${extra.reason}` : ''}${extra.recountCode ? `. Phiên kiểm lại: ${extra.recountCode}` : ''}.` });
  } else if (step === 'ADJUSTED') {
    const accountantUrl = session.warehouseType === 'FINISHED_GOODS'
      ? ROLE_PAGES.ACCOUNTANT.productValuation : ROLE_PAGES.ACCOUNTANT.materialValuation;
    notifyWorkflow({ ...base, type: 'INVENTORY_VARIANCE', roles: { ACCOUNTANT: accountantUrl },
      title: `Điều chỉnh tồn kho sau kiểm kê: ${code}`,
      message: `Quản lý kho đã điều chỉnh tồn ${where} theo kết quả kiểm kê ${code} (${extra.quantityAdjustedLines || 0} dòng điều chỉnh${extra.writtenOffUnits ? `, ${extra.writtenOffUnits} đơn vị xóa sổ` : ''}). Giá trị tồn kho đã thay đổi.` });
    notifyWorkflow({ ...base, type: 'INVENTORY_VARIANCE', users: inspector,
      title: `Đã điều chỉnh tồn theo kiểm kê: ${code}`,
      message: `Tồn kho ${where} đã được điều chỉnh theo báo cáo ${code} của bạn.` });
  }
}

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
      ? `Kho sẽ kiểm kê lúc ${windowText(session)}. Trong khung giờ này chức năng đóng hàng bị khóa; đơn đang đóng dở khi bắt đầu kiểm kê sẽ không được ghi nhận và phải đóng lại sau. Bàn giao đơn đã đóng cho đơn vị vận chuyển vẫn thực hiện bình thường.`
      : `Kho sẽ kiểm kê lúc ${windowText(session)}. Hạn chế di chuyển hàng trong khu được kiểm.` }));
  const results = await Promise.allSettled(jobs);
  for (const result of results) if (result.status === 'rejected') console.error('[stocktake] Không gửi được thông báo:', result.reason?.message);
  publishStocktakeChanged(session, recount ? 'RECOUNT_SCHEDULED' : 'SCHEDULED');
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
