/*
 * File: warehouseReportSnapshot.js
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Builds the data of a warehouse statistics report for the Owner from what the system already
 * records. Stock figures are taken at the moment the snapshot is built; "in period" figures (returns,
 * cutting issues, stocktakes, movements) use the chosen date range. Stock value uses the listed price:
 * SKU retail price for finished goods, material unit cost for raw materials. No figure is typed by hand.
 *
 * Sections: A = finished goods warehouse, B = raw material warehouse, C = shared (locations, stocktake,
 * movements). The result is stored as ManagerReport.content and frozen when the report is sent.
 */
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import ReturnInspection from '../../../models/ReturnInspection.model.js';
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import StocktakeRecord from '../../../models/StocktakeRecord.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import User from '../../../models/User.model.js';

export const REPORT_SCHEMA = 'warehouse-report-v1';
const DAY = 24 * 60 * 60 * 1000;
const live = { isDeleted: { $ne: true } };
const id = (value) => String(value?._id || value || '');
const num = (value) => Number(value) || 0;
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const ageDays = (date, now) => (date ? Math.max(0, Math.floor((now - new Date(date).getTime()) / DAY)) : null);
const RETURN_CONDITIONS = ['GOOD_INTACT', 'MISSING_TAG', 'DIRTY_OR_DAMAGED', 'DEFECTIVE_SEWING', 'WRONG_ITEM', 'USED'];
// Inventory movement types grouped the way the warehouse talks about them.
const MOVEMENT_GROUPS = {
  INBOUND_RECEIPT: 'Nhập nguyên phụ liệu', INBOUND_PUTAWAY: 'Xếp hàng lên kệ', MANUAL_INBOUND: 'Nhập thành phẩm theo phiếu',
  REMNANT_RETURN_PUTAWAY: 'Vải thừa trả về kho', RETURN_RESTOCK: 'Hàng hoàn nhập lại', OUTBOUND_ISSUE_CUTTING: 'Xuất cấp xưởng cắt',
  ORDER_PACK_DEDUCT: 'Xuất đóng gói đơn', POS_DIRECT_SALE: 'Bán trực tiếp tại quầy', MANUAL_OUTBOUND: 'Xuất thành phẩm theo phiếu',
  ORDER_RESERVE: 'Giữ hàng cho đơn', ORDER_CANCEL_RELEASE: 'Nhả giữ hàng khi hủy đơn', DEFECT_QUARANTINE: 'Nhập kho hàng lỗi',
  DEFECT_DISPOSAL: 'Xuất kho hàng lỗi', SUPPLIER_RETURN_OUTBOUND: 'Trả nhà cung cấp', STOCKTAKE_ADJUSTMENT: 'Điều chỉnh sau kiểm kê',
};

/* ------------------------------------------------------------------ A. Finished goods */

async function finishedGoodsSection(range, now) {
  const [products, skus, defectUnits, batches] = await Promise.all([
    Product.find(live).select('productCode productName category isActive codeLockedAt').lean(),
    Sku.find(live).select('productId skuCode color size retailPrice onHandQty reservedQty safetyStockThreshold fifoAgingThresholdDays isActive discontinuedAt').lean(),
    ProductUnit.aggregate([{ $match: { inventoryStatus: { $in: ['DEFECT_PENDING', 'DEFECTIVE'] } } },
      { $group: { _id: { skuId: '$skuId', status: '$inventoryStatus' }, n: { $sum: 1 } } }]),
    FinishedGoodsBatch.find({ ...live, currentOnHandQty: { $gt: 0 }, isDefectQuarantine: { $ne: true } })
      .select('batchCode skuId locationId initialQty currentOnHandQty labeledQty fifoInboundTimestamp').lean(),
  ]);
  const productById = new Map(products.map((product) => [id(product), product]));
  const defectBySku = new Map();
  for (const row of defectUnits) {
    const entry = defectBySku.get(id(row._id.skuId)) || { pending: 0, inStock: 0 };
    if (row._id.status === 'DEFECT_PENDING') entry.pending += row.n; else entry.inStock += row.n;
    defectBySku.set(id(row._id.skuId), entry);
  }
  const locations = new Map((await WarehouseLocation.find({ _id: { $in: batches.map((batch) => batch.locationId) } })
    .select('locationCode').lean()).map((location) => [id(location), location.locationCode]));
  const batchesBySku = new Map();
  for (const batch of batches) {
    const list = batchesBySku.get(id(batch.skuId)) || [];
    list.push({ batchCode: batch.batchCode, locationCode: locations.get(id(batch.locationId)) || '',
      initialQty: num(batch.initialQty), remainingQty: num(batch.currentOnHandQty), labeledQty: num(batch.labeledQty),
      inboundAt: batch.fifoInboundTimestamp || null, ageDays: ageDays(batch.fifoInboundTimestamp, now) });
    batchesBySku.set(id(batch.skuId), list);
  }

  const totals = { onHand: 0, reserved: 0, available: 0, defect: 0, defectPending: 0, value: 0 };
  const split = { selling: 0, reserved: 0, defect: 0, stopped: 0 };
  const attention = { overReserved: [], belowSafety: [], aging: [], stoppedWithStock: [], draftWithStock: [], defective: [], unlabeled: [] };
  const tree = new Map();
  let checkedSkus = 0;
  let flaggedSkus = 0;
  for (const sku of skus) {
    const product = productById.get(id(sku.productId));
    if (!product) continue;
    const onHand = num(sku.onHandQty);
    const reserved = num(sku.reservedQty);
    const available = Math.max(0, onHand - reserved);
    const defects = defectBySku.get(id(sku)) || { pending: 0, inStock: 0 };
    const stopped = Boolean(sku.discontinuedAt);
    const legacyDraft = !product.isActive && !product.codeLockedAt;
    const value = onHand * num(sku.retailPrice);
    const lots = (batchesBySku.get(id(sku)) || []).sort((a, b) => new Date(a.inboundAt || 0) - new Date(b.inboundAt || 0));
    totals.onHand += onHand; totals.reserved += reserved; totals.available += available; totals.value += value;
    totals.defect += defects.inStock; totals.defectPending += defects.pending;
    if (stopped) split.stopped += onHand;
    else { split.selling += Math.max(0, onHand - reserved); split.reserved += Math.min(onHand, reserved); }
    split.defect += defects.inStock + defects.pending;

    const label = { skuCode: sku.skuCode, productName: product.productName, color: sku.color, size: sku.size };
    const flags = [];
    if (reserved > onHand) { attention.overReserved.push({ ...label, onHand, reserved, missing: reserved - onHand }); flags.push(1); }
    if (sku.isActive && available < num(sku.safetyStockThreshold)) {
      attention.belowSafety.push({ ...label, available, threshold: num(sku.safetyStockThreshold) }); flags.push(1);
    }
    const agingLimit = num(sku.fifoAgingThresholdDays) || 60;
    const oldLots = lots.filter((lot) => lot.ageDays != null && lot.ageDays > agingLimit);
    if (oldLots.length) {
      attention.aging.push({ ...label, quantity: oldLots.reduce((sum, lot) => sum + lot.remainingQty, 0),
        oldestDays: Math.max(...oldLots.map((lot) => lot.ageDays)), limitDays: agingLimit });
      flags.push(1);
    }
    if (stopped && (onHand > 0 || reserved > 0)) { attention.stoppedWithStock.push({ ...label, onHand, reserved, value }); flags.push(1); }
    if (legacyDraft && onHand > 0) { attention.draftWithStock.push({ ...label, onHand }); flags.push(1); }
    if (defects.inStock + defects.pending > 0) {
      attention.defective.push({ ...label, inStock: defects.inStock, pending: defects.pending }); flags.push(1);
    }
    const unlabeled = lots.reduce((sum, lot) => sum + Math.max(0, lot.remainingQty - lot.labeledQty), 0);
    if (unlabeled > 0) { attention.unlabeled.push({ ...label, quantity: unlabeled }); flags.push(1); }
    if (onHand > 0 || reserved > 0 || defects.inStock + defects.pending > 0 || sku.isActive) {
      checkedSkus += 1;
      if (flags.length) flaggedSkus += 1;
    }

    // Product -> color -> size tree (only variants that sell or still hold something).
    if (!sku.isActive && onHand === 0 && reserved === 0 && defects.inStock + defects.pending === 0) continue;
    const node = tree.get(id(product)) || { productCode: product.productCode, productName: product.productName,
      category: product.category, status: product.isActive ? 'SELLING' : legacyDraft ? 'DRAFT' : 'STOPPED',
      onHand: 0, reserved: 0, available: 0, defect: 0, value: 0, colors: new Map() };
    const color = node.colors.get(sku.color) || { color: sku.color, onHand: 0, reserved: 0, available: 0, defect: 0, value: 0, variants: [] };
    color.variants.push({ skuCode: sku.skuCode, size: sku.size, status: stopped ? 'STOPPED' : sku.isActive ? 'SELLING' : 'DRAFT',
      retailPrice: num(sku.retailPrice), onHand, reserved, available, defect: defects.inStock + defects.pending, value, lots });
    for (const target of [node, color]) {
      target.onHand += onHand; target.reserved += reserved; target.available += available;
      target.defect += defects.inStock + defects.pending; target.value += value;
    }
    node.colors.set(sku.color, color);
    tree.set(id(product), node);
  }
  const products$ = [...tree.values()].map((node) => ({ ...node, colors: [...node.colors.values()]
    .map((color) => ({ ...color, variants: color.variants.sort((a, b) => a.size.localeCompare(b.size)) })) }))
    .sort((a, b) => b.value - a.value || a.productCode.localeCompare(b.productCode));
  const splitTotal = split.selling + split.reserved + split.defect + split.stopped;

  return {
    overview: {
      ...totals,
      skuCount: { selling: skus.filter((sku) => sku.isActive).length, stopped: skus.filter((sku) => sku.discontinuedAt).length,
        draft: skus.filter((sku) => !sku.isActive && !sku.discontinuedAt).length },
      split: [
        { key: 'selling', label: 'Đang bán (có thể xuất)', quantity: split.selling, percent: percent(split.selling, splitTotal) },
        { key: 'reserved', label: 'Đang giữ cho đơn', quantity: split.reserved, percent: percent(split.reserved, splitTotal) },
        { key: 'defect', label: 'Hàng lỗi / cách ly', quantity: split.defect, percent: percent(split.defect, splitTotal) },
        { key: 'stopped', label: 'Ngừng bán còn tồn', quantity: split.stopped, percent: percent(split.stopped, splitTotal) },
      ],
    },
    products: products$,
    attention: { safeRate: percent(checkedSkus - flaggedSkus, checkedSkus), checkedSkus, flaggedSkus, groups: attention },
    returns: await returnsInPeriod(range),
  };
}

/** A4: return inspections finalized in the period, per unit. */
async function returnsInPeriod({ from, to }) {
  const inspections = await ReturnInspection.find({ inspectedAt: { $gte: from, $lt: to }, sessionStatus: { $ne: 'CANCELLED' } })
    .select('inspectionCode orderCode inspectionResult scannedUnits items').lean();
  const byCondition = Object.fromEntries(RETURN_CONDITIONS.map((key) => [key, 0]));
  let restocked = 0;
  let defective = 0;
  const results = { PASSED: 0, PARTIAL: 0, FAILED: 0 };
  for (const inspection of inspections) {
    if (inspection.inspectionResult in results) results[inspection.inspectionResult] += 1;
    // Newer inspections record each scanned unit; older ones only a line per SKU.
    const units = inspection.scannedUnits?.length ? inspection.scannedUnits.map((unit) => ({ quantity: 1, condition: unit.condition,
      defect: unit.disposition === 'QUARANTINE_DEFECT' }))
      : (inspection.items || []).map((item) => ({ quantity: num(item.quantity) || 1, condition: item.condition, defect: item.passed === false }));
    for (const unit of units) {
      if (unit.condition in byCondition) byCondition[unit.condition] += unit.quantity;
      if (unit.defect) defective += unit.quantity; else restocked += unit.quantity;
    }
  }
  const total = restocked + defective;
  return { inspections: inspections.length, results, total, restocked, defective,
    restockedPercent: percent(restocked, total), defectivePercent: percent(defective, total),
    byCondition: RETURN_CONDITIONS.map((key) => ({ key, quantity: byCondition[key] })) };
}

/* ------------------------------------------------------------------ B. Raw materials */

async function materialsSection(range, now) {
  const [materials, rolls, lots, cutting] = await Promise.all([
    RawMaterial.find(live).select('materialCode materialName materialType category unit color widthCm unitCost onHandQty reservedQty pendingPutawayQty safetyStockThreshold fifoAgingThresholdDays isActive').lean(),
    FabricRoll.find({ ...live, status: { $nin: ['DEPLETED', 'RETURNED_TO_SUPPLIER', 'ISSUED_FOR_CUTTING'] } })
      .select('rollBarcode rawMaterialId measuredWidthCm initialLengthMeters currentLengthMeters locationId status isRemnantRoll fifoInboundTimestamp putawayConfirmedAt').lean(),
    MaterialStockLot.find({ status: { $in: ['PENDING_PUTAWAY', 'IN_STOCK', 'QUARANTINED'] } })
      .select('lotBarcode rawMaterialId currentQty status fifoInboundTimestamp').lean(),
    InventoryTransaction.find({ transactionType: 'OUTBOUND_ISSUE_CUTTING', createdAt: { $gte: range.from, $lt: range.to } })
      .select('rawMaterialId referenceId quantityChange').lean(),
  ]);
  const materialById = new Map(materials.map((material) => [id(material), material]));
  const locationCodes = new Map((await WarehouseLocation.find({ _id: { $in: rolls.map((roll) => roll.locationId).filter(Boolean) } })
    .select('locationCode').lean()).map((location) => [id(location), location.locationCode]));
  const unitOf = (materialId) => materialById.get(id(materialId))?.unit || '';

  // Totals per material type and unit, never adding meters to pieces.
  const totalsByUnit = new Map();
  const totalFor = (type, unit) => {
    const key = `${type}:${unit}`;
    if (!totalsByUnit.has(key)) totalsByUnit.set(key, { materialType: type, unit, onHand: 0, reserved: 0, available: 0, pendingPutaway: 0, quarantine: 0, value: 0 });
    return totalsByUnit.get(key);
  };
  let value = 0;
  const items = materials.map((material) => {
    const onHand = num(material.onHandQty);
    const reserved = num(material.reservedQty);
    const row = { materialCode: material.materialCode, materialName: material.materialName, materialType: material.materialType,
      unit: material.unit, color: material.color || '', onHand, reserved, available: Math.max(0, onHand - reserved),
      pendingPutaway: num(material.pendingPutawayQty), unitCost: num(material.unitCost), value: onHand * num(material.unitCost) };
    const total = totalFor(material.materialType, material.unit);
    total.onHand += row.onHand; total.reserved += row.reserved; total.available += row.available;
    total.pendingPutaway += row.pendingPutaway; total.value += row.value;
    value += row.value;
    return row;
  }).sort((a, b) => b.value - a.value);

  const attention = { belowSafety: [], aging: [], pendingPutaway: [], pendingCheckOrDefect: [] };
  for (const material of materials) {
    const available = Math.max(0, num(material.onHandQty) - num(material.reservedQty));
    if (material.isActive !== false && available < num(material.safetyStockThreshold)) {
      attention.belowSafety.push({ materialCode: material.materialCode, materialName: material.materialName, unit: material.unit,
        available, threshold: num(material.safetyStockThreshold) });
    }
    if (num(material.pendingPutawayQty) > 0) {
      attention.pendingPutaway.push({ code: material.materialCode, name: material.materialName, unit: material.unit,
        quantity: num(material.pendingPutawayQty), source: 'Chờ lên kệ' });
    }
  }
  const agingLimitOf = (materialId) => num(materialById.get(id(materialId))?.fifoAgingThresholdDays) || 180;
  const rollRows = rolls.map((roll) => {
    const material = materialById.get(id(roll.rawMaterialId));
    const days = ageDays(roll.fifoInboundTimestamp, now);
    if (roll.status === 'DEFECTIVE') {
      totalFor('FABRIC', material?.unit || 'METER').quarantine += num(roll.currentLengthMeters);
      attention.pendingCheckOrDefect.push({ code: roll.rollBarcode, name: material?.materialName || '', unit: 'm',
        quantity: num(roll.currentLengthMeters), source: 'Cuộn lỗi' });
    } else if (roll.status === 'PENDING_QC') {
      attention.pendingCheckOrDefect.push({ code: roll.rollBarcode, name: material?.materialName || '', unit: 'm',
        quantity: num(roll.currentLengthMeters), source: 'Cuộn chờ kiểm' });
    }
    if (['QC_PASSED', 'IN_STOCK', 'REMNANT_RETURNED'].includes(roll.status) && !roll.putawayConfirmedAt && !roll.locationId) {
      attention.pendingPutaway.push({ code: roll.rollBarcode, name: material?.materialName || '', unit: 'm',
        quantity: num(roll.currentLengthMeters), source: 'Cuộn chưa lên kệ' });
    }
    if (days != null && days > agingLimitOf(roll.rawMaterialId) && num(roll.currentLengthMeters) > 0 && roll.status !== 'DEFECTIVE') {
      attention.aging.push({ code: roll.rollBarcode, name: material?.materialName || '', unit: 'm',
        quantity: num(roll.currentLengthMeters), ageDays: days, limitDays: agingLimitOf(roll.rawMaterialId) });
    }
    return { rollBarcode: roll.rollBarcode, materialCode: material?.materialCode || '', materialName: material?.materialName || '',
      widthCm: num(roll.measuredWidthCm) || num(material?.widthCm), initialMeters: num(roll.initialLengthMeters),
      remainingMeters: num(roll.currentLengthMeters), usedMeters: Math.max(0, num(roll.initialLengthMeters) - num(roll.currentLengthMeters)),
      isRemnant: Boolean(roll.isRemnantRoll), locationCode: locationCodes.get(id(roll.locationId)) || '', status: roll.status, ageDays: days };
  }).sort((a, b) => a.materialCode.localeCompare(b.materialCode) || a.rollBarcode.localeCompare(b.rollBarcode));
  for (const lot of lots) {
    const material = materialById.get(id(lot.rawMaterialId));
    const days = ageDays(lot.fifoInboundTimestamp, now);
    if (lot.status === 'QUARANTINED') {
      totalFor(material?.materialType || 'AUXILIARY', material?.unit || '').quarantine += num(lot.currentQty);
      attention.pendingCheckOrDefect.push({ code: lot.lotBarcode, name: material?.materialName || '', unit: unitOf(lot.rawMaterialId),
        quantity: num(lot.currentQty), source: 'Lô cách ly' });
    }
    if (lot.status === 'PENDING_PUTAWAY') {
      attention.pendingPutaway.push({ code: lot.lotBarcode, name: material?.materialName || '', unit: unitOf(lot.rawMaterialId),
        quantity: num(lot.currentQty), source: 'Lô chưa lên kệ' });
    }
    if (lot.status === 'IN_STOCK' && days != null && days > agingLimitOf(lot.rawMaterialId) && num(lot.currentQty) > 0) {
      attention.aging.push({ code: lot.lotBarcode, name: material?.materialName || '', unit: unitOf(lot.rawMaterialId),
        quantity: num(lot.currentQty), ageDays: days, limitDays: agingLimitOf(lot.rawMaterialId) });
    }
  }

  const cuttingByUnit = new Map();
  for (const movement of cutting) {
    const material = materialById.get(id(movement.rawMaterialId));
    const key = `${material?.materialType || 'AUXILIARY'}:${material?.unit || ''}`;
    const entry = cuttingByUnit.get(key) || { materialType: material?.materialType || 'AUXILIARY', unit: material?.unit || '', quantity: 0 };
    entry.quantity += Math.abs(num(movement.quantityChange));
    cuttingByUnit.set(key, entry);
  }

  return {
    overview: { totals: [...totalsByUnit.values()].sort((a, b) => a.materialType.localeCompare(b.materialType)), value,
      materialCount: materials.length, rollCount: rolls.length, remnantRollCount: rolls.filter((roll) => roll.isRemnantRoll).length },
    items, rolls: rollRows, attention,
    cutting: { documents: new Set(cutting.map((movement) => id(movement.referenceId))).size, lines: cutting.length,
      byUnit: [...cuttingByUnit.values()] },
  };
}

/* ------------------------------------------------------------------ C. Shared */

async function commonSection(range) {
  const [locations, unplacedUnits, sessions] = await Promise.all([
    WarehouseLocation.find(live).select('locationCode warehouseType status maxCapacity currentOccupancy isFrozenForStocktake isSystemUnplaced layoutBin').lean(),
    ProductUnit.countDocuments({ inventoryStatus: 'AVAILABLE',
      warehouseId: { $in: (await WarehouseLocation.find({ isSystemUnplaced: true }).select('_id').lean()).map((location) => location._id) } }),
    StocktakeSession.find({ ...live, $or: [{ createdAt: { $gte: range.from, $lt: range.to } }, { scheduledAt: { $gte: range.from, $lt: range.to } }] })
      .select('sessionCode name warehouseType status scheduledAt dueAt inspectorId totalDiscrepancyCount createdAt').lean(),
  ]);

  // C1: physical bins only (the system "unplaced" buffer is reported separately).
  const bins = locations.filter((location) => !location.isSystemUnplaced);
  const byType = new Map();
  for (const location of bins) {
    const entry = byType.get(location.warehouseType) || { warehouseType: location.warehouseType, total: 0, used: 0, empty: 0,
      full: 0, maintenance: 0, locked: 0, frozen: 0, inactive: 0, capacity: 0, occupancy: 0 };
    const occupancy = num(location.currentOccupancy);
    entry.total += 1;
    if (occupancy > 0) entry.used += 1; else entry.empty += 1;
    if (location.status === 'FULL') entry.full += 1;
    if (location.status === 'MAINTENANCE') entry.maintenance += 1;
    if (location.status === 'LOCKED') entry.locked += 1;
    if (location.status === 'INACTIVE') entry.inactive += 1;
    if (location.isFrozenForStocktake) entry.frozen += 1;
    // Capacity is counted only for finite bins; the defect area is created with a huge capacity.
    if (num(location.maxCapacity) > 0 && num(location.maxCapacity) < 1_000_000) {
      entry.capacity += num(location.maxCapacity); entry.occupancy += occupancy;
    }
    byType.set(location.warehouseType, entry);
  }
  const typeRows = [...byType.values()].map((entry) => ({ ...entry, fillPercent: percent(entry.occupancy, entry.capacity) }));
  const capacity = typeRows.reduce((sum, entry) => sum + entry.capacity, 0);
  const occupancy = typeRows.reduce((sum, entry) => sum + entry.occupancy, 0);

  // C2: stocktakes of the period, including counts sent back by the garment technician.
  const records = sessions.length ? await StocktakeRecord.find({ sessionId: { $in: sessions.map((session) => session._id) } })
    .select('sessionId itemType skuId rawMaterialId fabricRollId systemSnapshotQty actualScannedQty varianceQty unitCostSnapshot scannedAt').lean() : [];
  const skuPrice = new Map((await Sku.find({ _id: { $in: records.map((record) => record.skuId).filter(Boolean) } })
    .select('retailPrice').lean()).map((sku) => [id(sku), num(sku.retailPrice)]));
  const inspectorName = new Map((await User.find({ _id: { $in: sessions.map((session) => session.inspectorId).filter(Boolean) } })
    .select('fullName').lean()).map((user) => [id(user), user.fullName]));
  const priceOf = (record) => (record.itemType === 'SKU_BATCH' ? skuPrice.get(id(record.skuId)) || 0 : num(record.unitCostSnapshot));
  const tally = (list) => list.reduce((acc, record) => {
    const variance = num(record.varianceQty);
    if (!record.scannedAt && !num(record.actualScannedQty) && variance === 0) acc.notCounted += 1;
    else if (variance === 0) acc.matched += 1;
    else if (variance > 0) { acc.over += 1; acc.overValue += variance * priceOf(record); }
    else { acc.short += 1; acc.shortValue += variance * priceOf(record); }
    return acc;
  }, { lines: list.length, matched: 0, over: 0, short: 0, notCounted: 0, overValue: 0, shortValue: 0 });
  const total = tally(records);

  // C3: completed inventory movements of the period, grouped by type.
  const movements = await InventoryTransaction.aggregate([
    { $match: { createdAt: { $gte: range.from, $lt: range.to } } },
    { $group: { _id: { type: '$transactionType', warehouse: '$warehouseType' }, count: { $sum: 1 },
      quantity: { $sum: { $abs: '$quantityChange' } } } },
  ]);

  return {
    locations: { byType: typeRows, total: bins.length, fillPercent: percent(occupancy, capacity), capacity, occupancy,
      unplacedFinishedUnits: unplacedUnits },
    stocktake: {
      sessions: sessions.map((session) => {
        const own = records.filter((record) => id(record.sessionId) === id(session));
        return { sessionCode: session.sessionCode, name: session.name || '', warehouseType: session.warehouseType, status: session.status,
          scheduledAt: session.scheduledAt || session.createdAt, inspector: inspectorName.get(id(session.inspectorId)) || '', ...tally(own) };
      }),
      ...total, matchedPercent: percent(total.matched, total.lines - total.notCounted),
    },
    movements: movements.map((row) => ({ type: row._id.type, label: MOVEMENT_GROUPS[row._id.type] || row._id.type,
      warehouseType: row._id.warehouse, count: row.count, quantity: row.quantity }))
      .sort((a, b) => a.warehouseType.localeCompare(b.warehouseType) || b.count - a.count),
  };
}

/**
 * Builds the full report data for a period.
 * @param {{from: Date, to: Date}} range Half-open [from, to) range of the "in period" figures.
 */
export async function buildWarehouseSnapshot(range) {
  const now = Date.now();
  const [finishedGoods, materials, common] = await Promise.all([
    finishedGoodsSection(range, now), materialsSection(range, now), commonSection(range),
  ]);
  return { schema: REPORT_SCHEMA, generatedAt: new Date(now).toISOString(),
    period: { from: range.from.toISOString(), to: range.to.toISOString() }, finishedGoods, materials, common };
}
