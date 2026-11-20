/*
 * File: defectWarehouse.service.js
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Defect warehouse for finished goods. Lists defective units waiting for the warehouse
 * (DEFECT_PENDING, set when the garment technician finalizes a return inspection) and units inside the
 * defect warehouse (DEFECTIVE, set when the warehouse confirms the defect inbound), and takes defective
 * units out with a typed reason (DEFECTIVE -> DEFECT_OUT). Defective units never count in Sku.onHandQty.
 */
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import ProductUnit from '../../../models/ProductUnit.js';
import Sku from '../../../models/Sku.model.js';
import FinishedGoodsTicket from '../../../models/FinishedGoodsTicket.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import { requestError } from '../shared/warehouseHttp.js';

const DAY = 24 * 60 * 60 * 1000;
const LISTED_STATUSES = ['DEFECT_PENDING', 'DEFECTIVE'];

/**
 * Lists defective units still held by the warehouse, with SKU, product, source return and age.
 * @returns {{summary: {pending: number, inStock: number}, units: Array}}
 */
export const listDefectUnits = async () => {
  const units = await ProductUnit.find({ inventoryStatus: { $in: LISTED_STATUSES } })
    .select('barcode skuId warehouseId inventoryStatus defectReason inspectedAt defectReceivedAt returnInspectionId returnedFromOrderId createdAt')
    .populate({ path: 'skuId', select: 'skuCode color size productId', populate: { path: 'productId', select: 'productCode productName' } })
    .populate('warehouseId', 'locationCode displayName warehouseType')
    .populate('returnInspectionId', 'inspectionCode')
    .populate('returnedFromOrderId', 'orderCode')
    .sort({ inventoryStatus: 1, defectReceivedAt: 1, inspectedAt: 1 })
    .lean();
  const now = Date.now();
  const rows = units.map((unit) => {
    // Age in the defect warehouse counts from receipt; pending units count from the technician's inspection.
    const since = unit.inventoryStatus === 'DEFECTIVE' ? (unit.defectReceivedAt || unit.inspectedAt) : unit.inspectedAt;
    return {
      barcode: unit.barcode,
      status: unit.inventoryStatus,
      skuId: String(unit.skuId?._id || unit.skuId || ''),
      skuCode: unit.skuId?.skuCode || '',
      color: unit.skuId?.color || '',
      size: unit.skuId?.size || '',
      productCode: unit.skuId?.productId?.productCode || '',
      productName: unit.skuId?.productId?.productName || '',
      defectReason: unit.defectReason || '',
      inspectionCode: unit.returnInspectionId?.inspectionCode || '',
      orderCode: unit.returnedFromOrderId?.orderCode || '',
      locationCode: unit.inventoryStatus === 'DEFECTIVE' ? (unit.warehouseId?.locationCode || '') : '',
      inspectedAt: unit.inspectedAt || null,
      receivedAt: unit.defectReceivedAt || null,
      daysHeld: since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / DAY)) : null,
    };
  });
  return {
    summary: {
      pending: rows.filter((row) => row.status === 'DEFECT_PENDING').length,
      inStock: rows.filter((row) => row.status === 'DEFECTIVE').length,
    },
    units: rows,
  };
};

/**
 * Takes defective units out of the defect warehouse in one transaction: records a
 * DEFECT_DISPOSAL_OUTBOUND ticket and one DEFECT_DISPOSAL inventory transaction per SKU, frees the
 * defect locations' occupancy and marks every unit DEFECT_OUT with the reason.
 * Only units inside the defect warehouse (DEFECTIVE) can be taken out.
 * @param {{barcodes: string[], reason: string}} input Validated by the controller.
 * @param {object} user Signed-in warehouse manager / owner.
 */
export const takeOutDefectUnits = async ({ barcodes, reason }, user) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const units = await ProductUnit.find({ barcode: { $in: barcodes } }).session(session);
      const byBarcode = new Map(units.map((unit) => [unit.barcode, unit]));
      const unknown = barcodes.filter((barcode) => !byBarcode.has(barcode));
      if (unknown.length) throw requestError(`Không tìm thấy tem: ${unknown.slice(0, 5).join(', ')}`, 'UNIT_NOT_FOUND', 404);
      const notInStock = units.filter((unit) => unit.inventoryStatus !== 'DEFECTIVE');
      if (notInStock.length) {
        const pending = notInStock.filter((unit) => unit.inventoryStatus === 'DEFECT_PENDING').map((unit) => unit.barcode);
        throw requestError(pending.length
          ? `Tem ${pending.slice(0, 5).join(', ')} chưa được nhập vào kho hàng lỗi`
          : `Tem ${notInStock.slice(0, 5).map((unit) => unit.barcode).join(', ')} không nằm trong kho hàng lỗi`,
        'UNIT_NOT_IN_DEFECT_WAREHOUSE', 409);
      }

      const skus = await Sku.find({ _id: { $in: [...new Set(units.map((unit) => String(unit.skuId)))] } }).session(session);
      const skuById = new Map(skus.map((sku) => [String(sku._id), sku]));
      const groups = new Map();
      for (const unit of units) {
        const key = String(unit.skuId);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(unit);
      }

      const now = new Date();
      const [ticket] = await FinishedGoodsTicket.create([{
        ticketCode: `XHL-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`,
        ticketType: 'DEFECT_DISPOSAL_OUTBOUND',
        status: 'COMPLETED',
        createdByManagerId: user._id,
        items: [...groups.entries()].map(([skuId, group]) => ({
          skuId, skuBarcode: skuById.get(skuId)?.skuBarcode || group[0].barcode,
          designatedFifoLocationId: group[0].warehouseId,
          expectedQty: group.length, totalQty: group.length, scannedQty: group.length,
          unitBarcodes: group.map((unit) => unit.barcode), defectNote: reason, scannedAt: now,
        })),
      }], { session });

      for (const [skuId, group] of groups) {
        const sku = skuById.get(skuId);
        // Defective stock is not part of Sku.onHandQty, so the sellable balance does not change.
        await InventoryTransaction.create([{
          transactionCode: `FGX-${randomUUID()}`, warehouseType: 'DEFECT_QUARANTINE', itemType: 'FINISHED_SKU',
          skuId, transactionType: 'DEFECT_DISPOSAL', referenceModel: 'FinishedGoodsTicket', referenceId: ticket._id,
          locationId: group[0].warehouseId, quantityChange: -group.length,
          onHandBefore: sku?.onHandQty || 0, onHandAfter: sku?.onHandQty || 0,
          unitCostSnapshot: 0, totalValueSnapshot: 0, performedByUserId: user._id, note: reason,
        }], { session });
      }

      const perLocation = new Map();
      for (const unit of units) perLocation.set(String(unit.warehouseId), (perLocation.get(String(unit.warehouseId)) || 0) + 1);
      for (const [locationId, count] of perLocation) {
        // Never go below zero if older data was received without occupancy.
        await WarehouseLocation.updateOne({ _id: locationId },
          [{ $set: { currentOccupancy: { $max: [0, { $subtract: [{ $ifNull: ['$currentOccupancy', 0] }, count] }] } } }],
          { session });
      }

      await ProductUnit.updateMany({ _id: { $in: units.map((unit) => unit._id) }, inventoryStatus: 'DEFECTIVE' }, {
        $set: { inventoryStatus: 'DEFECT_OUT', defectOutAt: now, defectOutReason: reason, defectOutBy: user._id,
          defectOutTicketId: ticket._id },
      }, { session });

      result = { ticketCode: ticket.ticketCode, quantity: units.length,
        skus: [...groups.entries()].map(([skuId, group]) => ({ skuCode: skuById.get(skuId)?.skuCode || '', quantity: group.length })) };
    });
    return result;
  } finally {
    await session.endSession();
  }
};
