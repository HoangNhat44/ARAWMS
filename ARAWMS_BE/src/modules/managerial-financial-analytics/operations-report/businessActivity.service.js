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
const returnOrderStatuses = ['RETURN_REQUESTED', 'RETURNED', 'RETURN_COMPLETED'];
// RETURNED = bưu kiện về tới kho; đơn KCS đạt trước đây ghi RETURNED, nay ghi RETURN_COMPLETED.
const returnArrivedStatuses = ['RETURNED', 'RETURN_COMPLETED'];
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
  const arrivedAt = history.find(row => returnArrivedStatuses.includes(row.to) && (!shippedAt || row.at >= shippedAt))?.at
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

export const BOM_REASONS = {
  CUSTOMER_REFUSED: 'Khách từ chối nhận hàng',
  UNREACHABLE_CUSTOMER: 'Khách không nghe máy / Thuê bao',
  WRONG_INFO: 'Sai địa chỉ / Số điện thoại',
  RESCHEDULE_EXCEEDED: 'Khách hẹn lại quá hạn / Giao nhiều lần',
  CARRIER_EXCEPTION: 'Sự cố vận chuyển / Hư hỏng / Thất lạc',
  INVALID_ORDER: 'Đơn hàng không hợp lệ',
  OTHER_CARRIER_FAIL: 'Giao không thành công (lý do khác)',
};

export const RETURN_REASONS = {
  SIZE_UNFIT: 'Không vừa kích thước / size',
  PRODUCT_DEFECT: 'Sản phẩm lỗi may mặc / lỗi vải',
  WRONG_ITEM: 'Giao nhầm mã / nhầm màu sản phẩm',
  DISLIKED_STYLE: 'Khách không ưng phom dáng',
  CHANGE_MIND: 'Khách đổi ý muốn mẫu khác',
  OTHER_RETURN: 'Lý do đổi trả khác',
};

// Chuẩn hóa phân loại lý do bom hàng
export function classifyBomReason(order, request) {
  const ghnReason = order?.warehouseFulfillment?.deliveryFailReason || order?.warehouseFulfillment?.ghnReason || order?.deliveryFailReason || '';
  const cancelReason = order?.cancelReason || '';
  const notes = (order?.statusHistory || []).map(h => h.note || '').join(' ');
  const text = `${ghnReason} ${cancelReason} ${notes} ${request?.reasonDescription || ''}`.toLowerCase();
  const code = request?.reasonCode || order?.reason;

  if (code === 'INVALID_ORDER' || /không hợp lệ|trùng đơn|đơn ảo/i.test(text)) {
    return 'INVALID_ORDER';
  }
  if (code === 'CUSTOMER_REFUSED' || /từ chối|không nhận|đổi ý không lấy|bom hàng/i.test(text)) {
    return 'CUSTOMER_REFUSED';
  }
  if (/không nghe máy|thuê bao|tắt máy|không liên lạc/i.test(text)) {
    return 'UNREACHABLE_CUSTOMER';
  }
  if (/sai địa chỉ|sai sđt|sai số điện thoại|ngoài vùng/i.test(text)) {
    return 'WRONG_INFO';
  }
  if (/hẹn lại|quá hạn|quá 3 lần|lưu kho/i.test(text)) {
    return 'RESCHEDULE_EXCEEDED';
  }
  if (/hư hỏng|thất lạc|mất hàng|bị ướt|bị rách|exception|damage|lost/i.test(text) ||
      ['damage', 'lost', 'exception'].includes(order?.warehouseFulfillment?.ghnStatus || order?.ghnStatus)) {
    return 'CARRIER_EXCEPTION';
  }
  return 'OTHER_CARRIER_FAIL';
}

// Chuẩn hóa phân loại lý do đổi / trả hàng
export function classifyReturnReason(request) {
  if (!request) return 'OTHER_RETURN';
  const text = `${request.reasonDescription || ''} ${request.reasonCode || ''}`.toLowerCase();

  if (/size|không vừa|chật|rộng|chật bụng|dài quá|ngắn quá/i.test(text)) {
    return 'SIZE_UNFIT';
  }
  if (request.reasonCode === 'PRODUCT_DEFECT' || /lỗi|vải|sút chỉ|đứt nút|rách|ố vàng|phai màu|lỗi xưởng/i.test(text)) {
    return 'PRODUCT_DEFECT';
  }
  if (/nhầm|sai mẫu|sai màu|sai mã|giao sai/i.test(text)) {
    return 'WRONG_ITEM';
  }
  if (/phom|dáng|không ưng|không hợp/i.test(text)) {
    return 'DISLIKED_STYLE';
  }
  if (/đổi ý|mẫu khác|thích màu khác|chọn mẫu khác/i.test(text)) {
    return 'CHANGE_MIND';
  }
  return 'OTHER_RETURN';
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
    const returnDetails = orders.filter(order => shippingReturn(order, asOf).turnedBack).map(order => {
      const reqs = requestsByOrder.get(String(order._id)) || [];
      const req = reqs[0];
      const amount = Number(order.financialSummary?.totalOrderAmount) || Number(order.totalOrderAmount) || 0;
      return {
        channel,
        code: order.orderCode,
        shippedAt: order.warehouseFulfillment?.handedOverAt,
        reason: reasonFor(reqs),
        amount,
        ghnStatus: order.warehouseFulfillment?.ghnStatus || 'returned',
        deliveryFailReason: order.warehouseFulfillment?.deliveryFailReason || order.cancelReason || '',
        request: req,
      };
    });
    const refused = returnDetails.filter(row => refusalReasons.includes(row.reason)).length;

    // Bom hàng theo kênh
    const bomItems = returnDetails.filter(row => refusalReasons.includes(row.reason));
    const bomAmount = bomItems.reduce((sum, item) => sum + item.amount, 0);

    // Đổi / trả theo kênh
    const rmaOrders = orders.filter(order => (requestsByOrder.get(String(order._id)) || []).length > 0);
    const returnItems = rmaOrders.map(order => {
      const req = (requestsByOrder.get(String(order._id)) || [])[0];
      const amount = Number(req?.financialAccounting?.returnedMerchandiseValue) ||
        Number(order.financialSummary?.totalOrderAmount) || Number(order.totalOrderAmount) || 0;
      const reasonKey = classifyReturnReason(req);
      return {
        channel,
        code: order.orderCode,
        rmaCode: req?.rmaCode || '',
        returnType: req?.returnType || 'RETURN_FOR_REFUND',
        returnTypeLabel: req?.returnType === 'EXCHANGE_PRODUCT' ? 'Đổi hàng' : 'Trả hàng hoàn tiền',
        createdAt: req?.createdAt || order.warehouseFulfillment?.handedOverAt,
        status: req?.status || order.status,
        reasonKey,
        reasonLabel: RETURN_REASONS[reasonKey] || req?.reasonDescription || 'Lý do khác',
        reasonDescription: req?.reasonDescription || '',
        amount,
      };
    });
    const returnAmount = returnItems.reduce((sum, item) => sum + item.amount, 0);
    const exchangeCount = returnItems.filter(item => item.returnType === 'EXCHANGE_PRODUCT').length;
    const refundCount = returnItems.filter(item => item.returnType === 'RETURN_FOR_REFUND').length;

    return {
      channel,
      shipped: orders.length,
      turnedBack: returnDetails.length,
      refused,
      turnbackRate: rate(returnDetails.length, orders.length),
      refusalRate: rate(refused, orders.length),
      newCustomers: newCustomers.filter(order => salesChannelOf(order) === channel).length,
      returnDetails,
      bom: {
        count: bomItems.length,
        rate: rate(bomItems.length, orders.length),
        amount: bomAmount,
      },
      returns: {
        count: returnItems.length,
        rate: rate(returnItems.length, orders.length),
        amount: returnAmount,
        exchangeCount,
        refundCount,
      },
    };
  });
  const totals = Object.fromEntries(['shipped', 'turnedBack', 'refused', 'newCustomers']
    .map(key => [key, rows.reduce((total, row) => total + row[key], 0)]));
  const details = rows.flatMap(row => row.returnDetails);

  // Phân tích toàn diện Bom hàng
  const allBomDetails = details.filter(row => refusalReasons.includes(row.reason)).map(row => {
    const reasonKey = classifyBomReason(row, row.request);
    return {
      code: row.code,
      channel: row.channel,
      shippedAt: row.shippedAt,
      amount: row.amount,
      ghnStatus: row.ghnStatus,
      reasonKey,
      reasonLabel: BOM_REASONS[reasonKey] || 'Khách từ chối nhận hàng',
      detailNote: row.deliveryFailReason || row.request?.reasonDescription || '',
    };
  });
  const bomAmount = allBomDetails.reduce((sum, item) => sum + item.amount, 0);

  const bomReasons = Object.entries(BOM_REASONS).map(([key, label]) => {
    const matching = allBomDetails.filter(item => item.reasonKey === key);
    return {
      key,
      label,
      count: matching.length,
      percentage: allBomDetails.length ? (matching.length / allBomDetails.length) * 100 : 0,
      amount: matching.reduce((sum, item) => sum + item.amount, 0),
    };
  }).filter(r => r.count > 0).sort((a, b) => b.count - a.count);

  // Phân tích toàn diện Đổi / Trả hàng
  const allReturnOrders = shipped.filter(order => (requestsByOrder.get(String(order._id)) || []).length > 0);
  const allReturnDetails = allReturnOrders.map(order => {
    const req = (requestsByOrder.get(String(order._id)) || [])[0];
    const amount = Number(req?.financialAccounting?.returnedMerchandiseValue) ||
      Number(order.financialSummary?.totalOrderAmount) || Number(order.totalOrderAmount) || 0;
    const reasonKey = classifyReturnReason(req);
    return {
      code: order.orderCode,
      rmaCode: req?.rmaCode || '',
      returnType: req?.returnType || 'RETURN_FOR_REFUND',
      returnTypeLabel: req?.returnType === 'EXCHANGE_PRODUCT' ? 'Đổi hàng' : 'Trả hàng hoàn tiền',
      channel: salesChannelOf(order),
      createdAt: req?.createdAt || order.warehouseFulfillment?.handedOverAt,
      status: req?.status || order.status,
      reasonKey,
      reasonLabel: RETURN_REASONS[reasonKey] || req?.reasonDescription || 'Lý do khác',
      reasonDescription: req?.reasonDescription || '',
      amount,
    };
  });
  const returnAmount = allReturnDetails.reduce((sum, item) => sum + item.amount, 0);
  const totalExchangeCount = allReturnDetails.filter(item => item.returnType === 'EXCHANGE_PRODUCT').length;
  const totalRefundCount = allReturnDetails.filter(item => item.returnType === 'RETURN_FOR_REFUND').length;

  const returnReasons = Object.entries(RETURN_REASONS).map(([key, label]) => {
    const matching = allReturnDetails.filter(item => item.reasonKey === key);
    return {
      key,
      label,
      count: matching.length,
      percentage: allReturnDetails.length ? (matching.length / allReturnDetails.length) * 100 : 0,
      amount: matching.reduce((sum, item) => sum + item.amount, 0),
    };
  }).filter(r => r.count > 0).sort((a, b) => b.count - a.count);

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
    const bomCountInPeriod = returned.filter(row => refusalReasons.includes(row.reason)).length;
    points.push({
      label: key.split('-').reverse().join('/'),
      shipped: size,
      turnedBack: returned.length,
      turnbackRate: rate(returned.length, size),
      refusalRate: rate(bomCountInPeriod, size),
      bomCount: bomCountInPeriod,
      bomRate: rate(bomCountInPeriod, size),
      returnCount: returned.length,
      returnRate: rate(returned.length, size),
    });
    if (daily) cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return {
    ...totals,
    turnbackRate: rate(totals.turnedBack, totals.shipped),
    refusalRate: rate(totals.refused, totals.shipped),
    returnDetails: details.sort((a, b) => b.shippedAt - a.shippedAt),
    channels: rows.map(({ returnDetails, ...row }) => row),
    points,
    // Phân mục BOM HÀNG tách riêng
    bom: {
      count: totals.refused,
      rate: rate(totals.refused, totals.shipped),
      amount: bomAmount,
      reasons: bomReasons,
      details: allBomDetails.sort((a, b) => (b.shippedAt || 0) - (a.shippedAt || 0)),
      channels: rows.map(r => ({
        channel: r.channel,
        shipped: r.shipped,
        count: r.bom.count,
        rate: r.bom.rate,
        amount: r.bom.amount,
      })),
    },
    // Phân mục ĐỔI / TRẢ HÀNG tách riêng
    returns: {
      count: allReturnDetails.length,
      rate: rate(allReturnDetails.length, totals.shipped),
      amount: returnAmount,
      exchangeCount: totalExchangeCount,
      exchangeRate: rate(totalExchangeCount, totals.shipped),
      refundCount: totalRefundCount,
      refundRate: rate(totalRefundCount, totals.shipped),
      reasons: returnReasons,
      details: allReturnDetails.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      channels: rows.map(r => ({
        channel: r.channel,
        shipped: r.shipped,
        count: r.returns.count,
        rate: r.returns.rate,
        amount: r.returns.amount,
        exchangeCount: r.returns.exchangeCount,
        refundCount: r.returns.refundCount,
      })),
    },
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
    totalOrderAmount: 1, financialSummary: 1, cancelReason: 1, linkedReturnRequestId: 1,
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
    read('sales_orders', { ...scope, createdAt: range }, { status: 1, totalOrderAmount: 1, financialSummary: 1 }),
    read('return_inspections', { inspectedAt: processingRange }, { orderId: 1 }),
  ]);
  const [requests, returned] = await Promise.all([
    read('return_requests', {
      originalOrderId: { $in: [...shipped, ...previousShipped].map(order => order._id) },
      status: { $ne: 'REJECTED' }, createdAt: { $lte: now },
    }, {
      reasonCode: 1, reasonDescription: 1, returnType: 1, rmaCode: 1,
      originalOrderId: 1, createdAt: 1, financialAccounting: 1, status: 1,
    }),
    // Sự kiện nhận có thể ở kỳ mới dù đơn đã xuất từ một kỳ trước.
    read('sales_orders', { ...scope, $or: [
      { _id: { $in: windowInspections.map(record => record.orderId) } },
      { statusHistory: { $elemMatch: { to: { $in: returnArrivedStatuses }, at: processingRange } } },
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
    orderStatuses: ORDER_STATUS.map(status => {
      const matching = created.filter(order => order.status === status);
      const totalAmount = matching.reduce((sum, order) => sum + (Number(order.financialSummary?.totalOrderAmount) || Number(order.totalOrderAmount) || 0), 0);
      return { status, count: matching.length, totalAmount };
    }),
    worklist: returnWorklist(returned, inspections, tickets, range, now, includeBacklog),
    policy: returnPolicy,
  };
}
