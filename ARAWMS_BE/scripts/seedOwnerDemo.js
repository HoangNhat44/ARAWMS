/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * UC-12/13/19, phản hồi 1–7: Dữ liệu trình diễn liên kết hợp đồng → kế hoạch → phiếu → sổ kho.
 * Chạy lại không ghi đè dữ liệu; không tạo tài khoản/mật khẩu. --dry-run kiểm tra schema trước khi kết nối.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import RawMaterial from '../src/models/RawMaterial.model.js';
import Supplier from '../src/models/Supplier.model.js';
import SupplierContract from '../src/models/SupplierContract.model.js';
import MaterialInboundPlan from '../src/models/MaterialInboundPlan.model.js';
import MaterialTicket from '../src/models/MaterialTicket.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import ProductionOrder from '../src/models/ProductionOrder.model.js';
import SalesOrder from '../src/models/SalesOrder.model.js';
import ReturnRequest from '../src/models/ReturnRequest.model.js';
import ReturnInspection from '../src/models/ReturnInspection.model.js';
import Sku from '../src/models/Sku.model.js';
import StocktakeSession from '../src/models/StocktakeSession.model.js';
import CashFlowVoucher from '../src/models/CashFlowVoucher.model.js';
import Product from '../src/models/Product.model.js';
import Customer from '../src/models/Customer.model.js';
import FinishedGoodsTicket from '../src/models/FinishedGoodsTicket.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';
import StocktakeRecord from '../src/models/StocktakeRecord.model.js';
import Bom from '../src/models/Bom.model.js';
import { catalogRecords } from './demoCatalog.js';

const id = (n) => new mongoose.Types.ObjectId(`de202600${n.toString(16).padStart(16, '0')}`);
const at = (year, month, day = 2) => new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T09:00:00+07:00`);
// Phản hồi 7: Đơn vị lưu theo từng mặt hàng, không tự quy đổi kg sang mét khi chưa có thông số vải.
export function demoRecords(year = 2026, staffId = id(900), ownerId = id(901)) {
  const records = []; const add = (model, value, date = at(year, 1)) => records.push({ model, value: { ...value, createdAt: date, updatedAt: date, isDeleted: false } });
  const units = [['Vải cotton', 'FABRIC_ROLL', 'METER', 400, 55000], ['Vải thun', 'FABRIC_ROLL', 'KG', 120, 95000], ['Kim may', 'NEEDLE', 'BOX', 20, 30000], ['Chỉ may', 'THREAD', 'SPOOL', 100, 18000], ['Phấn may', 'CHALK', 'BOX', 12, 25000], ['Bút đánh dấu vải', 'MARKER', 'PIECE', 30, 12000], ['Cúc áo', 'ACCESSORY', 'PIECE', 800, 1500]];
  units.forEach(([materialName, category, unit, onHandQty, unitCost], i) => add(RawMaterial, { _id: id(i + 1), materialCode: `DEMO-NL-${i + 1}`, materialName, materialType: i < 2 ? 'FABRIC' : 'AUXILIARY', category, unit, onHandQty, reservedQty: 0, unitCost }));
  add(Supplier, { _id: id(20), supplierCode: 'DEMO-NCC-01', supplierName: 'Công ty Vải An Phú (mẫu)', phone: '0900000001', address: 'Hà Nội', totalPayableDebt: 0 });
  add(Product, { _id: id(30), productCode: 'DEMO-SP-01', productName: 'Áo thun mẫu', category: 'Áo thun', basePrice: 150000 });
  add(Customer, { _id: id(31), customerCode: 'DEMO-KH-01', fullName: 'Khách mua mẫu', phone: '0900000002' });
  add(Sku, { _id: id(32), skuCode: 'DEMO-AO-M', skuBarcode: 'DEMO-AO-M', productId: id(30), styleName: 'Áo thun mẫu', color: 'Trắng', size: 'M', retailPrice: 150000, onHandQty: 200, reservedQty: 20, defectQuarantineQty: 5 });
  add(WarehouseLocation, { _id: id(40), locationCode: 'DEMO-KHO-NL', barcode: 'DEMO-KHO-NL', warehouseType: 'RAW_MATERIAL', zoneCode: 'A', rackCode: '01', shelfCode: '01', maxCapacity: 10000 });
  add(WarehouseLocation, { _id: id(41), locationCode: 'DEMO-KHO-TP', barcode: 'DEMO-KHO-TP', warehouseType: 'FINISHED_GOODS', zoneCode: 'B', rackCode: '01', shelfCode: '01', maxCapacity: 10000 });
  add(Bom, { _id: id(42), bomCode: 'DEMO-DM-01', skuId: id(32), skuCode: 'DEMO-AO-M', versionNo: 1, status: 'STANDARD', lines: [{ materialId: id(1), materialCode: 'DEMO-NL-1', materialName: 'Vải cotton', qtyPerUnit: 2, unitCode: 'METER', wastageRate: 0 }] });
  for (const y of [year - 4, year - 3, year - 2, year - 1, year]) for (let m = 1; m <= 12; m++) {
    const key = (y >= year - 1 ? (y - year + 2) * 10000 : 100000 + (y - year + 4) * 10000) + m * 100; const date = at(y, m);
    add(SupplierContract, { _id: id(key), contractCode: `DEMO-HD-${y}-${m}`, supplierId: id(20), status: 'ACTIVE', draftedByAccountantId: staffId, totalContractAmount: 33000000, totalPaidAmount: 11000000, contractedMaterials: [{ rawMaterialId: id(1), contractedQty: 600, unitPrice: 55000 }] }, date);
    add(MaterialInboundPlan, { _id: id(key + 1), planCode: `DEMO-NH-${y}-${m}`, supplierId: id(20), contractId: id(key), scheduledDeliveryDate: date, status: 'DEVIATION_REPORTED', createdByAccountantId: staffId, assignedReceiverId: staffId, expectedItems: [{ rawMaterialId: id(1), plannedQty: 600, actualVerifiedPassedQty: 400, actualDefectiveOrShortQty: 200 }] }, date);
    add(MaterialTicket, { _id: id(key + 2), ticketCode: `DEMO-PN-${y}-${m}`, ticketType: 'INBOUND_FROM_PLAN', inboundPlanId: id(key + 1), status: 'COMPLETED', createdByManagerId: staffId, items: [{ rawMaterialId: id(1), rollBarcode: 'DEMO-CUON-01', designatedFifoLocationId: id(40), expectedQty: 400, scannedQty: 400, isScannedCompleted: true }] }, date);
    add(InventoryTransaction, { _id: id(key + 3), transactionCode: `DEMO-GD-${y}-${m}`, warehouseType: 'RAW_MATERIAL', itemType: 'RAW_MATERIAL', rawMaterialId: id(1), transactionType: 'INBOUND_PUTAWAY', referenceModel: 'MaterialTicket', referenceId: id(key + 2), quantityChange: 400, onHandBefore: 0, onHandAfter: 400, performedByUserId: staffId }, date);
    add(ProductionOrder, { _id: id(key + 4), code: `DEMO-SX-${y}-${m}`, status: 'MATERIAL_SHORTAGE', plannedStart: date, plannedEnd: at(y, m, 20), items: [{ skuId: id(32), skuCode: 'DEMO-AO-M', plannedQty: 300, completedQty: 100 }], materialRequirements: [{ materialId: id(1), requiredQty: 600 }], stages: [{ stage: 'CUTTING', status: 'BLOCKED', blockedReason: 'Cần 600 mét vải, tồn khả dụng chỉ còn 400 mét.' }, { stage: 'SEWING', status: 'NOT_STARTED' }] }, date);
    add(FinishedGoodsTicket, { _id: id(key + 5), ticketCode: `DEMO-TP-${y}-${m}`, ticketType: 'INBOUND_FROM_SEWING', status: 'COMPLETED', createdByManagerId: staffId, items: [{ skuId: id(32), skuBarcode: 'DEMO-AO-M', designatedFifoLocationId: id(40), expectedQty: 100, scannedQty: 100 }] }, date);
    add(InventoryTransaction, { _id: id(key + 6), transactionCode: `DEMO-TP-GD-${y}-${m}`, warehouseType: 'FINISHED_GOODS', itemType: 'FINISHED_SKU', skuId: id(32), transactionType: 'INBOUND_PUTAWAY', referenceModel: 'FinishedGoodsTicket', referenceId: id(key + 5), quantityChange: 100, onHandBefore: 100, onHandAfter: 200, performedByUserId: staffId }, date);
    ['FACEBOOK', 'SHOPEE', 'TIKTOK', 'SHOPEE', 'FACEBOOK', m % 6 === 0 ? 'UNKNOWN' : 'TIKTOK'].forEach((channel, c) => {
      const amount = (y === year ? 150000 : 120000 - (year - 1 - y) * 10000) * (c + 1) * (m + 1);
      add(SalesOrder, { _id: id(key + 10 + c), orderCode: `DEMO-DH-${y}-${m}-${c}`, customerId: id(31), sellerId: staffId, salesChannel: channel, paymentStatus: c % 2 ? 'PENDING' : 'PAID', status: 'DELIVERED', expectedDeliveryAt: at(y, m, 4), deliveredAt: at(y, m, c % 2 ? 6 : 3), items: [{ skuId: id(32), skuCode: 'DEMO-AO-M', skuBarcode: 'DEMO-AO-M', orderedQty: (c + 1) * (m + 1), unitSalePrice: y === year ? 150000 : 120000 - (year - 1 - y) * 10000 }], financialSummary: { itemsSubtotal: amount, totalOrderAmount: amount + 25000, shippingFee: 25000, expectedCodAmount: c % 2 ? amount + 25000 : 0 }, warehouseFulfillment: { packedAt: date, handedOverAt: date } }, date);
    });
    add(ReturnRequest, { _id: id(key + 20), rmaCode: `DEMO-HOAN-${y}-${m}`, originalOrderId: id(key + 10), customerId: id(31), createdBySellerId: staffId, returnType: 'RETURN_FOR_REFUND', reasonCode: m % 2 ? 'CUSTOMER_REFUSED' : 'INVALID_ORDER', status: 'COMPLETED', financialAccounting: { returnedMerchandiseValue: 50000, approvedAt: date } }, date);
    add(StocktakeSession, { _id: id(key + 21), sessionCode: `DEMO-KK-NL-${y}-${m}`, warehouseType: 'RAW_MATERIAL', createdByManagerId: staffId, status: 'APPROVED_COMPLETED', approvalInfo: { approvedAt: date, approvedByUserId: ownerId } }, date);
    add(StocktakeSession, { _id: id(key + 23), sessionCode: `DEMO-KK-TP-${y}-${m}`, warehouseType: 'FINISHED_GOODS', createdByManagerId: staffId, status: 'FROZEN_COUNTING' }, date);
    add(StocktakeRecord, { _id: id(key + 24), sessionId: id(key + 21), locationId: id(40), itemType: 'RAW_MATERIAL', rawMaterialId: id(1), barcode: 'DEMO-NL-1', systemSnapshotQty: 400, actualScannedQty: 400, varianceQty: 0, unitCostSnapshot: 55000, scannedAt: date, scannedByStaffId: staffId }, date);
    add(StocktakeRecord, { _id: id(key + 25), sessionId: id(key + 23), locationId: id(41), itemType: 'SKU_BATCH', skuId: id(32), barcode: 'DEMO-AO-M', systemSnapshotQty: 200, actualScannedQty: 0, varianceQty: 0 }, date);
    add(CashFlowVoucher, { _id: id(key + 22), voucherCode: `DEMO-CHI-${y}-${m}`, flowType: 'CASH_OUT', category: 'SUPPLIER_INSTALLMENT', amount: 11000000, contractId: id(key), supplierId: id(20), createdByAccountantId: staffId, voucherDate: date }, date);
  }
  records.filter((r) => r.model === ProductionOrder).forEach((r) => { r.value.items[0].bomId = id(42); });
  records.filter((r) => r.model === FinishedGoodsTicket).forEach((r) => { r.value.items[0].designatedFifoLocationId = id(41); });
  addActivityDemoRecords(year, staffId, add);
  // Phiếu chi/thu trong các bộ mẫu cũ thiếu người nhận và nội dung bắt buộc
  // theo schema hiện tại. Bổ sung ngay trên dữ liệu mẫu trước khi xác thực.
  return [...records, ...catalogRecords(id, staffId, ownerId)].map(record => {
    if (record.model !== CashFlowVoucher) return record;
    const { value } = record;
    const supplierPayment = Boolean(value.supplierId);
    return { model: record.model, value: {
      paymentReason: value.note || 'Thanh toán công nợ theo hợp đồng mẫu',
      recipient: { name: supplierPayment ? 'Nhà cung cấp mẫu' : 'Đơn vị vận chuyển mẫu',
        recipientType: supplierPayment ? 'SUPPLIER' : 'CARRIER' },
      ...value,
    } };
  });
}

// Cụm mã riêng giúp chạy lại seed trên bản demo cũ. Lọc 10/11 để thấy
// đúng 100 đơn bàn giao và 10 đơn chuyển hoàn ngày 13/11.
function addActivityDemoRecords(year, staffId, add) {
  const sent = at(year, 11, 10);
  const returned = at(year, 11, 13);
  // Mỗi nhóm 25 đơn tập trung vào ba kênh online, chỉ một đơn thiếu nguồn.
  // Đặt các ca quay đầu đầu tiên trải đều để biểu đồ có đủ lý do theo kênh.
  const sources = ['FACEBOOK', 'SHOPEE', 'TIKTOK', 'FACEBOOK', 'SHOPEE', 'TIKTOK', 'FACEBOOK',
    'SHOPEE', 'TIKTOK', ...Array(8).fill('FACEBOOK'), ...Array(5).fill('SHOPEE'), ...Array(2).fill('TIKTOK'), 'UNKNOWN'];
  const otherStatuses = ['PENDING', 'CONFIRMED_RESERVED', 'PICKING', 'PACKED', 'CANCELLED'];
  const orders = Array.from({ length: 105 }, (_, index) => index);
  for (const index of orders) {
    const customerId = id(201000 + index);
    const orderId = id(202000 + index);
    const orderCode = `DEMO-OWNER-DH-${year}-${index + 1}`;
    const turnedBack = index < 10;
    const shipped = index < 100;
    const delivered = shipped && !turnedBack && index % 5 !== 0;
    const salesChannel = sources[index % sources.length];
    const status = turnedBack ? (index < 7 ? 'RETURNED' : 'RETURN_REQUESTED')
      : delivered ? 'DELIVERED' : shipped ? 'HANDED_OVER_CARRIER' : otherStatuses[index - 100];
    add(Customer, { _id: customerId, customerCode: `DEMO-OWNER-KH-${index + 1}`, fullName: `Khách demo ${index + 1}` }, sent);
    add(SalesOrder, {
      _id: orderId, orderCode, sellerId: staffId, customerId, salesChannel, status,
      paymentStatus: delivered ? 'PAID' : 'PENDING', deliveredAt: delivered ? returned : undefined,
      items: [{ skuId: id(32), skuCode: 'DEMO-AO-M', skuBarcode: 'DEMO-AO-M', orderedQty: 1, unitSalePrice: 150000 }],
      financialSummary: { itemsSubtotal: 150000, totalOrderAmount: 175000, shippingFee: 25000, expectedCodAmount: 175000 },
      warehouseFulfillment: {
        packedAt: shipped || status === 'PACKED' ? sent : undefined, handedOverAt: shipped ? sent : undefined,
        ghnStatus: turnedBack ? (index < 7 ? 'returned' : 'returning') : undefined,
        ghnUpdatedAt: turnedBack ? returned : undefined,
      },
      statusHistory: turnedBack ? [{ from: 'HANDED_OVER_CARRIER', to: status, at: returned }] : [],
    }, sent);
    if (!turnedBack) continue;
    add(ReturnRequest, {
      _id: id(203000 + index), rmaCode: `DEMO-OWNER-HOAN-${index + 1}`, originalOrderId: orderId, customerId,
      createdBySellerId: staffId, returnType: 'RETURN_FOR_REFUND', status: 'REQUESTED',
      reasonCode: index === 0 ? 'INVALID_ORDER' : index < 6 ? 'CUSTOMER_REFUSED'
        : index === 6 ? 'PRODUCT_DEFECT' : index === 7 ? 'OTHER' : 'UNKNOWN',
    }, returned);
    // Mẫu cả chờ mở kiện, chờ nhập, không đạt và đã nhập. ID phiếu dùng riêng cho báo cáo demo.
    if (index >= 4) continue;
    const completed = index === 0;
    if (completed) add(FinishedGoodsTicket, {
      _id: id(205000), ticketCode: 'DEMO-OWNER-NHAP-HOAN', ticketType: 'INBOUND_FROM_RETURN', status: 'COMPLETED',
      items: [{ skuId: id(32), skuBarcode: 'DEMO-AO-M', designatedFifoLocationId: id(41), expectedQty: 1, scannedQty: 1 }],
    }, returned);
    add(ReturnInspection, {
      _id: id(204000 + index), inspectionCode: `DEMO-OWNER-KIEM-${index + 1}`, orderId, orderCode, customerId,
      inspectionResult: index === 3 ? 'FAILED' : 'PASSED', inspectedByTechId: staffId,
      inspectedAt: returned, inboundTicketId: completed ? id(205000) : undefined,
      items: [{ skuId: id(32), quantity: 1, passed: index !== 3 }],
    }, returned);
  }
}
async function main() {
  const dry = process.argv.includes('--dry-run');
  const activityOnly = process.argv.includes('--activity-only');
  if (!dry) {
    if (!process.env.MONGODB_URI) throw new Error('Cần cấu hình MONGODB_URI trong tệp .env.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  }
  try {
    const staff = dry ? null : await mongoose.connection.collection('users').findOne({ isDeleted: { $ne: true }, status: 'ACTIVE', roleCode: 'ACCOUNTANT' });
    const owner = dry ? null : await mongoose.connection.collection('users').findOne({ isDeleted: { $ne: true }, status: 'ACTIVE', roleCode: 'OWNER' });
    if (!dry && (!staff || !owner)) throw new Error('Cần có tài khoản chủ cửa hàng và kế toán đang hoạt động trước khi thêm dữ liệu mẫu.');
    const allRecords = demoRecords(2026, staff?._id, owner?._id);
    // Chỉ chèn bộ dữ liệu mục 4.4 và các mã hàng liên kết khi demo báo cáo kinh doanh.
    const linkedCodes = ['DEMO-SP-01', 'DEMO-AO-M', 'DEMO-KHO-TP'];
    const records = activityOnly ? allRecords.filter(({ value }) => [
      value.orderCode, value.customerCode, value.rmaCode, value.inspectionCode, value.ticketCode,
      value.productCode, value.skuCode, value.locationCode,
    ].some(code => code?.startsWith('DEMO-OWNER-') || linkedCodes.includes(code))) : allRecords;
    for (const { model, value } of records) { const doc = new model(value); await doc.validate(); }
    if (dry) { console.log(`Đã kiểm tra ${records.length} bản ghi mẫu hợp lệ; chưa kết nối cơ sở dữ liệu.`); return; }
    let count = 0;
    // Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi dữ liệu - Ghi theo nhóm để thêm nhiều năm nhanh và không chèn trùng.
    const groups = new Map();
    for (const { model, value } of records) { const doc = new model(value).toObject({ transform: false, virtuals: false }); if (!groups.has(model)) groups.set(model, []); groups.get(model).push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } }); }
    for (const [model, operations] of groups) { const result = await model.collection.bulkWrite(operations, { ordered: true }); count += result.upsertedCount; }
    if (activityOnly) {
      // Chỉ chỉnh các mã mẫu thuộc bộ Owner. Giữ nguyên nguồn của đơn thật.
      const historicalOrders = allRecords.filter(({ model, value }) => model === SalesOrder && /^DEMO-DH-\d{4}-\d{1,2}-[345]$/.test(value.orderCode));
      const updated = await SalesOrder.collection.bulkWrite(historicalOrders.map(({ value }) => ({
        updateOne: {
          filter: { _id: value._id, orderCode: value.orderCode, salesChannel: { $in: ['WHOLESALE', 'RETAIL', 'DIRECT', 'UNKNOWN'] } },
          update: { $set: { salesChannel: value.salesChannel } },
        },
      })));
      console.log(`Đã thêm ${count} bản ghi mẫu mục 4.4 và cập nhật nguồn bán của ${updated.modifiedCount} đơn mẫu cũ.`);
      return;
    }
    // UC-19: Bổ sung liên kết định mức còn thiếu cho bản mẫu phiên bản đầu, không đổi số lượng/kế hoạch đã chỉnh.
    await ProductionOrder.collection.updateMany({ _id: { $in: records.filter((r) => r.model === ProductionOrder && r.value.code.startsWith('DEMO-SX-202')).map((r) => r.value._id) }, 'items.0.bomId': { $exists: false } }, { $set: { 'items.0.bomId': id(42) } });
    await FinishedGoodsTicket.collection.updateMany({ _id: { $in: records.filter((r) => r.model === FinishedGoodsTicket).map((r) => r.value._id) }, 'items.0.designatedFifoLocationId': id(40) }, { $set: { 'items.0.designatedFifoLocationId': id(41) } });
    // Phản hồi 2/3: Lô mẫu giao thiếu phải có trạng thái chênh lệch, không đánh dấu kiểm khớp.
    await MaterialInboundPlan.collection.updateMany({ _id: { $in: records.filter((r) => r.model === MaterialInboundPlan).map((r) => r.value._id) }, status: 'VERIFIED_MATCHED', 'expectedItems.actualDefectiveOrShortQty': { $gt: 0 } }, { $set: { status: 'DEVIATION_REPORTED' } });
    const demoContracts = await SupplierContract.find({ supplierId: id(20), isDeleted: { $ne: true } }).lean();
    const demoDebt = demoContracts.reduce((s, r) => s + Math.max(0, r.totalContractAmount - r.totalPaidAmount), 0);
    await Supplier.updateOne({ _id: id(20), totalPayableDebt: 0 }, { $set: { totalPayableDebt: demoDebt } });
    await mongoose.connection.collection('owner_targets').updateOne({ year: 2026 }, { $setOnInsert: { year: 2026, revenue: 500000000, revision: 0, isDeleted: false } }, { upsert: true });
    await mongoose.connection.collection('work_assignments').updateOne({ _id: id(950) }, { $setOnInsert: { _id: id(950), title: 'Kiểm tra và nhận lô vải còn thiếu', assigneeId: staff._id, assigneeName: staff.fullName, dueDate: at(2026, 11, 3), status: 'NOT_STARTED', revision: 0, createdBy: owner._id, createdAt: at(2026, 11), isDeleted: false } }, { upsert: true });
    for (const year of [2022, 2023, 2024, 2025]) await mongoose.connection.collection('owner_targets').updateOne({ year }, { $setOnInsert: { year, revenue: 300000000 + (year - 2022) * 50000000, revision: 0, isDeleted: false } }, { upsert: true });
    const workers = await mongoose.connection.collection('users').find({ status: 'ACTIVE', isDeleted: { $ne: true }, roleCode: { $ne: 'OWNER' } }, { projection: { _id: 1, fullName: 1 } }).limit(6).toArray();
    const taskNames = ['Nhận và kiểm tra lô vải kaki', 'Đếm lại thành phẩm áo sơ mi', 'Theo dõi lô khóa kéo còn thiếu', 'Kiểm tra mẫu áo polo', 'Sắp xếp khu vực hàng lỗi', 'Chốt báo cáo kho tháng này'];
    for (let i = 0; i < workers.length; i++) await mongoose.connection.collection('work_assignments').updateOne({ _id: id(5000 + i) }, { $setOnInsert: { _id: id(5000 + i), title: taskNames[i], assigneeId: workers[i]._id, assigneeName: workers[i].fullName, dueDate: at(2026, 11, 3 + i), status: ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'IN_PROGRESS', 'NOT_STARTED'][i], revision: 0, createdBy: owner._id, createdAt: at(2026, 11), isDeleted: false } }, { upsert: true });
    for (const supplierId of [id(1100), id(1101), id(1102)]) {
      const contracts = await SupplierContract.find({ supplierId, isDeleted: { $ne: true } }).lean();
      await Supplier.updateOne({ _id: supplierId, totalPayableDebt: 0 }, { $set: { totalPayableDebt: contracts.reduce((s, c) => s + Math.max(0, c.totalContractAmount - c.totalPaidAmount), 0) } });
    }
    console.log(`Đã thêm ${count} bản ghi mẫu. Các bản ghi đã có được giữ nguyên.`);
  } finally { if (!dry) await mongoose.disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.name === 'ValidationError' ? error.message : 'Không thể thêm dữ liệu mẫu. Hãy kiểm tra cấu hình kết nối và tài khoản.'); process.exitCode = 1; });
