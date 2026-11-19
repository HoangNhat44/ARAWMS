/*
 * Nguyễn Ngọc Huy - HE171157
 * Ngày: 14-11-2026
 * Kiểm thử báo cáo mục 4.4 với MongoDB tạm và dữ liệu trình diễn của chủ cửa hàng.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { demoRecords } from '../scripts/seedOwnerDemo.js';
import { businessActivity, shippingReturn } from '../src/modules/managerial-financial-analytics/operations-report/businessActivity.service.js';
import { period, readSalesPeriod, salesSummary } from '../src/modules/managerial-financial-analytics/operations-report/operationsReport.service.js';
import { salesReportScope } from '../src/modules/managerial-financial-analytics/operations-report/salesReportScope.js';
import { annualReport, trendReport } from '../src/modules/managerial-financial-analytics/operations-report/annualReport.service.js';

test('Kết quả giao sau ngày xuất cập nhật đúng tỷ lệ, các kênh và tiến độ hàng hoàn', async () => {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());
    const groups = new Map();
    // Chèn riêng các bản ghi của kịch bản mục 4.4, không kết nối cơ sở dữ liệu ứng dụng.
    for (const { model, value } of demoRecords()) {
      const code = value.orderCode || value.customerCode || value.rmaCode || value.inspectionCode || value.ticketCode;
      if (!code?.startsWith('DEMO-OWNER-')) continue;
      if (!groups.has(model)) groups.set(model, []);
      groups.get(model).push(value);
    }
    for (const [model, values] of groups) await model.insertMany(values);

    const now = new Date('2026-11-14T18:00:00+07:00');
    const query = { from: '2026-11-10', to: '2026-11-10', compareFrom: '2025-11-10', compareTo: '2025-11-10', comparison: 'on' };
    const report = await businessActivity(query, now);
    assert.equal(report.activity.shipped, 100);
    assert.equal(report.activity.turnedBack, 10);
    assert.equal(report.activity.turnbackRate, 10);
    assert.equal(report.activity.newCustomers, 104);
    assert.equal(report.previous.turnbackRate, null);
    assert.equal(report.orderStatuses.find(row => row.status === 'CANCELLED').count, 1);

    const facebook = await businessActivity({ ...query, salesChannel: 'FACEBOOK' }, now);
    assert.equal(facebook.activity.shipped, 44);
    assert.equal(facebook.activity.turnedBack, 4);
    assert.equal(facebook.activity.refused, 2);
    const received = await businessActivity({ ...query, from: '2026-11-13', to: '2026-11-13' }, now);
    assert.equal(received.worklist.length, 7);
    assert.equal(received.worklist.filter(row => row.overdue).length, 5);
    assert.equal(received.worklist.filter(row => row.step === 'RESTOCKED').length, 1);
    const today = await businessActivity({ ...query, from: '2026-11-14', to: '2026-11-14' }, now);
    assert.equal(today.worklist.filter(row => row.carriedOver).length, 5);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('Phiếu hoàn ghi giảm đúng kênh và khách cũ được đối chiếu ngoài kỳ lọc', async () => {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());
    const customerId = new mongoose.Types.ObjectId();
    const firstOrder = new mongoose.Types.ObjectId();
    const older = new Date('2026-10-01T09:00:00+07:00');
    const newer = new Date('2026-11-01T09:00:00+07:00');
    const financialSummary = { itemsSubtotal: 100, discountAmount: 10, totalOrderAmount: 110 };
    const collection = mongoose.connection.collection('sales_orders');
    await mongoose.connection.collection('customers').insertOne({ _id: customerId, customerCode: 'HE171157-TEST' });
    await collection.insertMany([
      { _id: firstOrder, customerId, channel: 'SHOPEE', salesChannel: 'RETAIL', createdAt: older },
      { customerId, channel: 'FACEBOOK_MESSENGER', createdAt: newer, warehouseFulfillment: { packedAt: newer }, financialSummary },
    ]);
    await mongoose.connection.collection('return_requests').insertOne({
      originalOrderId: firstOrder, status: 'COMPLETED', createdAt: newer,
      financialAccounting: { approvedAt: newer, returnedMerchandiseValue: 15 },
    });
    const query = { from: '2026-11-01', to: '2026-11-30' };
    const range = period(query.from, query.to);
    const { orders, returns } = await readSalesPeriod(range, {});
    const sales = salesSummary(orders, returns);
    assert.equal(sales.channels.find(row => row.channel === 'UNKNOWN').revenue, 90);
    assert.equal(sales.channels.find(row => row.channel === 'SHOPEE').revenue, -15);
    assert.equal(sales.revenue, 75);
    assert.equal((await readSalesPeriod(range, salesReportScope({ salesChannel: 'SHOPEE' }))).returns.length, 1);
    assert.equal((await readSalesPeriod(range, salesReportScope({ salesChannel: 'UNKNOWN' }))).orders.length, 1);
    assert.equal((await businessActivity(query, newer)).activity.newCustomers, 0);
    const trend = await trendReport({ ...query, bucket: 'day' });
    assert.equal(trend.points.reduce((sum, point) => sum + point.revenue, 0), sales.revenue);
    const annual = await annualReport({ year: '2026', compareYear: '2025' }, '2026-11-14');
    assert.equal(annual.quarters[3].revenue, 75);
    assert.equal(annual.months[10].revenue, 75);
    assert.equal(annual.months[11].revenue, undefined);
    assert.equal(annual.months[11].previous.label, 'Tháng 12');
    const currentTrend = await trendReport({ from: '2026-11-01', to: '2026-11-30', bucket: 'day' }, '2026-11-14');
    assert.equal(currentTrend.points.at(-1).key, '2026-11-14');
    const futureTrend = await trendReport({ from: '2026-11-20', to: '2026-12-31' }, '2026-11-14');
    assert.deepEqual(futureTrend.points, []);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test('Hoàn sau khi giao hoặc thất lạc không được tính là quay đầu', () => {
  const handedOverAt = new Date('2026-11-10');
  const deliveredAt = new Date('2026-11-11');
  const returnedAt = new Date('2026-11-13');
  const asOf = new Date('2026-11-14');
  const order = {
    warehouseFulfillment: { handedOverAt, deliveredAt, ghnStatus: 'returned', ghnUpdatedAt: returnedAt },
    statusHistory: [{ to: 'RETURNED', at: returnedAt }],
  };
  assert.equal(shippingReturn(order, asOf).turnedBack, false);
  assert.equal(shippingReturn({
    warehouseFulfillment: { handedOverAt, ghnStatus: 'lost', ghnUpdatedAt: returnedAt },
    statusHistory: [{ to: 'RETURN_REQUESTED', at: returnedAt, note: 'Đồng bộ từ GHN: Hàng bị thất lạc' }],
  }, asOf).turnedBack, false);
});
