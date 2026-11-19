/**
 * ============================================================================
 * @title        : Garment Technician Dashboard Service
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Tổng hợp số liệu Dashboard vận hành & chất lượng KCS cho Nhân viên Kỹ thuật
 *                 (Garment Technician): KCS thành phẩm xưởng may & cơ cấu nhóm lỗi, hàng hoàn/trả,
 *                 quản lý lô hàng, đối soát kế hoạch NPL, vải thừa thu hồi và kiểm kê.
 * @module       : Garment Technical / Dashboard
 * @layer        : Service
 * ============================================================================
 */

import FinishedGoodsTicket from '../../../models/FinishedGoodsTicket.model.js';
import ReturnInspection from '../../../models/ReturnInspection.model.js';
import GarmentLot from '../../../models/GarmentLot.model.js';
import MaterialInboundPlan from '../../../models/MaterialInboundPlan.model.js';
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import RemnantRecoveryRequest from '../../../models/RemnantRecoveryRequest.model.js';
import ProductUnit, { DEFECT_HELD_STATUSES } from '../../../models/ProductUnit.js';

const RANGE_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

const dateFilterFor = (range) => {
  const days = RANGE_DAYS[range] ?? 30;
  if (!days) return {};
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  return { createdAt: { $gte: from } };
};

const toDayKey = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Aggregates live metrics across all Garment Technician workflows for the requested period.
 * @param {object} query - { range: '7d' | '30d' | '90d' | 'all' }
 * @param {object} user
 */
export const getGarmentDashboardSummary = async (query = {}, user) => {
  const range = Object.prototype.hasOwnProperty.call(RANGE_DAYS, query.range) ? query.range : '30d';
  const periodFilter = dateFilterFor(range);

  const [
    sewingTickets,
    pendingReturnCount,
    finalizedReturns,
    lots,
    plans,
    stocktakes,
    remnants,
    defectiveUnitsCount,
  ] = await Promise.all([
    FinishedGoodsTicket.find({
      ticketType: 'INBOUND_FROM_SEWING',
      isDeleted: { $ne: true },
      ...periodFilter,
    })
      .populate({
        path: 'items.skuId',
        select: 'skuCode styleName color size productId',
        populate: { path: 'productId', select: 'productName' },
      })
      .sort({ createdAt: -1 })
      .lean(),

    ReturnInspection.countDocuments({
      sessionStatus: { $in: ['RECORDING', 'PENDING_REVIEW'] },
    }),

    ReturnInspection.find({
      $or: [{ sessionStatus: 'FINALIZED' }, { sessionStatus: { $exists: false } }],
      ...periodFilter,
    })
      .sort({ inspectedAt: -1, createdAt: -1 })
      .lean(),

    GarmentLot.find({
      isDeleted: { $ne: true },
      status: { $ne: 'CANCELLED' },
      ...periodFilter,
    })
      .select('lotCode lotType status quantity failedQty linkedTicketCode createdAt')
      .sort({ createdAt: -1 })
      .lean(),

    MaterialInboundPlan.find({
      isDeleted: { $ne: true },
      ...periodFilter,
    })
      .select('planCode status createdAt')
      .lean(),

    StocktakeSession.find({
      isDeleted: { $ne: true },
      ...(user?.roleCode === 'GARMENT_TECHNICIAN' ? { $or: [{ inspectorId: user._id }, { inspectorId: null }] } : {}),
    })
      .select('sessionCode status warehouseType dueAt createdAt')
      .lean(),

    RemnantRecoveryRequest.find({
      isDeleted: { $ne: true },
      ...periodFilter,
    })
      .select('requestCode measuredRemnantLengthMeters status createdAt')
      .lean(),

    // Hàng lỗi còn giữ: chờ kho nhận (DEFECT_PENDING) + đang trong kho hàng lỗi (DEFECTIVE).
    ProductUnit.countDocuments({ inventoryStatus: { $in: DEFECT_HELD_STATUSES } }),
  ]);

  // -------------------------------------------------------------------------
  // 1. KCS Thành phẩm Xưởng may (Finished Goods Sewing Inspection)
  // -------------------------------------------------------------------------
  let totalSewingBatch = 0;
  let totalSewingPassed = 0;
  let totalSewingFailed = 0;

  const defectCategoryMap = new Map();
  const defectActionMap = new Map();
  const skuStatsMap = new Map();
  const dailyMap = new Map();

  for (const ticket of sewingTickets) {
    const tBatch = Number(ticket.garmentInspection?.totalBatchQty) || 0;
    const tPassed = Number(ticket.garmentInspection?.passedQty) || 0;
    const tFailed = Number(ticket.garmentInspection?.failedDefectQty) || 0;

    totalSewingBatch += tBatch;
    totalSewingPassed += tPassed;
    totalSewingFailed += tFailed;

    if (tFailed > 0) {
      const action = ticket.defectAction && ticket.defectAction !== 'NONE' ? ticket.defectAction : 'REPAIR_AT_WORKSHOP';
      defectActionMap.set(action, (defectActionMap.get(action) || 0) + tFailed);
    }

    const dayKey = toDayKey(ticket.createdAt || new Date());
    const dayEntry = dailyMap.get(dayKey) || { date: dayKey, passedQty: 0, failedQty: 0, tickets: 0 };
    dayEntry.passedQty += tPassed;
    dayEntry.failedQty += tFailed;
    dayEntry.tickets += 1;
    dailyMap.set(dayKey, dayEntry);

    let perItemFailedTracked = 0;
    for (const item of ticket.items || []) {
      const skuObj = item.skuId;
      const skuKey = String(skuObj?._id || item.skuId || item.skuBarcode);
      const itemPassed = Number(item.expectedQty) || 0;
      const itemFailed = Number(item.failedQty) || 0;
      const itemTotal = Number(item.totalQty) || itemPassed + itemFailed;

      perItemFailedTracked += itemFailed;

      if (itemFailed > 0) {
        const cat = item.defectCategory && item.defectCategory !== 'NONE' ? item.defectCategory : 'OTHER';
        defectCategoryMap.set(cat, (defectCategoryMap.get(cat) || 0) + itemFailed);
      }

      const skuEntry = skuStatsMap.get(skuKey) || {
        skuId: skuKey,
        skuCode: skuObj?.skuCode || item.skuBarcode || 'Chưa có mã',
        productName: skuObj?.productId?.productName || skuObj?.styleName || skuObj?.skuCode || 'Sản phẩm',
        color: skuObj?.color || '',
        size: skuObj?.size || '',
        totalQty: 0,
        passedQty: 0,
        failedQty: 0,
        defectCategories: new Map(),
        latestDefectNote: '',
      };

      skuEntry.totalQty += itemTotal;
      skuEntry.passedQty += itemPassed;
      skuEntry.failedQty += itemFailed;
      if (itemFailed > 0) {
        const cat = item.defectCategory && item.defectCategory !== 'NONE' ? item.defectCategory : 'OTHER';
        skuEntry.defectCategories.set(cat, (skuEntry.defectCategories.get(cat) || 0) + itemFailed);
        if (!skuEntry.latestDefectNote && item.defectNote) {
          skuEntry.latestDefectNote = item.defectNote;
        }
      }
      skuStatsMap.set(skuKey, skuEntry);
    }

    // Legacy tickets created before per-row failedQty was saved: credit difference to OTHER
    if (tFailed > perItemFailedTracked) {
      const remainder = tFailed - perItemFailedTracked;
      defectCategoryMap.set('OTHER', (defectCategoryMap.get('OTHER') || 0) + remainder);
    }
  }

  const defectByCategory = [...defectCategoryMap.entries()]
    .map(([category, count]) => ({
      category,
      count,
      percentage: totalSewingFailed > 0 ? round1((count / totalSewingFailed) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const defectByAction = [...defectActionMap.entries()]
    .map(([action, count]) => ({
      action,
      count,
      percentage: totalSewingFailed > 0 ? round1((count / totalSewingFailed) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const topDefectSkus = [...skuStatsMap.values()]
    .filter((entry) => entry.failedQty > 0)
    .map((entry) => {
      const topCatEntry = [...entry.defectCategories.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        skuId: entry.skuId,
        skuCode: entry.skuCode,
        productName: entry.productName,
        color: entry.color,
        size: entry.size,
        totalQty: entry.totalQty,
        passedQty: entry.passedQty,
        failedQty: entry.failedQty,
        defectRate: entry.totalQty > 0 ? round1((entry.failedQty / entry.totalQty) * 100) : 0,
        topDefectCategory: topCatEntry ? topCatEntry[0] : 'OTHER',
        latestDefectNote: entry.latestDefectNote,
      };
    })
    .sort((a, b) => b.failedQty - a.failedQty)
    .slice(0, 8);

  const dailySewingTrend = [...dailyMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  // -------------------------------------------------------------------------
  // 2. Hàng hoàn / trả (Return Inspection — Phương án A)
  // -------------------------------------------------------------------------
  let returnPassedOrders = 0;
  let returnPartialOrders = 0;
  let returnFailedOrders = 0;
  let returnRestockUnits = 0;
  let returnDefectUnits = 0;
  const returnConditionMap = new Map();

  for (const insp of finalizedReturns) {
    if (insp.inspectionResult === 'PASSED') returnPassedOrders += 1;
    else if (insp.inspectionResult === 'PARTIAL') returnPartialOrders += 1;
    else returnFailedOrders += 1;

    if (Array.isArray(insp.scannedUnits) && insp.scannedUnits.length > 0) {
      for (const u of insp.scannedUnits) {
        if (u.disposition === 'QUARANTINE_DEFECT') {
          returnDefectUnits += 1;
          const cond = u.condition && u.condition !== 'GOOD_INTACT' ? u.condition : 'DIRTY_OR_DAMAGED';
          returnConditionMap.set(cond, (returnConditionMap.get(cond) || 0) + 1);
        } else {
          returnRestockUnits += 1;
        }
      }
    } else {
      for (const item of insp.items || []) {
        const qty = Number(item.quantity) || 1;
        if (item.passed === false || insp.inspectionResult === 'FAILED') {
          returnDefectUnits += qty;
          const cond = item.condition && item.condition !== 'GOOD_INTACT' ? item.condition : 'DIRTY_OR_DAMAGED';
          returnConditionMap.set(cond, (returnConditionMap.get(cond) || 0) + qty);
        } else {
          returnRestockUnits += qty;
        }
      }
    }
  }

  const returnConditionBreakdown = [...returnConditionMap.entries()]
    .map(([condition, count]) => ({
      condition,
      count,
      percentage: returnDefectUnits > 0 ? round1((count / returnDefectUnits) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // -------------------------------------------------------------------------
  // 3. Quản lý Lô hàng (GarmentLots)
  // -------------------------------------------------------------------------
  const summarizeLots = (lotType) => {
    const subset = lots.filter((l) => l.lotType === lotType);
    return {
      total: subset.length,
      draft: subset.filter((l) => l.status === 'DRAFT').length,
      requested: subset.filter((l) => l.status === 'REQUESTED').length,
      received: subset.filter((l) => l.status === 'RECEIVED').length,
    };
  };
  const fgLots = summarizeLots('FINISHED_GOODS');
  const rmLots = summarizeLots('RAW_MATERIAL');

  // -------------------------------------------------------------------------
  // 4. Kế hoạch NPL, Kiểm kê & Thu hồi vải thừa
  // -------------------------------------------------------------------------
  const planSummary = {
    total: plans.length,
    pendingVerification: plans.filter((p) => ['SCHEDULED', 'IN_INSPECTION'].includes(p.status)).length,
    matched: plans.filter((p) => p.status === 'VERIFIED_MATCHED').length,
    deviation: plans.filter((p) => p.status === 'DEVIATION_REPORTED').length,
  };

  const stocktakeSummary = {
    total: stocktakes.length,
    pending: stocktakes.filter((s) => ['WAITING', 'FROZEN_COUNTING'].includes(s.status)).length,
    inReview: stocktakes.filter((s) => s.status === 'VARIANCE_REVIEW').length,
    completed: stocktakes.filter((s) => s.status === 'APPROVED_COMPLETED').length,
  };

  const remnantSummary = {
    totalRequests: remnants.length,
    recoveredMeters: round1(
      remnants
        .filter((r) => !['CANCELLED', 'REJECTED', 'SCRAPPED_BELOW_THRESHOLD'].includes(r.status))
        .reduce((sum, r) => sum + (Number(r.measuredRemnantLengthMeters) || 0), 0)
    ),
    waitingConfirmation: remnants.filter((r) =>
      ['PENDING_RECEIPT_TICKET', 'WAITING_WAREHOUSE_CONFIRMATION'].includes(r.status)
    ).length,
    restocked: remnants.filter((r) => r.status === 'RESTOCKED').length,
  };

  // -------------------------------------------------------------------------
  // 5. Hoạt động KCS gần đây
  // -------------------------------------------------------------------------
  const recentActivities = [
    ...sewingTickets.slice(0, 5).map((t) => ({
      id: String(t._id),
      type: 'SEWING_KCS',
      code: t.ticketCode,
      title: `Kiểm định thành phẩm: ${t.garmentInspection?.passedQty || 0} đạt / ${t.garmentInspection?.failedDefectQty || 0} lỗi`,
      status: t.status,
      at: t.createdAt,
      link: '/garment/finished-goods-inspection',
    })),
    ...finalizedReturns.slice(0, 5).map((r) => ({
      id: String(r._id),
      type: 'RETURN_KCS',
      code: r.inspectionCode,
      title: `Kiểm tra hàng hoàn đơn ${r.orderCode}`,
      status: r.inspectionResult,
      at: r.inspectedAt || r.createdAt,
      link: '/garment/return-inspection',
    })),
    ...lots.slice(0, 4).map((l) => ({
      id: String(l._id),
      type: 'LOT',
      code: l.lotCode,
      title: `${l.lotType === 'FINISHED_GOODS' ? 'Lô Thành phẩm' : 'Lô Nguyên phụ liệu'} (${l.quantity} ${l.lotType === 'FINISHED_GOODS' ? 'sản phẩm' : 'đơn vị'})`,
      status: l.status,
      at: l.createdAt,
      link: '/garment/lots',
    })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8);

  return {
    range,
    actionQueue: {
      plansPendingVerification: planSummary.pendingVerification,
      returnsPendingReview: pendingReturnCount,
      draftLotsCount: fgLots.draft + rmLots.draft,
      stocktakesPending: stocktakeSummary.pending,
    },
    sewingKcs: {
      ticketCount: sewingTickets.length,
      totalBatchQty: totalSewingBatch,
      passedQty: totalSewingPassed,
      failedDefectQty: totalSewingFailed,
      passRate: totalSewingBatch > 0 ? round1((totalSewingPassed / totalSewingBatch) * 100) : 100,
      defectRate: totalSewingBatch > 0 ? round1((totalSewingFailed / totalSewingBatch) * 100) : 0,
      defectByCategory,
      defectByAction,
      topDefectSkus,
      dailySewingTrend,
    },
    returnKcs: {
      totalOrders: finalizedReturns.length,
      passedOrders: returnPassedOrders,
      partialOrders: returnPartialOrders,
      failedOrders: returnFailedOrders,
      passRate:
        finalizedReturns.length > 0 ? round1((returnPassedOrders / finalizedReturns.length) * 100) : 0,
      restockUnits: returnRestockUnits,
      defectUnits: returnDefectUnits,
      totalDefectiveProductUnitsInSystem: defectiveUnitsCount,
      conditionBreakdown: returnConditionBreakdown,
    },
    lots: {
      finishedGoods: fgLots,
      rawMaterials: rmLots,
      total: fgLots.total + rmLots.total,
    },
    materialPlans: planSummary,
    stocktake: stocktakeSummary,
    remnant: remnantSummary,
    recentActivities,
  };
};
