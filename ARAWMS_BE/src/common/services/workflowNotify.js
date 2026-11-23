/*
 * File: workflowNotify.js
 * Description: Gửi thông báo nghiệp vụ giữa các role kho (Kế toán, Quản lý kho, Nhân viên kho,
 * Nhân viên kỹ thuật). Mỗi thông báo được lưu DB (chuông thông báo) và phát qua Socket.io
 * (sự kiện `new_notification`) để người nhận thấy ngay mà không cần tải lại trang.
 * Không bao giờ ném lỗi: thông báo hỏng không được làm hỏng nghiệp vụ chính.
 */
import { createNotification } from '../../modules/notifications/notification.service.js';
import { publishRealtime } from './realtime.js';

/** Trang mặc định của từng role khi bấm vào thông báo. */
export const ROLE_PAGES = {
  ACCOUNTANT: {
    inboundPlans: '/accountant/inbound-plans',
    deviations: '/accountant/contract-deviations',
    materialValuation: '/accountant/inventory-valuation',
    productValuation: '/accountant/product-valuation',
  },
  WAREHOUSE_MANAGER: {
    supplierInbound: '/warehouse/raw-materials/inbound',
    outbound: '/warehouse/raw-materials/outbound',
    technicalInbound: '/warehouse/technical-inbound',
    technicalOutbound: '/warehouse/technical-outbound',
    inboundProgress: '/warehouse/inbound-progress',
    finishedGoods: '/warehouse/finished-goods',
    stocktake: '/warehouse/stocktake',
  },
  WAREHOUSE_STAFF: {
    putaway: '/warehouse/putaway',
    outbound: '/warehouse/staff/outbound',
    inboundProgress: '/warehouse/staff/inbound-progress',
  },
  GARMENT_TECHNICIAN: {
    inboundVerification: '/garment/material-inbound-verification',
    lots: '/garment/lots',
    finishedInspection: '/garment/finished-goods-inspection',
    returnInspection: '/garment/return-inspection',
    outboundRequest: '/garment/material-outbound-request',
    remnant: '/garment/remnant-recovery',
    stocktake: '/garment/stocktake-execution',
  },
};

const idOf = (value) => (value?._id || value ? String(value?._id || value) : null);

/**
 * @param {object} input
 * @param {Object<string,string>} [input.roles] role → targetUrl, gửi chung cho cả role.
 * @param {Array<{userId:any, role:string, url?:string}>} [input.users] người nhận đích danh.
 * @param {string} input.title
 * @param {string} input.message
 * @param {string} [input.type]
 * @param {string} [input.priority]
 * @param {object} [input.metadata]
 * @param {object} [input.actor] user thực hiện thao tác (không tự gửi cho chính mình).
 */
export function notifyWorkflow({ roles = {}, users = [], title, message, type = 'OTHER', priority = 'NORMAL', metadata = {}, actor = null }) {
  const actorId = idOf(actor);
  const common = {
    title, message, type, priority, metadata,
    senderUserId: actorId, senderRole: actor?.roleCode || 'SYSTEM',
  };
  const jobs = [];
  const seen = new Set();
  for (const target of users) {
    const userId = idOf(target?.userId);
    if (!userId || userId === actorId || seen.has(userId) || !target.role) continue;
    seen.add(userId);
    jobs.push(createNotification({ ...common, recipientRole: target.role, recipientUserId: userId,
      targetUrl: target.url || '' }));
  }
  for (const [role, url] of Object.entries(roles)) {
    if (!url && url !== '') continue;
    jobs.push(createNotification({ ...common, recipientRole: role, targetUrl: url }));
  }
  return Promise.allSettled(jobs).then((results) => {
    results.filter((r) => r.status === 'rejected')
      .forEach((r) => console.error('[workflowNotify] Không gửi được thông báo:', r.reason?.message));
    return results;
  });
}

/**
 * Kỹ thuật gửi phiếu nhập thành phẩm / hàng hoàn / lô → Quản lý kho: phát `technical-inbound:changed`
 * để trang "Nhập từ kỹ thuật" tự tải lại và báo chuông cho Quản lý kho.
 */
export function announceTechnicalInbound({ ticketCodes = [], label = 'phiếu nhập', detail = '', actor, rawMaterial = false }) {
  const codes = ticketCodes.filter(Boolean);
  if (!codes.length) return;
  publishRealtime(rawMaterial ? 'material-inbound-request:changed' : 'technical-inbound:changed', { ticketCodes: codes });
  notifyWorkflow({ actor, type: 'INBOUND_REQUEST', priority: 'HIGH',
    roles: { WAREHOUSE_MANAGER: rawMaterial ? ROLE_PAGES.WAREHOUSE_MANAGER.supplierInbound : ROLE_PAGES.WAREHOUSE_MANAGER.technicalInbound },
    title: `Yêu cầu nhập kho mới: ${codes.join(', ')}`,
    message: `${actor?.fullName || 'Nhân viên kỹ thuật'} đã gửi ${label} ${codes.join(', ')}${detail ? ` (${detail})` : ''}. Cần tiếp nhận và phân bổ vị trí.`,
    metadata: { ticketCodes: codes } });
}

export default notifyWorkflow;
