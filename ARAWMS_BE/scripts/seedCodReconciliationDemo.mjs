/*
 * Seed dữ liệu demo cho trang Kế toán > Đối soát COD (accountant/cod-reconciliation).
 * Tạo các đơn COD đã giao/chuyển hoàn kèm kết quả đối soát GHN trả về:
 *   - Khớp COD (MATCHED)
 *   - Lệch COD ở các giai đoạn: chờ điều tra, đã khiếu nại, GHN đã phản hồi, đã xử lý xong
 *   - Hàng hoàn (COD = 0)
 *   - Đơn đã giao nhưng chưa đối soát (để bấm "Đồng bộ GHN")
 * Chạy lại được nhiều lần: dữ liệu cũ có tiền tố ORD-COD- sẽ được xóa trước.
 *
 * Usage: node scripts/seedCodReconciliationDemo.mjs
 */
import 'dotenv/config';
import dns from 'node:dns';
import mongoose from 'mongoose';
import {
  SalesOrder,
  ShippingCarrier,
  CodReconciliationBatch,
  CodReconciliationItem,
  User,
  Sku,
} from '../src/models/index.js';

const ORDER_PREFIX = 'ORD-COD-';
const STATEMENT_URL = 'DEMO_SEED_GHN_STATEMENT';
const DAY = 24 * 60 * 60 * 1000;

if (process.env.MONGODB_URI?.startsWith('mongodb+srv:')) dns.setServers(['8.8.8.8', '1.1.1.1']);

const vnd = (n) => `${Number(n).toLocaleString('vi-VN')} ₫`;

// Kịch bản: expected = tiền COD hệ thống, reported = tiền GHN báo thu
const SCENARIOS = [
  // ===== KHỚP COD =====
  { code: '001', name: 'Nguyễn Văn An', phone: '0901112233', address: '12 Nguyễn Trãi, Q.5, TP.HCM', qty: [1], ship: 30000, reported: 'EXACT', fee: 30000, status: 'DELIVERED', recon: 'MATCHED', daysAgo: 6 },
  { code: '002', name: 'Lê Thị Bình', phone: '0902223344', address: '45 Lê Lợi, Q.1, TP.HCM', qty: [1, 1], ship: 30000, reported: 'EXACT', fee: 32000, status: 'DELIVERED', recon: 'MATCHED', daysAgo: 5 },
  { code: '003', name: 'Trần Quốc Bảo', phone: '0913334455', address: '21 Cầu Giấy, Hà Nội', qty: [2], ship: 25000, reported: 'EXACT', fee: 25000, status: 'DELIVERED', recon: 'MATCHED', daysAgo: 4 },
  { code: '004', name: 'Phạm Thu Hà', phone: '0924445566', address: '9 Trần Phú, Hải Châu, Đà Nẵng', qty: [1], ship: 35000, reported: 'EXACT', fee: 35000, status: 'DELIVERED', recon: 'MATCHED', daysAgo: 3 },
  { code: '005', name: 'Võ Minh Khang', phone: '0935556677', address: '88 Lý Thường Kiệt, Q.10, TP.HCM', qty: [3], ship: 30000, reported: 'EXACT', fee: 30000, status: 'DELIVERED', recon: 'MATCHED', daysAgo: 2 },

  // ===== LỆCH COD =====
  // Shipper thu thiếu 50k - chờ kế toán điều tra
  { code: '006', name: 'Phạm Minh Cường', phone: '0903334455', address: '88 Quang Trung, Gò Vấp, TP.HCM', qty: [1, 1], ship: 30000, reported: -50000, fee: 30000, status: 'DELIVERED', recon: 'RED_FLAG_DISCREPANCY', flag: 'PENDING_INVESTIGATION', daysAgo: 4 },
  // Thu thiếu 20k - kế toán đã gửi khiếu nại GHN
  { code: '007', name: 'Đỗ Thị Hạnh', phone: '0946667788', address: '15 Hai Bà Trưng, Hoàn Kiếm, Hà Nội', qty: [1], ship: 30000, reported: -20000, fee: 30000, status: 'DELIVERED', recon: 'RED_FLAG_DISCREPANCY', flag: 'ESCALATED_TO_DISPUTE', daysAgo: 5 },
  // Thu thiếu 100k - GHN phản hồi: lỗi do shipper (GHN bồi hoàn)
  { code: '008', name: 'Bùi Văn Long', phone: '0957778899', address: '30 Nguyễn Văn Cừ, Ninh Kiều, Cần Thơ', qty: [2, 1], ship: 30000, reported: -100000, fee: 38000, status: 'DELIVERED', recon: 'RED_FLAG_DISCREPANCY', flag: 'CARRIER_FEEDBACK_RECEIVED', proposed: 'CARRIER_GHN', daysAgo: 6 },
  // Thu thiếu 30k - GHN phản hồi: shop tự giảm giá cho khách (lỗi phía shop)
  { code: '009', name: 'Ngô Thị Lan', phone: '0968889900', address: '7 Phan Chu Trinh, TP. Huế', qty: [1], ship: 30000, reported: -30000, fee: 30000, status: 'DELIVERED', recon: 'RED_FLAG_DISCREPANCY', flag: 'CARRIER_FEEDBACK_RECEIVED', proposed: 'ARA_STORE', daysAgo: 7 },
  // Thu dư 10k (GHN báo cao hơn) - chờ điều tra
  { code: '010', name: 'Hoàng Gia Huy', phone: '0979990011', address: '120 Điện Biên Phủ, Bình Thạnh, TP.HCM', qty: [1], ship: 30000, reported: 10000, fee: 30000, status: 'DELIVERED', recon: 'RED_FLAG_DISCREPANCY', flag: 'PENDING_INVESTIGATION', daysAgo: 3 },
  // Thu thiếu 40k - đã xử lý xong, lỗi GHN => công nợ tính theo tiền hệ thống
  { code: '011', name: 'Trịnh Văn Phúc', phone: '0981112233', address: '55 Nguyễn Thị Minh Khai, Q.3, TP.HCM', qty: [1, 1], ship: 30000, reported: -40000, fee: 30000, status: 'DELIVERED', recon: 'RESOLVED', flag: 'RESOLVED_ADJUSTED', proposed: 'CARRIER_GHN', resolved: 'CARRIER_GHN', daysAgo: 9 },
  // Thu thiếu 25k - đã xử lý xong, lỗi shop => công nợ tính theo tiền GHN báo
  { code: '012', name: 'Lý Thị Mai', phone: '0992223344', address: '18 Lê Duẩn, TP. Vinh, Nghệ An', qty: [1], ship: 30000, reported: -25000, fee: 30000, status: 'DELIVERED', recon: 'RESOLVED', flag: 'RESOLVED_ADJUSTED', proposed: 'ARA_STORE', resolved: 'ARA_STORE', daysAgo: 8 },
  // Hàng hoàn (boom hàng) - GHN báo COD = 0
  { code: '013', name: 'Hoàng Văn Dũng', phone: '0904445566', address: '102 Cộng Hòa, Tân Bình, TP.HCM', qty: [1], ship: 30000, reported: 'ZERO', fee: 45000, status: 'RETURNED', recon: 'RED_FLAG_DISCREPANCY', flag: 'PENDING_INVESTIGATION', reason: 'ORDER_NOT_FOUND', daysAgo: 5 },

  // ===== ĐÃ GIAO, CHƯA ĐỐI SOÁT (để test nút Đồng bộ GHN) =====
  { code: '014', name: 'Đặng Mai Phương', phone: '0905556677', address: '77 Hai Bà Trưng, Q.3, TP.HCM', qty: [1], ship: 30000, status: 'DELIVERED', recon: 'UNRECONCILED', daysAgo: 1 },
  { code: '015', name: 'Vũ Đức Thắng', phone: '0916667788', address: '3 Kim Mã, Ba Đình, Hà Nội', qty: [2], ship: 30000, status: 'DELIVERED', recon: 'UNRECONCILED', daysAgo: 1 },
];

function buildFeedback(s, variance, reported) {
  const v = vnd(Math.abs(variance));
  if (s.proposed === 'CARRIER_GHN') {
    return `[GHN CSKH phản hồi]: Bưu cục GHN đã làm việc với bưu tá giao tuyến. Shipper xác nhận do sơ suất đã thu thiếu ${v} của người nhận. Bưu cục GHN chấp thuận khiếu nại và sẽ bồi hoàn đủ ${v} vào kỳ thanh toán COD kế tiếp.`;
  }
  return `[GHN CSKH phản hồi]: Bưu cục GHN đã liên hệ người nhận đơn hàng. Người nhận cung cấp ảnh chụp tin nhắn xác nhận Shop đồng ý bớt ${v} do sản phẩm có lỗi nhỏ / thỏa thuận riêng, shipper thu ${vnd(reported)} đúng theo yêu cầu của khách. GHN từ chối bồi hoàn, đề nghị Shop tự cân đối sổ sách.`;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  const ghn = (await ShippingCarrier.findOne({ carrierCode: 'GHN' })) || (await ShippingCarrier.create({
    carrierCode: 'GHN', carrierName: 'Giao Hàng Nhanh', hotline: '1900 636677', baseShippingFee: 19000, isActive: true,
  }));
  const accountant = (await User.findOne({ employeeCode: 'KETOAN' }).select('_id')) || (await User.findOne().select('_id'));

  // Lấy customer/seller/SKU thật từ một đơn có sẵn để populate không bị lỗi
  const refOrder = await SalesOrder.findOne({ orderCode: { $not: new RegExp(`^${ORDER_PREFIX}`) }, 'items.0': { $exists: true } }).lean();
  if (!refOrder) throw new Error('Không tìm thấy đơn hàng tham chiếu để lấy customer/seller/SKU');
  const skus = await Sku.find({ isDeleted: { $ne: true } }).limit(5).lean();
  const skuPool = skus.length
    ? skus.map((k) => ({ skuId: k._id, skuCode: k.skuCode, skuBarcode: k.skuBarcode, productName: k.styleName, color: k.color, size: k.size, price: Number(k.retailPrice) || 299000, cogs: Number(k.unitCogs) || 0 }))
    : refOrder.items.map((i) => ({ skuId: i.skuId, skuCode: i.skuCode, skuBarcode: i.skuBarcode, productName: i.productName, color: i.color, size: i.size, price: i.unitSalePrice }));

  // Dọn dữ liệu demo cũ
  const oldOrders = await SalesOrder.find({ orderCode: new RegExp(`^${ORDER_PREFIX}`) }).select('_id').lean();
  await CodReconciliationItem.deleteMany({ $or: [{ orderCode: new RegExp(`^${ORDER_PREFIX}`) }, { salesOrderId: { $in: oldOrders.map((o) => o._id) } }] });
  await CodReconciliationBatch.deleteMany({ statementFileUrl: STATEMENT_URL });
  await SalesOrder.deleteMany({ orderCode: new RegExp(`^${ORDER_PREFIX}`) });

  const now = Date.now();
  const orderDocs = SCENARIOS.map((s, idx) => {
    const items = s.qty.map((q, i) => {
      const sku = skuPool[(idx + i) % skuPool.length];
      return {
        skuId: sku.skuId, skuCode: sku.skuCode, skuBarcode: sku.skuBarcode, productName: sku.productName,
        color: sku.color, size: sku.size, orderedQty: q, unitSalePrice: sku.price, unitCogsSnapshot: sku.cogs || 0,
      };
    });
    const subtotal = items.reduce((sum, i) => sum + i.orderedQty * i.unitSalePrice, 0);
    const total = subtotal + s.ship;
    const createdAt = new Date(now - (s.daysAgo + 2) * DAY);
    const handedOverAt = new Date(now - (s.daysAgo + 1) * DAY);
    const deliveredAt = new Date(now - s.daysAgo * DAY);
    const isReturned = s.status === 'RETURNED';
    s._expected = total;
    return {
      orderCode: `${ORDER_PREFIX}${s.code}`,
      customerId: refOrder.customerId,
      sellerId: refOrder.sellerId,
      status: s.status,
      paymentMethod: 'COD',
      isCustomerConfirmed: true,
      confirmedAt: createdAt,
      shippingRecipient: { name: s.name, phone: s.phone, address: s.address },
      items,
      financialSummary: {
        itemsSubtotal: subtotal, shippingFee: s.ship, discountAmount: 0, totalOrderAmount: total, expectedCodAmount: total,
      },
      warehouseFulfillment: {
        carrierId: ghn._id,
        carrierName: 'GHN',
        waybillCode: `LYDEMO${s.code}`,
        ghnStatus: isReturned ? 'returned' : 'delivered',
        ghnStatusName: isReturned ? 'Đã hoàn hàng' : 'Giao hàng thành công',
        ghnUpdatedAt: deliveredAt,
        handedOverAt,
        handedOverByName: 'Nhân viên kho',
        deliveredAt: isReturned ? undefined : deliveredAt,
      },
      deliveredAt: isReturned ? undefined : deliveredAt,
      codReconciliationStatus: s.recon,
      statusHistory: [
        { from: 'NONE', to: 'PENDING', at: createdAt, note: 'Tạo đơn hàng mới (demo)' },
        { from: 'PACKED', to: 'HANDED_OVER_CARRIER', at: handedOverAt },
        { from: 'HANDED_OVER_CARRIER', to: s.status, at: deliveredAt, note: isReturned ? 'Đồng bộ từ GHN: Đã hoàn hàng' : 'Đồng bộ từ GHN: Giao hàng thành công' },
      ],
      createdAt,
      updatedAt: deliveredAt,
    };
  });

  const inserted = await SalesOrder.insertMany(orderDocs, { timestamps: false });
  const byCode = new Map(inserted.map((o) => [o.orderCode, o]));

  // Batch đối soát (GHN trả về) cho các đơn đã có kết quả
  const reconciled = SCENARIOS.filter((s) => s.recon !== 'UNRECONCILED');
  const batch = await CodReconciliationBatch.create({
    batchCode: `BATCH-COD-DEMO-${String(now).slice(-6)}`,
    carrierId: ghn._id,
    uploadedByAccountantId: accountant._id,
    statementFileUrl: STATEMENT_URL,
    status: 'RECONCILING',
    totalWaybillsCount: reconciled.length,
  });

  let matched = 0; let redFlag = 0; let totalExpected = 0; let totalReported = 0; let totalDiscrepancy = 0;
  for (const s of reconciled) {
    const order = byCode.get(`${ORDER_PREFIX}${s.code}`);
    const expected = s._expected;
    const reported = s.reported === 'EXACT' ? expected : s.reported === 'ZERO' ? 0 : expected + s.reported;
    const variance = expected - reported;
    const isRedFlag = variance !== 0;
    totalExpected += expected; totalReported += reported; totalDiscrepancy += Math.abs(variance);
    if (isRedFlag) redFlag++; else matched++;

    const item = {
      batchId: batch._id,
      carrierId: ghn._id,
      waybillCode: order.warehouseFulfillment.waybillCode,
      salesOrderId: order._id,
      orderCode: order.orderCode,
      systemExpectedCod: expected,
      carrierReportedCod: reported,
      carrierShippingFee: s.fee,
      varianceAmount: variance,
      isRedFlag,
      redFlagReason: isRedFlag ? (s.reason || 'COD_AMOUNT_MISMATCH') : 'NONE',
      redFlagStatus: isRedFlag ? s.flag : 'NONE',
      investigationNote: isRedFlag ? 'chưa ghi nhận lý do sai lệch' : 'Khớp số liệu hoàn hảo 100%',
      updatedByAccountantId: accountant._id,
    };

    if (s.flag === 'ESCALATED_TO_DISPUTE') {
      item.investigationNote = `Đã gửi khiếu nại GHN: shipper thu thiếu ${vnd(Math.abs(variance))} so với giá trị COD trên vận đơn.`;
    }
    if (s.proposed) {
      item.carrierDisputeFeedback = buildFeedback(s, variance, reported);
      item.carrierDisputeFeedbackAt = new Date(now - (s.daysAgo - 1) * DAY);
      item.carrierProposedFaultParty = s.proposed;
    }
    if (s.resolved) {
      item.resolvedFaultParty = s.resolved;
      item.resolvedCodAmount = s.resolved === 'ARA_STORE' ? reported : expected;
      item.investigationNote = s.resolved === 'ARA_STORE'
        ? 'Đã xác minh: Shop đồng ý giảm giá cho khách, ghi nhận công nợ theo số GHN thu thực tế.'
        : `Đã xác minh: lỗi shipper GHN, GHN bồi hoàn ${vnd(Math.abs(variance))} vào kỳ thanh toán COD kế tiếp.`;
      await SalesOrder.updateOne({ _id: order._id }, {
        'financialSummary.resolvedFaultParty': s.resolved,
        'financialSummary.actualCodAmount': item.resolvedCodAmount,
      });
    } else if (!isRedFlag) {
      await SalesOrder.updateOne({ _id: order._id }, { 'financialSummary.actualCodAmount': reported });
    }

    await CodReconciliationItem.create(item);
  }

  Object.assign(batch, {
    status: 'COMPLETED', matchedCount: matched, redFlagCount: redFlag,
    totalExpectedCodAmount: totalExpected, totalCarrierReportedCodAmount: totalReported, totalDiscrepancyAmount: totalDiscrepancy,
  });
  await batch.save();

  console.log(`Batch ${batch.batchCode}: ${matched} khớp, ${redFlag} lệch, tổng chênh lệch ${vnd(totalDiscrepancy)}`);
  console.table(SCENARIOS.map((s) => ({
    order: `${ORDER_PREFIX}${s.code}`, waybill: `LYDEMO${s.code}`, status: s.status, recon: s.recon, redFlag: s.flag || '-', expected: s._expected,
  })));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
