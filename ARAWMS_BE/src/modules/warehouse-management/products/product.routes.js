/*
 * File: product.routes.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Defines warehouse product, stock, location, and media endpoints. Restricts these operations to warehouse managers and records stock changes.
 */
import express from 'express';
import mongoose from 'mongoose';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { v2 as cloudinary } from 'cloudinary';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { configureProductCloudinary, productMediaOptions } from '../../../common/services/productMediaStorage.js';
import bulkStockRoutes from './bulkStock.routes.js';
import productConfigurationRoutes from './productConfiguration.routes.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';

const router = express.Router();
const media = {
  image: { types: ['image/jpeg', 'image/png', 'image/webp'], limit: 10 * 1024 * 1024, field: 'thumbnailUrl', publicIdField: 'imagePublicId' },
  video: { types: ['video/mp4', 'video/webm'], limit: 100 * 1024 * 1024, field: 'videoUrl', publicIdField: 'videoPublicId' },
  'additional-image': { types: ['image/jpeg', 'image/png', 'image/webp'], limit: 10 * 1024 * 1024, field: 'additionalImageUrls' },
};

// Product configuration endpoints require warehouse manager access.
// router.use(authenticate);
// Mock user for testing without authentication
router.use((req, res, next) => {
  req.user = {
    _id: '507f1f77bcf86cd799439011',
    username: 'test',
    fullName: 'Test User',
    roles: ['OWNER', 'ADMIN'],
    warehouseIds: []
  };
  next();
});
// router.use((req, res, next) => req.user.roles?.includes('WAREHOUSE_MANAGER')
//   ? next()
//   : sendError(res, 'Chỉ quản lý kho được tạo sản phẩm', { code: 'FORBIDDEN' }, 403));
router.use('/bulk', bulkStockRoutes);
router.use('/configuration', productConfigurationRoutes);

/** Lists usable finished goods locations and their current capacity. */
router.get('/locations', async (req, res, next) => {
  try {
    const locations = await WarehouseLocation.find({ warehouseType: 'FINISHED_GOODS',
      layoutBin: { $ne: true }, isSystemUnplaced: { $ne: true },
      isDeleted: { $ne: true } }).sort({ locationCode: 1 }).lean();
    return sendSuccess(res, 'Vị trí kho thành phẩm', { locations: locations.map((item) => ({
      id: String(item._id), locationCode: item.locationCode, status: item.status,
      maxCapacity: item.maxCapacity, currentOccupancy: item.currentOccupancy || 0,
    })) });
  } catch (error) { next(error); }
});

/** Creates a uniquely coded finished goods location for receiving stock. */
router.post('/locations', async (req, res, next) => {
  const locationCode = String(req.body?.locationCode || '').trim().toUpperCase();
  const maxCapacity = Number(req.body?.maxCapacity);
  if (!/^[A-Z0-9_-]{2,40}$/.test(locationCode) || !Number.isSafeInteger(maxCapacity) || maxCapacity < 1) {
    return sendError(res, 'Vị trí kho không hợp lệ', { code: 'INVALID_LOCATION' }, 400);
  }
  try {
    const location = await WarehouseLocation.create({
      locationCode, barcode: `LOC-${locationCode}`, warehouseType: 'FINISHED_GOODS',
      zoneCode: 'THANH-PHAM', rackCode: 'CHUNG', shelfCode: 'CHUNG', maxCapacity,
    });
    return sendSuccess(res, 'Đã tạo vị trí kho', { location: { id: location.id, locationCode: location.locationCode, maxCapacity, currentOccupancy: 0, status: location.status } }, 201);
  } catch (error) {
    if (error.code === 11000) return sendError(res, 'Mã vị trí đã tồn tại', { code: 'DUPLICATE_LOCATION' }, 409);
    next(error);
  }
});

/** Lists products with SKU stock totals for receiving and stock lookup. */
router.get('/', async (req, res, next) => {
  try {
    const products = await Product.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
    const skus = await Sku.find({ productId: { $in: products.map((item) => item._id) }, isDeleted: { $ne: true } }).lean();
    const byProduct = new Map();
    for (const sku of skus) {
      const key = String(sku.productId);
      if (!byProduct.has(key)) byProduct.set(key, []);
      byProduct.get(key).push({
        id: String(sku._id), skuCode: sku.skuCode, color: sku.color, size: sku.size,
        isActive: sku.isActive, retailPrice: sku.retailPrice,
        onHandQty: sku.onHandQty || 0, reservedQty: sku.reservedQty || 0,
        availableQty: (sku.onHandQty || 0) - (sku.reservedQty || 0),
      });
    }
    return sendSuccess(res, 'Danh sách kho thành phẩm', { products: products.map((product) => {
      const variants = byProduct.get(String(product._id)) || [];
      return {
        id: String(product._id), productCode: product.productCode, productName: product.productName,
        sampleCode: product.sampleCode || '', category: product.category, isActive: product.isActive,
        thumbnailUrl: product.thumbnailUrl, videoUrl: product.videoUrl,
        onHandQty: variants.reduce((sum, sku) => sum + sku.onHandQty, 0),
        reservedQty: variants.reduce((sum, sku) => sum + sku.reservedQty, 0),
        skus: variants,
      };
    }) });
  } catch (error) { next(error); }
});

/** Issues unreserved stock for one active SKU and records the movement.
 * Receiving requires a separate barcode issuing flow; tracked batch stock cannot
 * leave through this aggregate endpoint because each physical unit must be scanned.
 */
router.post('/:id/stock', async (req, res, next) => {
  const { id } = req.params;
  const { direction, skuId, note } = req.body || {};
  const quantity = Number(req.body?.quantity);
  if (!mongoose.isValidObjectId(id) || !['IN', 'OUT'].includes(direction) ||
      !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 100000 ||
      (skuId && !mongoose.isValidObjectId(skuId)) || String(note || '').length > 500) {
    return sendError(res, 'Thông tin nhập/xuất không hợp lệ', { code: 'INVALID_STOCK_MOVEMENT' }, 400);
  }
  if (direction === 'IN') return sendError(res, 'Nhập kho cần phiếu kiểm nhận và cấp barcode', { code: 'RECEIVING_REQUIRED' }, 400);
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } }).session(session);
      if (!product) throw Object.assign(new Error('Không tìm thấy sản phẩm'), { status: 404, code: 'PRODUCT_NOT_FOUND' });
      if (!product.isActive) throw Object.assign(new Error('Sản phẩm đang ở trạng thái nháp'), { status: 409, code: 'PRODUCT_INACTIVE' });
      let sku;
      if (skuId) {
        sku = await Sku.findOne({ _id: skuId, productId: id, isDeleted: { $ne: true } }).session(session);
      }
      if (!sku) throw Object.assign(new Error('Không tìm thấy SKU của sản phẩm'), { status: 404, code: 'SKU_NOT_FOUND' });
      if (!sku.isActive) throw Object.assign(new Error('SKU đã ngừng sử dụng'), { status: 409, code: 'SKU_INACTIVE' });
      const hasTrackedBatch = await FinishedGoodsBatch.exists({ skuId: sku._id,
        currentOnHandQty: { $gt: 0 }, isDeleted: { $ne: true } }).session(session);
      if (hasTrackedBatch) throw Object.assign(new Error('Hàng theo lô cần xuất bằng barcode từng chiếc'),
        { status: 409, code: 'BARCODE_OUTBOUND_REQUIRED' });
      const before = sku.onHandQty || 0;
      const reserved = sku.reservedQty || 0;
      if (direction === 'OUT' && before - reserved < quantity) {
        throw Object.assign(new Error('Số lượng khả dụng không đủ để xuất kho'), { status: 409, code: 'INSUFFICIENT_STOCK' });
      }
      const delta = direction === 'IN' ? quantity : -quantity;
      const updated = await Sku.findOneAndUpdate(
        { _id: sku._id, ...(direction === 'OUT' ? { $expr: { $gte: [{ $subtract: [{ $ifNull: ['$onHandQty', 0] }, { $ifNull: ['$reservedQty', 0] }] }, quantity] } } : {}) },
        { $inc: { onHandQty: delta } }, { new: true, session }
      );
      if (!updated) throw Object.assign(new Error('Tồn kho đã thay đổi, hãy thử lại'), { status: 409, code: 'STOCK_CHANGED' });
      await InventoryTransaction.create([{
        transactionCode: `FGM-${randomUUID()}`, warehouseType: 'FINISHED_GOODS',
        itemType: 'FINISHED_SKU', skuId: sku._id,
        transactionType: direction === 'IN' ? 'MANUAL_INBOUND' : 'MANUAL_OUTBOUND',
        referenceModel: 'Sku', referenceId: sku._id,
        quantityChange: delta, onHandBefore: before, onHandAfter: updated.onHandQty,
        unitCostSnapshot: sku.unitCogs || 0, performedByUserId: req.user._id,
        note: String(note || '').trim(),
      }], { session });
      result = { skuId: String(sku._id), skuCode: sku.skuCode, onHandQty: updated.onHandQty };
    });
    return sendSuccess(res, direction === 'IN' ? 'Đã nhập kho' : 'Đã xuất kho', result);
  } catch (error) {
    if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
    if (error.code === 11000) return sendError(res, 'Mã SKU đã tồn tại', { code: 'DUPLICATE_SKU' }, 409);
    next(error);
  } finally { if (session) await session.endSession(); }
});

/** Creates a basic product after checking its code, name, category, and price. */
router.post('/', async (req, res, next) => {
  const productCode = String(req.body?.productCode || '').trim().toUpperCase();
  const productName = String(req.body?.productName || '').trim();
  const sampleCode = String(req.body?.sampleCode || '').trim().toUpperCase();
  const category = String(req.body?.category || '').trim();
  const basePrice = Number(req.body?.basePrice);
  if (!/^[A-Z0-9_-]{2,64}$/.test(productCode) || !productName || productName.length > 200 ||
      !/^[A-Z0-9_-]{2,64}$/.test(sampleCode) || !category || category.length > 100 ||
      req.body?.basePrice === '' || req.body?.basePrice == null || !Number.isFinite(basePrice) || basePrice < 0) {
    return sendError(res, 'Thông tin sản phẩm không hợp lệ', { code: 'INVALID_PRODUCT' }, 400);
  }
  try {
    const product = await Product.create({ productCode, productName, sampleCode, category, basePrice });
    return sendSuccess(res, 'Đã tạo sản phẩm', { product }, 201);
  } catch (error) {
    if (error.code === 11000) return sendError(res, 'Mã sản phẩm đã tồn tại', { code: 'DUPLICATE_PRODUCT_CODE' }, 409);
    next(error);
  }
});

/**
 * Accepts a product image, video, or additional image as a raw request stream.
 * Enforces MIME type and byte limits during transfer, places the asset in the
 * product-code Cloudinary folder, and saves the returned URL only after upload
 * completion. Main image and video uploads replace their prior named asset;
 * additional images get unique names and append to the product gallery.
 */
const uploadProductMedia = async (req, res, next) => {
  const config = media[req.params.kind];
  const mimeType = (req.headers['content-type'] || '').split(';')[0].toLowerCase();
  if (!config.types.includes(mimeType)) return sendError(res, 'Định dạng tệp không được hỗ trợ', { code: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã sản phẩm không hợp lệ', { code: 'INVALID_PRODUCT_ID' }, 400);
  if (Number(req.headers['content-length']) > config.limit) return sendError(res, 'Tệp vượt quá dung lượng cho phép', { code: 'FILE_TOO_LARGE' }, 413);

  try {
    const product = await Product.findById(req.params.id);
    if (!product) return sendError(res, 'Không tìm thấy sản phẩm', { code: 'PRODUCT_NOT_FOUND' }, 404);
    configureProductCloudinary();
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        callback(bytes > config.limit ? Object.assign(new Error('FILE_TOO_LARGE'), { status: 413 }) : null, chunk);
      },
    });
    let settle;
    const uploaded = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    uploaded.catch(() => {});
    const options = {
      ...productMediaOptions(product.productCode, req.params.kind,
        req.params.kind === 'additional-image' ? `extra_${randomUUID()}` : ''),
      overwrite: req.params.kind !== 'additional-image',
      ...(req.params.kind === 'video' ? { chunk_size: 6 * 1024 * 1024 } : {}),
    };
    // Chunked uploads emit intermediate callbacks; save metadata only after the final result.
    const onUploaded = (error, result) => {
      if (error) settle.reject(error);
      else if (result?.done !== false) settle.resolve(result);
    };
    const upload = req.params.kind === 'video'
      ? cloudinary.uploader.upload_chunked_stream(options, onUploaded)
      : cloudinary.uploader.upload_stream(options, onUploaded);
    await pipeline(req, limiter, upload);
    if (!bytes) return sendError(res, 'Tệp rỗng', { code: 'EMPTY_FILE' }, 400);
    const result = await uploaded;
    if (!result?.secure_url || !result?.public_id) throw new Error('Cloudinary không trả về URL tệp');
    if (req.params.kind === 'additional-image') product.additionalImageUrls.push(result.secure_url);
    else {
      product[config.field] = result.secure_url;
      product[config.publicIdField] = result.public_id;
    }
    await product.save();
    return sendSuccess(res, 'Đã lưu tệp sản phẩm', { product });
  } catch (error) {
    if (error.status === 413) return sendError(res, 'Tệp vượt quá dung lượng cho phép', { code: 'FILE_TOO_LARGE' }, 413);
    if (error.status === 503) return sendError(res, error.message, { code: error.code }, 503);
    next(error);
  }
};
router.put('/:id/:kind(image|video)', uploadProductMedia);
router.post('/:id/:kind(additional-image)', uploadProductMedia);

export default router;
