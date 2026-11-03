/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * UC-12/15/16/18/19/20, GBR-13/18/19: Danh mục, mẫu có ảnh, báo cáo quản lý, tồn kho và kiểm kê để trình diễn.
 * Mã định danh ổn định, liên kết đúng sản phẩm/định mức/vị trí; dữ liệu cũ không bị ghi đè.
 */
import RawMaterial from '../src/models/RawMaterial.model.js';
import Product from '../src/models/Product.model.js';
import Sku from '../src/models/Sku.model.js';
import Bom from '../src/models/Bom.model.js';
import ProductSample from '../src/models/ProductSample.model.js';
import ManagerReport from '../src/models/ManagerReport.model.js';
import Supplier from '../src/models/Supplier.model.js';
import SupplierContract from '../src/models/SupplierContract.model.js';
import MaterialInboundPlan from '../src/models/MaterialInboundPlan.model.js';
import MaterialTicket from '../src/models/MaterialTicket.model.js';
import FinishedGoodsTicket from '../src/models/FinishedGoodsTicket.model.js';
import FinishedGoodsBatch from '../src/models/FinishedGoodsBatch.model.js';
import FabricRoll from '../src/models/FabricRoll.model.js';
import InventoryTransaction from '../src/models/InventoryTransaction.model.js';
import ProductionOrder from '../src/models/ProductionOrder.model.js';
import CashFlowVoucher from '../src/models/CashFlowVoucher.model.js';
import StocktakeSession from '../src/models/StocktakeSession.model.js';
import StocktakeRecord from '../src/models/StocktakeRecord.model.js';
import SystemLog from '../src/models/SystemLog.model.js';
import ShippingCarrier from '../src/models/ShippingCarrier.model.js';
import CodReconciliationBatch from '../src/models/CodReconciliationBatch.model.js';
import CodReconciliationItem from '../src/models/CodReconciliationItem.model.js';
export function catalogRecords(id, staffId, ownerId) {
  const records = []; const date = new Date('2026-11-02T09:00:00+07:00');
  const add = (model, value) => records.push({ model, value: { ...value, createdAt: date, updatedAt: date, isDeleted: false } });
  const materials = [['Vải kaki', 'FABRIC_ROLL', 'METER', 1200, 200, 65000], ['Vải linen', 'FABRIC_ROLL', 'METER', 30, 20, 85000], ['Khóa kéo', 'ZIPPER', 'PIECE', 0, 0, 6500], ['Nhãn giặt', 'CARE_LABEL', 'PIECE', 3500, 500, 500], ['Túi đóng gói', 'PACKAGING_BAG', 'PIECE', 1000, 100, 2000], ['Vải nỉ', 'FABRIC_ROLL', 'KG', 250, 20, 110000]];
  materials.forEach(([materialName, category, unit, onHandQty, reservedQty, unitCost], i) => add(RawMaterial, { _id: id(1000 + i), materialCode: `DEMO-NL-BS-${i + 1}`, materialName, materialType: category === 'FABRIC_ROLL' ? 'FABRIC' : 'AUXILIARY', category, unit, onHandQty, reservedQty, unitCost, safetyStockThreshold: unit === 'METER' ? 100 : 50 }));
  ['Công ty Dệt Bình Minh', 'Xưởng Phụ liệu Hòa Bình', 'Công ty Bao bì An Khang'].forEach((supplierName, i) => add(Supplier, { _id: id(1100 + i), supplierCode: `DEMO-NCC-BS-${i + 1}`, supplierName: `${supplierName} (mẫu)`, phone: `090000001${i}`, address: ['Hà Nội', 'Nam Định', 'Hưng Yên'][i], totalPayableDebt: 0 }));
  const styles = [['Áo sơ mi linen', 'shirt', 390000, id(1001), 1.8], ['Quần kaki', 'pants', 450000, id(1000), 1.5], ['Áo khoác nhẹ', 'jacket', 590000, id(1000), 2.2], ['Váy công sở', 'dress', 520000, id(1001), 2], ['Áo nỉ dài tay', 'sweater', 350000, id(1005), 0.65], ['Áo polo', 'polo', 290000, id(1), 1.6]];
  styles.forEach(([name, image, price, materialId, perUnit], i) => {
    const productId = id(2000 + i), unit = i === 4 ? 'KG' : 'METER';
    add(Product, { _id: productId, productCode: `DEMO-SP-BS-${i + 1}`, productName: name, category: name, basePrice: price, thumbnailUrl: `/demo/${image}.svg` });
    ['M', 'L'].forEach((size, j) => {
      const skuId = id(2100 + i * 10 + j), skuCode = `DEMO-TP-${i + 1}-${size}`, onHandQty = i === 2 ? 0 : 100 + i * 30 + j * 20;
      add(Sku, { _id: skuId, skuCode, skuBarcode: skuCode, productId, styleName: `${name} ${size}`, color: i % 2 ? 'Xanh' : 'Be', size, retailPrice: price, onHandQty, reservedQty: onHandQty ? 20 : 0, defectQuarantineQty: j ? 3 : 0, safetyStockThreshold: 30 });
      add(Bom, { _id: id(2200 + i * 10 + j), bomCode: `DEMO-DM-${i + 1}-${size}`, skuId, skuCode, versionNo: 1, status: 'STANDARD', lines: [{ materialId, materialName: name.includes('linen') || i === 3 ? 'Vải linen' : i === 4 ? 'Vải nỉ' : i === 5 ? 'Vải cotton' : 'Vải kaki', qtyPerUnit: perUnit, unitCode: unit, wastageRate: 0.03 }] });
      if (onHandQty) {
        const ticketId = id(2400 + i * 10 + j);
        add(FinishedGoodsTicket, { _id: ticketId, ticketCode: `DEMO-PN-TP-BS-${i + 1}-${size}`, ticketType: 'INBOUND_FROM_SEWING', status: 'COMPLETED', createdByManagerId: staffId, items: [{ skuId, skuBarcode: skuCode, designatedFifoLocationId: id(41), expectedQty: onHandQty, scannedQty: onHandQty }] });
        add(InventoryTransaction, { _id: id(2500 + i * 10 + j), transactionCode: `DEMO-GD-TP-BS-${i + 1}-${size}`, warehouseType: 'FINISHED_GOODS', itemType: 'FINISHED_SKU', skuId, transactionType: 'INBOUND_PUTAWAY', referenceModel: 'FinishedGoodsTicket', referenceId: ticketId, quantityChange: onHandQty, onHandBefore: 0, onHandAfter: onHandQty, performedByUserId: staffId });
        add(FinishedGoodsBatch, { _id: id(2300 + i * 10 + j), batchCode: `DEMO-LO-${i + 1}-${size}`, skuId, skuBarcode: skuCode, inboundTicketId: ticketId, locationId: id(41), initialQty: onHandQty, currentOnHandQty: onHandQty, reservedPickQty: 20, fifoInboundTimestamp: date });
      }
    });
    add(ProductSample, { _id: id(3000 + i), code: `DEMO-MAU-${i + 1}`, name, productCode: `DEMO-SP-BS-${i + 1}`, status: ['IN_DEVELOPMENT', 'SAMPLE_READY', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'UNDER_REVIEW'][i], description: `Mẫu ${name.toLocaleLowerCase('vi')} dành cho bộ sưu tập mới. Kiểm tra đường may, chất liệu và kích thước trước khi sản xuất.`, imageUrls: [`/demo/${image}.svg`], estimatedCost: Math.round(price * 0.4), proposedPrice: price, evaluationNote: i === 4 ? 'Cần chỉnh lại kích thước cổ áo trước khi làm mẫu tiếp theo.' : 'Đường may đều; cần đối chiếu màu vải và kiểm tra co rút.', createdBy: staffId });
    add(ProductionOrder, { _id: id(3100 + i), code: `DEMO-SX-BS-${i + 1}`, status: ['IN_PROGRESS', 'PLANNED', 'MATERIAL_SHORTAGE', 'COMPLETED', 'RELEASED', 'PLANNED'][i], plannedStart: date, plannedEnd: new Date('2026-11-25T09:00:00+07:00'), items: [{ skuId: id(2100 + i * 10), skuCode: `DEMO-TP-${i + 1}-M`, bomId: id(2200 + i * 10), plannedQty: 200, completedQty: i === 3 ? 200 : i === 0 ? 80 : 0, defectiveQty: i === 0 ? 2 : 0 }], materialRequirements: [{ materialId, requiredQty: 200 * perUnit * 1.03 }], stages: [{ stage: 'CUTTING', status: i === 2 ? 'BLOCKED' : 'DONE', blockedReason: i === 2 ? 'Cần bổ sung vải và khóa kéo.' : '' }, { stage: 'SEWING', status: i === 3 ? 'DONE' : 'IN_PROGRESS' }, { stage: 'QC', status: i === 3 ? 'DONE' : 'NOT_STARTED' }] });
  });
  ['PRODUCTION', 'INVENTORY', 'SALES', 'MONTHLY', 'EXCEPTION', 'WEEKLY'].forEach((reportType, i) => add(ManagerReport, { _id: id(3200 + i), code: `DEMO-BC-${i + 1}`, reportType, title: ['Tiến độ sản xuất tháng 11', 'Tình hình tồn kho nguyên liệu', 'Tổng hợp đơn hàng và hoàn hàng', 'Báo cáo vận hành tháng 11', 'Nguyên liệu cần mua bổ sung', 'Kế hoạch nhập và xuất tuần này'][i], status: i % 2 ? 'REVIEWED' : 'SUBMITTED', periodStart: date, periodEnd: new Date('2026-11-30T16:59:59Z'), summary: 'Báo cáo mẫu phục vụ đối chiếu kế hoạch, số thực hiện và các việc cần xử lý.', content: '1. Kiểm tra vải linen dưới mức tồn tối thiểu.\n2. Theo dõi lô nhập còn thiếu và phân công người nhận.\n3. Đối chiếu sản lượng thành phẩm với kế hoạch.\n4. Tách hàng lỗi để xử lý, không đưa vào lượng bán được.', submittedBy: staffId, submittedAt: date, ...(i % 2 ? { reviewedBy: ownerId, reviewedAt: date, ownerComment: 'Đã xem, ưu tiên mua đủ nguyên liệu.' } : {}) }));
  // Phản hồi nhập hàng: Nhiều nhà cung cấp, mặt hàng và mức thanh toán để so sánh trong cùng kỳ.
  materials.forEach(([, , , quantity, , price], i) => {
    const supplierId = id(1100 + i % 3), contractId = id(4000 + i), planId = id(4100 + i), materialId = id(1000 + i), planned = Math.max(200, quantity), received = i === 2 ? 0 : Math.round(planned * (i % 2 ? 0.5 : 1));
    add(SupplierContract, { _id: contractId, contractCode: `DEMO-HD-BS-${i + 1}`, supplierId, status: 'ACTIVE', draftedByAccountantId: staffId, totalContractAmount: planned * price, totalPaidAmount: Math.round(planned * price * (i % 2 ? 0.3 : 1)), contractedMaterials: [{ rawMaterialId: materialId, contractedQty: planned, unitPrice: price }] });
    add(MaterialInboundPlan, { _id: planId, planCode: `DEMO-NH-BS-${i + 1}`, contractId, supplierId, scheduledDeliveryDate: date, status: received < planned ? 'DEVIATION_REPORTED' : 'VERIFIED_MATCHED', createdByAccountantId: staffId, assignedBuyerId: staffId, assignedReceiverId: staffId, expectedItems: [{ rawMaterialId: materialId, plannedQty: planned, actualVerifiedPassedQty: received, actualDefectiveOrShortQty: planned - received }] });
    if (received) {
      add(MaterialTicket, { _id: id(4200 + i), ticketCode: `DEMO-PN-BS-${i + 1}`, ticketType: 'INBOUND_FROM_PLAN', inboundPlanId: planId, createdByManagerId: staffId, status: 'COMPLETED', items: [{ rawMaterialId: materialId, rollBarcode: `DEMO-CUON-BS-${i + 1}`, designatedFifoLocationId: id(40), expectedQty: received, scannedQty: received, isScannedCompleted: true }] });
      add(InventoryTransaction, { _id: id(4300 + i), transactionCode: `DEMO-GD-BS-${i + 1}`, warehouseType: 'RAW_MATERIAL', itemType: 'RAW_MATERIAL', rawMaterialId: materialId, transactionType: 'INBOUND_PUTAWAY', referenceModel: 'MaterialTicket', referenceId: id(4200 + i), quantityChange: received, onHandBefore: 0, onHandAfter: received, performedByUserId: staffId });
    }
    add(CashFlowVoucher, { _id: id(4400 + i), voucherCode: `DEMO-CHI-BS-${i + 1}`, flowType: 'CASH_OUT', category: 'SUPPLIER_INSTALLMENT', amount: Math.round(planned * price * (i % 2 ? 0.3 : 1)), supplierId, contractId, createdByAccountantId: staffId, voucherDate: date });
  });
  add(FabricRoll, { _id: id(4500), rollBarcode: 'DEMO-CUON-KAKI', rawMaterialId: id(1000), supplierId: id(1100), initialLengthMeters: 1200, currentLengthMeters: 1200, unitCostPerMeter: 65000, locationId: id(40), fifoInboundTimestamp: date, status: 'IN_STOCK' });
  ['RAW_MATERIAL', 'FINISHED_GOODS'].forEach((warehouseType, i) => {
    add(StocktakeSession, { _id: id(4600 + i), sessionCode: `DEMO-KK-DUYET-${i + 1}`, warehouseType, createdByManagerId: staffId, status: 'VARIANCE_REVIEW', totalItemsExpected: 1, totalDiscrepancyCount: 1, approvalInfo: { approvalLevelRequired: 'MAJOR_OWNER' } });
    add(StocktakeRecord, { _id: id(4700 + i), sessionId: id(4600 + i), locationId: id(i ? 41 : 40), itemType: i ? 'SKU_BATCH' : 'RAW_MATERIAL', ...(i ? { skuId: id(2100), batchId: id(2300) } : { rawMaterialId: id(1000) }), barcode: i ? 'DEMO-TP-1-M' : 'DEMO-NL-BS-1', systemSnapshotQty: i ? 100 : 1200, actualScannedQty: i ? 90 : 1170, varianceQty: i ? -10 : -30, unitCostSnapshot: i ? 0 : 65000, scannedByStaffId: staffId, scannedAt: date, agingDaysAtCount: 120, isAgingThresholdExceeded: true });
  });
  // GBR-14: Phiếu thu có đợt đối soát nguồn và ba đơn liên kết, không dùng mã nguồn không tồn tại.
  add(ShippingCarrier, { _id: id(4810), carrierCode: 'DEMO-VANCHUYEN', carrierName: 'Đơn vị vận chuyển mẫu', baseShippingFee: 25000 });
  add(CodReconciliationBatch, { _id: id(4801), batchCode: 'DEMO-DOISOAT-11', carrierId: id(4810), uploadedByAccountantId: staffId, statementFileUrl: '/demo/doi-soat-mau.csv', status: 'COMPLETED', totalWaybillsCount: 3, matchedCount: 3, totalExpectedCodAmount: 21675000, totalCarrierReportedCodAmount: 21675000 });
  [1, 3, 5].forEach((channel, i) => add(CodReconciliationItem, { _id: id(4820 + i), batchId: id(4801), carrierId: id(4810), waybillCode: `DEMO-VD-${i + 1}`, salesOrderId: id(21110 + channel), orderCode: `DEMO-DH-2026-11-${channel}`, systemExpectedCod: 150000 * (channel + 1) * 12 + 25000, carrierReportedCod: 150000 * (channel + 1) * 12 + 25000, carrierShippingFee: 25000, varianceAmount: 0, redFlagReason: 'NONE', redFlagStatus: 'NONE' }));
  add(CashFlowVoucher, { _id: id(4800), voucherCode: 'DEMO-THU-DOISOAT', flowType: 'CASH_IN', category: 'CARRIER_COD_PAYOUT', amount: 21600000, reconciliationBatchId: id(4801), createdByAccountantId: staffId, voucherDate: date, note: 'Tiền thu hộ mẫu sau khi trừ 75.000 đồng phí vận chuyển.' });
  add(SystemLog, { _id: id(4900), actorId: ownerId, actorRole: 'OWNER', majorFeature: 'User Management', subFeature: 'Employee Management', action: 'CREATE_EMPLOYEE', targetCollection: 'users', targetCode: 'DEMO-NHATKY', afterSnapshot: { note: 'Bản ghi minh họa nhật ký cho dữ liệu trình diễn.' } });
  return records;
}
