/*
 * Nguyễn Ngọc Huy - HE171157
 * Ngày: 14-11-2026
 * Chuẩn bị và đọc dữ liệu trình diễn dành riêng cho biểu đồ hàng hoàn của Owner.
 */
import mongoose from 'mongoose';
import { read } from './operationsReport.service.js';

const collectionName = 'owner_return_trend_demo';

// Tử số bom là một phần của số quay đầu. Mốc tháng 6 minh họa
// mẫu số bằng 0. Tháng 2 minh họa tỷ lệ 0% dù đã có đơn bàn giao.
const example = [
  [60, 3, 1, 0, 1, 'Dưới ngưỡng'], [70, 0, 0, 0, 0, 'Không có đơn quay đầu'],
  [80, 6, 0, 2, 0, 'Có quay đầu, chưa xác định đơn bom'], [100, 10, 6, 2, 1, 'Chạm ngưỡng'],
  [90, 18, 11, 3, 4, 'Vượt ngưỡng'], [0, 0, 0, 0, 0, 'Chưa có đơn bàn giao'],
  [75, 6, 2, 0, 2, 'Dưới ngưỡng'], [120, 12, 7, 4, 2, 'Chạm ngưỡng'],
  [100, 25, 16, 6, 5, 'Vượt ngưỡng'], [110, 6, 2, 1, 1, 'Giảm dưới ngưỡng'],
  [100, 10, 5, 2, 2, 'Tháng đang xem, tính đến ngày 14/11'],
];

// Mã cố định theo tháng để chạy lại an toàn và chỉ cập nhật bộ số liệu mẫu.
export function seedReturnTrendDemo() {
  return mongoose.connection.collection(collectionName).bulkWrite(example.map(([shipped, turnedBack, refused, lateInspection, lateRestock, scenario], index) => {
    const month = `2026-${String(index + 1).padStart(2, '0')}`;
    return { updateOne: { filter: { _id: month }, update: { $set: { month, shipped, turnedBack, refused, lateInspection, lateRestock, scenario } }, upsert: true } };
  }));
}

export async function returnTrendDemo() {
  const rows = await read(collectionName, {}, { month: 1, shipped: 1, turnedBack: 1, refused: 1, lateInspection: 1, lateRestock: 1, scenario: 1 });
  // Tính tỷ lệ từ số đếm để biểu đồ và bảng minh họa đối chiếu được với nhau.
  return rows.sort((a, b) => a.month.localeCompare(b.month)).map(({ month, shipped, turnedBack, refused, lateInspection = 0, lateRestock = 0, scenario }) => ({
    label: month.split('-').reverse().join('/'), shipped, turnedBack, refused, lateInspection, lateRestock, scenario,
    turnbackRate: shipped ? turnedBack / shipped * 100 : null,
    refusalRate: shipped ? refused / shipped * 100 : null,
  }));
}
