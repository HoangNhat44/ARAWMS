/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * UC-12/13: Đủ 12 tháng, so sánh hai năm, tổng hợp quý; GBR-01 - Đọc dữ liệu chưa xóa.
 * Doanh thu trừ hoàn theo ngày duyệt tại Việt Nam, không tính giá vốn/lợi nhuận.
 */
import { read, period, salesSummary, channels, percent } from './operationsReport.service.js';
import { httpError } from '../../../common/utils/httpError.js';
const localMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' });
const monthKey = (date) => {
  if (!date || !Number.isFinite(new Date(date).getTime())) return '';
  const parts = localMonth.formatToParts(new Date(date));
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
};
// UC-13: Tháng không có giao dịch vẫn có dòng bằng 0, giữ đúng vị trí trên trục 12 tháng.
export function monthlyRows(orders, returns, year) {
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const sales = salesSummary(orders.filter((r) => monthKey(r.warehouseFulfillment?.packedAt || r.createdAt) === key), returns.filter((r) => monthKey(r.financialAccounting?.approvedAt || r.createdAt) === key));
    return { month: i + 1, label: `Tháng ${i + 1}`, revenue: sales.revenue, orders: sales.orders, returns: sales.returns, shipping: sales.shipping,
      paid: sales.paid, unpaid: sales.unpaid, late: sales.channels.reduce((s, r) => s + r.late, 0) };
  });
}
export function compareMonths(current, previous) {
  return current.map((row, i) => ({ ...row, previous: previous[i], revenueChange: percent(row.revenue, previous[i].revenue) }));
}
export function quarterRows(rows) {
  return Array.from({ length: 4 }, (_, i) => ({ label: `Quý ${i + 1}`, ...Object.fromEntries(['revenue', 'orders', 'returns', 'shipping', 'paid', 'unpaid', 'late'].map((key) => [key, rows.slice(i * 3, i * 3 + 3).reduce((s, r) => s + (r[key] || 0), 0)])) }));
}
export async function annualReport(query) {
  const year = Number(query.year), compareYear = Number(query.compareYear);
  if (![query.year, query.compareYear].every((v) => typeof v === 'string' && /^\d{4}$/.test(v)) || ![year, compareYear].every((v) => v >= 2000 && v <= 2200)) throw httpError(400, 'Chọn hai năm hợp lệ từ 2000 đến 2200.');
  if (query.salesChannel && !channels.includes(query.salesChannel)) throw httpError(400, 'Nguồn bán không hợp lệ.');
  if (query.paymentStatus && !['PAID', 'UNPAID', 'PARTIAL', 'UNKNOWN'].includes(query.paymentStatus)) throw httpError(400, 'Tình trạng thanh toán không hợp lệ.');
  const scope = Object.fromEntries(['salesChannel', 'paymentStatus'].filter((k) => query[k]).map((k) => [k, query[k] === 'UNKNOWN' ? { $in: ['UNKNOWN', null] } : query[k]]));
  const linked = Object.keys(scope).length ? await read('sales_orders', scope, { _id: 1 }) : null;
  async function load(y) {
    const range = period(`${y}-01-01`, `${y}-12-31`);
    const [orders, returns] = await Promise.all([
      read('sales_orders', { ...scope, $or: [{ 'warehouseFulfillment.packedAt': range }, { 'warehouseFulfillment.packedAt': null, createdAt: range }] }),
      read('return_requests', { ...(linked ? { originalOrderId: { $in: linked.map((r) => r._id) } } : {}), $or: [{ 'financialAccounting.approvedAt': range }, { 'financialAccounting.approvedAt': null, createdAt: range }] }),
    ]);
    return monthlyRows(orders, returns, y);
  }
  const [current, previous] = await Promise.all([load(year), load(compareYear)]);
  return { year, compareYear, months: compareMonths(current, previous), quarters: compareMonths(quarterRows(current), quarterRows(previous)),
    basis: 'Biểu đồ năm luôn gồm tháng 1 đến tháng 12 và áp dụng nguồn bán, tình trạng thanh toán đang chọn. Tháng chưa có giao dịch ghi nhận là 0. Doanh thu trừ hàng hoàn đã duyệt theo tháng, phí vận chuyển tách riêng.' };
}
