/*
 * Nguyễn Ngọc Huy - HE171157
 * Ngày: 14-11-2026
 * Chuẩn hóa nguồn bán và thanh toán dành riêng cho các báo cáo của chủ cửa hàng.
 */
import { httpError } from '../../../common/utils/httpError.js';

export const channels = ['FACEBOOK', 'SHOPEE', 'TIKTOK', 'UNKNOWN'];
export const paymentStatuses = ['PAID', 'UNPAID', 'PARTIAL', 'REFUNDED', 'UNKNOWN'];

// Dùng cùng danh sách điều kiện khi đọc một đơn và khi lọc MongoDB. Nguồn bán rõ ràng
// ưu tiên hơn dữ liệu lịch sử; Messenger mặc định cần có cuộc hội thoại hoặc trang bán.
const rules = [
  ...channels.slice(0, 3).map(channel => [channel, { salesChannel: channel }]),
  ['SHOPEE', { channel: 'SHOPEE' }],
  ['TIKTOK', { channel: 'TIKTOK' }],
  ['FACEBOOK', { channel: 'FACEBOOK' }],
  ['SHOPEE', { 'sourceDetails.sourceType': 'SHOPEE_STORE' }],
  ['TIKTOK', { 'sourceDetails.sourceType': 'TIKTOK_SHOP' }],
  ['FACEBOOK', { channel: 'FACEBOOK_MESSENGER', conversationId: { $ne: null } }],
  ['FACEBOOK', { channel: 'FACEBOOK_MESSENGER', 'sourceDetails.sourceType': 'FANPAGE', 'sourceDetails.sourceId': { $nin: [null, ''], $exists: true } }],
];

export function salesChannelOf(order) {
  for (const [channel, conditions] of rules) {
    const matches = Object.entries(conditions).every(([path, expected]) => {
      const value = path.split('.').reduce((record, field) => record?.[field], order);
      if (expected.$nin) return value != null && !expected.$nin.includes(value);
      if (Object.hasOwn(expected, '$ne')) return value != null;
      return value === expected;
    });
    if (matches) return channel;
  }
  return 'UNKNOWN';
}

export function paymentStatusOf(order) {
  if (order.paymentStatus === 'PENDING') return 'UNPAID';
  return paymentStatuses.includes(order.paymentStatus) ? order.paymentStatus : 'UNKNOWN';
}

// Các nhánh có thứ tự loại trừ nhau, vì vậy một đơn chỉ xuất hiện trong một kênh.
export function salesReportScope({ salesChannel, paymentStatus }) {
  if (salesChannel && !channels.includes(salesChannel)) throw httpError(400, 'Nguồn bán không hợp lệ.');
  if (paymentStatus && !paymentStatuses.includes(paymentStatus)) throw httpError(400, 'Trạng thái thanh toán không hợp lệ.');
  const scope = {};
  if (salesChannel === 'UNKNOWN') {
    scope.$nor = rules.map(([, conditions]) => conditions);
  } else if (salesChannel) {
    scope.$and = [{ $or: rules.flatMap(([channel, conditions], index) => {
      if (channel !== salesChannel) return [];
      const earlier = rules.slice(0, index).filter(([other]) => other !== channel).map(([, conditions]) => conditions);
      return [{ ...conditions, ...(earlier.length ? { $nor: earlier } : {}) }];
    }) }];
  }
  if (paymentStatus) {
    scope.paymentStatus = {
      UNPAID: { $in: ['PENDING', 'UNPAID'] },
      UNKNOWN: { $nin: ['PENDING', 'UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'] },
    }[paymentStatus] || paymentStatus;
  }
  return scope;
}
