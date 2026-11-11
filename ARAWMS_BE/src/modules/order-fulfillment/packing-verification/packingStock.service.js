/*
 * File: packingStock.service.js
 * Author: Duy Anh
 * Date: 2026-10-25
 * Description: Deducts reserved finished goods when a real order is packed.
 */
import { randomUUID } from 'node:crypto';
import ProductUnit from '../../../models/ProductUnit.js';
import Sku from '../../../models/Sku.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import { PackingError } from './packingVerification.service.js';

/** Deducts exactly the physical units scanned for a completed order.
 * Rechecks every barcode against the order line's SKU, reserved batch, location,
 * and allocated quantity before any balance changes are committed.
 * Updates SKU, FIFO batch, and location balances, records inventory movements,
 * and marks unit barcodes unavailable inside the caller's MongoDB transaction.
 */
export const consumePackedStock = async (packing, order, dbSession) => {
  if (!packing.items.length || packing.scannedUnits.length !== packing.items.reduce((n, item) => n + item.quantity, 0)) {
    throw new PackingError('SCAN_INCOMPLETE');
  }
  const barcodes = packing.scannedUnits.map((scan) => scan.barcode);
  const units = await ProductUnit.find({ barcode: { $in: barcodes }, inventoryStatus: 'AVAILABLE' })
    .session(dbSession).lean();
  if (units.length !== barcodes.length) throw new PackingError('UNIT_UNAVAILABLE');
  const byBarcode = new Map(units.map((unit) => [unit.barcode, unit]));
  const groups = new Map();
  const releases = new Map();
  // Each scanned unit only has to be the line's SKU; stock leaves the unit's own batch and shelf.
  for (const item of packing.items) {
    const orderItem = order.items[Number(item.lineKey)];
    if (!orderItem || String(orderItem.skuId) !== String(item.skuId)) throw new PackingError('ORDER_CHANGED');
    const scans = packing.scannedUnits.filter((scan) => scan.lineKey === item.lineKey);
    if (scans.length !== item.quantity) throw new PackingError('SCAN_INCOMPLETE');
    for (const pick of orderItem.fifoPickList || []) {
      releases.set(String(pick.batchId), (releases.get(String(pick.batchId)) || 0) + (pick.allocatedQty || 0));
    }
    for (const scan of scans) {
      const unit = byBarcode.get(scan.barcode);
      if (!unit || !unit.batchId || String(unit.skuId) !== String(item.skuId)) throw new PackingError('UNIT_NOT_RESERVED');
      const key = `${unit.skuId}:${unit.batchId}`;
      const group = groups.get(key) || { skuId: unit.skuId, batchId: unit.batchId,
        locationId: unit.warehouseId, quantity: 0 };
      group.quantity += 1;
      groups.set(key, group);
    }
  }
  // Release the FIFO holds this order placed at confirmation (batch-level picking reservations).
  for (const [batchId, quantity] of releases) {
    const released = await FinishedGoodsBatch.updateOne({ _id: batchId, reservedPickQty: { $gte: quantity } },
      { $inc: { reservedPickQty: -quantity } }, { session: dbSession });
    if (released.matchedCount !== 1) throw new PackingError('BATCH_STOCK_CHANGED');
  }
  // Deduct from the batches actually scanned, never below what other orders still hold there.
  for (const group of groups.values()) {
    const batch = await FinishedGoodsBatch.findOneAndUpdate({
      _id: group.batchId, skuId: group.skuId, locationId: group.locationId,
      isDefectQuarantine: false,
      $expr: { $gte: [{ $subtract: ['$currentOnHandQty', { $ifNull: ['$reservedPickQty', 0] }] }, group.quantity] },
    }, { $inc: { currentOnHandQty: -group.quantity } },
    { new: true, session: dbSession });
    if (!batch) throw new PackingError('BATCH_STOCK_CHANGED');
    const sku = await Sku.findOneAndUpdate({
      _id: group.skuId, onHandQty: { $gte: group.quantity }, reservedQty: { $gte: group.quantity },
    }, { $inc: { onHandQty: -group.quantity, reservedQty: -group.quantity } },
    { new: true, session: dbSession });
    if (!sku) throw new PackingError('SKU_STOCK_CHANGED');
    const location = await WarehouseLocation.updateOne({ _id: group.locationId, currentOccupancy: { $gte: group.quantity } },
      { $inc: { currentOccupancy: -group.quantity } }, { session: dbSession });
    if (location.matchedCount !== 1) throw new PackingError('LOCATION_STOCK_CHANGED');
    await InventoryTransaction.create([{
      transactionCode: `FGP-${randomUUID()}`,
      warehouseType: 'FINISHED_GOODS', itemType: 'FINISHED_SKU',
      skuId: group.skuId, locationId: group.locationId, transactionType: 'ORDER_PACK_DEDUCT',
      referenceModel: 'SalesOrder', referenceId: order._id,
      quantityChange: -group.quantity,
      reservedChange: -group.quantity,
      onHandBefore: sku.onHandQty + group.quantity, onHandAfter: sku.onHandQty,
      reservedBefore: sku.reservedQty + group.quantity, reservedAfter: sku.reservedQty,
      unitCostSnapshot: sku.unitCogs || 0, performedByUserId: packing.operatorId,
    }], { session: dbSession });
  }
  const updated = await ProductUnit.updateMany({
    barcode: { $in: barcodes }, inventoryStatus: 'AVAILABLE',
  }, { $set: { inventoryStatus: 'UNAVAILABLE', packedOrderId: order._id, packedAt: new Date() } },
  { session: dbSession });
  if (updated.modifiedCount !== barcodes.length) throw new PackingError('UNIT_UNAVAILABLE');
};
