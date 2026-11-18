/*
 * File: productConfiguration.routes.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Defines product setup, Excel import, variant, and pricing endpoints. Validates product and SKU data before persisting catalog changes.
 */
import express from 'express';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import CatalogOperation from '../../../models/CatalogOperation.model.js';
import { buildSkuCode, isValidProductCode, normalizeColorKey, normalizeProductCode, toColorCode } from '../../../common/utils/productCode.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { parseProductWorkbook, findImportConflicts, saveImportedProducts } from './productExcelImport.js';
import { copyProductMediaUrl, removeProductMedia } from '../../../common/services/productMediaStorage.js';
import { publishRealtime } from '../../../common/services/realtime.js';

const router = express.Router();
const excelBody = express.raw({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'], limit: '5mb' });
const sizes = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE']);
const createProductRequestError = (message, code, status = 400) => Object.assign(new Error(message), { code, status });
/** Converts expected validation and duplicate errors into client responses. */
const respondToProductError = (error, res, next) => {
  if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
  if (error.code === 11000) return sendError(res, 'Mã sản phẩm hoặc biến thể đã tồn tại', { code: 'DUPLICATE_PRODUCT_OR_VARIANT' }, 409);
  next(error);
};

/** Reads the user-defined product code. productCode is the only product code field; sampleCode is
 * deprecated and never written. The sampleCode alias below only accepts operations queued offline by
 * older clients — TODO(xóa sampleCode): remove once no device can hold such operations.
 */
const readProductCode = (body) => normalizeProductCode(body?.productCode ?? body?.sampleCode);

/** Validates product name, category, description, base price, and draft/active status (not the code). */
const parseProductDetails = (body) => {
  const productName = String(body?.productName || '').trim();
  const category = String(body?.category || '').trim();
  const description = String(body?.description || '').trim();
  const basePrice = Number(body?.basePrice);
  if (!productName || productName.length > 200 ||
      !category || category.length > 100 || description.length > 2000 ||
      body?.basePrice === '' || body?.basePrice == null || !Number.isFinite(basePrice) || basePrice < 0 ||
      !['DRAFT', 'ACTIVE'].includes(body?.status)) throw createProductRequestError('Thông tin sản phẩm không hợp lệ', 'INVALID_PRODUCT');
  return { productName, category, description, basePrice, isActive: body.status === 'ACTIVE' };
};

/** Validates a new product: details plus a product code that follows the shared code rule. */
const parseProductCatalogInput = (body) => {
  const productCode = readProductCode(body);
  if (!isValidProductCode(productCode)) {
    throw createProductRequestError('Mã sản phẩm cần 2–20 chữ in hoa hoặc số, không dấu, không dấu gạch', 'INVALID_PRODUCT_CODE');
  }
  return { productCode, ...parseProductDetails(body) };
};

/** Rejects a product code already used by another product, including soft-deleted ones.
 * Legacy products (before scripts/migrate-product-codes.mjs --apply) still carry their code in
 * sampleCode, so that is checked too. TODO(xóa sampleCode): check productCode only after the migration.
 */
const assertProductCodeFree = async (productCode, session, exceptId = null) => {
  const codeTaken = { $or: [{ productCode }, { sampleCode: productCode }] };
  const filter = exceptId ? { ...codeTaken, _id: { $ne: exceptId } } : codeTaken;
  if (await Product.exists(filter).session(session ?? null)) {
    throw createProductRequestError(`Mã sản phẩm ${productCode} đã tồn tại`, 'DUPLICATE_PRODUCT_CODE', 409);
  }
};

/** Requires 1-100 variants with valid color, size, and nonnegative price.
 * The same normalized color and size pair may occur only once per product, and two
 * color names may not collapse into the same color code (e.g. "Đỏ" and "Do").
 */
const parseProductVariantInputs = (variants, basePrice) => {
  if (!Array.isArray(variants) || variants.length < 1 || variants.length > 100) {
    throw createProductRequestError('Cần chọn ít nhất một biến thể', 'VARIANTS_REQUIRED');
  }
  const seen = new Set();
  const seenCodes = new Map();
  return variants.map((item) => {
    const color = String(item?.color || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const size = String(item?.size || '').toUpperCase();
    const retailPrice = item?.retailPrice == null || item?.retailPrice === '' ? basePrice : Number(item.retailPrice);
    if (!color || color.length > 80 || !sizes.has(size) || !Number.isFinite(retailPrice) || retailPrice < 0) {
      throw createProductRequestError('Biến thể không hợp lệ', 'INVALID_VARIANT');
    }
    const colorCode = toColorCode(color);
    if (!colorCode) throw createProductRequestError(`Màu "${color}" cần có chữ hoặc số`, 'INVALID_VARIANT');
    const key = `${normalizeColorKey(color)}:${size}`;
    if (seen.has(key)) throw createProductRequestError('Trùng tổ hợp màu và size', 'DUPLICATE_VARIANT');
    const codeKey = `${colorCode}:${size}`;
    if (seenCodes.has(codeKey) && seenCodes.get(codeKey) !== normalizeColorKey(color)) {
      throw createProductRequestError(`Màu "${color}" trùng mã ${colorCode} với một màu khác`, 'DUPLICATE_COLOR_CODE');
    }
    seen.add(key);
    seenCodes.set(codeKey, normalizeColorKey(color));
    return { color, size, retailPrice, key };
  });
};

/**
 * Adds variants to a product inside the caller's transaction. SKU codes are generated once as
 * PRODUCTCODE-COLORCODE-SIZE. A color/size that was stopped from sale is re-enabled instead of
 * recreated, so it keeps its original code and sales history.
 * @returns {Promise<Array>} Created and re-enabled SKUs.
 */
const addProductVariants = async (product, variants, session) => {
  const existing = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).session(session);
  const byKey = new Map(existing.map((sku) => [`${normalizeColorKey(sku.color)}:${sku.size}`, sku]));
  const reactivated = [];
  const rows = [];
  for (const variant of variants) {
    const current = byKey.get(variant.key);
    if (current && !current.discontinuedAt) {
      throw createProductRequestError(`Biến thể ${current.skuCode} đã tồn tại`, 'DUPLICATE_VARIANT', 409);
    }
    if (current) {
      reactivated.push(await Sku.findOneAndUpdate({ _id: current._id },
        { $set: { isActive: product.isActive, discontinuedAt: null }, $inc: { version: 1 } }, { new: true, session }));
      continue;
    }
    let skuCode;
    try {
      skuCode = buildSkuCode(product.productCode, variant.color, variant.size, { allowLegacyCode: true });
    } catch (error) { throw createProductRequestError(error.message, 'INVALID_VARIANT'); }
    // Excel rows may carry their own printed barcode and low-stock threshold.
    rows.push({ productId: product._id, skuCode, skuBarcode: variant.barcode || skuCode, styleName: product.productCode,
      color: variant.color, size: variant.size, retailPrice: variant.retailPrice,
      ...(variant.threshold != null ? { safetyStockThreshold: variant.threshold } : {}),
      variantKey: `${product._id}:${variant.key}`, isActive: product.isActive });
  }
  if (rows.length) {
    // Soft-deleted SKUs still reserve their code and barcode in the unique indexes.
    const codes = rows.map((row) => row.skuCode);
    const barcodes = rows.map((row) => row.skuBarcode);
    const taken = await Sku.findOne({ $or: [{ skuCode: { $in: codes } }, { skuBarcode: { $in: barcodes } }] })
      .select('skuCode skuBarcode').session(session);
    if (taken) {
      const value = codes.includes(taken.skuCode) ? `Mã SKU ${taken.skuCode}` : `Mã vạch ${taken.skuBarcode}`;
      throw createProductRequestError(`${value} đã tồn tại`, 'DUPLICATE_SKU_CODE', 409);
    }
  }
  const created = rows.length ? await Sku.create(rows, { session, ordered: true }) : [];
  return [...created, ...reactivated];
};

/**
 * Validates one product group read from Excel (see offlineProductWorkbook / productExcelImport).
 * One product per product code; each variant is one color × size row. Operations queued by
 * older clients carried a single product-level color, which is still accepted.
 */
const parseImportProductPayload = (payload) => {
  const productCode = normalizeProductCode(payload.productCode);
  if (!isValidProductCode(productCode)) {
    throw createProductRequestError(`Mã sản phẩm "${payload.productCode}" cần 2–20 chữ in hoa hoặc số, không dấu, không dấu gạch`,
      'INVALID_PRODUCT_CODE');
  }
  const productName = String(payload.productName || '').trim();
  const category = String(payload.category || '').trim();
  const description = String(payload.description || '').trim();
  const basePrice = Number(payload.basePrice);
  if (!productName || productName.length > 200 || !category || category.length > 100 || description.length > 2000 ||
      !Number.isFinite(basePrice) || basePrice < 0 || !Array.isArray(payload.variants)) {
    throw createProductRequestError('Dòng import không hợp lệ', 'INVALID_IMPORT_PRODUCT');
  }
  const variants = parseProductVariantInputs(payload.variants.map((item) => ({
    color: item?.color ?? payload.color, size: item?.size, retailPrice: item?.price,
  })), basePrice).map((variant, index) => {
    const source = payload.variants[index];
    const threshold = source.threshold == null || source.threshold === '' ? 10 : Number(source.threshold);
    const barcode = String(source.barcode || '').trim();
    if (!Number.isSafeInteger(threshold) || threshold < 0 || barcode.length > 128 || /\s/.test(barcode)) {
      throw createProductRequestError('SKU trong file không hợp lệ', 'INVALID_IMPORT_VARIANT');
    }
    return { ...variant, threshold, barcode };
  });
  return { catalog: { productCode, productName, category, description, basePrice,
    isActive: true }, variants };
};

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
      products: parsed.products.map(({ stt, productCode, productName, variants }) => ({ stt, productCode, productName,
        colors: [...new Set(variants.map(({ color }) => color))], variants: variants.map(({ color, size }) => ({ color, size })) })),
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
router.post('/sync', async (req, res, next) => {
  const { operationId, operationType, payload, serverEntityId, baseVersion } = req.body || {};
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(String(operationId || '')) || !payload || typeof payload !== 'object' ||
      !['CREATE', 'UPDATE_PRODUCT', 'ADD_VARIANTS', 'UPDATE_SKU_PRICE', 'UPDATE_SKU', 'IMPORT_PRODUCT', 'SET_COLOR_ACTIVE'].includes(operationType)) {
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
    let createInput;
    if (operationType === 'CREATE') {
      const catalog = parseProductCatalogInput(payload);
      createInput = { catalog, variants: parseProductVariantInputs(payload.variants, catalog.basePrice) };
      await assertProductCodeFree(catalog.productCode);
    }
    if (operationType === 'IMPORT_PRODUCT') {
      // Validate before copying media so a bad row never leaves orphan assets.
      createInput = parseImportProductPayload(payload);
      await assertProductCodeFree(createInput.catalog.productCode);
      for (const [field, kind, publicIdField] of [['imageUrl', 'image', 'imagePublicId'],
        ['videoUrl', 'video', 'videoPublicId']]) {
        const url = payload[field];
        if (!url) continue;
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || url.length > 2000) {
          throw createProductRequestError('URL ảnh/video không hợp lệ', 'INVALID_MEDIA_URL');
        }
        let asset;
        try {
          asset = await copyProductMediaUrl(url, createInput.catalog.productCode, kind,
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
        const [product] = await Product.create([{ ...createInput.catalog,
          codeLockedAt: createInput.catalog.isActive ? new Date() : null }], { session });
        const skus = await addProductVariants(product, createInput.variants, session);
        result = { product, skus };
      } else if (operationType === 'IMPORT_PRODUCT') {
        const [product] = await Product.create([{ ...createInput.catalog, ...importMedia, codeLockedAt: new Date() }], { session });
        const skus = await addProductVariants(product, createInput.variants, session);
        result = { product, skus, rows: payload.rows || [] };
      } else if (operationType === 'UPDATE_PRODUCT') {
        if (!mongoose.isValidObjectId(serverEntityId)) throw createProductRequestError('Mã sản phẩm không hợp lệ', 'INVALID_PRODUCT_ID');
        const current = await Product.findOne({ _id: serverEntityId, isDeleted: { $ne: true } }).session(session);
        if (!current) throw createProductRequestError('Sản phẩm đã bị xóa', 'PRODUCT_NOT_FOUND', 404);
        if (Number(baseVersion) !== (current.version ?? 0)) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        // sampleCode is accepted as an alias of productCode for operations queued by older clients.
        // TODO(xóa sampleCode): drop the alias together with readProductCode's fallback.
        const allowed = ['productName', 'productCode', 'sampleCode', 'category', 'description', 'basePrice', 'status'];
        if (!Object.keys(payload).length || Object.keys(payload).some((key) => !allowed.includes(key))) {
          throw createProductRequestError('Trường cập nhật không hợp lệ', 'INVALID_PRODUCT');
        }
        const details = parseProductDetails({ ...current.toObject(), ...payload,
          status: payload.status || (current.isActive ? 'ACTIVE' : 'DRAFT') });
        const changes = Object.fromEntries(['productName', 'category', 'description', 'basePrice']
          .filter((key) => key in payload).map((key) => [key, details[key]]));
        if ('status' in payload) changes.isActive = details.isActive;
        const requestedCode = ('productCode' in payload || 'sampleCode' in payload) ? readProductCode(payload) : current.productCode;
        const codeChanged = requestedCode !== current.productCode;
        if (codeChanged) {
          // The code is frozen once the product has been ACTIVE: SKU codes, labels and orders already carry it.
          if (current.codeLockedAt || current.isActive) {
            throw createProductRequestError('Mã sản phẩm đã khóa vì sản phẩm đã được đưa vào sử dụng', 'PRODUCT_CODE_LOCKED', 409);
          }
          if (!isValidProductCode(requestedCode)) {
            throw createProductRequestError('Mã sản phẩm cần 2–20 chữ in hoa hoặc số, không dấu, không dấu gạch', 'INVALID_PRODUCT_CODE');
          }
          await assertProductCodeFree(requestedCode, session, current._id);
          changes.productCode = requestedCode;
        }
        if (details.isActive && !current.codeLockedAt) changes.codeLockedAt = new Date();
        const versionFilter = current.version == null ? { $exists: false } : current.version;
        // Renaming drops a legacy sampleCode so a product never carries two codes.
        const product = await Product.findOneAndUpdate({ _id: current._id, version: versionFilter },
          { $set: changes, ...(codeChanged ? { $unset: { sampleCode: '' } } : {}), $inc: { version: 1 } },
          { new: true, runValidators: true, session });
        if (!product) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        if (codeChanged) {
          // A draft product has no stock or orders yet, so its SKU codes can be regenerated safely.
          const skus = await Sku.find({ productId: current._id }).session(session);
          if (skus.some((sku) => sku.onHandQty || sku.reservedQty || sku.defectQuarantineQty)) {
            throw createProductRequestError('Sản phẩm đã có tồn kho, không thể đổi mã', 'PRODUCT_CODE_LOCKED', 409);
          }
          for (const sku of skus) {
            const skuCode = buildSkuCode(requestedCode, sku.color, sku.size);
            await Sku.updateOne({ _id: sku._id }, { $set: { skuCode, skuBarcode: skuCode, styleName: requestedCode },
              $inc: { version: 1 } }, { session });
          }
        }
        // Stopped colors stay inactive when the product is activated.
        if (!current.isActive && details.isActive) await Sku.updateMany({ productId: current._id,
          isDeleted: { $ne: true }, discontinuedAt: null }, { $set: { isActive: true } }, { session });
        result = { product };
      } else if (operationType === 'ADD_VARIANTS') {
        if (!mongoose.isValidObjectId(serverEntityId)) throw createProductRequestError('Mã sản phẩm không hợp lệ', 'INVALID_PRODUCT_ID');
        const product = await Product.findOne({ _id: serverEntityId, isDeleted: { $ne: true } }).session(session);
        if (!product) throw createProductRequestError('Sản phẩm đã bị xóa', 'PRODUCT_NOT_FOUND', 404);
        if (Number(baseVersion) !== (product.version ?? 0)) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        const variants = parseProductVariantInputs(payload.variants, product.basePrice);
        const skus = await addProductVariants(product, variants, session);
        const versionFilter = product.version == null ? { $exists: false } : product.version;
        const changed = await Product.updateOne({ _id: product._id, version: versionFilter }, { $inc: { version: 1 } }, { session });
        if (!changed.modifiedCount) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        result = { productId: String(product._id), skus };
      } else if (operationType === 'SET_COLOR_ACTIVE') {
        // Stops or resumes selling one color (all its sizes). SKUs are never deleted, so returns of a
        // stopped color can still be inspected and restocked.
        if (!mongoose.isValidObjectId(serverEntityId) || typeof payload.isActive !== 'boolean' ||
            !String(payload.color || '').trim() || Object.keys(payload).some((key) => !['color', 'isActive'].includes(key))) {
          throw createProductRequestError('Thông tin màu không hợp lệ', 'INVALID_COLOR_STATUS');
        }
        const product = await Product.findOne({ _id: serverEntityId, isDeleted: { $ne: true } }).session(session);
        if (!product) throw createProductRequestError('Sản phẩm đã bị xóa', 'PRODUCT_NOT_FOUND', 404);
        if (Number(baseVersion) !== (product.version ?? 0)) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        const colorKey = normalizeColorKey(String(payload.color));
        const ids = (await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).select('color').session(session))
          .filter((sku) => normalizeColorKey(sku.color) === colorKey).map((sku) => sku._id);
        if (!ids.length) throw createProductRequestError('Không tìm thấy màu này trong sản phẩm', 'COLOR_NOT_FOUND', 404);
        const update = payload.isActive ? { isActive: product.isActive, discontinuedAt: null }
          : { isActive: false, discontinuedAt: new Date() };
        await Sku.updateMany({ _id: { $in: ids } }, { $set: update, $inc: { version: 1 } }, { session });
        const versionFilter = product.version == null ? { $exists: false } : product.version;
        const updatedProduct = await Product.findOneAndUpdate({ _id: product._id, version: versionFilter },
          { $inc: { version: 1 } }, { new: true, session });
        if (!updatedProduct) throw createProductRequestError('Sản phẩm đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        const skus = await Sku.find({ _id: { $in: ids } }).session(session);
        const stock = skus.reduce((total, sku) => ({ onHand: total.onHand + (sku.onHandQty || 0),
          reserved: total.reserved + (sku.reservedQty || 0), quarantine: total.quarantine + (sku.defectQuarantineQty || 0) }),
        { onHand: 0, reserved: 0, quarantine: 0 });
        result = { product: updatedProduct, skus, stock };
      } else if (operationType === 'UPDATE_SKU') {
        if (!mongoose.isValidObjectId(serverEntityId) || !mongoose.isValidObjectId(payload.skuId) ||
            Object.keys(payload).some((key) => !['skuId', 'color', 'size', 'retailPrice'].includes(key))) {
          throw createProductRequestError('Thông tin SKU không hợp lệ', 'INVALID_VARIANT');
        }
        const current = await Sku.findOne({ _id: payload.skuId, productId: serverEntityId, isDeleted: { $ne: true } }).session(session);
        if (!current) throw createProductRequestError('SKU đã bị xóa', 'SKU_NOT_FOUND', 404);
        if (Number(baseVersion) !== (current.version ?? 0)) throw createProductRequestError('SKU đã được người khác thay đổi', 'VERSION_CONFLICT', 409);
        // Color and size are part of the SKU code, so only the price may change.
        // Add a new variant and stop the old color instead of editing it.
        const colorChanged = 'color' in payload &&
          normalizeColorKey(String(payload.color ?? '')) !== normalizeColorKey(current.color);
        const sizeChanged = 'size' in payload && String(payload.size ?? '').toUpperCase() !== current.size;
        if (colorChanged || sizeChanged) {
          throw createProductRequestError('Không sửa được màu hoặc size của SKU; hãy thêm biến thể mới và ngừng bán biến thể cũ',
            'SKU_ATTRIBUTE_IMMUTABLE', 400);
        }
        const retailPrice = Number(payload.retailPrice ?? current.retailPrice);
        if (payload.retailPrice === '' || !Number.isFinite(retailPrice) || retailPrice < 0) {
          throw createProductRequestError('Giá SKU không hợp lệ', 'INVALID_SKU_PRICE');
        }
        const versionFilter = current.version == null ? { $exists: false } : current.version;
        const sku = await Sku.findOneAndUpdate({ _id: current._id, version: versionFilter },
          { $set: { retailPrice }, $inc: { version: 1 } }, { new: true, runValidators: true, session });
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
    await assertProductCodeFree(catalog.productCode);
    session = await mongoose.startSession();
    let product, skus;
    await session.withTransaction(async () => {
      [product] = await Product.create([{ ...catalog, configurationRequestId: requestId,
        codeLockedAt: catalog.isActive ? new Date() : null }], { session });
      skus = await addProductVariants(product, variants, session);
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

/**
 * Lists SKUs stopped from sale that still hold physical stock (e.g. restocked returns), so the
 * owner can resume selling them or clear them out. Computed on read so it never goes stale.
 * Declared before GET /:id so the path is not treated as a product ID.
 */
router.get('/discontinued-stock', async (req, res, next) => {
  try {
    const skus = await Sku.find({ isActive: false, discontinuedAt: { $ne: null }, isDeleted: { $ne: true },
      $or: [{ onHandQty: { $gt: 0 } }, { reservedQty: { $gt: 0 } }, { defectQuarantineQty: { $gt: 0 } }] })
      .populate('productId', 'productCode productName').sort({ skuCode: 1 }).lean();
    return sendSuccess(res, 'SKU ngừng bán còn tồn', { items: skus.map((sku) => ({
      skuId: String(sku._id), skuCode: sku.skuCode, color: sku.color, size: sku.size,
      productId: String(sku.productId?._id || sku.productId), productCode: sku.productId?.productCode || '',
      productName: sku.productId?.productName || '', onHandQty: sku.onHandQty || 0, reservedQty: sku.reservedQty || 0,
      defectQuarantineQty: sku.defectQuarantineQty || 0, discontinuedAt: sku.discontinuedAt,
    })) });
  } catch (error) { next(error); }
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

/** Updates product details and keeps existing SKUs in sync with activation.
 * The product code is not editable here; the offline /sync UPDATE_PRODUCT operation owns that rule.
 */
router.patch('/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã sản phẩm không hợp lệ', { code: 'INVALID_PRODUCT_ID' }, 400);
  let session;
  try {
    const catalog = parseProductDetails(req.body);
    session = await mongoose.startSession();
    let product;
    await session.withTransaction(async () => {
      const current = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).session(session);
      if (!current) throw createProductRequestError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
      if (normalizeProductCode(req.body?.productCode ?? current.productCode) !== current.productCode) {
        throw createProductRequestError('Không sửa mã sản phẩm qua API này', 'PRODUCT_CODE_LOCKED', 409);
      }
      const changes = { ...catalog, ...(catalog.isActive && !current.codeLockedAt ? { codeLockedAt: new Date() } : {}) };
      product = await Product.findOneAndUpdate(
        { _id: req.params.id, isDeleted: { $ne: true } }, { $set: changes, $inc: { version: 1 } }, { new: true, runValidators: true, session }
      );
      if (!current.isActive && catalog.isActive) {
        await Sku.updateMany({ productId: current._id, isDeleted: { $ne: true }, discontinuedAt: null },
          { $set: { isActive: true } }, { session });
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
      skus = await addProductVariants(product, variants, session);
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
