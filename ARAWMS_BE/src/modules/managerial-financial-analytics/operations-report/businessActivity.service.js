/*
 * Nguyễn Ngọc Huy - HE171157
 * Ngày: 14-11-2026
 * Phân tích khách mới, đơn quay đầu và tiến độ xử lý hàng hoàn của chủ cửa hàng.
 */
import mongoose from 'mongoose';
import { ORDER_STATUS } from '../../../common/constants/enums.js';
import { channels, salesChannelOf, salesReportScope } from './salesReportScope.js';
import { reportPeriod, read } from './operationsReport.service.js';

const timeZone = 'Asia/Ho_Chi_Minh';
const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
});
const dayMs = 86400000;
const returningCarrierStatuses = ['waiting_to_return', 'return', 'return_transporting', 'return_sorting', 'returning', 'returned'];
const returnOrderStatuses = ['RETURN_REQUESTED', 'RETURNED'];
const reasonCodes = ['CUSTOMER_REFUSED', 'INVALID_ORDER', 'PRODUCT_DEFECT', 'OTHER', 'UNKNOWN'];
const refusalReasons = ['CUSTOMER_REFUSED', 'INVALID_ORDER'];
const validPurchase = { status: { $ne: 'CANCELLED' }, orderType: { $ne: 'EXCHANGE_ORDER' } };
const active = { isDeleted: { $ne: true } };
const sourceFields = { salesChannel: 1, channel: 1, sourceDetails: 1, conversationId: 1 };
const rate = (count, total) => total ? count / total * 100 : null;
const contains = (range, date) => date && date >= range.$gte && date < range.$lt;
function groupBy(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[field]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

const returnPolicy = { alertRate: 10, inspectionHours: 24, restockHours: 24 };

// Chỉ tính quay đầu trước khi giao thành công. Phiếu đổi/trả sau khi giao có mẫu số
// khác nên chỉ theo dõi ở nhóm xử lý hàng hoàn. Lấy sự kiện đầu tiên nếu có lịch sử.
export function shippingReturn(order, asOf) {
  const fulfillment = order.warehouseFulfillment || {};
  const history = (order.statusHistory || []).filter(event => event.at && event.at <= asOf)
    .sort((a, b) => a.at - b.at);
  const shippedAt = fulfillment.handedOverAt;
  const carrierAt = fulfillment.ghnUpdatedAt;
  const deliveredAt = fulfillment.deliveredAt || order.deliveredAt
    || history.find(event => event.to === 'DELIVERED')?.at;
  const isCarrierReturn = returningCarrierStatuses.includes(fulfillment.ghnStatus) && carrierAt && carrierAt <= asOf;
  // Hệ thống vận chuyển dùng cùng mã đơn RETURN_REQUESTED cho hàng thất lạc/hư hỏng.
  // Bỏ sự kiện đồng bộ các ngoại lệ đó nếu chưa có tín hiệu chuyển hoàn thực tế.
  const carrierException = ['damage', 'lost', 'exception'].includes(fulfillment.ghnStatus);
  const event = history.find(row => returnOrderStatuses.includes(row.to) && (!shippedAt || row.at >= shippedAt)
    && !/thất lạc|bị hư hỏng|ngoại lệ/i.test(row.note || '')
    && !(carrierException && row.to === 'RETURN_REQUESTED' && !row.note));
  const startedAt = event?.at || (isCarrierReturn ? carrierAt : null);
  const arrivedAt = history.find(row => row.to === 'RETURNED' && (!shippedAt || row.at >= shippedAt))?.at
    || (isCarrierReturn && fulfillment.ghnStatus === 'returned' ? carrierAt : null);
  return {
    startedAt,
    arrivedAt,
    turnedBack: Boolean(shippedAt && startedAt && startedAt >= shippedAt && (!deliveredAt || startedAt < deliveredAt)),
  };
}

// Sau khi xác định tập khách trong kỳ, tìm đúng đơn hợp lệ đầu tiên trong toàn bộ
// lịch sử từng khách, gồm kênh khác. Thứ tự mã đơn nội bộ giải quyết trường hợp trùng giờ.
async function firstPurchases(range, scope) {
  return mongoose.connection.collection('sales_orders').aggregate([
    { $match: { ...active, ...validPurchase, ...scope, createdAt: range, customerId: { $ne: null } } },
    { $lookup: {
      from: 'sales_orders', localField: 'customerId', foreignField: 'customerId', as: 'first',
      pipeline: [{ $match: { ...active, ...validPurchase, createdAt: { $type: 'date' } } },
        { $sort: { createdAt: 1, _id: 1 } }, { $limit: 1 }, { $project: { _id: 1 } }],
    } },
    { $match: { $expr: { $eq: ['$_id', { $arrayElemAt: ['$first._id', 0] }] } } },
    { $lookup: {
      from: 'customers', localField: 'customerId', foreignField: '_id', as: 'identity',
      pipeline: [{ $match: { ...active, customerCode: { $ne: 'CUST-WALKIN' } } }, { $project: { _id: 1 } }],
    } },
    { $match: { 'identity.0': { $exists: true } } },
    { $project: sourceFields },
  ]).toArray();
}

// Mỗi lần chuyển hoàn chỉ được tính một lần theo đơn gốc. Ưu tiên mã lý do
// được ghi trong phiếu đang hiệu lực, chỉ tính bom với mã khách từ chối/đơn không hợp lệ.
function reasonFor(requests) {
  const known = requests.find(request => reasonCodes.includes(request.reasonCode) && request.reasonCode !== 'UNKNOWN');
  return known?.reasonCode || 'UNKNOWN';
}

export function summarizeActivity(shipped, newCustomers, requestsByOrder, range, asOf) {
  const rows = channels.map(channel => {
    const orders = shipped.filter(order => salesChannelOf(order) === channel);
    const returnDetails = orders.filter(order => shippingReturn(order, asOf).turnedBack).map(order => ({
      channel, code: order.orderCode, shippedAt: order.warehouseFulfillment.handedOverAt,
      reason: reasonFor(requestsByOrder.get(String(order._id)) || []),
    }));
    const refused = returnDetails.filter(row => refusalReasons.includes(row.reason)).length;
    return {
      channel, shipped: orders.length, turnedBack: returnDetails.length, refused, returnDetails,
      newCustomers: newCustomers.filter(order => salesChannelOf(order) === channel).length,
      turnbackRate: rate(returnDetails.length, orders.length), refusalRate: rate(refused, orders.length),
    };
  });
  const totals = Object.fromEntries(['shipped', 'turnedBack', 'refused', 'newCustomers']
    .map(key => [key, rows.reduce((total, row) => total + row[key], 0)]));
  const details = rows.flatMap(row => row.returnDetails);
  // Nhóm theo ngày xuất của cohort. Kỳ dài dùng tháng để còn đọc được trục biểu đồ.
  const daily = range.$lt - range.$gte <= 31 * dayMs;
  const keyOf = value => localDate.format(value).slice(0, daily ? 10 : 7);
  const byShipPeriod = groupBy(shipped.map(order => ({ key: keyOf(order.warehouseFulfillment.handedOverAt) })), 'key');
  const byReturnPeriod = groupBy(details.map(row => ({ ...row, key: keyOf(row.shippedAt) })), 'key');
  const cursor = new Date(`${localDate.format(range.$gte)}T00:00:00Z`);
  if (!daily) cursor.setUTCDate(1);
  const points = [];
  const endKey = keyOf(new Date(range.$lt - 1));
  while (cursor.toISOString().slice(0, daily ? 10 : 7) <= endKey) {
    const key = cursor.toISOString().slice(0, daily ? 10 : 7);
    const size = byShipPeriod.get(key)?.length || 0;
    const returned = byReturnPeriod.get(key) || [];
    points.push({
      label: key.split('-').reverse().join('/'), shipped: size, turnedBack: returned.length,
      turnbackRate: rate(returned.length, size),
      refusalRate: rate(returned.filter(row => refusalReasons.includes(row.reason)).length, size),
    });
    if (daily) cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return {
    ...totals, turnbackRate: rate(totals.turnedBack, totals.shipped),
    refusalRate: rate(totals.refused, totals.shipped),
    returnDetails: details.sort((a, b) => b.shippedAt - a.shippedAt),
    channels: rows.map(({ returnDetails, ...row }) => row),
    points,
  };
}

// Dùng dấu nhận từ vận chuyển và hồ sơ kiểm hàng. Chỉ đánh dấu đã nhập khi
// phiếu kho liên kết đã hoàn tất, độc lập với trạng thái của đơn bán hàng.
export function returnWorklist(orders, inspections, tickets, range, asOf, includeBacklog = false) {
  const inspectionsByOrder = groupBy(inspections, 'orderId');
  const ticketsById = new Map(tickets.map(ticket => [String(ticket._id), ticket]));
  return orders.flatMap(order => {
    const inspection = inspectionsByOrder.get(String(order._id))?.[0];
    const { arrivedAt } = shippingReturn(order, asOf);
    const receivedAt = [arrivedAt, inspection?.inspectedAt].filter(Boolean).sort((a, b) => a - b)[0];
    if (!receivedAt) return [];
    const ticket = ticketsById.get(String(inspection?.inboundTicketId));
    let step = 'WAIT_INSPECTION';
    if (inspection?.inspectionResult === 'FAILED') step = 'FAILED_INSPECTION';
    else if (inspection && ticket?.status === 'COMPLETED') step = 'RESTOCKED';
    else if (inspection) step = 'WAIT_RESTOCK';
    const deadline = step === 'WAIT_INSPECTION'
      ? new Date(+receivedAt + returnPolicy.inspectionHours * 3600000)
      : step === 'WAIT_RESTOCK' ? new Date(+inspection.inspectedAt + returnPolicy.restockHours * 3600000) : null;
    const carriedOver = receivedAt < range.$gte;
    // Bộ lọc ngày hôm nay vẫn hiện hàng đã nhận từ ngày trước đang chờ xử lý.
    if (!contains(range, receivedAt) && !(includeBacklog && carriedOver && deadline)) return [];
    return [{
      id: String(order._id), code: order.orderCode, channel: salesChannelOf(order), receivedAt,
      step, deadline, carriedOver, overdue: Boolean(deadline && asOf > deadline), ticket: ticket?.ticketCode,
    }];
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.receivedAt - a.receivedAt);
}

function loadShipped(range, scope, now) {
  // Preset có thể chứa ngày cuối kỳ trong tương lai. Chỉ đếm những bàn giao đã xảy ra.
  return read('sales_orders', { ...scope, 'warehouseFulfillment.handedOverAt': { ...range, $lte: now } }, {
    ...sourceFields, orderCode: 1, statusHistory: 1, warehouseFulfillment: 1, deliveredAt: 1,
  });
}

export async function businessActivity(query, now = new Date()) {
  const scope = salesReportScope(query);
  const today = localDate.format(now);
  const { range } = reportPeriod(query.from, query.to, today);
  const compare = query.comparison === 'on' ? reportPeriod(query.compareFrom, query.compareTo, today).range : null;
  const includeBacklog = query.from === today && query.to === today;
  const processingRange = includeBacklog ? { $lte: now } : range;
  const [shipped, previousShipped, customers, previousCustomers, created, windowInspections] = await Promise.all([
    loadShipped(range, scope, now), compare ? loadShipped(compare, scope, now) : [],
    firstPurchases(range, scope), compare ? firstPurchases(compare, scope) : [],
    read('sales_orders', { ...scope, createdAt: range }, { status: 1 }),
    read('return_inspections', { inspectedAt: processingRange }, { orderId: 1 }),
  ]);
  const [requests, returned] = await Promise.all([
    read('return_requests', {
      originalOrderId: { $in: [...shipped, ...previousShipped].map(order => order._id) },
      status: { $ne: 'REJECTED' }, createdAt: { $lte: now },
    }, { reasonCode: 1, originalOrderId: 1, createdAt: 1 }),
    // Sự kiện nhận có thể ở kỳ mới dù đơn đã xuất từ một kỳ trước.
    read('sales_orders', { ...scope, $or: [
      { _id: { $in: windowInspections.map(record => record.orderId) } },
      { statusHistory: { $elemMatch: { to: 'RETURNED', at: processingRange } } },
      { 'warehouseFulfillment.ghnStatus': 'returned', 'warehouseFulfillment.ghnUpdatedAt': processingRange },
    ] }, { ...sourceFields, orderCode: 1, statusHistory: 1, warehouseFulfillment: 1, deliveredAt: 1 }),
  ]);
  const inspections = await read('return_inspections', {
    orderId: { $in: returned.map(order => order._id) }, inspectedAt: { $lte: now },
  }, { inspectedAt: 1, orderId: 1, inspectionResult: 1, inboundTicketId: 1 });
  inspections.sort((a, b) => b.inspectedAt - a.inspectedAt);
  const tickets = await read('finished_goods_tickets', {
    _id: { $in: inspections.map(record => record.inboundTicketId).filter(Boolean) },
    ticketType: 'INBOUND_FROM_RETURN',
  }, { ticketCode: 1, status: 1 });
  const requestsByOrder = groupBy(requests.sort((a, b) => b.createdAt - a.createdAt), 'originalOrderId');
  return {
    activity: summarizeActivity(shipped, customers, requestsByOrder, range, now),
    previous: compare ? summarizeActivity(previousShipped, previousCustomers, requestsByOrder, compare, now) : null,
    orderStatuses: ORDER_STATUS.map(status => ({ status, count: created.filter(order => order.status === status).length })),
    worklist: returnWorklist(returned, inspections, tickets, range, now, includeBacklog),
    policy: returnPolicy,
  };
}
