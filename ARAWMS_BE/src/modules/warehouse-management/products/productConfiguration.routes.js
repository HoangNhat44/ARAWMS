import express from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';

const router = express.Router();
const sizes = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE']);
const colorKey = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
const fail = (message, code, status = 400) => Object.assign(new Error(message), { code, status });
const respondError = (error, res, next) => {
  if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
  if (error.code === 11000) return sendError(res, 'Mã sản phẩm hoặc biến thể đã tồn tại', { code: 'DUPLICATE_PRODUCT_OR_VARIANT' }, 409);
  next(error);
};

const parseCatalog = (body) => {
  const productName = String(body?.productName || '').trim();
  const sampleCode = String(body?.sampleCode || '').trim().toUpperCase();
  const category = String(body?.category || '').trim();
  const description = String(body?.description || '').trim();
  const basePrice = Number(body?.basePrice);
  if (!productName || productName.length > 200 || !/^[A-Z0-9_-]{2,64}$/.test(sampleCode) ||
      !category || category.length > 100 || description.length > 2000 ||
      body?.basePrice === '' || body?.basePrice == null || !Number.isFinite(basePrice) || basePrice < 0 ||
      !['DRAFT', 'ACTIVE'].includes(body?.status)) throw fail('Thông tin sản phẩm không hợp lệ', 'INVALID_PRODUCT');
  return { productName, sampleCode, category, description, basePrice, isActive: body.status === 'ACTIVE' };
};

const parseVariants = (variants, basePrice) => {
  if (!Array.isArray(variants) || variants.length < 1 || variants.length > 100) {
    throw fail('Cần chọn ít nhất một biến thể', 'VARIANTS_REQUIRED');
  }
  const seen = new Set();
  return variants.map((item) => {
    const color = String(item?.color || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const size = String(item?.size || '').toUpperCase();
    const retailPrice = item?.retailPrice == null || item?.retailPrice === '' ? basePrice : Number(item.retailPrice);
    if (!color || color.length > 80 || !sizes.has(size) || !Number.isFinite(retailPrice) || retailPrice < 0) {
      throw fail('Biến thể không hợp lệ', 'INVALID_VARIANT');
    }
    const key = `${colorKey(color)}:${size}`;
    if (seen.has(key)) throw fail('Trùng tổ hợp màu và size', 'DUPLICATE_VARIANT');
    seen.add(key);
    return { color, size, retailPrice, key };
  });
};

const createSkus = async (product, variants, session) => Sku.create(variants.map((variant) => {
  const skuCode = `${product.productCode}-V${randomUUID().slice(0, 8).toUpperCase()}`;
  return {
    productId: product._id, skuCode, skuBarcode: `SKU-${skuCode}`,
    styleName: product.sampleCode || product.productName, color: variant.color,
    size: variant.size, retailPrice: variant.retailPrice,
    variantKey: `${product._id}:${variant.key}`, isActive: product.isActive,
  };
}), { session });

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
    const catalog = parseCatalog(req.body);
    const variants = parseVariants(req.body.variants, catalog.basePrice);
    const year = new Date().getFullYear();
    const productCode = await CounterSequence.getNextSequence(`PRODUCT-${year}`, `SP-${year}`, 5);
    session = await mongoose.startSession();
    let product, skus;
    await session.withTransaction(async () => {
      [product] = await Product.create([{ ...catalog, productCode, configurationRequestId: requestId }], { session });
      skus = await createSkus(product, variants, session);
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
    respondError(error, res, next);
  } finally { if (session) await session.endSession(); }
});

router.get('/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã sản phẩm không hợp lệ', { code: 'INVALID_PRODUCT_ID' }, 400);
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!product) return sendError(res, 'Không tìm thấy sản phẩm', { code: 'PRODUCT_NOT_FOUND' }, 404);
    const skus = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).sort({ color: 1, size: 1 });
    return sendSuccess(res, 'Cấu hình sản phẩm', { product, skus });
  } catch (error) { next(error); }
});

router.patch('/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã sản phẩm không hợp lệ', { code: 'INVALID_PRODUCT_ID' }, 400);
  let session;
  try {
    const catalog = parseCatalog(req.body);
    session = await mongoose.startSession();
    let product;
    await session.withTransaction(async () => {
      const current = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).session(session);
      if (!current) throw fail('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
      product = await Product.findOneAndUpdate(
        { _id: req.params.id, isDeleted: { $ne: true } }, { $set: catalog }, { new: true, runValidators: true, session }
      );
      if (!current.isActive && catalog.isActive) {
        await Sku.updateMany({ productId: current._id, isDeleted: { $ne: true } }, { $set: { isActive: true } }, { session });
      }
    });
    return sendSuccess(res, 'Đã cập nhật thông tin sản phẩm', { product });
  } catch (error) { respondError(error, res, next); }
  finally { if (session) await session.endSession(); }
});

router.post('/:id/variants', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã sản phẩm không hợp lệ', { code: 'INVALID_PRODUCT_ID' }, 400);
  let session;
  try {
    session = await mongoose.startSession();
    let skus;
    await session.withTransaction(async () => {
      const product = await Product.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).session(session);
      if (!product) throw fail('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND', 404);
      const variants = parseVariants(req.body?.variants, product.basePrice);
      const existing = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).session(session);
      const keys = new Set(existing.map((sku) => `${colorKey(sku.color)}:${sku.size}`));
      if (variants.some((variant) => keys.has(variant.key))) throw fail('Biến thể màu–size đã tồn tại', 'DUPLICATE_VARIANT', 409);
      skus = await createSkus(product, variants, session);
    });
    return sendSuccess(res, 'Đã thêm biến thể', { skus }, 201);
  } catch (error) { respondError(error, res, next); }
  finally { if (session) await session.endSession(); }
});

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
