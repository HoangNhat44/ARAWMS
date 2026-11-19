/*
 * File: productConfiguration.service.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Product setup business logic: creating products and SKUs, Excel import, variant and price changes,
 * stopping colors, and the idempotent offline catalog sync. Input is validated in productConfiguration.validation.js.
 */
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import CatalogOperation from '../../../models/CatalogOperation.model.js';
import { buildSkuCode, normalizeColorKey } from '../../../common/utils/productCode.js';
import { copyProductMediaUrl, removeProductMedia } from '../../../common/services/productMediaStorage.js';
import { publishRealtime } from '../../../common/services/realtime.js';
import { parseProductWorkbook, findImportConflicts, saveImportedProducts } from './productExcelImport.js';
import { requestError } from '../shared/warehouseHttp.js';
import {
  readProductCode, parseProductDetails, parseProductCatalogInput, parseProductVariantInputs, parseImportProductPayload,
  assertValidProductCode, assertImportMediaUrl, parseSyncOperation, assertUpdatableProductFields, assertProductId,
  assertColorStatusPayload, assertSkuUpdatePayload, assertSkuPricePayload, assertRequestId,
} from './productConfiguration.validation.js';

const versionConflict = (what = 'Sản phẩm') => requestError(`${what} đã được người khác thay đổi`, 'VERSION_CONFLICT', 409);
const versionFilterOf = (doc) => (doc.version == null ? { $exists: false } : doc.version);

/** Rejects a product code already used by another product, including soft-deleted ones.
 * Legacy products (before scripts/migrate-product-codes.mjs --apply) still carry their code in
 * sampleCode, so that is checked too. TODO(xóa sampleCode): check productCode only after the migration.
 */
export const assertProductCodeFree = async (productCode, session, exceptId = null) => {
  const codeTaken = { $or: [{ productCode }, { sampleCode: productCode }] };
  const filter = exceptId ? { ...codeTaken, _id: { $ne: exceptId } } : codeTaken;
  if (await Product.exists(filter).session(session ?? null)) {
    throw requestError(`Mã sản phẩm ${productCode} đã tồn tại`, 'DUPLICATE_PRODUCT_CODE', 409);
  }
};

/**
 * Adds variants to a product inside the caller's transaction. SKU codes are generated once as
 * PRODUCTCODE-COLORCODE-SIZE. A color/size that was stopped from sale is re-enabled instead of
 * recreated, so it keeps its original code and sales history.
 * @returns {Promise<Array>} Created and re-enabled SKUs.
 */
export const addProductVariants = async (product, variants, session) => {
  const existing = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).session(session);
  const byKey = new Map(existing.map((sku) => [`${normalizeColorKey(sku.color)}:${sku.size}`, sku]));
  const reactivated = [];
  const rows = [];
  for (const variant of variants) {
    const current = byKey.get(variant.key);
    if (current && !current.discontinuedAt) {
      throw requestError(`Biến thể ${current.skuCode} đã tồn tại`, 'DUPLICATE_VARIANT', 409);
    }
    if (current) {
      reactivated.push(await Sku.findOneAndUpdate({ _id: current._id },
        { $set: { isActive: product.isActive, discontinuedAt: null }, $inc: { version: 1 } }, { new: true, session }));
      continue;
    }
    let skuCode;
    try {
      skuCode = buildSkuCode(product.productCode, variant.color, variant.size, { allowLegacyCode: true });
    } catch (error) { throw requestError(error.message, 'INVALID_VARIANT'); }
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
      throw requestError(`${value} đã tồn tại`, 'DUPLICATE_SKU_CODE', 409);
    }
  }
  const created = rows.length ? await Sku.create(rows, { session, ordered: true }) : [];
  return [...created, ...reactivated];
};

/* ---------------------------------------------------------------- Excel import */

/** Reads the workbook and reports validation and database conflicts without writing. */
export async function inspectProductWorkbook(buffer) {
  const parsed = await parseProductWorkbook(buffer);
  const errors = [...parsed.errors, ...(parsed.products.length ? await findImportConflicts(parsed.products) : [])];
  const summary = {
    productCount: parsed.products.length,
    variantCount: parsed.products.reduce((count, product) => count + product.variants.length, 0),
    products: parsed.products.map(({ stt, productCode, productName, variants }) => ({ stt, productCode, productName,
      colors: [...new Set(variants.map(({ color }) => color))], variants: variants.map(({ color, size }) => ({ color, size })) })),
    errors,
  };
  return { parsed, summary };
}

/** Rejects the whole workbook when any row is invalid, otherwise saves all products together. */
export async function importProductWorkbook(buffer) {
  const { parsed, summary } = await inspectProductWorkbook(buffer);
  if (summary.errors.length) {
    throw requestError('File Excel có lỗi; chưa import sản phẩm nào', 'INVALID_EXCEL_DATA', 400, summary);
  }
  await saveImportedProducts(parsed.products);
  return summary;
}

/* ---------------------------------------------------------------- Offline catalog sync */

/** Copies imported image/video URLs before the transaction, so a bad row never leaves orphan assets. */
async function copyImportMedia(payload, productCode, ownerUserId, operationId, uploadedAssets) {
  const media = {};
  for (const [field, kind, publicIdField] of [['imageUrl', 'image', 'imagePublicId'], ['videoUrl', 'video', 'videoPublicId']]) {
    const url = payload[field];
    if (!url) continue;
    assertImportMediaUrl(url);
    let asset;
    try {
      asset = await copyProductMediaUrl(url, productCode, kind, `catalog_${ownerUserId}_${operationId}`);
    } catch (error) {
      if ([400, 404, 422].includes(error.http_code || error.status)) {
        throw requestError('Không tải được ảnh/video từ URL trong file Excel', 'MEDIA_URL_UNAVAILABLE', 422);
      }
      throw error;
    }
    uploadedAssets.push(asset);
    media[kind === 'image' ? 'thumbnailUrl' : 'videoUrl'] = asset.secure_url;
    media[publicIdField] = asset.public_id;
  }
  return media;
}

async function syncUpdateProduct({ payload, serverEntityId, baseVersion }, session) {
  assertProductId(serverEntityId);
  const current = await Product.findOne({ _id: serverEntityId, isDeleted: { $ne: true } }).session(session);
  if (!current) throw requestError('Sản phẩm đã bị xóa', 'PRODUCT_NOT_FOUND', 404);
  if (Number(baseVersion) !== (current.version ?? 0)) throw versionConflict();
  assertUpdatableProductFields(payload);
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
      throw requestError('Mã sản phẩm đã khóa vì sản phẩm đã được đưa vào sử dụng', 'PRODUCT_CODE_LOCKED', 409);
    }
    assertValidProductCode(requestedCode);
    await assertProductCodeFree(requestedCode, session, current._id);
    changes.productCode = requestedCode;
  }
  if (details.isActive && !current.codeLockedAt) changes.codeLockedAt = new Date();
  // Renaming drops a legacy sampleCode so a product never carries two codes.
  const product = await Product.findOneAndUpdate({ _id: current._id, version: versionFilterOf(current) },
    { $set: changes, ...(codeChanged ? { $unset: { sampleCode: '' } } : {}), $inc: { version: 1 } },
    { new: true, runValidators: true, session });
  if (!product) throw versionConflict();
  if (codeChanged) {
    // A draft product has no stock or orders yet, so its SKU codes can be regenerated safely.
    const skus = await Sku.find({ productId: current._id }).session(session);
    if (skus.some((sku) => sku.onHandQty || sku.reservedQty || sku.defectQuarantineQty)) {
      throw requestError('Sản phẩm đã có tồn kho, không thể đổi mã', 'PRODUCT_CODE_LOCKED', 409);
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
  return { product };
}

async function syncAddVariants({ payload, serverEntityId, baseVersion }, session) {
  assertProductId(serverEntityId);
  const product = await Product.findOne({ _id: serverEntityId, isDeleted: { $ne: true } }).session(session);
  if (!product) throw requestError('Sản phẩm đã bị xóa', 'PRODUCT_NOT_FOUND', 404);
  if (Number(baseVersion) !== (product.version ?? 0)) throw versionConflict();
  const variants = parseProductVariantInputs(payload.variants, product.basePrice);
  const skus = await addProductVariants(product, variants, session);
  const changed = await Product.updateOne({ _id: product._id, version: versionFilterOf(product) }, { $inc: { version: 1 } }, { session });
  if (!changed.modifiedCount) throw versionConflict();
  return { productId: String(product._id), skus };
}

/** Stops or resumes selling one color (all its sizes). SKUs are never deleted, so returns of a
 * stopped color can still be inspected and restocked. */
async function syncSetColorActive({ payload, serverEntityId, baseVersion }, session) {
  assertColorStatusPayload(serverEntityId, payload);
  const product = await Product.findOne({ _id: serverEntityId, isDeleted: { $ne: true } }).session(session);
  if (!product) throw requestError('Sản phẩm đã bị xóa', 'PRODUCT_NOT_FOUND', 404);
  if (Number(baseVersion) !== (product.version ?? 0)) throw versionConflict();
  const colorKey = normalizeColorKey(String(payload.color));
  const ids = (await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).select('color').session(session))
    .filter((sku) => normalizeColorKey(sku.color) === colorKey).map((sku) => sku._id);
  if (!ids.length) throw requestError('Không tìm thấy màu này trong sản phẩm', 'COLOR_NOT_FOUND', 404);
  const update = payload.isActive ? { isActive: product.isActive, discontinuedAt: null }
    : { isActive: false, discontinuedAt: new Date() };
  await Sku.updateMany({ _id: { $in: ids } }, { $set: update, $inc: { version: 1 } }, { session });
  const updatedProduct = await Product.findOneAndUpdate({ _id: product._id, version: versionFilterOf(product) },
    { $inc: { version: 1 } }, { new: true, session });
  if (!updatedProduct) throw versionConflict();
  const skus = await Sku.find({ _id: { $in: ids } }).session(session);
  const stock = skus.reduce((total, sku) => ({ onHand: total.onHand + (sku.onHandQty || 0),
    reserved: total.reserved + (sku.reservedQty || 0), quarantine: total.quarantine + (sku.defectQuarantineQty || 0) }),
  { onHand: 0, reserved: 0, quarantine: 0 });
  return { product: updatedProduct, skus, stock };
}

/** Color and size are part of the SKU code, so only the price may change.
 * Add a new variant and stop the old color instead of editing it. */
async function syncUpdateSku({ payload, serverEntityId, baseVersion }, session) {
  assertSkuUpdatePayload(serverEntityId, payload);
  const current = await Sku.findOne({ _id: payload.skuId, productId: serverEntityId, isDeleted: { $ne: true } }).session(session);
  if (!current) throw requestError('SKU đã bị xóa', 'SKU_NOT_FOUND', 404);
  if (Number(baseVersion) !== (current.version ?? 0)) throw versionConflict('SKU');
  const colorChanged = 'color' in payload &&
    normalizeColorKey(String(payload.color ?? '')) !== normalizeColorKey(current.color);
  const sizeChanged = 'size' in payload && String(payload.size ?? '').toUpperCase() !== current.size;
  if (colorChanged || sizeChanged) {
    throw requestError('Không sửa được màu hoặc size của SKU; hãy thêm biến thể mới và ngừng bán biến thể cũ',
      'SKU_ATTRIBUTE_IMMUTABLE', 400);
  }
  const retailPrice = Number(payload.retailPrice ?? current.retailPrice);
  if (payload.retailPrice === '' || !Number.isFinite(retailPrice) || retailPrice < 0) {
    throw requestError('Giá SKU không hợp lệ', 'INVALID_SKU_PRICE');
  }
  const sku = await Sku.findOneAndUpdate({ _id: current._id, version: versionFilterOf(current) },
    { $set: { retailPrice }, $inc: { version: 1 } }, { new: true, runValidators: true, session });
  if (!sku) throw versionConflict('SKU');
  return { sku };
}

/** Legacy price-only operation queued by older clients. */
async function syncUpdateSkuPrice({ payload, serverEntityId, baseVersion }, session) {
  assertSkuPricePayload(serverEntityId, payload);
  const current = await Sku.findOne({ _id: payload.skuId, productId: serverEntityId, isDeleted: { $ne: true } }).session(session);
  if (!current) throw requestError('SKU đã bị xóa', 'SKU_NOT_FOUND', 404);
  if (Number(baseVersion) !== (current.version ?? 0)) throw versionConflict('SKU');
  const sku = await Sku.findOneAndUpdate({ _id: current._id, version: versionFilterOf(current) },
    { $set: { retailPrice: Number(payload.retailPrice) }, $inc: { version: 1 } },
    { new: true, runValidators: true, session });
  if (!sku) throw versionConflict('SKU');
  return { sku };
}

/**
 * Applies one immutable, account-scoped operation and commits its replay result with the catalog write.
 * Repeating an operation ID returns the stored result; reusing it for other content is rejected.
 * @returns {Promise<{ result: object, status: number }>}
 */
export async function syncCatalogOperation(body, user) {
  const operation = parseSyncOperation(body);
  const { operationId, operationType, payload, serverEntityId, baseVersion } = operation;
  const ownerUserId = user._id;
  const payloadHash = createHash('sha256').update(JSON.stringify({ operationType, payload, serverEntityId, baseVersion })).digest('hex');
  const replay = async () => {
    const saved = await CatalogOperation.findOne({ ownerUserId, operationId }).lean();
    if (!saved) return null;
    if (saved.payloadHash !== payloadHash) throw requestError('Mã thao tác đã dùng cho nội dung khác', 'OPERATION_PAYLOAD_CONFLICT', 409);
    return { result: saved.result, status: 200 };
  };
  let session;
  const uploadedAssets = [];
  let committed = false;
  try {
    const previous = await replay();
    if (previous) return previous;
    let createInput;
    let importMedia = {};
    if (operationType === 'CREATE') {
      const catalog = parseProductCatalogInput(payload);
      createInput = { catalog, variants: parseProductVariantInputs(payload.variants, catalog.basePrice) };
      await assertProductCodeFree(catalog.productCode);
    }
    if (operationType === 'IMPORT_PRODUCT') {
      createInput = parseImportProductPayload(payload);
      await assertProductCodeFree(createInput.catalog.productCode);
      importMedia = await copyImportMedia(payload, createInput.catalog.productCode, ownerUserId, operationId, uploadedAssets);
    }
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      if (operationType === 'CREATE') {
        const [product] = await Product.create([{ ...createInput.catalog,
          codeLockedAt: createInput.catalog.isActive ? new Date() : null }], { session });
        result = { product, skus: await addProductVariants(product, createInput.variants, session) };
      } else if (operationType === 'IMPORT_PRODUCT') {
        const [product] = await Product.create([{ ...createInput.catalog, ...importMedia, codeLockedAt: new Date() }], { session });
        result = { product, skus: await addProductVariants(product, createInput.variants, session), rows: payload.rows || [] };
      } else if (operationType === 'UPDATE_PRODUCT') result = await syncUpdateProduct(operation, session);
      else if (operationType === 'ADD_VARIANTS') result = await syncAddVariants(operation, session);
      else if (operationType === 'SET_COLOR_ACTIVE') result = await syncSetColorActive(operation, session);
      else if (operationType === 'UPDATE_SKU') result = await syncUpdateSku(operation, session);
      else result = await syncUpdateSkuPrice(operation, session);
      // Store the public JSON shape so replay has the same IDs and fields as the first response.
      result = JSON.parse(JSON.stringify(result));
      await CatalogOperation.create([{ ownerUserId, operationId, payloadHash, result }], { session });
    });
    committed = true;
    if (operationType === 'UPDATE_PRODUCT' && Object.hasOwn(payload, 'description')) {
      publishRealtime('catalog:product-updated', { productId: String(result.product._id), description: result.product.description,
        version: result.product.version, changedFields: ['description'] });
    }
    return { result, status: ['CREATE', 'IMPORT_PRODUCT'].includes(operationType) ? 201 : 200 };
  } catch (error) {
    if (error.code === 11000) {
      const previous = await replay();
      if (previous) return previous;
    }
    // Concurrent retries can share the deterministic Cloudinary public ID; do not delete their asset.
    if (!committed && uploadedAssets.length && error.code !== 11000) await removeProductMedia(uploadedAssets);
    throw error;
  } finally { if (session) await session.endSession(); }
}

/* ---------------------------------------------------------------- Direct (online) product endpoints */

const productWithSkus = async (product) => ({ product,
  skus: await Sku.find({ productId: product._id, isDeleted: { $ne: true } }) });

/** Creates a product and its SKUs atomically; requestId makes retries idempotent.
 * @returns {Promise<{ product, skus, created: boolean }>} */
export async function createConfiguredProduct(body) {
  const requestId = String(body?.requestId || '');
  assertRequestId(requestId);
  const existing = await Product.findOne({ configurationRequestId: requestId });
  if (existing) return { ...(await productWithSkus(existing)), created: false };
  let session;
  try {
    const catalog = parseProductCatalogInput(body);
    const variants = parseProductVariantInputs(body.variants, catalog.basePrice);
    await assertProductCodeFree(catalog.productCode);
    session = await mongoose.startSession();
    let product;
    let skus;
    await session.withTransaction(async () => {
      [product] = await Product.create([{ ...catalog, configurationRequestId: requestId,
        codeLockedAt: catalog.isActive ? new Date() : null }], { session });
      skus = await addProductVariants(product, variants, session);
    });
    return { product, skus, created: true };
  } catch (error) {
    if (error.code === 11000) {
      const created = await Product.findOne({ configurationRequestId: requestId });
      if (created) return { ...(await productWithSkus(created)), created: false };
    }
    throw error;
  } finally { if (session) await session.endSession(); }
}

/**
 * SKUs stopped from sale that still hold physical stock (e.g. restocked returns), so the owner can
 * resume selling them or clear them out. Computed on read so it never goes stale.
 */
export async function listDiscontinuedStock() {
  const skus = await Sku.find({ isActive: false, discontinuedAt: { $ne: null }, isDeleted: { $ne: true },
    $or: [{ onHandQty: { $gt: 0 } }, { reservedQty: { $gt: 0 } }, { defectQuarantineQty: { $gt: 0 } }] })
    .populate('productId', 'productCode productName').sort({ skuCode: 1 }).lean();
  return { items: skus.map((sku) => ({
    skuId: String(sku._id), skuCode: sku.skuCode, color: sku.color, size: sku.size,
    productId: String(sku.productId?._id || sku.productId), productCode: sku.productId?.productCode || '',
    productName: sku.productId?.productName || '', onHandQty: sku.onHandQty || 0, reservedQty: sku.reservedQty || 0,
    defectQuarantineQty: sku.defectQuarantineQty || 0, discontinuedAt: sku.discontinuedAt,
  })) };
}

/** A product and all active variants for editing and receiving. */
export async function getProductConfiguration(productId) {
  assertProductId(productId);
  const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } });
  if (!product) throw requestError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
  const skus = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).sort({ color: 1, size: 1 });
  return { product, skus };
}

/** Updates product details and keeps existing SKUs in sync with activation.
 * The product code is not editable here; the offline sync UPDATE_PRODUCT operation owns that rule. */
export async function updateProductDetails(productId, body) {
  assertProductId(productId);
  const catalog = parseProductDetails(body);
  const session = await mongoose.startSession();
  try {
    let product;
    await session.withTransaction(async () => {
      const current = await Product.findOne({ _id: productId, isDeleted: { $ne: true } }).session(session);
      if (!current) throw requestError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
      if (readProductCode({ productCode: body?.productCode ?? current.productCode }) !== current.productCode) {
        throw requestError('Không sửa mã sản phẩm qua API này', 'PRODUCT_CODE_LOCKED', 409);
      }
      const changes = { ...catalog, ...(catalog.isActive && !current.codeLockedAt ? { codeLockedAt: new Date() } : {}) };
      product = await Product.findOneAndUpdate({ _id: productId, isDeleted: { $ne: true } },
        { $set: changes, $inc: { version: 1 } }, { new: true, runValidators: true, session });
      if (!current.isActive && catalog.isActive) {
        await Sku.updateMany({ productId: current._id, isDeleted: { $ne: true }, discontinuedAt: null },
          { $set: { isActive: true } }, { session });
      }
    });
    if (Object.hasOwn(body || {}, 'description')) publishRealtime('catalog:product-updated', {
      productId: String(product._id), description: product.description, version: product.version, changedFields: ['description'],
    });
    return { product };
  } finally { await session.endSession(); }
}

/** Adds variants while rejecting existing color and size combinations. */
export async function addVariants(productId, body) {
  assertProductId(productId);
  const session = await mongoose.startSession();
  try {
    let skus;
    await session.withTransaction(async () => {
      const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } }).session(session);
      if (!product) throw requestError('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
      const variants = parseProductVariantInputs(body?.variants, product.basePrice);
      skus = await addProductVariants(product, variants, session);
      await Product.updateOne({ _id: product._id }, { $inc: { version: 1 } }, { session });
    });
    return { skus };
  } finally { await session.endSession(); }
}

/** Updates the price of a SKU owned by the selected product. */
export async function updateSkuPrice(productId, skuId, retailPrice) {
  const sku = await Sku.findOneAndUpdate({ _id: skuId, productId, isDeleted: { $ne: true } },
    { $set: { retailPrice: Number(retailPrice) }, $inc: { version: 1 } }, { new: true, runValidators: true });
  if (!sku) throw requestError('Không tìm thấy SKU', 'SKU_NOT_FOUND', 404);
  return { sku };
}
