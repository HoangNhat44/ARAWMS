/*
 * File: product.service.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Finished-goods catalog business logic: stock list by SKU, receiving locations,
 * single-SKU stock issue for untracked stock, and streaming product media to Cloudinary.
 */
import mongoose from 'mongoose';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import { configureProductCloudinary, productMediaOptions } from '../../../common/services/productMediaStorage.js';
import { assertWarehouseUnlockedForStocktake } from '../../../common/services/stocktakeLockGuard.js';
import { pickableQtyBySku } from './productDetail.service.js';
import { requestError } from '../shared/warehouseHttp.js';

/** Usable finished-goods receiving locations (not shelf bins, not the virtual unplaced area). */
export async function listReceivingLocations() {
  const locations = await WarehouseLocation.find({ warehouseType: 'FINISHED_GOODS',
    layoutBin: { $ne: true }, isSystemUnplaced: { $ne: true },
    isDeleted: { $ne: true } }).sort({ locationCode: 1 }).lean();
  return { locations: locations.map((item) => ({
    id: String(item._id), locationCode: item.locationCode, status: item.status,
    maxCapacity: item.maxCapacity, currentOccupancy: item.currentOccupancy || 0,
  })) };
}

/** Creates a uniquely coded finished-goods location for receiving stock. */
export async function createReceivingLocation({ locationCode, maxCapacity }) {
  try {
    const location = await WarehouseLocation.create({
      locationCode, barcode: `LOC-${locationCode}`, warehouseType: 'FINISHED_GOODS',
      zoneCode: 'THANH-PHAM', rackCode: 'CHUNG', shelfCode: 'CHUNG', maxCapacity,
    });
    return { location: { id: location.id, locationCode: location.locationCode, maxCapacity, currentOccupancy: 0, status: location.status } };
  } catch (error) {
    if (error.code === 11000) throw requestError('Mã vị trí đã tồn tại', 'DUPLICATE_LOCATION', 409);
    throw error;
  }
}

/** Products with SKU stock totals for receiving and stock lookup. */
export async function listProductsWithStock() {
  const products = await Product.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
  const skus = await Sku.find({ productId: { $in: products.map((item) => item._id) }, isDeleted: { $ne: true } }).lean();
  const pickableBySku = await pickableQtyBySku(skus.map((sku) => sku._id));
  const byProduct = new Map();
  for (const sku of skus) {
    const key = String(sku.productId);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push({
      id: String(sku._id), skuCode: sku.skuCode, color: sku.color, size: sku.size,
      isActive: sku.isActive, retailPrice: sku.retailPrice, unitCogs: sku.unitCogs || 0,
      onHandQty: sku.onHandQty || 0, reservedQty: sku.reservedQty || 0,
      availableQty: (sku.onHandQty || 0) - (sku.reservedQty || 0),
      pickableQty: pickableBySku.get(String(sku._id)) || 0,
    });
  }
  return { products: products.map((product) => {
    const variants = byProduct.get(String(product._id)) || [];
    return {
      id: String(product._id), productCode: product.productCode, productName: product.productName,
      // TODO(xóa sampleCode): legacy field, remove together with FinishedGoodsOverview's search on it.
      sampleCode: product.sampleCode || '', category: product.category, isActive: product.isActive,
      thumbnailUrl: product.thumbnailUrl, videoUrl: product.videoUrl,
      onHandQty: variants.reduce((sum, sku) => sum + sku.onHandQty, 0),
      reservedQty: variants.reduce((sum, sku) => sum + sku.reservedQty, 0),
      skus: variants,
    };
  }) };
}

/** Issues unreserved stock for one active SKU and records the movement.
 * Tracked batch stock cannot leave through this aggregate path because each physical unit must be scanned.
 */
export async function issueSkuStock(productId, { direction, skuId, quantity, note }, user) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } }).session(session);
      if (!product) throw requestError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
      if (!product.isActive) throw requestError('Sản phẩm đang ở trạng thái nháp', 'PRODUCT_INACTIVE', 409);
      await assertWarehouseUnlockedForStocktake('FINISHED_GOODS', 'nhập/xuất kho', session);
      const sku = skuId ? await Sku.findOne({ _id: skuId, productId, isDeleted: { $ne: true } }).session(session) : null;
      if (!sku) throw requestError('Không tìm thấy SKU của sản phẩm', 'SKU_NOT_FOUND', 404);
      if (!sku.isActive) throw requestError('SKU đã ngừng sử dụng', 'SKU_INACTIVE', 409);
      const hasTrackedBatch = await FinishedGoodsBatch.exists({ skuId: sku._id,
        currentOnHandQty: { $gt: 0 }, isDeleted: { $ne: true } }).session(session);
      if (hasTrackedBatch) throw requestError('Hàng theo lô cần xuất bằng barcode từng chiếc', 'BARCODE_OUTBOUND_REQUIRED', 409);
      const before = sku.onHandQty || 0;
      const reserved = sku.reservedQty || 0;
      if (direction === 'OUT' && before - reserved < quantity) {
        throw requestError('Số lượng khả dụng không đủ để xuất kho', 'INSUFFICIENT_STOCK', 409);
      }
      const delta = direction === 'IN' ? quantity : -quantity;
      const updated = await Sku.findOneAndUpdate(
        { _id: sku._id, ...(direction === 'OUT' ? { $expr: { $gte: [{ $subtract: [{ $ifNull: ['$onHandQty', 0] }, { $ifNull: ['$reservedQty', 0] }] }, quantity] } } : {}) },
        { $inc: { onHandQty: delta } }, { new: true, session },
      );
      if (!updated) throw requestError('Tồn kho đã thay đổi, hãy thử lại', 'STOCK_CHANGED', 409);
      await InventoryTransaction.create([{
        transactionCode: `FGM-${randomUUID()}`, warehouseType: 'FINISHED_GOODS',
        itemType: 'FINISHED_SKU', skuId: sku._id,
        transactionType: direction === 'IN' ? 'MANUAL_INBOUND' : 'MANUAL_OUTBOUND',
        referenceModel: 'Sku', referenceId: sku._id,
        quantityChange: delta, onHandBefore: before, onHandAfter: updated.onHandQty,
        unitCostSnapshot: sku.unitCogs || 0, totalValueSnapshot: quantity * (sku.unitCogs || 0), performedByUserId: user._id,
        note,
      }], { session });
      result = { skuId: String(sku._id), skuCode: sku.skuCode, onHandQty: updated.onHandQty,
        unitCostSnapshot: sku.unitCogs || 0, outboundValueSnapshot: quantity * (sku.unitCogs || 0) };
    });
    return result;
  } finally { await session.endSession(); }
}

const findMediaOperation = (product, mediaOperationId, userId) => product?.mediaOperations?.find((item) =>
  item.operationId === mediaOperationId && String(item.ownerUserId) === String(userId));

/**
 * Streams a product image, video or additional image to Cloudinary, enforcing the byte limit during
 * transfer, and saves the URL only after the upload completes. Main image and video replace their prior
 * named asset; additional images get unique names. A repeated offline file ID returns the saved product.
 * @returns {Promise<{ product, alreadySaved: boolean }>}
 */
export async function saveProductMedia({ productId, kind, config, mediaOperationId, expectedHash }, stream, user) {
  try {
    const product = await Product.findById(productId);
    if (!product) throw requestError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
    const existingMedia = findMediaOperation(product, mediaOperationId, user._id);
    if (mediaOperationId && existingMedia) {
      if (existingMedia.sha256 !== expectedHash || existingMedia.kind !== kind) {
        throw requestError('Mã tệp đã dùng cho nội dung khác', 'MEDIA_OPERATION_CONFLICT', 409);
      }
      return { product, alreadySaved: true };
    }
    configureProductCloudinary();
    let bytes = 0;
    const fileHash = mediaOperationId ? createHash('sha256') : null;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        fileHash?.update(chunk);
        callback(bytes > config.limit ? Object.assign(new Error('FILE_TOO_LARGE'), { status: 413 }) : null, chunk);
      },
    });
    let settle;
    const uploaded = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    uploaded.catch(() => {});
    const options = {
      ...productMediaOptions(product.productCode, kind,
        mediaOperationId ? `catalog_${user._id}_${mediaOperationId}_${expectedHash.slice(0, 16)}`
          : kind === 'additional-image' ? `extra_${randomUUID()}` : ''),
      overwrite: !mediaOperationId && kind !== 'additional-image',
      ...(kind === 'video' ? { chunk_size: 6 * 1024 * 1024 } : {}),
    };
    // Chunked uploads emit intermediate callbacks; save metadata only after the final result.
    const onUploaded = (error, result) => {
      if (error) settle.reject(error);
      else if (result?.done !== false) settle.resolve(result);
    };
    const upload = kind === 'video'
      ? cloudinary.uploader.upload_chunked_stream(options, onUploaded)
      : cloudinary.uploader.upload_stream(options, onUploaded);
    await pipeline(stream, limiter, upload);
    if (!bytes) throw requestError('Tệp rỗng', 'EMPTY_FILE');
    if (fileHash && fileHash.digest('hex') !== expectedHash) {
      throw requestError('Nội dung tệp không khớp thao tác đồng bộ', 'MEDIA_HASH_MISMATCH', 409);
    }
    const result = await uploaded;
    if (!result?.secure_url || !result?.public_id) throw new Error('Cloudinary không trả về URL tệp');
    if (kind === 'additional-image') product.additionalImageUrls.push(result.secure_url);
    else {
      product[config.field] = result.secure_url;
      product[config.publicIdField] = result.public_id;
    }
    if (mediaOperationId) product.mediaOperations.push({ ownerUserId: user._id, operationId: mediaOperationId,
      sha256: expectedHash, kind, url: result.secure_url });
    await product.save();
    return { product, alreadySaved: false };
  } catch (error) {
    if (error.expected) throw error;
    // A concurrent retry of the same offline file may have saved first.
    if (mediaOperationId && error.name === 'VersionError') {
      const current = await Product.findById(productId);
      const prior = findMediaOperation(current, mediaOperationId, user._id);
      if (prior && prior.sha256 === expectedHash && prior.kind === kind) return { product: current, alreadySaved: true };
      if (prior) throw requestError('Mã tệp đã dùng cho nội dung khác', 'MEDIA_OPERATION_CONFLICT', 409);
    }
    if (error.status === 413) throw requestError('Tệp vượt quá dung lượng cho phép', 'FILE_TOO_LARGE', 413);
    if (error.status === 503) throw requestError(error.message, error.code, 503);
    throw error;
  }
}
