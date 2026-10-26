/*
 * File: bulkStock.routes.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Handles bulk finished goods stock documents.
 */
import express from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import FinishedGoodsBulkDocument from '../../../models/FinishedGoodsBulkDocument.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';

const router = express.Router();
const createBulkStockRequestError = (message, code, status = 400) => Object.assign(new Error(message), { code, status });

/** Returns recent stock documents with receiving barcode details. */
router.get('/documents', async (req, res, next) => {
  try {
    const documents = await FinishedGoodsBulkDocument.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 }).limit(20).lean();
    return sendSuccess(res, 'Phiếu kho gần đây', { documents: documents.map((document) => ({
      id: String(document._id), documentCode: document.documentCode, direction: document.direction,
      totalQuantity: document.totalQuantity, createdAt: document.createdAt,
      lineCount: document.items.length,
      items: document.direction === 'IN' ? document.items.map((item) => ({
        barcodes: item.barcodes || [], expectedQty: item.expectedQty, receivedQty: item.receivedQty, acceptedQty: item.quantity,
        repairQty: item.repairQty,
        repairStatus: item.repairStatus,
      })) : [],
    })) });
  } catch (error) { next(error); }
});

/** Validates a bulk movement and updates document, stock, batches, and units atomically. */
router.post('/documents', async (req, res, next) => {
  const direction = req.body?.direction;
  const documentCode = String(req.body?.documentCode || '').trim().toUpperCase();
  const note = String(req.body?.note || '').trim();
  const items = req.body?.items;
  const locationId = req.body?.locationId;
  if (!['IN', 'OUT'].includes(direction) || !/^[A-Z0-9._/-]{2,80}$/.test(documentCode) ||
      note.length > 500 || !Array.isArray(items) || items.length < 1 || items.length > 100 ||
      (direction === 'IN' && !mongoose.isValidObjectId(locationId)) ||
      items.some((item) => !mongoose.isValidObjectId(item?.productId) ||
        (item?.skuId && !mongoose.isValidObjectId(item.skuId)) ||
        !Number.isSafeInteger(Number(item?.quantity)) || Number(item.quantity) < (direction === 'IN' ? 0 : 1) || Number(item.quantity) > (direction === 'IN' ? 500 : 100000) ||
        (direction === 'IN' && ((item?.expectedQty != null && item.expectedQty !== '' &&
          (!Number.isSafeInteger(Number(item.expectedQty)) || Number(item.expectedQty) < 0 || Number(item.expectedQty) > 500)) ||
          !Number.isSafeInteger(Number(item?.receivedQty)) ||
          !Number.isSafeInteger(Number(item?.repairQty)) || Number(item.receivedQty) < 1 || Number(item.receivedQty) > 500 ||
          Number(item.repairQty) < 0 || Number(item.repairQty) > 500 ||
          Number(item.receivedQty) !== Number(item.quantity) + Number(item.repairQty))))) {
    return sendError(res, 'Phiếu nhập/xuất không hợp lệ', { code: 'INVALID_BULK_DOCUMENT' }, 400);
  }
  if (direction === 'IN' && items.reduce((sum, item) => sum + Number(item.quantity), 0) > 500) {
    return sendError(res, 'Mỗi phiếu nhận tối đa 500 sản phẩm đạt', { code: 'TOO_MANY_UNITS' }, 400);
  }
  if (direction === 'IN' && items.reduce((sum, item) => sum + Number(item.receivedQty), 0) > 1000) {
    return sendError(res, 'Mỗi phiếu nhận tối đa 1000 sản phẩm', { code: 'TOO_MANY_RECEIVED_UNITS' }, 400);
  }
  const seen = new Set();
  for (const item of items) {
    const key = `${item.productId}:${item.skuId || ''}`;
    if (seen.has(key)) return sendError(res, 'Một SKU chỉ được xuất hiện một lần trong phiếu', { code: 'DUPLICATE_LINE' }, 400);
    seen.add(key);
  }

  let session;
  try {
    session = await mongoose.startSession();
    let saved;
    await session.withTransaction(async () => {
      const documentId = new mongoose.Types.ObjectId();
      const lines = [];
      const resolvedSkus = new Set();
      const location = direction === 'IN' ? await WarehouseLocation.findOne({
        _id: locationId, warehouseType: 'FINISHED_GOODS', status: 'ACTIVE', isDeleted: { $ne: true },
      }).session(session) : null;
      if (direction === 'IN' && !location) throw createBulkStockRequestError('Vị trí kho thành phẩm không hợp lệ', 'LOCATION_NOT_FOUND', 404);
      for (const item of items) {
        const product = await Product.findOne({ _id: item.productId, isDeleted: { $ne: true } }).session(session);
        if (!product) throw createBulkStockRequestError('Không tìm thấy sản phẩm trong phiếu', 'PRODUCT_NOT_FOUND', 404);
        if (!product.isActive) throw createBulkStockRequestError(`Sản phẩm ${product.productCode} đang ở trạng thái nháp`, 'PRODUCT_INACTIVE', 409);
        let sku;
        if (item.skuId) {
          sku = await Sku.findOne({ _id: item.skuId, productId: product._id, isDeleted: { $ne: true } }).session(session);
        } else {
          const existing = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).limit(2).session(session);
          if (existing.length > 1) throw createBulkStockRequestError(`Hãy chọn SKU cho ${product.productCode}`, 'SKU_REQUIRED');
          if (existing.length === 1) sku = existing[0];
        }
        if (!sku) throw createBulkStockRequestError(`Không tìm thấy SKU cho ${product.productCode}`, 'SKU_NOT_FOUND', 404);
        if (!sku.isActive) throw createBulkStockRequestError(`SKU ${sku.skuCode} đã ngừng sử dụng`, 'SKU_INACTIVE', 409);
        if (direction === 'OUT' && await FinishedGoodsBatch.exists({ skuId: sku._id,
          currentOnHandQty: { $gt: 0 }, isDeleted: { $ne: true } }).session(session)) {
          throw createBulkStockRequestError('Hàng theo lô cần xuất bằng barcode từng chiếc', 'BARCODE_OUTBOUND_REQUIRED', 409);
        }
        const resolvedKey = String(sku._id);
        if (resolvedSkus.has(resolvedKey)) throw createBulkStockRequestError(`SKU ${sku.skuCode} bị lặp trong phiếu`, 'DUPLICATE_LINE');
        resolvedSkus.add(resolvedKey);
        const quantity = Number(item.quantity);
        const before = sku.onHandQty || 0;
        if (direction === 'OUT' && before - (sku.reservedQty || 0) < quantity) {
          throw createBulkStockRequestError(`Tồn khả dụng của ${sku.skuCode} không đủ`, 'INSUFFICIENT_STOCK', 409);
        }
        const delta = direction === 'IN' ? quantity : -quantity;
        const updated = delta === 0 ? sku : await Sku.findOneAndUpdate(
          { _id: sku._id, ...(direction === 'OUT' ? { $expr: { $gte: [{ $subtract: [{ $ifNull: ['$onHandQty', 0] }, { $ifNull: ['$reservedQty', 0] }] }, quantity] } } : {}) },
          { $inc: { onHandQty: delta } }, { new: true, session }
        );
        if (!updated) throw createBulkStockRequestError('Tồn kho đã thay đổi, hãy thử lại', 'STOCK_CHANGED', 409);
        if (delta !== 0) await InventoryTransaction.create([{
          transactionCode: `FGM-${randomUUID()}`, warehouseType: 'FINISHED_GOODS', itemType: 'FINISHED_SKU',
          skuId: sku._id, transactionType: direction === 'IN' ? 'MANUAL_INBOUND' : 'MANUAL_OUTBOUND',
          referenceModel: 'FinishedGoodsBulkDocument', referenceId: documentId,
          ...(direction === 'IN' ? { locationId: location._id } : {}),
          quantityChange: delta, onHandBefore: before, onHandAfter: updated.onHandQty,
          unitCostSnapshot: sku.unitCogs || 0, performedByUserId: req.user._id, note,
        }], { session });
        let barcodes = [];
        if (direction === 'IN' && quantity > 0) {
          barcodes = Array.from({ length: quantity }, () => `ARA${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`);
          const [batch] = await FinishedGoodsBatch.create([{
            batchCode: `FGB-${randomUUID()}`, skuId: sku._id, skuBarcode: sku.skuBarcode,
            locationId: location._id, initialQty: quantity, labeledQty: quantity, currentOnHandQty: quantity,
            fifoInboundTimestamp: new Date(),
          }], { session });
          await ProductUnit.insertMany(barcodes.map((barcode) => ({
            barcode, barcodeFormat: 'CODE_128', skuId: sku._id,
            warehouseId: location._id, batchId: batch._id,
            receivingDocumentId: documentId, inventoryStatus: 'AVAILABLE',
          })), { session });
        }
        lines.push({ productId: product._id, skuId: sku._id, quantity,
          ...(direction === 'IN' ? { expectedQty: item.expectedQty === '' || item.expectedQty == null ? undefined : Number(item.expectedQty),
            receivedQty: Number(item.receivedQty), repairQty: Number(item.repairQty),
            repairStatus: Number(item.repairQty) > 0 ? 'WAITING_RETURN' : undefined, barcodes } : {}) });
      }
      if (direction === 'IN') {
        const totalAccepted = lines.reduce((sum, line) => sum + line.quantity, 0);
        const updatedLocation = await WarehouseLocation.findOneAndUpdate({
          _id: location._id, $expr: { $gte: [{ $subtract: ['$maxCapacity', { $ifNull: ['$currentOccupancy', 0] }] }, totalAccepted] },
        }, { $inc: { currentOccupancy: totalAccepted } }, { session, new: true });
        if (!updatedLocation) throw createBulkStockRequestError('Vị trí kho không đủ sức chứa', 'LOCATION_FULL', 409);
      }
      [saved] = await FinishedGoodsBulkDocument.create([{
        _id: documentId, documentCode, direction, items: lines,
        ...(direction === 'IN' ? { locationId: location._id } : {}),
        totalQuantity: lines.reduce((total, line) => total + line.quantity, 0),
        note, createdByUserId: req.user._id,
      }], { session });
    });
    return sendSuccess(res, direction === 'IN' ? 'Đã nhập kho hàng loạt' : 'Đã xuất kho hàng loạt', {
      document: { id: String(saved._id), documentCode: saved.documentCode, direction: saved.direction,
        lineCount: saved.items.length, totalQuantity: saved.totalQuantity,
        items: direction === 'IN' ? saved.items.map((item) => ({ skuId: String(item.skuId), barcodes: item.barcodes, expectedQty: item.expectedQty,
          receivedQty: item.receivedQty, acceptedQty: item.quantity, repairQty: item.repairQty,
          repairStatus: item.repairStatus })) : undefined },
    }, 201);
  } catch (error) {
    if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
    if (error.code === 11000) return sendError(res, 'Số chứng từ hoặc mã SKU đã tồn tại', { code: 'DUPLICATE_DOCUMENT_OR_SKU' }, 409);
    next(error);
  } finally { if (session) await session.endSession(); }
});

export default router;
