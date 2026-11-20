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
import { defectQtyBySku } from '../../../common/services/defectStock.js';
import { publishRealtime } from '../../../common/services/realtime.js';
import { parseProductWorkbook, findImportConflicts, saveImportedProducts } from './productExcelImport.js';
import { requestError } from '../shared/warehouseHttp.js';
import {
  readProductCode, parseProductDetails, parseProductCatalogInput, parseProductVariantInputs, parseImportProductPayload,
  assertImportMediaUrl, parseSyncOperation, assertUpdatableProductFields, assertProductId,
  assertColorStatusPayload, assertSkuUpdatePayload, assertSkuPricePayload, assertRequestId,
} from './productConfiguration.validation.js';

const versionConflict = (what = 'Sản phẩm') => requestError(`${what} đã được người khác thay đổi`, 'VERSION_CONFLICT', 409);
const versionFilterOf = (doc) => (doc.version == null ? { $exists: false } : doc.version);

/*
 * Product status. There is no draft product any more ("nháp" is only the form kept on the device
 * before the product is added, plus the offline queue). A product is selling from the moment it is
 * added and its code is locked at once. Its status follows its colors: it stops selling when every
 * color is stopped and sells again when a color is resumed or added.
 */

/** A draft saved by an older version (inactive and never locked). Kept usable until it is activated. */
const isLegacyDraft = (product) => !product.isActive && !product.codeLockedAt;

/** A product sells while at least one of its SKUs is not stopped. */
const hasSellingSku = async (productId, session) => Boolean(await Sku.exists({ productId,
  isDeleted: { $ne: true }, discontinuedAt: null }).session(session ?? null));

/** Status fields a product must take after its colors changed (legacy drafts stay drafts). */
const sellingStatusFor = async (product, session) => {
  if (isLegacyDraft(product)) return {};
  const selling = await hasSellingSku(product._id, session);
  return { isActive: selling, ...(product.codeLockedAt ? {} : { codeLockedAt: new Date() }) };
};

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
  // New or resumed variants sell right away; only a legacy draft keeps them inactive until it is activated.
  const skuActive = !isLegacyDraft(product);
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
        { $set: { isActive: skuActive, discontinuedAt: null }, $inc: { version: 1 } }, { new: true, session }));
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
      variantKey: `${product._id}:${variant.key}`, isActive: skuActive });
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
  // Other distinct images of the product (one per color row in the source file) become extra images.
  const extras = (Array.isArray(payload.imageUrls) ? payload.imageUrls : []).filter((url) => url && url !== payload.imageUrl).slice(0, 10);
  for (const [index, url] of extras.entries()) {
    assertImportMediaUrl(url);
    let asset;
    try {
      asset = await copyProductMediaUrl(url, productCode, 'image', `catalog_${ownerUserId}_${operationId}_${index + 2}`);
    } catch (error) {
      if ([400, 404, 422].includes(error.http_code || error.status)) {
        throw requestError('Không tải được ảnh/video từ URL trong file Excel', 'MEDIA_URL_UNAVAILABLE', 422);
      }
      throw error;
    }
    uploadedAssets.push(asset);
    (media.additionalImageUrls ||= []).push(asset.secure_url);
  }
  return media;
}

async function syncUpdateProduct({ payload, serverEntityId, baseVersion }, session) {
  assertProductId(serverEntityId);
  const current = await Product.findOne({ _id: serverEntityId, isDeleted: { $ne: true } }).session(session);
  if (!current) throw requestError('Sản phẩm đã bị xóa', 'PRODUCT_NOT_FOUND', 404);
  if (Number(baseVersion) !== (current.version ?? 0)) throw versionConflict();
  assertUpdatableProductFields(payload);
  const details = parseProductDetails({ ...current.toObject(), ...payload });
  const changes = Object.fromEntries(['productName', 'category', 'description', 'basePrice']
    .filter((key) => key in payload).map((key) => [key, details[key]]));
  // Once a product is added its code never changes; only its details can be edited.
  const requestedCode = ('productCode' in payload || 'sampleCode' in payload) ? readProductCode(payload) : current.productCode;
  if (requestedCode !== current.productCode) {
    throw requestError('Mã sản phẩm không sửa được sau khi đã thêm sản phẩm', 'PRODUCT_CODE_LOCKED', 409);
  }
  // `status` is ignored: selling follows the colors. The only exception is a legacy draft, which an
  // older client activates with status ACTIVE; its code is locked and its variants start selling.
  const activateLegacyDraft = payload.status === 'ACTIVE' && isLegacyDraft(current);
  if (activateLegacyDraft) Object.assign(changes, { isActive: true, codeLockedAt: new Date() });
  else if (current.isActive && !current.codeLockedAt) changes.codeLockedAt = new Date();
  const product = await Product.findOneAndUpdate({ _id: current._id, version: versionFilterOf(current) },
    { $set: changes, $inc: { version: 1 } }, { new: true, runValidators: true, session });
  if (!product) throw versionConflict();
  // Stopped colors stay stopped when a legacy draft is activated.
  if (activateLegacyDraft) await Sku.updateMany({ productId: current._id,
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
  // Adding or resuming a variant on a stopped product makes it sell again.
  const updated = await Product.findOneAndUpdate({ _id: product._id, version: versionFilterOf(product) },
    { $set: await sellingStatusFor(product, session), $inc: { version: 1 } }, { new: true, session });
  if (!updated) throw versionConflict();
  return { productId: String(product._id), product: updated, skus };
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
  const update = payload.isActive ? { isActive: !isLegacyDraft(product), discontinuedAt: null }
    : { isActive: false, discontinuedAt: new Date() };
  await Sku.updateMany({ _id: { $in: ids } }, { $set: update, $inc: { version: 1 } }, { session });
  // Stopping the last color stops the product; resuming any color makes it sell again.
  const updatedProduct = await Product.findOneAndUpdate({ _id: product._id, version: versionFilterOf(product) },
    { $set: await sellingStatusFor(product, session), $inc: { version: 1 } }, { new: true, session });
  if (!updatedProduct) throw versionConflict();
  const skus = await Sku.find({ _id: { $in: ids } }).session(session);
  const defectBySku = await defectQtyBySku(ids);
  const stock = skus.reduce((total, sku) => ({ onHand: total.onHand + (sku.onHandQty || 0),
    reserved: total.reserved + (sku.reservedQty || 0), quarantine: total.quarantine + (defectBySku.get(String(sku._id)) || 0) }),
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
        // A product sells from the moment it is added, and its code is locked at once.
        const [product] = await Product.create([{ ...createInput.catalog, isActive: true, codeLockedAt: new Date() }], { session });
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
        isActive: true, codeLockedAt: new Date() }], { session });
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
  const stopped = await Sku.find({ isActive: false, discontinuedAt: { $ne: null }, isDeleted: { $ne: true } })
    .populate('productId', 'productCode productName').sort({ skuCode: 1 }).lean();
  // Defective units are counted per unit (ProductUnit), not stored on the SKU.
  const defectBySku = await defectQtyBySku(stopped.map((sku) => sku._id));
  const skus = stopped.filter((sku) => sku.onHandQty > 0 || sku.reservedQty > 0 || defectBySku.get(String(sku._id)));
  return { items: skus.map((sku) => ({
    skuId: String(sku._id), skuCode: sku.skuCode, color: sku.color, size: sku.size,
    productId: String(sku.productId?._id || sku.productId), productCode: sku.productId?.productCode || '',
    productName: sku.productId?.productName || '', onHandQty: sku.onHandQty || 0, reservedQty: sku.reservedQty || 0,
    defectQty: defectBySku.get(String(sku._id)) || 0, discontinuedAt: sku.discontinuedAt,
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

/** Updates product details. The code never changes after the product is added, and selling follows
 * the colors, so neither the code nor a status is taken from the body. */
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
        throw requestError('Mã sản phẩm không sửa được sau khi đã thêm sản phẩm', 'PRODUCT_CODE_LOCKED', 409);
      }
      product = await Product.findOneAndUpdate({ _id: productId, isDeleted: { $ne: true } },
        { $set: catalog, $inc: { version: 1 } }, { new: true, runValidators: true, session });
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
      await Product.updateOne({ _id: product._id },
        { $set: await sellingStatusFor(product, session), $inc: { version: 1 } }, { session });
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
