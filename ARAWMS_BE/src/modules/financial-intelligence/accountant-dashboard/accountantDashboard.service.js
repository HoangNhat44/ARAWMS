/*
 * File: accountantDashboard.service.js
 * Role: ACCOUNTANT / FINANCIAL_INTELLIGENCE
 * Description: Aggregates financial KPIs, cash flow, debt, inventory valuation, COD reconciliation,
 *              COGS/revenue trends, and period-over-period comparisons for Accountant Dashboard.
 */
import CashFlowVoucher from '../../../models/CashFlowVoucher.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import CodReconciliationItem from '../../../models/CodReconciliationItem.model.js';
import MaterialInboundPlan from '../../../models/MaterialInboundPlan.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import debtManagementService from '../debt-management/debtManagement.service.js';
import { getValuationSummary as getProductValuationSummary } from '../product-inventory-valuation/productValuation.service.js';
import { getRawMaterialValuationSummary } from '../raw-material-valuation/rawMaterialValuation.service.js';

const startOfDay = (d) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (d) => {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const formatShortDate = (d) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
};

const resolveDateRanges = (periodType = 'MONTH', fromDate = null, toDate = null) => {
  const now = new Date();
  let currStart;
  let currEnd;
  let prevStart;
  let prevEnd;
  let currLabel = '';
  let prevLabel = '';
  let granularity = 'DAY';

  if (periodType === 'WEEK') {
    const dayOfWeek = now.getDay(); // 0=CN, 1=T2..6=T7
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon));
    currEnd = endOfDay(new Date(currStart.getFullYear(), currStart.getMonth(), currStart.getDate() + 6));
    prevStart = startOfDay(new Date(currStart.getFullYear(), currStart.getMonth(), currStart.getDate() - 7));
    prevEnd = endOfDay(new Date(currStart.getFullYear(), currStart.getMonth(), currStart.getDate() - 1));
    currLabel = `Tuần này (${formatShortDate(currStart)} - ${formatShortDate(currEnd)})`;
    prevLabel = `Tuần trước (${formatShortDate(prevStart)} - ${formatShortDate(prevEnd)})`;
    granularity = 'DAY';
  } else if (periodType === 'QUARTER') {
    const q = Math.floor(now.getMonth() / 3);
    currStart = startOfDay(new Date(now.getFullYear(), q * 3, 1));
    currEnd = endOfDay(new Date(now.getFullYear(), q * 3 + 3, 0));
    const prevQStartMonth = q * 3 - 3;
    prevStart = startOfDay(new Date(now.getFullYear(), prevQStartMonth, 1));
    prevEnd = endOfDay(new Date(now.getFullYear(), prevQStartMonth + 3, 0));
    const prevQNum = q === 0 ? 4 : q;
    const prevYear = q === 0 ? now.getFullYear() - 1 : now.getFullYear();
    currLabel = `Quý ${q + 1}/${now.getFullYear()}`;
    prevLabel = `Quý ${prevQNum}/${prevYear}`;
    granularity = 'MONTH';
  } else if (periodType === 'YEAR') {
    currStart = startOfDay(new Date(now.getFullYear(), 0, 1));
    currEnd = endOfDay(new Date(now.getFullYear(), 11, 31));
    prevStart = startOfDay(new Date(now.getFullYear() - 1, 0, 1));
    prevEnd = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
    currLabel = `Năm ${now.getFullYear()}`;
    prevLabel = `Năm ${now.getFullYear() - 1}`;
    granularity = 'MONTH';
  } else if (periodType === 'CUSTOM' && fromDate && toDate) {
    currStart = startOfDay(new Date(fromDate));
    currEnd = endOfDay(new Date(toDate));
    const durationMs = currEnd.getTime() - currStart.getTime() + 1;
    const durationDays = Math.max(1, Math.round(durationMs / (1000 * 60 * 60 * 24)));
    prevEnd = endOfDay(new Date(currStart.getTime() - 1));
    prevStart = startOfDay(new Date(prevEnd.getTime() - (durationDays - 1) * 24 * 60 * 60 * 1000));
    currLabel = `${formatShortDate(currStart)} - ${formatShortDate(currEnd)}`;
    prevLabel = `${formatShortDate(prevStart)} - ${formatShortDate(prevEnd)}`;
    granularity = durationDays > 60 ? 'MONTH' : 'DAY';
  } else {
    // Default: MONTH
    currStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    currEnd = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    prevStart = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    prevEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    currLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevLabel = `Tháng ${prevDate.getMonth() + 1}/${prevDate.getFullYear()}`;
    granularity = 'DAY';
  }

  return {
    periodType,
    granularity,
    currentRange: { start: currStart, end: currEnd, label: currLabel },
    previousRange: { start: prevStart, end: prevEnd, label: prevLabel },
  };
};

const calcDelta = (currentVal, previousVal) => {
  const curr = Math.round(Number(currentVal || 0));
  const prev = Math.round(Number(previousVal || 0));
  const deltaAmount = curr - prev;

  let deltaPct = 0;
  let isNew = false;

  if (prev === 0) {
    if (curr > 0) {
      deltaPct = 100;
      isNew = true;
    } else if (curr < 0) {
      deltaPct = -100;
      isNew = true;
    }
  } else {
    deltaPct = Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(1));
  }

  return {
    current: curr,
    previous: prev,
    deltaAmount,
    deltaPct,
    isNew,
  };
};

const getBucketSlots = (periodType, granularity, currentRange, previousRange) => {
  const slots = [];
  if (granularity === 'MONTH') {
    const startYear = currentRange.start.getFullYear();
    const startMonth = currentRange.start.getMonth();
    const endYear = currentRange.end.getFullYear();
    const endMonth = currentRange.end.getMonth();
    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;

    for (let i = 0; i < totalMonths; i += 1) {
      const cDate = new Date(startYear, startMonth + i, 1);
      const pDate = new Date(previousRange.start.getFullYear(), previousRange.start.getMonth() + i, 1);
      const cKey = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`;
      const pKey = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
      slots.push({
        index: i,
        label: `T${cDate.getMonth() + 1}`,
        currKey: cKey,
        prevKey: pKey,
      });
    }
  } else {
    const dayMs = 1000 * 60 * 60 * 24;
    const totalDays = Math.min(
      62,
      Math.max(1, Math.round((currentRange.end.getTime() - currentRange.start.getTime()) / dayMs))
    );
    const weekDayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    for (let i = 0; i < totalDays; i += 1) {
      const cDate = new Date(currentRange.start.getFullYear(), currentRange.start.getMonth(), currentRange.start.getDate() + i);
      const pDate = new Date(previousRange.start.getFullYear(), previousRange.start.getMonth(), previousRange.start.getDate() + i);
      const cKey = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}-${String(cDate.getDate()).padStart(2, '0')}`;
      const pKey = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}-${String(pDate.getDate()).padStart(2, '0')}`;
      const label =
        periodType === 'WEEK'
          ? `${weekDayLabels[cDate.getDay()]} (${cDate.getDate()}/${cDate.getMonth() + 1})`
          : `${String(cDate.getDate()).padStart(2, '0')}/${String(cDate.getMonth() + 1).padStart(2, '0')}`;
      slots.push({
        index: i,
        label,
        currKey: cKey,
        prevKey: pKey,
      });
    }
  }
  return slots;
};

const aggregateCashFlowForRange = async (start, end, granularity) => {
  const dateFmt = granularity === 'MONTH' ? '%Y-%m' : '%Y-%m-%d';
  const [summaryRows, seriesRows, methodRows] = await Promise.all([
    CashFlowVoucher.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          status: { $in: ['CONFIRMED', 'PAID', 'COMPLETED'] },
          voucherDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: '$flowType',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    CashFlowVoucher.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          status: { $in: ['CONFIRMED', 'PAID', 'COMPLETED'] },
          voucherDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            bucket: { $dateToString: { format: dateFmt, date: '$voucherDate', timezone: '+07:00' } },
            flowType: '$flowType',
          },
          amount: { $sum: '$amount' },
        },
      },
    ]),
    CashFlowVoucher.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          status: { $in: ['CONFIRMED', 'PAID', 'COMPLETED'] },
          voucherDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { flowType: '$flowType', paymentMethod: '$paymentMethod' },
          amount: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  let cashIn = 0;
  let cashOut = 0;
  let countIn = 0;
  let countOut = 0;
  summaryRows.forEach((r) => {
    if (r._id === 'CASH_IN') {
      cashIn = r.totalAmount || 0;
      countIn = r.count || 0;
    } else if (r._id === 'CASH_OUT') {
      cashOut = r.totalAmount || 0;
      countOut = r.count || 0;
    }
  });

  const seriesMap = {};
  seriesRows.forEach((r) => {
    const key = r._id.bucket;
    if (!seriesMap[key]) seriesMap[key] = { CASH_IN: 0, CASH_OUT: 0 };
    seriesMap[key][r._id.flowType] = r.amount || 0;
  });

  const byMethod = { CASH: { in: 0, out: 0 }, BANK_TRANSFER: { in: 0, out: 0 }, OTHER: { in: 0, out: 0 } };
  methodRows.forEach((r) => {
    const m = byMethod[r._id.paymentMethod] ? r._id.paymentMethod : 'OTHER';
    if (r._id.flowType === 'CASH_IN') byMethod[m].in += r.amount || 0;
    else byMethod[m].out += r.amount || 0;
  });

  return {
    cashIn,
    cashOut,
    netCashFlow: cashIn - cashOut,
    countIn,
    countOut,
    byMethod,
    seriesMap,
  };
};

const aggregateSalesAndCogsForRange = async (start, end, granularity) => {
  const dateFmt = granularity === 'MONTH' ? '%Y-%m' : '%Y-%m-%d';
  const [summaryRows, seriesRows, codStatusRows] = await Promise.all([
    SalesOrder.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          status: { $ne: 'CANCELLED' },
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $project: {
          totalOrderAmount: { $ifNull: ['$financialSummary.totalOrderAmount', 0] },
          expectedCodAmount: { $ifNull: ['$financialSummary.expectedCodAmount', 0] },
          orderCogs: {
            $reduce: {
              input: { $ifNull: ['$items', []] },
              initialValue: 0,
              in: {
                $add: [
                  '$$value',
                  {
                    $multiply: [
                      { $ifNull: ['$$this.orderedQty', 0] },
                      { $ifNull: ['$$this.unitCogsSnapshot', 0] },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: '$totalOrderAmount' },
          totalCogs: { $sum: '$orderCogs' },
          totalExpectedCod: { $sum: '$expectedCodAmount' },
        },
      },
    ]),
    SalesOrder.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          status: { $ne: 'CANCELLED' },
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $project: {
          bucket: { $dateToString: { format: dateFmt, date: '$createdAt', timezone: '+07:00' } },
          totalOrderAmount: { $ifNull: ['$financialSummary.totalOrderAmount', 0] },
          orderCogs: {
            $reduce: {
              input: { $ifNull: ['$items', []] },
              initialValue: 0,
              in: {
                $add: [
                  '$$value',
                  {
                    $multiply: [
                      { $ifNull: ['$$this.orderedQty', 0] },
                      { $ifNull: ['$$this.unitCogsSnapshot', 0] },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$bucket',
          revenue: { $sum: '$totalOrderAmount' },
          cogs: { $sum: '$orderCogs' },
          orderCount: { $sum: 1 },
        },
      },
    ]),
    SalesOrder.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          status: { $ne: 'CANCELLED' },
          createdAt: { $gte: start, $lte: end },
          'financialSummary.expectedCodAmount': { $gt: 0 },
        },
      },
      {
        $group: {
          _id: '$codReconciliationStatus',
          count: { $sum: 1 },
          totalCod: { $sum: '$financialSummary.expectedCodAmount' },
        },
      },
    ]),
  ]);

  const summary = summaryRows[0] || {
    orderCount: 0,
    totalRevenue: 0,
    totalCogs: 0,
    totalExpectedCod: 0,
  };

  const seriesMap = {};
  seriesRows.forEach((r) => {
    seriesMap[r._id] = {
      revenue: r.revenue || 0,
      cogs: r.cogs || 0,
      grossProfit: (r.revenue || 0) - (r.cogs || 0),
      orderCount: r.orderCount || 0,
    };
  });

  const codBreakdown = {
    matchedCount: 0,
    matchedAmount: 0,
    pendingCount: 0,
    pendingAmount: 0,
    redFlagCount: 0,
    redFlagAmount: 0,
  };

  codStatusRows.forEach((r) => {
    const st = String(r._id || '');
    if (st === 'RECONCILED_MATCHED' || st === 'MATCHED') {
      codBreakdown.matchedCount += r.count || 0;
      codBreakdown.matchedAmount += r.totalCod || 0;
    } else if (st === 'RED_FLAG_DISCREPANCY' || st === 'DISCREPANCY') {
      codBreakdown.redFlagCount += r.count || 0;
      codBreakdown.redFlagAmount += r.totalCod || 0;
    } else {
      codBreakdown.pendingCount += r.count || 0;
      codBreakdown.pendingAmount += r.totalCod || 0;
    }
  });

  return {
    orderCount: summary.orderCount || 0,
    totalRevenue: summary.totalRevenue || 0,
    totalCogs: summary.totalCogs || 0,
    grossProfit: (summary.totalRevenue || 0) - (summary.totalCogs || 0),
    totalExpectedCod: summary.totalExpectedCod || 0,
    codBreakdown,
    seriesMap,
  };
};

export const getDashboardSummary = async ({ periodType = 'MONTH', fromDate = null, toDate = null } = {}) => {
  const { granularity, currentRange, previousRange } = resolveDateRanges(periodType, fromDate, toDate);
  const slots = getBucketSlots(periodType, granularity, currentRange, previousRange);

  const [
    currCashFlow,
    prevCashFlow,
    currSales,
    prevSales,
    supplierDebtOverview,
    carrierDebtOverview,
    productValuation,
    rawMaterialValuation,
    pendingRedFlagsAgg,
    openDisputesCount,
    openDeviationsCount,
    pendingRefundsAgg,
    recentVouchers,
  ] = await Promise.all([
    aggregateCashFlowForRange(currentRange.start, currentRange.end, granularity),
    aggregateCashFlowForRange(previousRange.start, previousRange.end, granularity),
    aggregateSalesAndCogsForRange(currentRange.start, currentRange.end, granularity),
    aggregateSalesAndCogsForRange(previousRange.start, previousRange.end, granularity),
    debtManagementService.getSupplierDebtOverview().catch(() => null),
    debtManagementService.getCarrierDebtOverview().catch(() => null),
    getProductValuationSummary().catch(() => null),
    getRawMaterialValuationSummary().catch(() => null),
    CodReconciliationItem.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          isRedFlag: true,
          redFlagStatus: { $in: ['PENDING_INVESTIGATION', 'ESCALATED_TO_DISPUTE'] },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalVariance: { $sum: { $abs: { $ifNull: ['$varianceAmount', 0] } } },
        },
      },
    ]),
    // Tranh chấp COD với ĐVVC được lưu trực tiếp trên dòng đối soát (redFlagStatus), không có bảng riêng.
    CodReconciliationItem.countDocuments({
      isDeleted: { $ne: true },
      isRedFlag: true,
      redFlagStatus: { $in: ['ESCALATED_TO_DISPUTE', 'CARRIER_FEEDBACK_RECEIVED'] },
    }).catch(() => 0),
    MaterialInboundPlan.countDocuments({
      isDeleted: { $ne: true },
      status: 'DEVIATION_REPORTED',
      'deviationResolution.status': { $ne: 'RESOLVED' },
    }).catch(() => 0),
    ReturnRequest.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          'refundRequest.status': 'PENDING_ACCOUNTANT',
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$refundRequest.requestedAmount', 0] } },
        },
      },
    ]),
    CashFlowVoucher.find({ isDeleted: { $ne: true } })
      .sort({ voucherDate: -1, createdAt: -1 })
      .limit(6)
      .select('voucherCode flowType category paymentReason recipient amount paymentMethod status voucherDate')
      .lean(),
  ]);

  // Build aligned time-series arrays for Period Comparison Charts
  const cashFlowTimeSeries = slots.map((slot) => {
    const c = currCashFlow.seriesMap[slot.currKey] || { CASH_IN: 0, CASH_OUT: 0 };
    const p = prevCashFlow.seriesMap[slot.prevKey] || { CASH_IN: 0, CASH_OUT: 0 };
    return {
      label: slot.label,
      currentIn: Math.round(c.CASH_IN || 0),
      currentOut: Math.round(c.CASH_OUT || 0),
      previousIn: Math.round(p.CASH_IN || 0),
      previousOut: Math.round(p.CASH_OUT || 0),
    };
  });

  const profitAndCogsSeries = slots.map((slot) => {
    const c = currSales.seriesMap[slot.currKey] || { revenue: 0, cogs: 0, grossProfit: 0 };
    const p = prevSales.seriesMap[slot.prevKey] || { revenue: 0, cogs: 0, grossProfit: 0 };
    return {
      label: slot.label,
      currentRevenue: Math.round(c.revenue || 0),
      currentCogs: Math.round(c.cogs || 0),
      currentGrossProfit: Math.round(c.grossProfit || 0),
      previousRevenue: Math.round(p.revenue || 0),
      previousCogs: Math.round(p.cogs || 0),
      previousGrossProfit: Math.round(p.grossProfit || 0),
    };
  });

  // Inventory Valuation Breakdown
  const pvSummary = productValuation?.summary || {};
  const rmSummary = rawMaterialValuation?.summary || {};
  const finishedOnHandVal = Math.round(Number(pvSummary.totalOnHandValue || 0));
  const finishedQuarantineVal = Math.round(Number(pvSummary.totalQuarantineValue || 0));
  const rawMaterialOnHandVal = Math.round(Number(rmSummary.totalOnHandValue || 0));
  const rawMaterialPendingVal = Math.round(Number(rmSummary.totalPendingValue || 0));
  const totalInventoryAssetValue =
    finishedOnHandVal + finishedQuarantineVal + rawMaterialOnHandVal + rawMaterialPendingVal;

  // Supplier Debt Summary
  const supplierKpis = supplierDebtOverview?.kpis || {};
  const topDebtSuppliers = (supplierDebtOverview?.suppliers || [])
    .filter((s) => Number(s.currentDebt || 0) > 0)
    .sort((a, b) => Number(b.currentDebt || 0) - Number(a.currentDebt || 0))
    .slice(0, 5)
    .map((s) => ({
      supplierId: s.supplierId || s._id,
      supplierCode: s.supplierCode || '',
      supplierName: s.supplierName || 'Nhà cung ứng',
      totalContractValue: Math.round(Number(s.totalContractedAmount || 0)),
      totalPaid: Math.round(Number(s.totalPaidAmount || 0)),
      remainingDebt: Math.round(Number(s.currentDebt || 0)),
      isOverdue: Boolean(s.isOverdue),
      isDueSoon: Boolean(s.isDueSoon),
    }));

  // Carrier COD Summary
  const carrierMetrics = carrierDebtOverview?.metrics || {};
  const pendingRedFlagInfo = pendingRedFlagsAgg[0] || { count: 0, totalVariance: 0 };
  const pendingRefundInfo = pendingRefundsAgg[0] || { count: 0, totalAmount: 0 };

  return {
    period: {
      periodType,
      granularity,
      current: {
        start: currentRange.start,
        end: currentRange.end,
        label: currentRange.label,
      },
      previous: {
        start: previousRange.start,
        end: previousRange.end,
        label: previousRange.label,
      },
    },
    kpis: {
      cashIn: calcDelta(currCashFlow.cashIn, prevCashFlow.cashIn),
      cashOut: calcDelta(currCashFlow.cashOut, prevCashFlow.cashOut),
      netCashFlow: calcDelta(currCashFlow.netCashFlow, prevCashFlow.netCashFlow),
      revenue: calcDelta(currSales.totalRevenue, prevSales.totalRevenue),
      cogs: calcDelta(currSales.totalCogs, prevSales.totalCogs),
      grossProfit: calcDelta(currSales.grossProfit, prevSales.grossProfit),
      orderCount: calcDelta(currSales.orderCount, prevSales.orderCount),
    },
    balanceSnapshot: {
      totalInventoryAssetValue,
      finishedGoodsValue: finishedOnHandVal,
      finishedQuarantineValue: finishedQuarantineVal,
      rawMaterialValue: rawMaterialOnHandVal,
      rawMaterialPendingValue: rawMaterialPendingVal,
      supplierTotalRemainingDebt: Math.round(Number(supplierKpis.totalSupplierDebt || 0)),
      supplierOverdueDebt: Math.round(Number(supplierKpis.totalOverdueDebt || 0)),
      supplierDueSoonDebt: Math.round(Number(supplierKpis.totalDueSoonDebt || 0)),
      supplierCountWithDebt: Number(supplierKpis.suppliersWithDebtCount || topDebtSuppliers.length || 0),
      carrierCodReceivable: Math.round(Number(carrierMetrics.totalCodCollected || 0)),
      carrierPendingCod: Math.round(Number(carrierMetrics.totalPendingCod || 0)),
      carrierUnpaidShippingFee: Math.round(Number(carrierMetrics.totalShippingFee || 0)),
      carrierNetAmount: Math.round(Number(carrierMetrics.netAmount || 0)),
    },
    charts: {
      cashFlowTimeSeries,
      profitAndCogsSeries,
      cashFlowMethods: {
        current: currCashFlow.byMethod,
        previous: prevCashFlow.byMethod,
      },
      codReconciliationComparison: {
        current: currSales.codBreakdown,
        previous: prevSales.codBreakdown,
      },
      inventoryBreakdown: [
        { key: 'RAW_MATERIAL', label: 'Nguyên phụ liệu tồn kho', value: rawMaterialOnHandVal, color: '#0F766E' },
        { key: 'RAW_PENDING', label: 'NPL chờ cất kệ (Putaway)', value: rawMaterialPendingVal, color: '#0284C7' },
        { key: 'FINISHED_GOODS', label: 'Thành phẩm sẵn sàng bán', value: finishedOnHandVal, color: '#9F8365' },
        { key: 'FINISHED_DEFECT', label: 'Thành phẩm lỗi / KCS cách ly', value: finishedQuarantineVal, color: '#DC2626' },
      ],
      topDebtSuppliers,
    },
    actionAlerts: {
      codRedFlagsCount: pendingRedFlagInfo.count || 0,
      codRedFlagsAmount: Math.round(pendingRedFlagInfo.totalVariance || 0),
      openDisputesCount: openDisputesCount || 0,
      openDeviationsCount: openDeviationsCount || 0,
      pendingRefundsCount: pendingRefundInfo.count || 0,
      pendingRefundsAmount: Math.round(pendingRefundInfo.totalAmount || 0),
      overdueSupplierDebt: Math.round(Number(supplierKpis.totalOverdueDebt || 0)),
    },
    recentVouchers: recentVouchers || [],
  };
};

export default {
  getDashboardSummary,
};
