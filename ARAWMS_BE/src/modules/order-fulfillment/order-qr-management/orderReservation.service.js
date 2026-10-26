/*
 * File: orderReservation.service.js
 * Author: Duy Anh
 * Date: 2026-10-25
 * Description: Reserves finished goods by FIFO when a sales order is confirmed.
 */
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import SalesOrder from '../../../models/SalesOrder.model.js';
import Sku from '../../../models/Sku.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';

const createStockReservationError = (code) => Object.assign(new Error(code), { code, status: 409 });

/** Allocates available batches in FIFO order without changing on-hand stock. */
export const reserveOrderStock = async (orderId, userId) => {
  const session = await mongoose.startSession();
  try {
    let confirmed;
    // Reserve SKU totals, FIFO batches, and order status in one transaction.
    await session.withTransaction(async () => {
      const order = await SalesOrder.findOne({ _id: orderId, status: 'PENDING', isDeleted: { $ne: true } }).session(session);
      if (!order) throw createStockReservationError('ORDER_NOT_PENDING');
      if (!order.items?.length) throw createStockReservationError('ORDER_EMPTY');
      const items = [];
      for (const item of order.items) {
        const quantity = item.orderedQty;
        if (!Number.isSafeInteger(quantity) || quantity <= 0) throw createStockReservationError('INVALID_ORDER_QUANTITY');
        const sku = await Sku.findOneAndUpdate({
          _id: item.skuId, isActive: true, isDeleted: { $ne: true },
          $expr: { $gte: [{ $subtract: [{ $ifNull: ['$onHandQty', 0] }, { $ifNull: ['$reservedQty', 0] }] }, quantity] },
        }, { $inc: { reservedQty: quantity } }, { new: true, session });
        if (!sku) throw createStockReservationError('INSUFFICIENT_SKU_STOCK');
        const batches = await FinishedGoodsBatch.find({
          skuId: item.skuId, isDefectQuarantine: false, isDeleted: { $ne: true },
          currentOnHandQty: { $gt: 0 },
        }).sort({ fifoInboundTimestamp: 1, _id: 1 }).session(session);
        const locations = await WarehouseLocation.find({
          _id: { $in: batches.map((batch) => batch.locationId) },
          warehouseType: 'FINISHED_GOODS', status: { $in: ['ACTIVE', 'FULL'] },
          isFrozenForStocktake: false, isDeleted: { $ne: true },
        }).select('_id').session(session);
        const usableLocations = new Set(locations.map((location) => String(location._id)));
        let remaining = quantity;
        let allocated = 0;
        const fifoPickList = [];
        // Ignore unusable locations and claim each batch only while its available quantity is sufficient.
        for (const batch of batches) {
          if (!remaining) break;
          if (!usableLocations.has(String(batch.locationId))) continue;
          const take = Math.min(remaining, Math.max(0, batch.currentOnHandQty - (batch.reservedPickQty || 0)));
          if (!take) continue;
          const reservedBatch = await FinishedGoodsBatch.findOneAndUpdate({
            _id: batch._id,
            $expr: { $gte: [{ $subtract: ['$currentOnHandQty', { $ifNull: ['$reservedPickQty', 0] }] }, take] },
          }, { $inc: { reservedPickQty: take } }, { new: true, session });
          if (!reservedBatch) throw createStockReservationError('BATCH_STOCK_CHANGED');
          fifoPickList.push({ batchId: batch._id, locationId: batch.locationId,
            allocatedQty: take, pickedConfirmed: false });
          await InventoryTransaction.create([{
            transactionCode: `FGR-${randomUUID()}`,
            warehouseType: 'FINISHED_GOODS', itemType: 'FINISHED_SKU',
            skuId: item.skuId, locationId: batch.locationId,
            transactionType: 'ORDER_RESERVE', referenceModel: 'SalesOrder', referenceId: order._id,
            quantityChange: 0, reservedChange: take,
            onHandBefore: sku.onHandQty, onHandAfter: sku.onHandQty,
            reservedBefore: sku.reservedQty - quantity + allocated,
            reservedAfter: sku.reservedQty - quantity + allocated + take,
            unitCostSnapshot: sku.unitCogs || 0, performedByUserId: userId,
          }], { session });
          remaining -= take;
          allocated += take;
        }
        if (remaining) throw createStockReservationError('INSUFFICIENT_BATCH_STOCK');
        items.push({ ...item.toObject(), fifoPickList });
      }
      const now = new Date();
      confirmed = await SalesOrder.findOneAndUpdate({ _id: order._id, status: 'PENDING', updatedAt: order.updatedAt },
        { $set: { items, status: 'CONFIRMED_RESERVED', confirmedAt: now,
          'warehouseFulfillment.stockReservedAt': now },
        $push: { statusHistory: { from: 'PENDING', to: 'CONFIRMED_RESERVED', by: userId, at: now } } },
        { new: true, session });
      if (!confirmed) throw createStockReservationError('ORDER_CHANGED');
    });
    return confirmed;
  } finally {
    await session.endSession();
  }
};
