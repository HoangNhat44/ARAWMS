/*
 * File: productConfiguration.validation.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Input validation for product setup, Excel import, variants, prices and offline catalog sync.
 * Every function throws a request error (status 400 unless stated) and never touches the database.
 */
import mongoose from 'mongoose';
import { isValidProductCode, normalizeColorKey, normalizeProductCode, toColorCode } from '../../../common/utils/productCode.js';
import { requestError } from '../shared/warehouseHttp.js';

export const PRODUCT_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE']);
export const SYNC_OPERATION_TYPES = ['CREATE', 'UPDATE_PRODUCT', 'ADD_VARIANTS', 'UPDATE_SKU_PRICE', 'UPDATE_SKU',
  'IMPORT_PRODUCT', 'SET_COLOR_ACTIVE'];
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
export const PRODUCT_CODE_MESSAGE = 'Mã sản phẩm cần 2–20 chữ in hoa hoặc số, không dấu, không dấu gạch';

/** Reads the user-defined product code. productCode is the only product code field; sampleCode is
 * deprecated and never written. The sampleCode alias below only accepts operations queued offline by
 * older clients — TODO(xóa sampleCode): remove once no device can hold such operations.
 */
export const readProductCode = (body) => normalizeProductCode(body?.productCode ?? body?.sampleCode);

/** Validates product name, category, description and base price (not the code).
 * There is no draft product any more: a product is selling from the moment it is added, and stops
 * selling by itself when all its colors are stopped. A `status` sent by older clients is ignored.
 */
export const parseProductDetails = (body) => {
  const productName = String(body?.productName || '').trim();
  const category = String(body?.category || '').trim();
  const description = String(body?.description || '').trim();
  const basePrice = Number(body?.basePrice);
  if (!productName || productName.length > 200 ||
      !category || category.length > 100 || description.length > 2000 ||
      body?.basePrice === '' || body?.basePrice == null || !Number.isFinite(basePrice) || basePrice < 0) {
    throw requestError('Thông tin sản phẩm không hợp lệ', 'INVALID_PRODUCT');
  }
  return { productName, category, description, basePrice };
};

/** Requires a product code that follows the shared code rule. */
export const assertValidProductCode = (productCode) => {
  if (!isValidProductCode(productCode)) throw requestError(PRODUCT_CODE_MESSAGE, 'INVALID_PRODUCT_CODE');
};

/** Validates a new product: details plus a product code that follows the shared code rule. */
export const parseProductCatalogInput = (body) => {
  const productCode = readProductCode(body);
  assertValidProductCode(productCode);
  return { productCode, ...parseProductDetails(body) };
};

/** Requires 1-100 variants with valid color, size, and nonnegative price.
 * The same normalized color and size pair may occur only once per product, and two
 * color names may not collapse into the same color code (e.g. "Đỏ" and "Do").
 */
export const parseProductVariantInputs = (variants, basePrice) => {
  if (!Array.isArray(variants) || variants.length < 1 || variants.length > 100) {
    throw requestError('Cần chọn ít nhất một biến thể', 'VARIANTS_REQUIRED');
  }
  const seen = new Set();
  const seenCodes = new Map();
  return variants.map((item) => {
    const color = String(item?.color || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const size = String(item?.size || '').toUpperCase();
    const retailPrice = item?.retailPrice == null || item?.retailPrice === '' ? basePrice : Number(item.retailPrice);
    if (!color || color.length > 80 || !PRODUCT_SIZES.has(size) || !Number.isFinite(retailPrice) || retailPrice < 0) {
      throw requestError('Biến thể không hợp lệ', 'INVALID_VARIANT');
    }
    const colorCode = toColorCode(color);
    if (!colorCode) throw requestError(`Màu "${color}" cần có chữ hoặc số`, 'INVALID_VARIANT');
    const key = `${normalizeColorKey(color)}:${size}`;
    if (seen.has(key)) throw requestError('Trùng tổ hợp màu và size', 'DUPLICATE_VARIANT');
    const codeKey = `${colorCode}:${size}`;
    if (seenCodes.has(codeKey) && seenCodes.get(codeKey) !== normalizeColorKey(color)) {
      throw requestError(`Màu "${color}" trùng mã ${colorCode} với một màu khác`, 'DUPLICATE_COLOR_CODE');
    }
    seen.add(key);
    seenCodes.set(codeKey, normalizeColorKey(color));
    return { color, size, retailPrice, key };
  });
};

/**
 * Validates one product group read from Excel (see offlineProductWorkbook / productExcelImport).
 * One product per product code; each variant is one color × size row. Operations queued by
 * older clients carried a single product-level color, which is still accepted.
 */
export const parseImportProductPayload = (payload) => {
  const productCode = normalizeProductCode(payload.productCode);
  if (!isValidProductCode(productCode)) {
    throw requestError(`Mã sản phẩm "${payload.productCode}" cần 2–20 chữ in hoa hoặc số, không dấu, không dấu gạch`,
      'INVALID_PRODUCT_CODE');
  }
  const productName = String(payload.productName || '').trim();
  const category = String(payload.category || '').trim();
  const description = String(payload.description || '').trim();
  const basePrice = Number(payload.basePrice);
  if (!productName || productName.length > 200 || !category || category.length > 100 || description.length > 2000 ||
      !Number.isFinite(basePrice) || basePrice < 0 || !Array.isArray(payload.variants)) {
    throw requestError('Dòng import không hợp lệ', 'INVALID_IMPORT_PRODUCT');
  }
  const variants = parseProductVariantInputs(payload.variants.map((item) => ({
    color: item?.color ?? payload.color, size: item?.size, retailPrice: item?.price,
  })), basePrice).map((variant, index) => {
    const source = payload.variants[index];
    const threshold = source.threshold == null || source.threshold === '' ? 10 : Number(source.threshold);
    const barcode = String(source.barcode || '').trim();
    if (!Number.isSafeInteger(threshold) || threshold < 0 || barcode.length > 128 || /\s/.test(barcode)) {
      throw requestError('SKU trong file không hợp lệ', 'INVALID_IMPORT_VARIANT');
    }
    return { ...variant, threshold, barcode };
  });
  return { catalog: { productCode, productName, category, description, basePrice,
    isActive: true }, variants };
};

/** Media URL copied from an imported Excel row. */
export const assertImportMediaUrl = (url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || url.length > 2000) {
    throw requestError('URL ảnh/video không hợp lệ', 'INVALID_MEDIA_URL');
  }
};

/** Offline sync envelope: an immutable operation ID, a known operation type and an object payload. */
export const parseSyncOperation = (body) => {
  const { operationId, operationType, payload, serverEntityId, baseVersion } = body || {};
  if (!REQUEST_ID_PATTERN.test(String(operationId || '')) || !payload || typeof payload !== 'object' ||
      !SYNC_OPERATION_TYPES.includes(operationType)) {
    throw requestError('Thao tác đồng bộ không hợp lệ', 'INVALID_OPERATION');
  }
  return { operationId, operationType, payload, serverEntityId, baseVersion };
};

/** Fields an UPDATE_PRODUCT sync operation may change. sampleCode is accepted as an alias of
 * productCode for operations queued by older clients. TODO(xóa sampleCode): drop the alias. */
export const assertUpdatableProductFields = (payload) => {
  const allowed = ['productName', 'productCode', 'sampleCode', 'category', 'description', 'basePrice', 'status'];
  if (!Object.keys(payload).length || Object.keys(payload).some((key) => !allowed.includes(key))) {
    throw requestError('Trường cập nhật không hợp lệ', 'INVALID_PRODUCT');
  }
};

export const assertProductId = (value) => {
  if (!mongoose.isValidObjectId(value)) throw requestError('Mã sản phẩm không hợp lệ', 'INVALID_PRODUCT_ID');
};

/** SET_COLOR_ACTIVE payload: { color, isActive } only. */
export const assertColorStatusPayload = (serverEntityId, payload) => {
  if (!mongoose.isValidObjectId(serverEntityId) || typeof payload.isActive !== 'boolean' ||
      !String(payload.color || '').trim() || Object.keys(payload).some((key) => !['color', 'isActive'].includes(key))) {
    throw requestError('Thông tin màu không hợp lệ', 'INVALID_COLOR_STATUS');
  }
};

/** UPDATE_SKU payload: { skuId, color?, size?, retailPrice? } only. */
export const assertSkuUpdatePayload = (serverEntityId, payload) => {
  if (!mongoose.isValidObjectId(serverEntityId) || !mongoose.isValidObjectId(payload.skuId) ||
      Object.keys(payload).some((key) => !['skuId', 'color', 'size', 'retailPrice'].includes(key))) {
    throw requestError('Thông tin SKU không hợp lệ', 'INVALID_VARIANT');
  }
};

/** A nonnegative SKU price given as a number or numeric string. */
export const isValidSkuPrice = (value) => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0;

/** UPDATE_SKU_PRICE payload: { skuId, retailPrice } for a product. */
export const assertSkuPricePayload = (serverEntityId, payload) => {
  if (!mongoose.isValidObjectId(serverEntityId) || !mongoose.isValidObjectId(payload.skuId) ||
      payload.retailPrice === '' || !Number.isFinite(Number(payload.retailPrice)) || Number(payload.retailPrice) < 0) {
    throw requestError('Giá SKU không hợp lệ', 'INVALID_SKU_PRICE');
  }
};

/** PATCH /:id/variants/:skuId: both IDs and a nonnegative price are required. */
export const assertSkuPriceRequest = (productId, skuId, body) => {
  if (!mongoose.isValidObjectId(productId) || !mongoose.isValidObjectId(skuId) || !isValidSkuPrice(body?.retailPrice)) {
    throw requestError('Giá SKU không hợp lệ', 'INVALID_SKU_PRICE');
  }
};

/** Idempotency key for POST /new. */
export const assertRequestId = (value) => {
  if (!REQUEST_ID_PATTERN.test(String(value || ''))) throw requestError('Mã yêu cầu không hợp lệ', 'INVALID_REQUEST_ID');
};

/** An .xlsx file is a ZIP archive, which starts with "PK". */
export const assertExcelBuffer = (body) => {
  if (!Buffer.isBuffer(body) || body.length < 4 || body.subarray(0, 2).toString() !== 'PK') {
    throw requestError('Vui lòng chọn file .xlsx hợp lệ', 'INVALID_EXCEL_FILE');
  }
};
