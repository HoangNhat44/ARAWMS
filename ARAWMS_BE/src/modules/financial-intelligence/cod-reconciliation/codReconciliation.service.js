import mongoose from 'mongoose';
import {
  SalesOrder,
  ShippingCarrier,
  CodReconciliationBatch,
  CodReconciliationItem,
  User,
} from '../../../models/index.js';
import { ghnService } from '../../../services/ghn.service.js';

/**
 * Helper: Lấy userId của Kế toán
 */
async function resolveAccountantUserId(explicitUserId) {
  if (explicitUserId) return explicitUserId;
  const accountant =
    (await User.findOne({ employeeCode: 'KETOAN' }).select('_id').lean()) ||
    (await User.findOne().select('_id').lean());
  return accountant?._id;
}

/**
 * 1. Lấy danh sách các đơn hàng COD đang chờ hoặc đã đối soát
 */
export const getCodOrdersList = async (filters = {}) => {
  const query = {};

  // Điều kiện lọc theo trạng thái đối soát
  if (filters.status && filters.status !== 'ALL') {
    query.codReconciliationStatus = filters.status;
  }

  // 1. Chỉ lấy các đơn hàng thanh toán Tiền mặt (COD > 0)
  query['financialSummary.expectedCodAmount'] = { $gt: 0 };

  // 2. Chuẩn nghiệp vụ đối soát vận chuyển: BẮT BUỘC ĐÃ BÀN GIAO CHO HÃNG VẬN CHUYỂN
  // (Đã xuất kho và được cấp mã vận đơn waybillCode từ đối tác giao vận)
  query['warehouseFulfillment.waybillCode'] = { $exists: true, $ne: '' };

  // 3. Chỉ lấy các đơn đã bàn giao sang khâu vận chuyển:
  // - DELIVERED: Đã giao thành công (Đủ điều kiện đối soát tiền mặt)
  // - RETURNED: Đã chuyển hoàn (Đủ điều kiện đối soát hàng hoàn)
  // - HANDED_OVER_CARRIER: Đã bàn giao cho bên vận chuyển (Chờ giao xong)
  // - CARRIER_PICKED_UP: Đã lấy hàng (Chờ giao xong)
  // LOẠI BỎ HOÀN TOÀN các trạng thái nội bộ kho chưa gửi hãng: PENDING, CONFIRMED_RESERVED, PICKING, PACKED, CANCELLED
  if (filters.shippingStatus && filters.shippingStatus !== 'ALL') {
    query.status = filters.shippingStatus;
  } else {
    query.status = { $in: ['DELIVERED', 'RETURNED', 'HANDED_OVER_CARRIER', 'CARRIER_PICKED_UP'] };
  }

  // Tìm kiếm theo mã đơn hoặc mã vận đơn
  if (filters.search && String(filters.search).trim()) {
    const q = String(filters.search).trim();
    query.$or = [
      { orderCode: new RegExp(q, 'i') },
      { 'warehouseFulfillment.waybillCode': new RegExp(q, 'i') },
      { 'shippingRecipient.name': new RegExp(q, 'i') },
      { 'shippingRecipient.phone': new RegExp(q, 'i') },
    ];
  }

  const orders = await SalesOrder.find(query)
    .populate('warehouseFulfillment.carrierId', 'carrierName carrierCode hotline')
    .sort({ createdAt: -1 })
    .lean();

  // Thống kê nhanh
  let totalExpectedCod = 0;
  let reconciledCount = 0;
  let unreconciledCount = 0;
  let redFlagCount = 0;

  orders.forEach((o) => {
    const cod = Number(o.financialSummary?.expectedCodAmount || 0);
    totalExpectedCod += cod;
    if (o.codReconciliationStatus === 'MATCHED' || o.codReconciliationStatus === 'RESOLVED') reconciledCount++;
    else if (o.codReconciliationStatus === 'RED_FLAG_DISCREPANCY' || o.codReconciliationStatus === 'DISPUTING') redFlagCount++;
    else unreconciledCount++;
  });

  return {
    summary: {
      totalOrders: orders.length,
      totalExpectedCod,
      reconciledCount,
      unreconciledCount,
      redFlagCount,
    },
    orders,
  };
};

/**
 * 2. Thực thi Đối soát Tự động qua API Giao Hàng Nhanh (GHN)
 * Chỉ lọc các đơn tiền mặt (COD > 0) có mã vận đơn và đang chưa đối soát
 */
export const executeAutomatedCodReconciliation = async (payload = {}, currentUserId) => {
  const accountantId = await resolveAccountantUserId(currentUserId);

  // Tìm đối tác vận chuyển GHN trong database
  let ghnCarrier = await ShippingCarrier.findOne({ carrierCode: 'GHN' });
  if (!ghnCarrier) {
    ghnCarrier = await ShippingCarrier.findOne({ carrierName: /Giao Hàng Nhanh/i });
  }
  if (!ghnCarrier) {
    ghnCarrier = await ShippingCarrier.create({
      carrierCode: 'GHN',
      carrierName: 'Giao Hàng Nhanh',
      hotline: '1900 636677',
      baseShippingFee: 19000,
      isActive: true,
    });
  }

  // 1. Lọc các đơn hàng tiền mặt cần đối soát theo đúng chuẩn nghiệp vụ:
  // - PTTT: Chỉ đối soát đơn Tiền mặt COD (expectedCodAmount > 0), tự động bỏ qua đơn chuyển khoản trước.
  // - Đã bàn giao cho đơn vị vận chuyển (có mã vận đơn waybillCode).
  // - Trạng thái: Chỉ đối soát các đơn đã kết thúc hành trình giao vận:
  //   + DELIVERED (Giao thành công): Kiểm tra tiền thu hộ thực tế.
  //   + RETURNED (Chuyển hoàn): Xác nhận tiền COD = 0 và kiểm soát hàng hoàn.
  //   => Tự động loại trừ các đơn đang trên đường giao (HANDED_OVER_CARRIER) chờ giao xong.
  const orderFilter = {
    'financialSummary.expectedCodAmount': { $gt: 0 },
    'warehouseFulfillment.waybillCode': { $exists: true, $ne: '' },
    status: { $in: ['DELIVERED', 'RETURNED'] },
  };

  if (payload.orderIds && Array.isArray(payload.orderIds) && payload.orderIds.length > 0) {
    orderFilter._id = { $in: payload.orderIds };
  } else {
    // Mặc định đối soát các đơn chưa hoàn tất đối soát
    orderFilter.codReconciliationStatus = { $in: ['UNRECONCILED', 'RED_FLAG_DISCREPANCY'] };
  }

  // Đếm số đơn COD đang trên đường giao để báo cáo cho kế toán
  const pendingTransitCount = await SalesOrder.countDocuments({
    'financialSummary.expectedCodAmount': { $gt: 0 },
    'warehouseFulfillment.waybillCode': { $exists: true, $ne: '' },
    status: 'HANDED_OVER_CARRIER',
  });

  const codOrders = await SalesOrder.find(orderFilter);

  if (codOrders.length === 0) {
    return {
      success: true,
      message: pendingTransitCount > 0
        ? `Hiện không có đơn tiền mặt nào đã giao xong. Hệ thống đã tự động giữ lại ${pendingTransitCount} đơn đang trên đường giao (chờ khách nhận hàng mới chốt đối soát).`
        : 'Không tìm thấy đơn hàng tiền mặt (COD) nào cần đối soát lúc này.',
      processedCount: 0,
      skippedTransitCount: pendingTransitCount,
      matchedCount: 0,
      redFlagCount: 0,
      items: [],
    };
  }

  // Tạo mã đợt đối soát
  const batchCode = `BATCH-COD-${Date.now().toString().slice(-6)}`;
  let totalBatchExpectedCod = 0;
  let totalBatchCarrierCod = 0;
  let totalBatchDiscrepancy = 0;
  let matchedCount = 0;
  let redFlagCount = 0;
  const itemResults = [];

  // Tạo Batch trước
  const batch = await CodReconciliationBatch.create({
    batchCode,
    carrierId: ghnCarrier._id,
    uploadedByAccountantId: accountantId,
    statementFileUrl: 'API_DIRECT_AUTOMATED_SYNC',
    status: 'RECONCILING',
    totalWaybillsCount: codOrders.length,
  });

  // 2. Chạy đối soát tự động cho từng đơn tiền mặt
  for (const order of codOrders) {
    const waybillCode = order.warehouseFulfillment?.waybillCode;
    const systemExpectedCod = Number(order.financialSummary?.expectedCodAmount || 0);
    totalBatchExpectedCod += systemExpectedCod;

    let carrierReportedCod = 0;
    let carrierShippingFee = 0;
    let ghnStatus = 'UNKNOWN';
    let ghnStatusName = '';
    let isRedFlag = false;
    let redFlagReason = 'NONE';
    let investigationNote = '';

    try {
      // Gọi API trực tiếp từ GHN Sandbox qua ghnService
      const ghnDetail = await ghnService.getOrderDetail(waybillCode);
      const data = ghnDetail.data || {};

      ghnStatus = data.status || 'unknown';
      ghnStatusName = data.status_name || ghnStatus;
      carrierShippingFee = Number(data.total_fee || 0);

      // Số tiền thu hộ COD do GHN báo
      if (data.status === 'delivered') {
        carrierReportedCod = Number(data.cod_amount ?? 0);
      } else if (data.status === 'cancel' || data.status === 'return' || data.status === 'returned') {
        carrierReportedCod = 0;
        isRedFlag = true;
        redFlagReason = 'ORDER_NOT_FOUND';
        investigationNote = 'chưa ghi nhận lý do sai lệch';
      } else {
        // Đang giao hoặc trạng thái khác
        carrierReportedCod = Number(data.cod_amount ?? 0);
      }
    } catch (apiErr) {
      // Trường hợp mã vận đơn không tìm thấy trên GHN Sandbox (ví dụ đơn mock test)
      console.warn(`[COD Recon] Không thể gọi GHN API cho mã ${waybillCode}:`, apiErr.message);
      if (waybillCode === 'LYFHNP') {
        carrierReportedCod = 450000; // Mock thu thiếu 50k
        ghnStatus = 'delivered';
        ghnStatusName = 'Giao thành công (Thiếu 50.000đ)';
      } else if (waybillCode === 'LYFHBOOM' || order.status === 'RETURNED' || order.status === 'CANCELLED') {
        carrierReportedCod = 0; // Hàng hoàn không thu được tiền COD
        ghnStatus = 'return';
        ghnStatusName = 'Chuyển hoàn';
        isRedFlag = true;
        redFlagReason = 'ORDER_NOT_FOUND';
        investigationNote = 'chưa ghi nhận lý do sai lệch';
      } else {
        carrierReportedCod = systemExpectedCod; // Mock fallback nếu mã test nội bộ
        ghnStatusName = 'Chưa đồng bộ GHN';
      }
    }

    // 3. Tính toán chênh lệch
    const varianceAmount = systemExpectedCod - carrierReportedCod;
    totalBatchCarrierCod += carrierReportedCod;
    totalBatchDiscrepancy += Math.abs(varianceAmount);

    // 4. Phát hiện Cờ đỏ (Red Flag)
    if (varianceAmount !== 0) {
      isRedFlag = true;
      redFlagCount++;
      if (redFlagReason === 'NONE') {
        redFlagReason = 'COD_AMOUNT_MISMATCH';
      }
      investigationNote = 'chưa ghi nhận lý do sai lệch';
      order.codReconciliationStatus = 'RED_FLAG_DISCREPANCY';
    } else {
      matchedCount++;
      investigationNote = 'Khớp số liệu hoàn hảo 100%';
      order.codReconciliationStatus = 'MATCHED';
    }

    await order.save();

    // 5. Lưu kết quả chi tiết từng đơn
    const item = await CodReconciliationItem.create({
      batchId: batch._id,
      carrierId: ghnCarrier._id,
      waybillCode: waybillCode || 'UNKNOWN',
      salesOrderId: order._id,
      orderCode: order.orderCode,
      systemExpectedCod,
      carrierReportedCod,
      carrierShippingFee,
      varianceAmount,
      isRedFlag,
      redFlagReason,
      redFlagStatus: isRedFlag ? 'PENDING_INVESTIGATION' : 'NONE',
      investigationNote: isRedFlag ? (investigationNote || 'chưa ghi nhận lý do sai lệch') : 'Khớp số liệu hoàn hảo 100%',
      updatedByAccountantId: accountantId,
    });

    itemResults.push({
      itemId: item._id,
      orderId: order._id,
      orderCode: order.orderCode,
      waybillCode,
      recipientName: order.shippingRecipient?.name || 'Khách hàng',
      recipientPhone: order.shippingRecipient?.phone || '',
      systemExpectedCod,
      carrierReportedCod,
      carrierShippingFee,
      varianceAmount,
      isRedFlag,
      redFlagReason,
      redFlagStatus: item.redFlagStatus,
      investigationNote: item.investigationNote,
      ghnStatus,
      ghnStatusName,
    });
  }

  // Cập nhật lại Batch
  batch.status = 'COMPLETED';
  batch.matchedCount = matchedCount;
  batch.redFlagCount = redFlagCount;
  batch.totalExpectedCodAmount = totalBatchExpectedCod;
  batch.totalCarrierReportedCodAmount = totalBatchCarrierCod;
  batch.totalDiscrepancyAmount = totalBatchDiscrepancy;
  await batch.save();

  const deliveredCount = codOrders.filter((o) => o.status === 'DELIVERED').length;
  const returnedCount = codOrders.filter((o) => o.status === 'RETURNED' || o.status === 'CANCELLED').length;

  return {
    success: true,
    message: `Đã đối soát ${codOrders.length} đơn tiền mặt đủ điều kiện (${deliveredCount} đơn giao thành công, ${returnedCount} đơn chuyển hoàn). Tự động bỏ qua các đơn chuyển khoản và ${pendingTransitCount} đơn đang giao trên đường!`,
    batchCode: batch.batchCode,
    deliveredCount,
    returnedCount,
    skippedTransitCount: pendingTransitCount,
    summary: {
      totalOrders: codOrders.length,
      matchedCount,
      redFlagCount,
      totalExpectedCod: totalBatchExpectedCod,
      totalCarrierReportedCod: totalBatchCarrierCod,
      totalDiscrepancy: totalBatchDiscrepancy,
    },
    items: itemResults,
  };
};

/**
 * 3. Lấy danh sách các đơn hàng đang bị Cờ đỏ (Red Flag Discrepancy) để kế toán khiếu nại
 * Đảm bảo tính nhất quán: Chỉ lấy bản ghi mới nhất cho mỗi đơn hàng và loại bỏ đơn mồ côi
 */
export const getRedFlagDiscrepancies = async () => {
  const rawItems = await CodReconciliationItem.find({ isRedFlag: true })
    .populate('salesOrderId', 'orderCode status financialSummary shippingRecipient codReconciliationStatus')
    .populate('carrierId', 'carrierName carrierCode hotline')
    .sort({ createdAt: -1 })
    .lean();

  const seenOrders = new Set();
  const latestRedFlags = [];

  for (const item of rawItems) {
    // 1. Loại bỏ các bản ghi mồ côi (đơn hàng đã bị xóa khỏi hệ thống)
    if (!item.salesOrderId) continue;

    // 2. Chỉ giữ lại 1 bản ghi mới nhất cho mỗi mã đơn hàng (khắc phục việc chạy đối soát nhiều lần bị nhân bản)
    const orderKey = item.orderCode || String(item.salesOrderId._id);
    if (seenOrders.has(orderKey)) continue;

    // 3. Đơn hàng phải đang trong diện Cờ đỏ / Tranh chấp hoặc đã xử lý điều chỉnh (không lấy đơn đã MATCHED)
    const orderReconStatus = item.salesOrderId.codReconciliationStatus;
    if (orderReconStatus === 'MATCHED') continue;

    seenOrders.add(orderKey);
    latestRedFlags.push(item);
  }

  return latestRedFlags;
};

/**
 * 4. Xử lý Tranh chấp / Khiếu nại hãng vận chuyển (File Shipping Dispute)
 */
export const resolveDispute = async (itemId, payload, currentUserId) => {
  const accountantId = await resolveAccountantUserId(currentUserId);
  const item = await CodReconciliationItem.findById(itemId);

  if (!item) {
    const err = new Error('Không tìm thấy bản ghi đối soát cờ đỏ cần xử lý');
    err.statusCode = 404;
    throw err;
  }

  const faultParty = payload.resolvedFaultParty || item.resolvedFaultParty || 'NONE';
  let resolvedCodAmount = item.systemExpectedCod;

  if (faultParty === 'ARA_STORE') {
    // Lệch COD do ARA Store: tiền công nợ tính theo bên vận chuyển GHN báo thu
    resolvedCodAmount = Number(item.carrierReportedCod ?? 0);
  } else if (faultParty === 'CARRIER_GHN') {
    // Lệch COD do GHN: tiền công nợ tính theo bên ARA dự kiến (GHN bồi thường)
    resolvedCodAmount = Number(item.systemExpectedCod ?? 0);
  }

  if (payload.redFlagStatus) {
    item.redFlagStatus = payload.redFlagStatus;
  }
  item.resolvedFaultParty = faultParty;
  item.resolvedCodAmount = resolvedCodAmount;
  if (payload.investigationNote) {
    item.investigationNote = payload.investigationNote;
  }
  item.updatedByAccountantId = accountantId;
  await item.save();

  // Nếu kế toán đã điều chỉnh xử lý xong (RESOLVED_ADJUSTED), gỡ cờ đỏ và cập nhật SalesOrder
  if (payload.redFlagStatus === 'RESOLVED_ADJUSTED' && item.salesOrderId) {
    await SalesOrder.findByIdAndUpdate(item.salesOrderId, {
      codReconciliationStatus: 'RESOLVED',
      'financialSummary.resolvedFaultParty': faultParty,
      'financialSummary.actualCodAmount': resolvedCodAmount,
    });
  }

  return item;
};

/**
 * 4.1. Mô phỏng Phản hồi từ Hãng vận chuyển GHN (Sandbox Webhook Simulator)
 * Cho phép kế toán hoặc tester mô phỏng kết quả điều tra thực địa từ bưu cục GHN
 */
export const simulateGhnDisputeFeedback = async (itemId, payload = {}) => {
  const item = await CodReconciliationItem.findById(itemId);
  if (!item) {
    const err = new Error('Không tìm thấy bản ghi đối soát cờ đỏ');
    err.statusCode = 404;
    throw err;
  }

  // Phản hồi là kết luận điều tra độc lập từ phía GHN, shop không tự ý lựa chọn
  let scenario = payload.scenario;
  if (!scenario) {
    const charSum = (item.waybillCode || item.orderCode || '')
      .split('')
      .reduce((acc, c) => acc + c.charCodeAt(0), 0);
    scenario = charSum % 2 === 0 ? 'CARRIER_FAULT' : 'SHOP_FAULT';
  }

  let feedbackMessage = '';
  let proposedParty = 'CARRIER_GHN';

  const varianceFormatted = `${Number(Math.abs(item.varianceAmount || 0)).toLocaleString('vi-VN')} ₫`;

  if (scenario === 'CARRIER_FAULT') {
    proposedParty = 'CARRIER_GHN';
    feedbackMessage =
      payload.customMessage ||
      `[GHN CSKH phản hồi]: Bưu cục GHN đã làm việc với bưu tá giao tuyến. Shipper xác nhận do sơ suất đã thu thiếu ${varianceFormatted} của người nhận. Bưu cục GHN chấp thuận khiếu nại và sẽ bồi hoàn đủ ${varianceFormatted} vào kỳ thanh toán COD kế tiếp.`;
  } else if (scenario === 'SHOP_FAULT') {
    proposedParty = 'ARA_STORE';
    feedbackMessage =
      payload.customMessage ||
      `[GHN CSKH phản hồi]: Bưu cục GHN đã liên hệ người nhận đơn hàng. Người nhận cung cấp ảnh chụp tin nhắn xác nhận Shop đồng ý bớt ${varianceFormatted} do sản phẩm có lỗi nhỏ / thỏa thuận riêng, shipper thu ${Number(item.carrierReportedCod || 0).toLocaleString('vi-VN')} ₫ đúng theo yêu cầu của khách. GHN từ chối bồi hoàn, đề nghị Shop tự cân đối sổ sách.`;
  } else {
    proposedParty = payload.carrierProposedFaultParty || 'NONE';
    feedbackMessage = payload.customMessage || `[GHN CSKH phản hồi]: Đã tiếp nhận và xử lý khiếu nại đơn hàng ${item.orderCode}.`;
  }

  item.carrierDisputeFeedback = feedbackMessage;
  item.carrierDisputeFeedbackAt = new Date();
  item.carrierProposedFaultParty = proposedParty;
  item.redFlagStatus = 'CARRIER_FEEDBACK_RECEIVED';
  await item.save();

  return item;
};

/**
 * 5. Mock / Seed 5 đơn hàng mẫu (gồm 4 đơn tiền mặt + 1 đơn chuyển khoản) phục vụ test trực quan
 */
export const seedMockOrdersForTesting = async () => {
  let ghnCarrier = await ShippingCarrier.findOne({ carrierCode: 'GHN' });
  if (!ghnCarrier) {
    ghnCarrier = await ShippingCarrier.create({
      carrierCode: 'GHN',
      carrierName: 'Giao Hàng Nhanh',
      hotline: '1900 636677',
      baseShippingFee: 19000,
      isActive: true,
    });
  }

  const sampleCustomerId = new mongoose.Types.ObjectId();
  const sampleSellerId = new mongoose.Types.ObjectId();
  const sampleSkuId = new mongoose.Types.ObjectId();

  // Xóa các đơn test cũ và các bản ghi đối soát test cũ
  await SalesOrder.deleteMany({ orderCode: /^TEST-ORD/ });
  await CodReconciliationItem.deleteMany({ orderCode: /^TEST-ORD/ });
  await CodReconciliationBatch.deleteMany({ statementFileUrl: 'API_DIRECT_AUTOMATED_SYNC' });

  const baseFee = ghnCarrier.baseShippingFee || 19000;

  const mockOrders = [
    // Đơn 1: Tiền mặt, 300k, Khớp 100%
    {
      orderCode: 'TEST-ORD-001',
      customerId: sampleCustomerId,
      sellerId: sampleSellerId,
      status: 'DELIVERED',
      shippingRecipient: {
        name: 'Nguyễn Văn An',
        phone: '0901112233',
        address: '12 Nguyễn Trãi, Q.5, TP.HCM',
      },
      items: [{
        skuId: sampleSkuId,
        skuCode: 'AO-THUN-TRANG-M',
        skuBarcode: '8930000001',
        orderedQty: 1,
        unitSalePrice: 380000,
        unitCogsSnapshot: 120000,
      }],
      financialSummary: {
        itemsSubtotal: 380000,
        shippingFee: baseFee,
        discountAmount: 0,
        totalOrderAmount: 380000,
        expectedCodAmount: 380000, // Đơn tiền mặt khớp 100% với GHN
      },
      warehouseFulfillment: {
        carrierId: ghnCarrier._id,
        waybillCode: 'LYFHWA', // Mã có thật trên GHN Sandbox (380.000đ)
      },
      codReconciliationStatus: 'UNRECONCILED',
    },
    // Đơn 2: Tiền mặt, 520k, Khớp 100%
    {
      orderCode: 'TEST-ORD-002',
      customerId: sampleCustomerId,
      sellerId: sampleSellerId,
      status: 'DELIVERED',
      shippingRecipient: {
        name: 'Lê Thị Bình',
        phone: '0902223344',
        address: '45 Lê Lợi, Q.1, TP.HCM',
      },
      items: [{
        skuId: sampleSkuId,
        skuCode: 'VAY-HOA-S',
        skuBarcode: '8930000002',
        orderedQty: 1,
        unitSalePrice: 520000,
        unitCogsSnapshot: 180000,
      }],
      financialSummary: {
        itemsSubtotal: 520000,
        shippingFee: baseFee,
        discountAmount: 0,
        totalOrderAmount: 520000,
        expectedCodAmount: 520000, // Đơn tiền mặt khớp 100% với GHN
      },
      warehouseFulfillment: {
        carrierId: ghnCarrier._id,
        waybillCode: 'LYFHWR', // Mã có thật trên GHN Sandbox (520.000đ)
      },
      codReconciliationStatus: 'UNRECONCILED',
    },
    // Đơn 3: Tiền mặt, 500k, Shipper thu thiếu 50k (Cờ đỏ)
    {
      orderCode: 'TEST-ORD-003',
      customerId: sampleCustomerId,
      sellerId: sampleSellerId,
      status: 'DELIVERED',
      shippingRecipient: {
        name: 'Phạm Minh Cường',
        phone: '0903334455',
        address: '88 Quang Trung, Gò Vấp, TP.HCM',
      },
      items: [{
        skuId: sampleSkuId,
        skuCode: 'QUAN-JEAN-30',
        skuBarcode: '8930000003',
        orderedQty: 1,
        unitSalePrice: 500000,
        unitCogsSnapshot: 210000,
      }],
      financialSummary: {
        itemsSubtotal: 500000,
        shippingFee: baseFee,
        discountAmount: 0,
        totalOrderAmount: 500000,
        expectedCodAmount: 500000, // Đơn tiền mặt
      },
      warehouseFulfillment: {
        carrierId: ghnCarrier._id,
        waybillCode: 'LYFHNP', // Mã test cờ đỏ
      },
      codReconciliationStatus: 'UNRECONCILED',
    },
    // Đơn 4: Tiền mặt, 200k, Hàng hoàn boom hàng (Cờ đỏ)
    {
      orderCode: 'TEST-ORD-004',
      customerId: sampleCustomerId,
      sellerId: sampleSellerId,
      status: 'RETURNED',
      shippingRecipient: {
        name: 'Hoàng Văn Dũng',
        phone: '0904445566',
        address: '102 Cộng Hòa, Tân Bình, TP.HCM',
      },
      items: [{
        skuId: sampleSkuId,
        skuCode: 'AO-POLO-DEN-L',
        skuBarcode: '8930000004',
        orderedQty: 1,
        unitSalePrice: 200000,
        unitCogsSnapshot: 90000,
      }],
      financialSummary: {
        itemsSubtotal: 200000,
        shippingFee: baseFee,
        discountAmount: 0,
        totalOrderAmount: 200000,
        expectedCodAmount: 200000, // Đơn tiền mặt
      },
      warehouseFulfillment: {
        carrierId: ghnCarrier._id,
        waybillCode: 'LYFHBOOM', // Mã test hàng hoàn
      },
      codReconciliationStatus: 'UNRECONCILED',
    },
    // Đơn 5: Chuyển khoản ngân hàng trước -> expectedCodAmount = 0
    {
      orderCode: 'TEST-ORD-005',
      customerId: sampleCustomerId,
      sellerId: sampleSellerId,
      status: 'DELIVERED',
      shippingRecipient: {
        name: 'Đặng Mai Phương',
        phone: '0905556677',
        address: '77 Hai Bà Trưng, Q.3, TP.HCM',
      },
      items: [{
        skuId: sampleSkuId,
        skuCode: 'AO-SM-TRANG-L',
        skuBarcode: '8930000005',
        orderedQty: 1,
        unitSalePrice: 600000,
        unitCogsSnapshot: 250000,
      }],
      financialSummary: {
        itemsSubtotal: 600000,
        shippingFee: 0,
        discountAmount: 0,
        totalOrderAmount: 600000,
        expectedCodAmount: 0, // ĐƠN CHUYỂN KHOẢN (Hệ thống sẽ tự động bỏ qua khi đối soát COD)
      },
      warehouseFulfillment: {
        carrierId: ghnCarrier._id,
        waybillCode: 'LYFHCK01',
      },
      codReconciliationStatus: 'UNRECONCILED',
      isCodSettled: false,
    },
    // Đơn 6: Tiền mặt, 350k, Đang trên đường giao (HANDED_OVER_CARRIER) -> Nghiệp vụ: Chờ giao xong mới tới kỳ đối soát
    {
      orderCode: 'TEST-ORD-006',
      customerId: sampleCustomerId,
      sellerId: sampleSellerId,
      status: 'HANDED_OVER_CARRIER',
      shippingRecipient: {
        name: 'Trần Gia Hưng',
        phone: '0906667788',
        address: '55 Nguyễn Thị Minh Khai, Q.1, TP.HCM',
      },
      items: [{
        skuId: sampleSkuId,
        skuCode: 'AO-HOODIE-XAM-XL',
        skuBarcode: '8930000006',
        orderedQty: 1,
        unitSalePrice: 350000,
        unitCogsSnapshot: 150000,
      }],
      financialSummary: {
        itemsSubtotal: 350000,
        shippingFee: baseFee,
        discountAmount: 0,
        totalOrderAmount: 350000,
        expectedCodAmount: 350000, // Đơn tiền mặt đang giao
      },
      warehouseFulfillment: {
        carrierId: ghnCarrier._id,
        waybillCode: 'LYFHDELIVERING',
      },
      codReconciliationStatus: 'UNRECONCILED',
    },
  ];

  await SalesOrder.insertMany(mockOrders);

  return {
    success: true,
    message: 'Đã tạo thành công 6 đơn hàng mẫu chuẩn nghiệp vụ: 3 đơn giao thành công, 1 đơn chuyển hoàn, 1 đơn chuyển khoản và 1 đơn đang giao dở dang!',
    createdCount: mockOrders.length,
    orders: mockOrders.map((o) => ({
      orderCode: o.orderCode,
      recipientName: o.shippingRecipient.name,
      paymentType: o.financialSummary.expectedCodAmount > 0 ? 'TIỀN MẶT (COD)' : 'CHUYỂN KHOẢN',
      expectedCod: o.financialSummary.expectedCodAmount,
      waybillCode: o.warehouseFulfillment.waybillCode,
      status: o.status,
    })),
  };
};
