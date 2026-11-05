/*
 * File: productConfiguration.routes.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Defines product setup, Excel import, variant, and pricing endpoints. Validates product and SKU data before persisting catalog changes.
 */
import express from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import CatalogOperation from '../../../models/CatalogOperation.model.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { parseProductWorkbook, findImportConflicts, saveImportedProducts } from './productExcelImport.js';
import { copyProductMediaUrl, removeProductMedia } from '../../../common/services/productMediaStorage.js';
import { publishRealtime } from '../../../common/services/realtime.js';

const router = express.Router();
const excelBody = express.raw({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'], limit: '5mb' });
const sizes = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE']);
/** Uses normalized color text to detect duplicate color and size combinations. */
const normalizeColorKey = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
const createProductRequestError = (message, code, status = 400) => Object.assign(new Error(message), { code, status });
/** Converts expected validation and duplicate errors into client responses. */
const respondToProductError = (error, res, next) => {
  if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
  if (error.code === 11000) return sendError(res, 'Mã sản phẩm hoặc biến thể đã tồn tại', { code: 'DUPLICATE_PRODUCT_OR_VARIANT' }, 409);
  next(error);
};
const authenticateCatalogRequest = (req, res, next) => {
  // Direct-URL development uses the test user installed by the parent products router.
  if (process.env.NODE_ENV !== 'production' && !req.headers.authorization && req.user) return next();
  return authenticate(req, res, next);
};

/** Validates product name, sample code, category, base price, and draft/active status. */
const parseProductCatalogInput = (body, { allowMissingSampleCode = false } = {}) => {
  const productName = String(body?.productName || '').trim();
  const sampleCode = String(body?.sampleCode || '').trim().toUpperCase();
  const category = String(body?.category || '').trim();
  const description = String(body?.description || '').trim();
  const basePrice = Number(body?.basePrice);
  if (!productName || productName.length > 200 ||
      (!allowMissingSampleCode || sampleCode) && !/^[A-Z0-9_-]{2,64}$/.test(sampleCode) ||
      !category || category.length > 100 || description.length > 2000 ||
      body?.basePrice === '' || body?.basePrice == null || !Number.isFinite(basePrice) || basePrice < 0 ||
      !['DRAFT', 'ACTIVE'].includes(body?.status)) throw createProductRequestError('Thông tin sản phẩm không hợp lệ', 'INVALID_PRODUCT');
  return { productName, sampleCode, category, description, basePrice, isActive: body.status === 'ACTIVE' };
};

/** Requires 1-100 variants with valid color, size, and nonnegative price.
 * The same normalized color and size pair may occur only once per product.
 */
const parseProductVariantInputs = (variants, basePrice) => {
  if (!Array.isArray(variants) || variants.length < 1 || variants.length > 100) {
    throw createProductRequestError('Cần chọn ít nhất một biến thể', 'VARIANTS_REQUIRED');
  }
  const seen = new Set();
  return variants.map((item) => {
    const color = String(item?.color || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const size = String(item?.size || '').toUpperCase();
    const retailPrice = item?.retailPrice == null || item?.retailPrice === '' ? basePrice : Number(item.retailPrice);
    if (!color || color.length > 80 || !sizes.has(size) || !Number.isFinite(retailPrice) || retailPrice < 0) {
      throw createProductRequestError('Biến thể không hợp lệ', 'INVALID_VARIANT');
    }
    const key = `${normalizeColorKey(color)}:${size}`;
    if (seen.has(key)) throw createProductRequestError('Trùng tổ hợp màu và size', 'DUPLICATE_VARIANT');
    seen.add(key);
    return { color, size, retailPrice, key };
  });
};

/** Creates variant SKUs in the same transaction as their product. */
const createProductVariantSkus = async (product, variants, session) => Sku.create(variants.map((variant) => {
  const skuCode = `${product.productCode}-V${randomUUID().slice(0, 8).toUpperCase()}`;
  return {
    productId: product._id, skuCode, skuBarcode: `SKU-${skuCode}`,
    styleName: product.sampleCode || product.productName, color: variant.color,
    size: variant.size, retailPrice: variant.retailPrice,
    variantKey: `${product._id}:${variant.key}`, isActive: product.isActive,
  };
}), { session });

/**
 * Builds the preview and commit handlers for the same Excel workbook format.
 * Rows with a shared STT become one product with multiple size variants. Preview
 * reports validation and database conflicts without writing; commit rejects the
 * entire workbook when any row is invalid, then saves all products together.
 * @param {boolean} preview whether to return a validation summary only
 * @returns {Function} an Express request handler for workbook bytes
 */
const importExcel = (preview) => async (req, res, next) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 4 || req.body.subarray(0, 2).toString() !== 'PK') {
    return sendError(res, 'Vui lòng chọn file .xlsx hợp lệ', { code: 'INVALID_EXCEL_FILE' }, 400);
  }
  try {
    const parsed = await parseProductWorkbook(req.body);
    const errors = [...parsed.errors, ...(parsed.products.length ? await findImportConflicts(parsed.products) : [])];
    const summary = {
      productCount: parsed.products.length,
      variantCount: parsed.products.reduce((count, product) => count + product.variants.length, 0),
      products: parsed.products.map(({ stt, productCode, productName, color, variants }) => ({ stt, productCode, productName, color, sizes: variants.map(({ size }) => size) })),
      errors,
    };
    if (preview) return sendSuccess(res, 'Kết quả kiểm tra file Excel', summary);
    if (errors.length) return sendError(res, 'File Excel có lỗi; chưa import sản phẩm nào', { code: 'INVALID_EXCEL_DATA', ...summary }, 400);
    await saveImportedProducts(parsed.products);
    return sendSuccess(res, 'Đã import sản phẩm và biến thể', summary, 201);
  } catch (error) {
    if (error.status === 400) return sendError(res, error.message, { code: 'INVALID_EXCEL_FILE' }, 400);
    if (error.code === 11000) return sendError(res, 'Mã sản phẩm, mã mẫu mã hoặc mã vạch đã tồn tại; chưa import sản phẩm nào', { code: 'DUPLICATE_PRODUCT_OR_VARIANT' }, 409);
    if (/zip|xlsx|workbook|archive/i.test(error.message)) return sendError(res, 'Không đọc được file Excel', { code: 'INVALID_EXCEL_FILE' }, 400);
    next(error);
  }
};

/** Applies one immutable, account-scoped operation and commits its replay result with the catalog write. */
router.post('/sync', authenticateCatalogRequest, (req, res, next) => req.user.roles?.some((role) =>
  ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(role))
  ? next() : sendError(res, 'Tài khoản không có quyền quản lý sản phẩm', { code: 'FORBIDDEN' }, 403), async (req, res, next) => {
  const { operationId, operationType, payload, serverEntityId, baseVersion } = req.body || {};
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(String(operationId || '')) || !payload || typeof payload !== 'object' ||
      !['CREATE', 'UPDATE_PRODUCT', 'ADD_VARIANTS', 'UPDATE_SKU_PRICE', 'UPDATE_SKU', 'IMPORT_PRODUCT'].includes(operationType)) {
    return sendError(res, 'Thao tác đồng bộ không hợp lệ', { code: 'INVALID_OPERATION' }, 400);
  }
  const ownerUserId = req.user._id;
  const payloadHash = createHash('sha256').update(JSON.stringify({ operationType, payload, serverEntityId, baseVersion })).digest('hex');
  const replay = async () => {
    const saved = await CatalogOperation.findOne({ ownerUserId, operationId }).lean();
    if (!saved) return false;
    if (saved.payloadHash !== payloadHash) {
      sendError(res, 'Mã thao tác đã dùng cho nội dung khác', { code: 'OPERATION_PAYLOAD_CONFLICT' }, 409);
    } else sendSuccess(res, 'Đã đồng bộ', saved.result);
    return true;
  };
  let session;
  const uploadedAssets = [];
  let importMedia = {};
  let committed = false;
  try {
    if (await replay()) return;
    let productCode;
    let createInput;
    if (operationType === 'CREATE') {
      const catalog = parseProductCatalogInput(payload);
      createInput = { catalog, variants: parseProductVariantInputs(payload.variants, catalog.basePrice) };
      const year = new Date().getFullYear();
      productCode = await CounterSequence.getNextSequence(`PRODUCT-${year}`, `SP-${year}`, 5);
    }
    if (operationType === 'IMPORT_PRODUCT') {
      if (await Product.exists({ productCode: String(payload.productCode || '').toUpperCase() })) {
        throw createProductRequestError('Mã sản phẩm đã tồn tại', 'DUPLICATE_PRODUCT_OR_VARIANT', 409);
      }
      for (const [field, kind, publicIdField] of [['imageUrl', 'image', 'imagePublicId'],
        ['videoUrl', 'video', 'videoPublicId']]) {
        const url = payload[field];
        if (!url) continue;
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || url.length > 2000) {
          throw createProductRequestError('URL ảnh/video không hợp lệ', 'INVALID_MEDIA_URL');
        }
        let asset;
        try {
          asset = await copyProductMediaUrl(url, String(payload.productCode), kind,
            `catalog_${ownerUserId}_${operationId}`);
        } catch (error) {
          if ([400, 404, 422].includes(error.http_code || error.status)) {
            throw createProductRequestError('Không tải được ảnh/video từ URL trong file Excel', 'MEDIA_URL_UNAVAILABLE', 422);
          }
          throw error;
        }
        uploadedAssets.push(asset);
        importMedia[kind === 'image' ? 'thumbnailUrl' : 'videoUrl'] = asset.secure_url;
        importMedia[publicIdField] = asset.public_id;
      }
    }
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      if (operationType === 'CREATE') {
        const [product] = await Product.create([{ ...createInput.catalog, productCode }], { session });
        const skus = await createProductVariantSkus(product, createInput.variants, session);
        result = { product, skus };
      } else if (operationType === 'IMPORT_PRODUCT') {
        const codePattern = /^[\p{L}\p{N}_-]{2,64}$/u;
        if (!codePattern.test(payload.productCode || '') || !payload.productName || !payload.category ||
            !payload.color || !Array.isArray(payload.variants) || !payload.variants.length || payload.variants.length > 100 ||
            !Number.isFinite(Number(payload.basePrice)) || Number(payload.basePrice) < 0) {
          throw createProductRequestError('Dòng import không hợp lệ', 'INVALID_IMPORT_PRODUCT');
        }
        const catalog = { productCode: payload.productCode, productName: payload.productName,
          sampleCode: payload.productCode, category: payload.category, description: payload.description || '',
          basePrice: Number(payload.basePrice), isActive: true };
        const colorKey = normalizeColorKey(String(payload.color));
        const seen = new Set();
        const skusInput = payload.variants.map((item) => {
          if (!codePattern.test(item.skuCode || '') || !sizes.has(item.size) ||
              !Number.isFinite(Number(item.price)) || Number(item.price) < 0 ||
              !Number.isSafeInteger(Number(item.threshold)) || Number(item.threshold) < 0 || seen.has(item.size)) {
            throw createProductRequestError('SKU trong file không hợp lệ', 'INVALID_IMPORT_VARIANT');
          }
          seen.add(item.size);
          return item;
        });
        const [product] = await Product.create([{ ...catalog, ...importMedia }], { session });
        const skus = await Sku.create(skusInput.map((item) => ({ productId: product._id,
          skuCode: item.skuCode, skuBarcode: item.barcode || `SKU-${item.skuCode}`,
          styleName: product.productCode, color: payload.color, size: item.size,
          retailPrice: Number(item.price), safetyStockThreshold: Number(item.threshold),
          variantKey: `${product._id}:${colorKey}:${item.size}`, isActive: true })), { session, ordered: true });
        result = { product, skus, rows: payload.rows || [] };
      } else if (operationType === 'UPDATE_PRODUCT') {
        if (!mongoose.isValidObjectId(serverEntityId)) throw createProductRequestError('Mã sản phẩm không hợp lệ', 'INVALID_PRODUCT_ID');
        const current = await Product.findOne({ _id: serverEntityId, isDeleted: { $ne: true } }).session(session);
        if (!current) throw createProductRequestError('Sản phẩm đã bị xóa', 'PRODUCT_NOT_FOUND', 404);
        if (Number(baseVersion) !== (current.version ?? 0)) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        const allowed = ['productName', 'sampleCode', 'category', 'description', 'basePrice', 'status'];
        if (!Object.keys(payload).length || Object.keys(payload).some((key) => !allowed.includes(key))) {
          throw createProductRequestError('Trường cập nhật không hợp lệ', 'INVALID_PRODUCT');
        }
        const preserveLegacySampleCode = !String(current.sampleCode || '').trim() && !String(payload.sampleCode || '').trim();
        const catalog = parseProductCatalogInput({ ...current.toObject(), ...payload,
          status: payload.status || (current.isActive ? 'ACTIVE' : 'DRAFT') }, { allowMissingSampleCode: preserveLegacySampleCode });
        const changes = Object.fromEntries(Object.keys(payload)
          .filter((key) => key !== 'status' && !(key === 'sampleCode' && preserveLegacySampleCode))
          .map((key) => [key, catalog[key]]));
        if ('status' in payload) changes.isActive = catalog.isActive;
        const versionFilter = current.version == null ? { $exists: false } : current.version;
        const product = await Product.findOneAndUpdate({ _id: current._id, version: versionFilter },
          { $set: changes, $inc: { version: 1 } }, { new: true, runValidators: true, session });
        if (!product) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        if (!current.isActive && catalog.isActive) await Sku.updateMany({ productId: current._id, isDeleted: { $ne: true } },
          { $set: { isActive: true } }, { session });
        result = { product };
      } else if (operationType === 'ADD_VARIANTS') {
        if (!mongoose.isValidObjectId(serverEntityId)) throw createProductRequestError('Mã sản phẩm không hợp lệ', 'INVALID_PRODUCT_ID');
        const product = await Product.findOne({ _id: serverEntityId, isDeleted: { $ne: true } }).session(session);
        if (!product) throw createProductRequestError('Sản phẩm đã bị xóa', 'PRODUCT_NOT_FOUND', 404);
        if (Number(baseVersion) !== (product.version ?? 0)) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        const variants = parseProductVariantInputs(payload.variants, product.basePrice);
        const existing = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).session(session);
        const keys = new Set(existing.map((sku) => `${normalizeColorKey(sku.color)}:${sku.size}`));
        if (variants.some((variant) => keys.has(variant.key))) throw createProductRequestError('Biến thể màu–size đã tồn tại', 'DUPLICATE_VARIANT', 409);
        const skus = await createProductVariantSkus(product, variants, session);
        const versionFilter = product.version == null ? { $exists: false } : product.version;
        const changed = await Product.updateOne({ _id: product._id, version: versionFilter }, { $inc: { version: 1 } }, { session });
        if (!changed.modifiedCount) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        result = { productId: String(product._id), skus };
      } else if (operationType === 'UPDATE_SKU') {
        if (!mongoose.isValidObjectId(serverEntityId) || !mongoose.isValidObjectId(payload.skuId) ||
            Object.keys(payload).some((key) => !['skuId', 'color', 'size', 'retailPrice'].includes(key))) {
          throw createProductRequestError('Thông tin SKU không hợp lệ', 'INVALID_VARIANT');
        }
        const current = await Sku.findOne({ _id: payload.skuId, productId: serverEntityId, isDeleted: { $ne: true } }).session(session);
        if (!current) throw createProductRequestError('SKU đã bị xóa', 'SKU_NOT_FOUND', 404);
        if (Number(baseVersion) !== (current.version ?? 0)) throw createProductRequestError('SKU đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        const color = String(payload.color ?? current.color).normalize('NFKC').trim().replace(/\s+/g, ' ');
        const size = String(payload.size ?? current.size).toUpperCase();
        const retailPrice = Number(payload.retailPrice ?? current.retailPrice);
        if (!color || color.length > 80 || !sizes.has(size) || !Number.isFinite(retailPrice) || retailPrice < 0) {
          throw createProductRequestError('Màu, size hoặc giá SKU không hợp lệ', 'INVALID_VARIANT');
        }
        if ((color !== current.color || size !== current.size) &&
            (current.onHandQty || current.reservedQty || current.defectQuarantineQty)) {
          throw createProductRequestError('SKU đã có tồn kho, không thể đổi màu hoặc size', 'SKU_HAS_STOCK', 409);
        }
        const versionFilter = current.version == null ? { $exists: false } : current.version;
        const sku = await Sku.findOneAndUpdate({ _id: current._id, version: versionFilter },
          { $set: { color, size, retailPrice, variantKey: `${current.productId}:${normalizeColorKey(color)}:${size}` },
            $inc: { version: 1 } }, { new: true, runValidators: true, session });
        if (!sku) throw createProductRequestError('SKU đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        result = { sku };
      } else {
        if (!mongoose.isValidObjectId(serverEntityId) || !mongoose.isValidObjectId(payload.skuId) ||
            payload.retailPrice === '' || !Number.isFinite(Number(payload.retailPrice)) || Number(payload.retailPrice) < 0) {
          throw createProductRequestError('Giá SKU không hợp lệ', 'INVALID_SKU_PRICE');
        }
        const current = await Sku.findOne({ _id: payload.skuId, productId: serverEntityId, isDeleted: { $ne: true } }).session(session);
        if (!current) throw createProductRequestError('SKU đã bị xóa', 'SKU_NOT_FOUND', 404);
        if (Number(baseVersion) !== (current.version ?? 0)) throw createProductRequestError('SKU đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        const versionFilter = current.version == null ? { $exists: false } : current.version;
        const sku = await Sku.findOneAndUpdate({ _id: current._id, version: versionFilter },
          { $set: { retailPrice: Number(payload.retailPrice) }, $inc: { version: 1 } },
          { new: true, runValidators: true, session });
        if (!sku) throw createProductRequestError('SKU đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        result = { sku };
      }
      // Store the public JSON shape so replay has the same IDs and fields as the first response.
      result = JSON.parse(JSON.stringify(result));
      await CatalogOperation.create([{ ownerUserId, operationId, payloadHash, result }], { session });
    });
    committed = true;
    if (operationType === 'UPDATE_PRODUCT' && Object.hasOwn(payload, 'description')) {
      publishRealtime('catalog:product-updated', { productId: String(result.product._id), description: result.product.description,
        version: result.product.version, changedFields: ['description'] });
    }
    return sendSuccess(res, 'Đã đồng bộ', result, ['CREATE', 'IMPORT_PRODUCT'].includes(operationType) ? 201 : 200);
  } catch (error) {
    if (error.code === 11000 && await replay()) return;
    // Concurrent retries can share the deterministic Cloudinary public ID; do not delete their asset.
    if (!committed && uploadedAssets.length && error.code !== 11000) await removeProductMedia(uploadedAssets);
    respondToProductError(error, res, next);
  } finally { if (session) await session.endSession(); }
});

router.post('/import/preview', excelBody, importExcel(true));
router.post('/import', excelBody, importExcel(false));

/** Creates a product and its SKUs atomically; requestId makes retries idempotent. */
router.post('/new', async (req, res, next) => {
  const requestId = String(req.body?.requestId || '');
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) return sendError(res, 'Mã yêu cầu không hợp lệ', { code: 'INVALID_REQUEST_ID' }, 400);
  let session;
  try {
    const existing = await Product.findOne({ configurationRequestId: requestId });
    if (existing) {
      const skus = await Sku.find({ productId: existing._id, isDeleted: { $ne: true } });
      return sendSuccess(res, 'Sản phẩm đã được tạo', { product: existing, skus });
    }
    const catalog = parseProductCatalogInput(req.body);
    const variants = parseProductVariantInputs(req.body.variants, catalog.basePrice);
    const year = new Date().getFullYear();
    const productCode = await CounterSequence.getNextSequence(`PRODUCT-${year}`, `SP-${year}`, 5);
    session = await mongoose.startSession();
    let product, skus;
    await session.withTransaction(async () => {
      [product] = await Product.create([{ ...catalog, productCode, configurationRequestId: requestId }], { session });
      skus = await createProductVariantSkus(product, variants, session);
    });
    return sendSuccess(res, 'Đã cấu hình sản phẩm', { product, skus }, 201);
  } catch (error) {
    if (error.code === 11000) {
      const existing = await Product.findOne({ configurationRequestId: requestId });
      if (existing) {
        const skus = await Sku.find({ productId: existing._id, isDeleted: { $ne: true } });
        return sendSuccess(res, 'Sản phẩm đã được tạo', { product: existing, skus });
      }
    }
    respondToProductError(error, res, next);
  } finally { if (session) await session.endSession(); }
});

/** Returns a product and all active variants for editing and receiving. */
router.get('/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã sản phẩm không hợp lệ', { code: 'INVALID_PRODUCT_ID' }, 400);
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return sendError(res, 'Không tìm thấy sản phẩm', { code: 'PRODUCT_NOT_FOUND' }, 404);
    const skus = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).sort({ color: 1, size: 1 });
    return sendSuccess(res, 'Cấu hình sản phẩm', { product, skus });
  } catch (error) { next(error); }
});

/** Updates product details and keeps existing SKUs in sync with activation. */
router.patch('/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã sản phẩm không hợp lệ', { code: 'INVALID_PRODUCT_ID' }, 400);
  let session;
  try {
    const catalog = parseProductCatalogInput(req.body);
    session = await mongoose.startSession();
    let product;
    await session.withTransaction(async () => {
      const current = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).session(session);
      if (!current) throw createProductRequestError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
      product = await Product.findOneAndUpdate(
        { _id: req.params.id, isDeleted: { $ne: true } }, { $set: catalog, $inc: { version: 1 } }, { new: true, runValidators: true, session }
      );
      if (!current.isActive && catalog.isActive) {
        await Sku.updateMany({ productId: current._id, isDeleted: { $ne: true } }, { $set: { isActive: true } }, { session });
      }
    });
    if (Object.hasOwn(req.body || {}, 'description')) publishRealtime('catalog:product-updated', {
      productId: String(product._id), description: product.description, version: product.version, changedFields: ['description'],
    });
    return sendSuccess(res, 'Đã cập nhật thông tin sản phẩm', { product });
  } catch (error) { respondToProductError(error, res, next); }
  finally { if (session) await session.endSession(); }
});

/** Adds variants while rejecting existing color and size combinations. */
router.post('/:id/variants', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã sản phẩm không hợp lệ', { code: 'INVALID_PRODUCT_ID' }, 400);
  let session;
  try {
    session = await mongoose.startSession();
    let skus;
    await session.withTransaction(async () => {
      const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).session(session);
      if (!product) throw createProductRequestError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
      const variants = parseProductVariantInputs(req.body?.variants, product.basePrice);
      const existing = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).session(session);
      const keys = new Set(existing.map((sku) => `${normalizeColorKey(sku.color)}:${sku.size}`));
      if (variants.some((variant) => keys.has(variant.key))) throw createProductRequestError('Biến thể màu–size đã tồn tại', 'DUPLICATE_VARIANT', 409);
      skus = await createProductVariantSkus(product, variants, session);
      await Product.updateOne({ _id: product._id }, { $inc: { version: 1 } }, { session });
    });
    return sendSuccess(res, 'Đã thêm biến thể', { skus }, 201);
  } catch (error) { respondToProductError(error, res, next); }
  finally { if (session) await session.endSession(); }
});

/** Updates the price of a SKU owned by the selected product. */
router.patch('/:id/variants/:skuId', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.skuId) ||
      req.body?.retailPrice === '' || req.body?.retailPrice == null ||
      !Number.isFinite(Number(req.body.retailPrice)) || Number(req.body.retailPrice) < 0) {
    return sendError(res, 'Giá SKU không hợp lệ', { code: 'INVALID_SKU_PRICE' }, 400);
  }
  try {
    const sku = await Sku.findOneAndUpdate(
      { _id: req.params.skuId, productId: req.params.id, isDeleted: { $ne: true } },
      { $set: { retailPrice: Number(req.body.retailPrice) }, $inc: { version: 1 } }, { new: true, runValidators: true }
    );
    if (!sku) return sendError(res, 'Không tìm thấy SKU', { code: 'SKU_NOT_FOUND' }, 404);
    return sendSuccess(res, 'Đã cập nhật giá SKU', { sku });
  } catch (error) { next(error); }
});

export default router;
