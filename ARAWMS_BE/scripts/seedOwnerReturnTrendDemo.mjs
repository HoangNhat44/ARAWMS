/*
 * Nguyễn Ngọc Huy - HE171157
 * Ngày: 14-11-2026
 * Nạp các mốc trình diễn vào bộ sưu tập dành cho biểu đồ Owner.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { returnTrendDemo, seedReturnTrendDemo } from '../src/modules/managerial-financial-analytics/operations-report/returnTrendDemo.service.js';

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  await seedReturnTrendDemo();
  console.log(`MongoDB có ${(await returnTrendDemo()).length} mốc trình diễn xu hướng hàng hoàn.`);
} catch (error) {
  console.error(`Không thể nạp dữ liệu trình diễn: ${error.name}.`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
