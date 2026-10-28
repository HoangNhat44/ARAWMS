/*
 * File: productConfiguration.routes.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Defines product setup, Excel import, variant, and pricing endpoints. Validates product and SKU data before persisting catalog changes.
 */
import express from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { parseProductWorkbook, findImportConflicts, saveImportedProducts } from './productExcelImport.js';

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

/** Validates product name, sample code, category, base price, and draft/active status. */
const parseProductCatalogInput = (body) => {
  const productName = String(body?.productName || '').trim();
  const sampleCode = String(body?.sampleCode || '').trim().toUpperCase();
  const category = String(body?.category || '').trim();
  const description = String(body?.description || '').trim();
  const basePrice = Number(body?.basePrice);
  if (!productName || productName.length > 200 || !/^[A-Z0-9_-]{2,64}$/.test(sampleCode) ||
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
        { _id: req.params.id, isDeleted: { $ne: true } }, { $set: catalog }, { new: true, runValidators: true, session }
      );
      if (!current.isActive && catalog.isActive) {
        await Sku.updateMany({ productId: current._id, isDeleted: { $ne: true } }, { $set: { isActive: true } }, { session });
      }
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
      { $set: { retailPrice: Number(req.body.retailPrice) } }, { new: true, runValidators: true }
    );
    if (!sku) return sendError(res, 'Không tìm thấy SKU', { code: 'SKU_NOT_FOUND' }, 404);
    return sendSuccess(res, 'Đã cập nhật giá SKU', { sku });
  } catch (error) { next(error); }
});

export default router;
