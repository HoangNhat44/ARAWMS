/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * UC-12/13: Đủ 12 tháng, so sánh hai năm, tổng hợp quý; GBR-01 - Đọc dữ liệu chưa xóa.
 * Doanh thu trừ hoàn theo ngày duyệt tại Việt Nam, không tính giá vốn/lợi nhuận.
 */
import { readSalesPeriod, reportPeriod, ownerToday, salesSummary, percent } from './operationsReport.service.js';
import { salesReportScope } from './salesReportScope.js';
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
    return { month: i + 1, label: `Tháng ${i + 1}`, revenue: sales.revenue, orderValue: sales.orderValue, orders: sales.orders, returns: sales.returns, shipping: sales.shipping,
      paid: sales.paid, unpaid: sales.unpaid, late: sales.channels.reduce((s, r) => s + r.late, 0) };
  });
}
export function compareMonths(current, previous) {
  return Array.from({ length: Math.max(current.length, previous.length) }, (_, i) => {
    const row = current[i], old = previous[i];
    return { ...row, label: (row || old).label, previous: old ?? null,
      revenueChange: row && old ? percent(row.revenue, old.revenue) : null };
  });
}
export function quarterRows(rows) {
  return Array.from({ length: Math.ceil(rows.length / 3) }, (_, i) => ({ label: `Quý ${i + 1}`, ...Object.fromEntries(['revenue', 'orderValue', 'orders', 'returns', 'shipping', 'paid', 'unpaid', 'late'].map((key) => [key, rows.slice(i * 3, i * 3 + 3).reduce((s, r) => s + (r[key] || 0), 0)])) }));
}
export async function annualReport(query, today = ownerToday()) {
  const year = Number(query.year), compareYear = Number(query.compareYear);
  if (![query.year, query.compareYear].every((v) => typeof v === 'string' && /^\d{4}$/.test(v)) || ![year, compareYear].every((v) => v >= 2000 && v <= 2200)) throw httpError(400, 'Chọn hai năm hợp lệ từ 2000 đến 2200.');
  const scope = salesReportScope(query);
  async function load(y) {
    const from = `${y}-01-01`;
    if (from > today) return [];
    const { range, to } = reportPeriod(from, `${y}-12-31`, today);
    const { orders, returns } = await readSalesPeriod(range, scope);
    return monthlyRows(orders, returns, y).slice(0, Number(to.slice(5, 7)));
  }
  const [current, previous] = await Promise.all([load(year), load(compareYear)]);
  return { year, compareYear, months: compareMonths(current, previous), quarters: compareMonths(quarterRows(current), quarterRows(previous)),
    basis: 'Năm hiện tại tính đến hôm nay theo giờ Việt Nam. Năm đã qua có đủ 12 tháng.' };
}

/**
 * Trả các điểm dữ liệu để vẽ xu hướng và so sánh đường; cùng cách tính với báo cáo tổng.
 * bucket=day chia theo ngày, mặc định chia theo tháng. Cả hai đều lọc chính xác from/to
 * trước khi gom nhóm, vì vậy tháng đầu/cuối không lấy thêm giao dịch ngoài khoảng đã chọn.
 */
export async function trendReport(query, today = ownerToday()) {
  const { range, to } = reportPeriod(query.from, query.to, today);
  if (query.bucket && !['day', 'month'].includes(query.bucket)) throw httpError(400, 'Cách chia thời gian không hợp lệ.');
  const { orders, returns } = await readSalesPeriod(range, salesReportScope(query));
  // Chuyển thời điểm về ngày/tháng Việt Nam trước khi gom, tránh lệch kỳ với giao dịch sát nửa đêm.
  const daily = query.bucket === 'day';
  const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateKey = (value) => { if (!value || !Number.isFinite(new Date(value).getTime())) return ''; return daily ? dayFormatter.format(new Date(value)) : monthKey(value); };
  const points = [];
  // Duyệt đủ các mốc lịch, kể cả mốc không có giao dịch; giá trị 0 chỉ phản ánh nhóm dữ liệu rỗng.
  const start = daily ? query.from : `${query.from.slice(0, 7)}-01`;
  for (let cursor = new Date(`${start}T00:00:00Z`); query.from <= to && cursor.toISOString().slice(0, daily ? 10 : 7) <= to.slice(0, daily ? 10 : 7); daily ? cursor.setUTCDate(cursor.getUTCDate() + 1) : cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const key = cursor.toISOString().slice(0, daily ? 10 : 7);
    const sales = salesSummary(orders.filter((r) => dateKey(r.warehouseFulfillment?.packedAt || r.createdAt) === key), returns.filter((r) => dateKey(r.financialAccounting?.approvedAt || r.createdAt) === key));
    points.push({ key, label: daily ? `${key.slice(8)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : `${key.slice(5)}/${key.slice(0, 4)}`, ...sales, late: sales.channels.reduce((sum, row) => sum + row.late, 0) });
  }
  // Giữ months cho biểu đồ tháng hiện có; points là đầu ra chung của cả chế độ ngày và tháng.
  return { months: daily ? [] : points, points, bucket: daily ? 'day' : 'month' };
}
