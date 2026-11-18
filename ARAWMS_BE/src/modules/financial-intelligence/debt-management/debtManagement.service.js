import mongoose from 'mongoose';
import {
  Supplier,
  SupplierContract,
  CashFlowVoucher,
  MaterialInboundPlan,
  ShippingCarrier,
  SalesOrder,
  CodReconciliationBatch,
  CodReconciliationItem,
} from '../../../models/index.js';

/**
 * 1. LẤY TỔNG QUAN CÔNG NỢ NHÀ CUNG CẤP (SUPPLIER DEBT OVERVIEW & AGING)
 * Quét toàn bộ NCC, tính tổng nợ, nợ trong hạn, nợ quá hạn và phân nhóm tuổi nợ
 */
export const getSupplierDebtOverview = async () => {
  const suppliers = await Supplier.find({ isActive: { $ne: false } }).lean();
  const now = new Date();

  const [contracts, vouchers, inboundPlans] = await Promise.all([
    SupplierContract.find({
      status: 'ACTIVE', // Nghiệp vụ: Công nợ chỉ tính trên các hợp đồng đang ACTIVE có hiệu lực
    }).lean(),
    CashFlowVoucher.find({
      flowType: 'CASH_OUT',
      status: 'PAID',
      supplierId: { $ne: null },
    }).lean(),
    MaterialInboundPlan.find({
      status: { $in: ['VERIFIED_MATCHED', 'DEVIATION_RESOLVED', 'SCHEDULED', 'IN_INSPECTION'] },
    }).lean(),
  ]);

  let totalSupplierDebt = 0;
  let totalOverdueDebt = 0;
  let totalDueSoonDebt = 0;
  let totalInTermDebt = 0;
  let suppliersWithDebtCount = 0;

  const supplierDebtList = suppliers.map((sup) => {
    const supIdStr = String(sup._id);

    // Hợp đồng của NCC này
    const supContracts = contracts.filter(
      (c) => String(c.supplierId?._id || c.supplierId) === supIdStr
    );

    // Phiếu chi tiền đã trả cho NCC này
    const supVouchers = vouchers.filter(
      (v) => String(v.supplierId?._id || v.supplierId) === supIdStr
    );

    // Kế hoạch nhập hàng của NCC này
    const supPlans = inboundPlans.filter(
      (p) => String(p.supplierId?._id || p.supplierId) === supIdStr
    );

    // Tổng tiền hợp đồng cam kết
    const totalContractedAmount = supContracts.reduce(
      (sum, c) => sum + (Number(c.totalContractAmount) || 0),
      0
    );

    // Tổng tiền đã thanh toán (PAID)
    const totalPaidAmount = supVouchers.reduce(
      (sum, v) => sum + (Number(v.amount) || 0),
      0
    );

    // Số dư nợ hiện tại
    const currentDebt = Math.max(0, totalContractedAmount - totalPaidAmount);

    // Hạn tín dụng mặc định từ hợp đồng hoặc 30 ngày
    const creditDays = supContracts[0]?.commercialTerms?.paymentCreditDays ?? 30;

    // Tính ngày đến hạn (dueDate) gần nhất
    let earliestDueDate = null;
    let isOverdue = false;
    let isDueSoon = false;
    let daysDiff = 0; // > 0: quá hạn X ngày, < 0: còn X ngày

    if (supContracts.length > 0 && currentDebt > 0) {
      // Tìm ngày đến hạn sớm nhất từ paymentSchedule hoặc signingDate + creditDays
      const dueDates = [];
      supContracts.forEach((c) => {
        if (Array.isArray(c.commercialTerms?.paymentSchedule) && c.commercialTerms.paymentSchedule.length > 0) {
          c.commercialTerms.paymentSchedule.forEach((sch) => {
            if (sch.dueDate) dueDates.push(new Date(sch.dueDate));
          });
        } else if (c.effectiveFrom || c.signingDate) {
          const baseDate = new Date(c.effectiveFrom || c.signingDate);
          const d = new Date(baseDate);
          d.setDate(d.getDate() + creditDays);
          dueDates.push(d);
        }
      });

      if (dueDates.length > 0) {
        dueDates.sort((a, b) => a - b);
        earliestDueDate = dueDates[0];
        const diffMs = now.getTime() - earliestDueDate.getTime();
        daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (daysDiff > 0) {
          isOverdue = true;
        } else if (Math.abs(daysDiff) <= 7) {
          isDueSoon = true;
        }
      }
    }

    // Phân nhóm tuổi nợ (Aging bucket)
    let agingCategory = 'IN_TERM';
    if (currentDebt === 0) {
      agingCategory = 'SETTLED';
    } else if (isOverdue) {
      if (daysDiff <= 30) agingCategory = 'OVERDUE_1_30';
      else if (daysDiff <= 60) agingCategory = 'OVERDUE_31_60';
      else agingCategory = 'OVERDUE_OVER_60';
    } else if (isDueSoon) {
      agingCategory = 'DUE_SOON';
    }

    if (currentDebt > 0) {
      suppliersWithDebtCount++;
      totalSupplierDebt += currentDebt;
      if (isOverdue) totalOverdueDebt += currentDebt;
      else if (isDueSoon) totalDueSoonDebt += currentDebt;
      else totalInTermDebt += currentDebt;
    }

    return {
      supplierId: sup._id,
      supplierCode: sup.supplierCode,
      supplierName: sup.supplierName,
      contactPerson: sup.contactPerson || sup.contactName || '',
      phone: sup.phone || '',
      taxCode: sup.taxCode || '',
      bankInfo: sup.bankInfo || {},
      contractsCount: supContracts.length,
      plansCount: supPlans.length,
      vouchersCount: supVouchers.length,
      totalContractedAmount,
      totalPaidAmount,
      currentDebt,
      creditDays,
      earliestDueDate,
      daysDiff,
      isOverdue,
      isDueSoon,
      agingCategory,
    };
  });

  // Sắp xếp: Ưu tiên nợ quá hạn lên đầu, sau đó đến số dư nợ giảm dần
  supplierDebtList.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return b.currentDebt - a.currentDebt;
  });

  return {
    kpis: {
      totalSupplierDebt,
      totalOverdueDebt,
      totalDueSoonDebt,
      totalInTermDebt,
      suppliersWithDebtCount,
      totalSuppliersCount: suppliers.length,
    },
    suppliers: supplierDebtList,
  };
};

/**
 * 2. LẤY SỔ CHI TIẾT CÔNG NỢ THEO TỪNG NHÀ CUNG CẤP (SUPPLIER STATEMENT OF ACCOUNT)
 * Bảng kê dòng thời gian các giao dịch Tăng nợ (HĐ/Nhập kho) và Giảm nợ (Phiếu chi/Giảm trừ)
 */
export const getSupplierDebtLedger = async (supplierId) => {
  const supplier = await Supplier.findById(supplierId).lean();
  if (!supplier) {
    const err = new Error('Không tìm thấy thông tin nhà cung ứng');
    err.statusCode = 404;
    throw err;
  }

  const [contracts, vouchers, inboundPlans] = await Promise.all([
    SupplierContract.find({
      supplierId,
      status: 'ACTIVE', // Nghiệp vụ: Sổ chi tiết công nợ chỉ ghi nhận các hợp đồng đang ACTIVE có hiệu lực
    }).lean(),
    CashFlowVoucher.find({
      supplierId,
      flowType: 'CASH_OUT',
      status: 'PAID',
    }).lean(),
    MaterialInboundPlan.find({
      supplierId,
      status: { $in: ['VERIFIED_MATCHED', 'DEVIATION_RESOLVED'] },
    }).lean(),
  ]);

  const transactions = [];

  // A. Bút toán phát sinh TĂNG NỢ từ Hợp đồng mua sắm
  contracts.forEach((c) => {
    transactions.push({
      id: `CONTRACT_${c._id}`,
      type: 'CONTRACT_SIGNING',
      typeName: 'Ký kết Hợp đồng mua sắm',
      documentCode: c.contractCode,
      date: c.signingDate || c.effectiveFrom || c.createdAt,
      description: `Hợp đồng cung ứng nguyên phụ liệu: ${c.contractTitle || 'Vải may mặc'}`,
      increaseAmount: Number(c.totalContractAmount || 0),
      decreaseAmount: 0,
      refId: c._id,
      refType: 'SupplierContract',
    });
  });

  // B. Bút toán phát sinh GIẢM NỢ từ Phiếu chi tiền mặt/ngân hàng (CashFlowVoucher)
  vouchers.forEach((v) => {
    transactions.push({
      id: `VOUCHER_${v._id}`,
      type: 'PAYMENT_DISBURSEMENT',
      typeName: v.category === 'SUPPLIER_DEPOSIT' ? 'Chi tiền cọc NCC' : 'Chi thanh toán tiền hàng',
      documentCode: v.voucherCode,
      date: v.paidAt || v.voucherDate || v.createdAt,
      description: v.paymentReason || 'Thanh toán tiền hàng nguyên phụ liệu',
      increaseAmount: 0,
      decreaseAmount: Number(v.amount || 0),
      paymentMethod: v.paymentMethod,
      transactionReference: v.transactionReference || '',
      refId: v._id,
      refType: 'CashFlowVoucher',
    });
  });

  // Sắp xếp các giao dịch theo ngày tăng dần để tính số dư lũy kế
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = 0;
  const ledgerEntries = transactions.map((tx) => {
    runningBalance = runningBalance + tx.increaseAmount - tx.decreaseAmount;
    return {
      ...tx,
      runningBalance: Math.max(0, runningBalance),
    };
  });

  const totalContractedAmount = contracts.reduce((sum, c) => sum + (Number(c.totalContractAmount) || 0), 0);
  const totalPaidAmount = vouchers.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
  const closingBalance = Math.max(0, totalContractedAmount - totalPaidAmount);

  return {
    supplier: {
      _id: supplier._id,
      supplierCode: supplier.supplierCode,
      supplierName: supplier.supplierName,
      contactPerson: supplier.contactPerson || supplier.contactName || '',
      phone: supplier.phone || '',
      taxCode: supplier.taxCode || '',
      bankInfo: supplier.bankInfo || {},
      address: supplier.address || '',
    },
    summary: {
      totalContractedAmount,
      totalPaidAmount,
      closingBalance,
      totalTransactions: ledgerEntries.length,
    },
    contracts,
    ledgerEntries,
  };
};

/**
 * 3. LẤY TỔNG QUAN CÔNG NỢ HÃNG VẬN CHUYỂN GHN (CARRIER DEBT & COD NETTING)
 * Tính toán tiền COD thu hộ (Phải thu), Cước vận chuyển (Phải trả) và Số tiền thực nhận (Net Balance)
 */
export const getCarrierDebtOverview = async () => {
  // Tìm đối tác GHN
  let carrier = await ShippingCarrier.findOne({ carrierCode: 'GHN' }).lean();
  if (!carrier) {
    carrier = await ShippingCarrier.findOne().lean();
  }

  // Quét danh sách đơn hàng xuất kho giao vận qua GHN (BẮT BUỘC CHỈ TÍNH ĐƠN TIỀN MẶT COD > 0)
  const carrierQuery = {
    'financialSummary.expectedCodAmount': { $gt: 0 },
    $or: [
      { 'warehouseFulfillment.carrierId': carrier?._id },
      { 'warehouseFulfillment.waybillCode': { $regex: /^GHN|^LYFH/i } },
      { codReconciliationStatus: { $in: ['MATCHED', 'RED_FLAG_DISCREPANCY', 'RESOLVED'] } },
    ],
  };

  const [orders, reconciliationBatches] = await Promise.all([
    SalesOrder.find(carrierQuery)
      .select('orderCode status warehouseFulfillment financialSummary codReconciliationStatus isCodSettled codSettledAt codSettlementVoucherId isShippingFeeSettled shippingFeeSettledAt shippingFeeSettlementVoucherId createdAt')
      .lean(),
    CodReconciliationBatch.find()
      .sort({ createdAt: -1 })
      .limit(7)
      .lean(),
  ]);

  let totalOrdersCount = orders.length;
  let deliveredOrdersCount = 0;
  let deliveredCodOrdersCount = 0;
  let returnedOrdersCount = 0;
  let inTransitOrdersCount = 0;
  let otherOrdersCount = 0;

  let totalCodCollected = 0;     // GHN đã thu hộ thành công CHƯA TẤT TOÁN (Phải thu)
  let totalPendingCod = 0;        // Đang trên đường giao
  let totalShippingFee = 0;       // Tổng cước phí vận chuyển của các đơn CHƯA TẤT TOÁN (Phải trả)
  let redFlagDiscrepancyCount = 0;
  let totalDiscrepancyAmount = 0;

  orders.forEach((o) => {
    const fee = Number(o.financialSummary?.shippingFee ?? carrier?.baseShippingFee ?? 19000);
    const feeUnsettled = !o.isShippingFeeSettled;
    
    // Quy tắc tính tiền COD theo bên chịu trách nhiệm sai lệch:
    // - Lệch do ARA Store (resolvedFaultParty === 'ARA_STORE'): Tính theo bên Vận chuyển GHN báo thu (actualCodAmount)
    // - Lệch do GHN (resolvedFaultParty === 'CARRIER_GHN') hoặc chưa xử lý: Tính theo bên ARA dự kiến (expectedCodAmount)
    let cod = Number(o.financialSummary?.expectedCodAmount || 0);
    if (o.financialSummary?.resolvedFaultParty === 'ARA_STORE') {
      cod = Number(o.financialSummary?.actualCodAmount ?? o.financialSummary?.expectedCodAmount ?? 0);
    }

    if (o.status === 'DELIVERED') {
      deliveredOrdersCount++;
      if (cod > 0) {
        deliveredCodOrdersCount++;
        // Chỉ tính vào công nợ phải thu hiện tại nếu đơn CHƯA ĐƯỢC TẤT TOÁN TIỀN
        if (!o.isCodSettled) {
          totalCodCollected += cod;
        }
      }
      if (feeUnsettled) {
        totalShippingFee += fee;
      }
    } else if (o.status === 'RETURNED' || o.status === 'CANCELLED') {
      returnedOrdersCount++;
      if (feeUnsettled) {
        totalShippingFee += fee;
      }
    } else if (o.status === 'HANDED_OVER_CARRIER' || o.status === 'CARRIER_PICKED_UP') {
      inTransitOrdersCount++;
      totalPendingCod += cod;
      if (feeUnsettled) {
        totalShippingFee += fee;
      }
    } else {
      otherOrdersCount++;
    }

    if (o.codReconciliationStatus === 'RED_FLAG_DISCREPANCY') {
      redFlagDiscrepancyCount++;
    }
  });

  // Tính số tiền thực nhận sau bù trừ hai chiều (Net Balance)
  // Thực nhận = Tổng tiền COD GHN thu chưa tất toán - Tổng cước phí vận chuyển chưa tất toán
  const netAmount = totalCodCollected - totalShippingFee;
  const carrierDebtToShop = Math.max(0, netAmount);   // GHN nợ Shop (tiền COD thực nhận sau bù trừ cước)
  const shopDebtToCarrier = Math.max(0, -netAmount);  // Shop nợ GHN (cước phí ship còn nợ)
  const netReceivableAmount = carrierDebtToShop;      // Giữ để tương thích ngược

  // Lấy danh sách chi tiết các đơn hàng thuộc các đợt đối soát gần đây
  const batchIds = reconciliationBatches.map((b) => b._id);
  const reconciliationItems = await CodReconciliationItem.find({ batchId: { $in: batchIds } })
    .select('batchId orderCode waybillCode systemExpectedCod carrierReportedCod varianceAmount isRedFlag redFlagReason reconciliationStatus')
    .lean();

  const itemsByBatch = {};
  reconciliationItems.forEach((it) => {
    const bId = it.batchId.toString();
    if (!itemsByBatch[bId]) itemsByBatch[bId] = [];
    itemsByBatch[bId].push({
      orderCode: it.orderCode,
      waybillCode: it.waybillCode,
      systemExpectedCod: it.systemExpectedCod,
      carrierReportedCod: it.carrierReportedCod,
      varianceAmount: it.varianceAmount,
      isRedFlag: it.isRedFlag,
      redFlagReason: it.redFlagReason,
      reconciliationStatus: it.reconciliationStatus,
    });
  });

  // Lấy chi tiết các đợt đối soát gần đây kèm danh sách đơn
  const batchesSummary = reconciliationBatches.map((b) => ({
    batchId: b._id,
    batchCode: b.batchCode,
    status: b.status,
    totalWaybillsCount: b.totalWaybillsCount,
    matchedCount: b.matchedCount,
    redFlagCount: b.redFlagCount,
    totalExpectedCodAmount: b.totalExpectedCodAmount,
    totalCarrierReportedCodAmount: b.totalCarrierReportedCodAmount,
    totalDiscrepancyAmount: b.totalDiscrepancyAmount,
    createdAt: b.createdAt,
    items: itemsByBatch[b._id.toString()] || [],
  }));

  // Lấy chi tiết các đơn giao thành công có thu tiền mặt cấu thành khoản COD thu hộ
  // Áp dụng số tiền COD thực tế sau điều chỉnh (nếu lệch do ARA Store thì tính theo GHN thu)
  const deliveredOrders = orders
    .filter((o) => {
      if (o.status !== 'DELIVERED') return false;
      let cod = Number(o.financialSummary?.expectedCodAmount || 0);
      if (o.financialSummary?.resolvedFaultParty === 'ARA_STORE') {
        cod = Number(o.financialSummary?.actualCodAmount ?? o.financialSummary?.expectedCodAmount ?? 0);
      }
      return cod > 0;
    })
    .map((o) => {
      let effectiveCod = Number(o.financialSummary?.expectedCodAmount || 0);
      if (o.financialSummary?.resolvedFaultParty === 'ARA_STORE') {
        effectiveCod = Number(o.financialSummary?.actualCodAmount ?? o.financialSummary?.expectedCodAmount ?? 0);
      }
      return {
        orderId: o._id,
        orderCode: o.orderCode,
        waybillCode: o.warehouseFulfillment?.waybillCode || '—',
        codAmount: effectiveCod,
        shippingFee: Number(o.financialSummary?.shippingFee || 19000),
        codReconciliationStatus: o.codReconciliationStatus,
        resolvedFaultParty: o.financialSummary?.resolvedFaultParty || 'NONE',
        isCodSettled: !!o.isCodSettled,
        codSettledAt: o.codSettledAt,
        createdAt: o.createdAt,
      };
    })
    .sort((a, b) => b.codAmount - a.codAmount);

  // Lấy lịch sử các đợt tất toán COD và chi trả cước phí GHN (CASH_IN: CARRIER_COD_PAYOUT & CASH_OUT: SHIPPING_COST)
  const settlementVouchers = await CashFlowVoucher.find({
    $or: [
      { flowType: 'CASH_IN', category: 'CARRIER_COD_PAYOUT' },
      { flowType: 'CASH_OUT', category: 'SHIPPING_COST' },
    ],
  })
    .sort({ paidAt: -1, voucherDate: -1, createdAt: -1 })
    .lean();

  const voucherIds = settlementVouchers.map((v) => v._id);
  const settledOrdersByVoucher = await SalesOrder.find({
    $or: [
      { codSettlementVoucherId: { $in: voucherIds } },
      { shippingFeeSettlementVoucherId: { $in: voucherIds } },
    ],
  })
    .select('orderCode warehouseFulfillment financialSummary codSettlementVoucherId shippingFeeSettlementVoucherId status createdAt')
    .lean();

  const ordersByVoucherMap = {};
  settledOrdersByVoucher.forEach((o) => {
    const vId = (o.codSettlementVoucherId || o.shippingFeeSettlementVoucherId)?.toString();
    if (!vId) return;
    if (!ordersByVoucherMap[vId]) ordersByVoucherMap[vId] = [];
    ordersByVoucherMap[vId].push({
      orderCode: o.orderCode,
      waybillCode: o.warehouseFulfillment?.waybillCode || '—',
      codAmount: Number(o.financialSummary?.actualCodAmount ?? o.financialSummary?.expectedCodAmount ?? 0),
      shippingFee: Number(o.financialSummary?.shippingFee ?? 19000),
      status: o.status,
    });
  });

  const settlementHistory = settlementVouchers.map((v) => ({
    voucherId: v._id,
    voucherCode: v.voucherCode,
    flowType: v.flowType,
    flowTypeName: v.flowType === 'CASH_IN' ? 'Thu tiền COD' : 'Chi trả cước phí',
    amount: v.amount,
    paymentMethod: v.paymentMethod,
    bankInfo: v.bankInfo || {},
    transactionReference: v.transactionReference || '—',
    voucherDate: v.voucherDate || v.paidAt || v.createdAt,
    paidAt: v.paidAt || v.createdAt,
    paymentReason: v.paymentReason,
    notes: v.notes,
    settledOrdersCount: (ordersByVoucherMap[v._id.toString()] || []).length,
    settledOrders: ordersByVoucherMap[v._id.toString()] || [],
  }));

  return {
    carrier: carrier || { carrierCode: 'GHN', carrierName: 'Giao Hàng Nhanh' },
    metrics: {
      totalOrdersCount,
      deliveredOrdersCount,
      deliveredCodOrdersCount,
      returnedOrdersCount,
      inTransitOrdersCount,
      otherOrdersCount,
      totalCodCollected,        // Phải thu từ đơn giao thành công chưa tất toán
      totalPendingCod,          // COD dự kiến từ đơn đang giao
      totalShippingFee,         // Cước phí vận chuyển chưa tất toán
      netAmount,                // Tổng thực nhận sau bù trừ (Dương: GHN nợ Shop, Âm: Shop nợ GHN)
      carrierDebtToShop,        // Số tiền GHN nợ Shop (Thực nhận COD)
      shopDebtToCarrier,        // Số tiền Shop nợ GHN (Cước phí vận chuyển)
      netReceivableAmount,      // Giữ để tương thích ngược (= carrierDebtToShop)
      redFlagDiscrepancyCount,  // Số đơn cờ đỏ sai lệch
      totalDiscrepancyAmount,
    },
    deliveredOrders,
    recentBatches: batchesSummary,
    settlementHistory,
  };
};

/**
 * Cập nhật cấu hình cước phí vận chuyển thỏa thuận (Base Shipping Fee) cho đối tác GHN
 */
export const updateCarrierConfig = async (payload = {}) => {
  const { baseShippingFee, updateExistingOrders } = payload;
  const fee = Number(baseShippingFee);
  if (isNaN(fee) || fee < 0) {
    const err = new Error('Cước phí vận chuyển thỏa thuận phải là một số không âm');
    err.statusCode = 400;
    throw err;
  }

  let carrier = await ShippingCarrier.findOneAndUpdate(
    { carrierCode: 'GHN' },
    { baseShippingFee: fee },
    { new: true, upsert: true }
  );

  // Nếu người dùng chọn cập nhật đồng bộ cho toàn bộ các đơn hàng hiện có (Chỉ áp dụng đơn giao vận GHN có COD)
  if (updateExistingOrders) {
    await SalesOrder.updateMany(
      {
        'financialSummary.expectedCodAmount': { $gt: 0 },
        $or: [
          { 'warehouseFulfillment.carrierId': carrier._id },
          { 'warehouseFulfillment.waybillCode': { $regex: /^GHN|^LYFH/i } },
        ],
      },
      {
        $set: { 'financialSummary.shippingFee': fee },
      }
    );
  }

  return carrier;
};

/**
 * 5. Xác nhận đã nhận tiền COD từ đối tác GHN (Tất toán công nợ kỳ đối soát & ghi nhận Phiếu Thu CASH_IN)
 */
export const settleCarrierCodPayment = async (payload = {}, currentUserId) => {
  const {
    amount,
    paymentMethod = 'BANK_TRANSFER',
    bankInfo = {},
    transactionReference,
    notes,
    voucherDate,
  } = payload;

  const settleAmount = Number(amount);
  if (isNaN(settleAmount) || settleAmount <= 0) {
    const err = new Error('Số tiền thanh toán phải lớn hơn 0.');
    err.statusCode = 400;
    throw err;
  }

  if (!transactionReference || !transactionReference.trim()) {
    const err = new Error('Vui lòng nhập mã giao dịch ngân hàng / số chứng từ đối soát.');
    err.statusCode = 400;
    throw err;
  }

  let carrier = await ShippingCarrier.findOne({ carrierCode: 'GHN' });
  if (!carrier) {
    carrier = await ShippingCarrier.findOne();
  }

  // Quét các đơn giao thành công chưa tất toán (BẮT BUỘC CHỈ TẤT TOÁN ĐƠN TIỀN MẶT COD > 0)
  const carrierQuery = {
    status: 'DELIVERED',
    'financialSummary.expectedCodAmount': { $gt: 0 },
    isCodSettled: { $ne: true },
    $or: [
      { 'warehouseFulfillment.carrierId': carrier?._id },
      { 'warehouseFulfillment.waybillCode': { $regex: /^GHN|^LYFH/i } },
      { codReconciliationStatus: { $in: ['MATCHED', 'RED_FLAG_DISCREPANCY', 'RESOLVED'] } },
    ],
  };

  const unsettledOrders = await SalesOrder.find(carrierQuery);

  // Sinh mã phiếu thu duy nhất
  const count = await CashFlowVoucher.countDocuments({ category: 'CARRIER_COD_PAYOUT' });
  const voucherCode = `PT-COD-GHN-${String(count + 1).padStart(4, '0')}`;

  const voucher = await CashFlowVoucher.create({
    voucherCode,
    flowType: 'CASH_IN',
    category: 'CARRIER_COD_PAYOUT',
    paymentReason: notes?.trim() || `Tất toán tiền thu hộ COD từ Giao Hàng Nhanh sau bù trừ cước phí`,
    recipient: {
      name: carrier?.carrierName || 'Giao Hàng Nhanh (GHN)',
      phone: carrier?.hotline || '1900 636677',
      recipientType: 'CARRIER',
    },
    carrierId: carrier?._id,
    amount: settleAmount,
    paymentMethod,
    bankInfo: {
      bankName: bankInfo.bankName || 'Ngân hàng TMCP Quân Đội (MB)',
      accountNo: bankInfo.accountNo || '0988888888',
      accountHolder: bankInfo.accountHolder || 'ARA STORE CO., LTD',
      branchName: bankInfo.branchName || 'Hội sở chính',
    },
    status: 'PAID',
    transactionReference: transactionReference.trim(),
    voucherDate: voucherDate ? new Date(voucherDate) : new Date(),
    paidAt: new Date(),
    createdByAccountantId: currentUserId || new mongoose.Types.ObjectId(),
    confirmedByAccountantId: currentUserId,
    confirmedAt: new Date(),
    paidByUserId: currentUserId,
    notes: notes || '',
  });

  // Đánh dấu các đơn hàng đã tất toán COD và cước phí (do cước phí đã bù trừ trực tiếp)
  const orderIds = unsettledOrders.map((o) => o._id);
  if (orderIds.length > 0) {
    await SalesOrder.updateMany(
      { _id: { $in: orderIds } },
      {
        $set: {
          isCodSettled: true,
          codSettledAt: new Date(),
          codSettlementVoucherId: voucher._id,
          isShippingFeeSettled: true,
          shippingFeeSettledAt: new Date(),
          shippingFeeSettlementVoucherId: voucher._id,
        },
      }
    );
  }

  return {
    voucher,
    settledOrdersCount: orderIds.length,
    settledOrderCodes: unsettledOrders.map((o) => o.orderCode),
  };
};

/**
 * 6. Xác nhận thanh toán cước phí vận chuyển cho GHN (Tất toán công nợ cước phí & ghi nhận Phiếu Chi CASH_OUT)
 */
export const settleCarrierShippingFeePayment = async (payload = {}, currentUserId) => {
  const {
    amount,
    paymentMethod = 'BANK_TRANSFER',
    bankInfo = {},
    transactionReference,
    notes,
    voucherDate,
  } = payload;

  const settleAmount = Number(amount);
  if (isNaN(settleAmount) || settleAmount <= 0) {
    const err = new Error('Số tiền thanh toán cước phí phải lớn hơn 0.');
    err.statusCode = 400;
    throw err;
  }

  if (!transactionReference || !transactionReference.trim()) {
    const err = new Error('Vui lòng nhập mã giao dịch ngân hàng / số chứng từ chuyển tiền.');
    err.statusCode = 400;
    throw err;
  }

  let carrier = await ShippingCarrier.findOne({ carrierCode: 'GHN' });
  if (!carrier) {
    carrier = await ShippingCarrier.findOne();
  }

  // Quét các đơn hàng giao qua GHN có cước chưa được tất toán
  const carrierOrdersQuery = {
    isShippingFeeSettled: { $ne: true },
    $or: [
      { 'warehouseFulfillment.carrierId': carrier?._id },
      { 'warehouseFulfillment.waybillCode': { $regex: /^GHN|^LYFH/i } },
      { codReconciliationStatus: { $in: ['MATCHED', 'RED_FLAG_DISCREPANCY', 'RESOLVED'] } },
      { 'financialSummary.expectedCodAmount': { $gt: 0 } },
    ],
  };

  const unsettledShippingOrders = await SalesOrder.find(carrierOrdersQuery);

  // Sinh mã phiếu chi cước GHN
  const count = await CashFlowVoucher.countDocuments({
    flowType: 'CASH_OUT',
    category: 'SHIPPING_COST',
  });
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const voucherCode = `PC-GHN-${todayStr}-${String(count + 1).padStart(4, '0')}`;

  const voucher = await CashFlowVoucher.create({
    voucherCode,
    flowType: 'CASH_OUT',
    category: 'SHIPPING_COST',
    paymentReason: notes?.trim() || `Thanh toán cước phí vận chuyển nợ đối tác Giao Hàng Nhanh (GHN)`,
    recipient: {
      name: carrier?.carrierName || 'Công ty Cổ phần Dịch vụ Giao Hàng Nhanh (GHN)',
      phone: carrier?.hotline || '1900 636677',
      address: 'Tòa nhà Rivera Park, 7/28 Thành Thái, Phường 14, Quận 10, TP. Hồ Chí Minh',
      recipientType: 'CARRIER',
    },
    carrierId: carrier?._id,
    amount: settleAmount,
    paymentMethod,
    bankInfo: {
      bankName: bankInfo.bankName || 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)',
      accountNo: bankInfo.accountNo || '12345678999',
      accountHolder: bankInfo.accountHolder || 'CONG TY CO PHAN DICH VU GIAO HANG NHANH',
      branchName: bankInfo.branchName || 'Chi nhánh TP.HCM',
    },
    status: 'PAID',
    transactionReference: transactionReference.trim(),
    voucherDate: voucherDate ? new Date(voucherDate) : new Date(),
    paidAt: new Date(),
    createdByAccountantId: currentUserId || new mongoose.Types.ObjectId(),
    confirmedByAccountantId: currentUserId,
    confirmedAt: new Date(),
    paidByUserId: currentUserId,
    notes: notes || '',
  });

  // Đánh dấu cước phí các đơn hàng này đã được tất toán
  const orderIds = unsettledShippingOrders.map((o) => o._id);
  if (orderIds.length > 0) {
    await SalesOrder.updateMany(
      { _id: { $in: orderIds } },
      {
        $set: {
          isShippingFeeSettled: true,
          shippingFeeSettledAt: new Date(),
          shippingFeeSettlementVoucherId: voucher._id,
        },
      }
    );
  }

  return {
    voucher,
    settledOrdersCount: orderIds.length,
    settledOrderCodes: unsettledShippingOrders.map((o) => o.orderCode),
  };
};

export default {
  getSupplierDebtOverview,
  getSupplierDebtLedger,
  getCarrierDebtOverview,
  updateCarrierConfig,
  settleCarrierCodPayment,
  settleCarrierShippingFeePayment,
};

