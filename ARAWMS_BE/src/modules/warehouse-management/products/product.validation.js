/*
 * File: product.validation.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Input validation for finished-goods locations, single-SKU stock issue and product media upload.
 */
import mongoose from 'mongoose';
import { requestError } from '../shared/warehouseHttp.js';

/** Accepted media per upload kind: MIME types, byte limit and the product field that stores the URL. */
export const PRODUCT_MEDIA = {
  image: { types: ['image/jpeg', 'image/png', 'image/webp'], limit: 10 * 1024 * 1024, field: 'thumbnailUrl', publicIdField: 'imagePublicId' },
  video: { types: ['video/mp4', 'video/webm'], limit: 100 * 1024 * 1024, field: 'videoUrl', publicIdField: 'videoPublicId' },
  'additional-image': { types: ['image/jpeg', 'image/png', 'image/webp'], limit: 10 * 1024 * 1024, field: 'additionalImageUrls' },
};

/** A receiving location: 2–40 uppercase letters, digits, "_" or "-", and a positive capacity. */
export const parseLocationInput = (body) => {
  const locationCode = String(body?.locationCode || '').trim().toUpperCase();
  const maxCapacity = Number(body?.maxCapacity);
  if (!/^[A-Z0-9_-]{2,40}$/.test(locationCode) || !Number.isSafeInteger(maxCapacity) || maxCapacity < 1) {
    throw requestError('Vị trí kho không hợp lệ', 'INVALID_LOCATION');
  }
  return { locationCode, maxCapacity };
};

/** Single-SKU stock movement. Receiving always goes through the barcode receiving flow, so IN is refused. */
export const parseStockMovement = (productId, body) => {
  const { direction, skuId, note } = body || {};
  const quantity = Number(body?.quantity);
  if (!mongoose.isValidObjectId(productId) || !['IN', 'OUT'].includes(direction) ||
      !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 100000 ||
      (skuId && !mongoose.isValidObjectId(skuId)) || String(note || '').length > 500) {
    throw requestError('Thông tin nhập/xuất không hợp lệ', 'INVALID_STOCK_MOVEMENT');
  }
  if (direction === 'IN') throw requestError('Nhập kho cần phiếu kiểm nhận và cấp barcode', 'RECEIVING_REQUIRED');
  return { direction, skuId, quantity, note: String(note || '').trim() };
};

/** Media upload headers, checked before any byte is read. */
export const parseMediaUpload = (params, headers) => {
  const config = PRODUCT_MEDIA[params.kind];
  const mimeType = (headers['content-type'] || '').split(';')[0].toLowerCase();
  if (!config.types.includes(mimeType)) throw requestError('Định dạng tệp không được hỗ trợ', 'UNSUPPORTED_MEDIA_TYPE', 415);
  if (!mongoose.isValidObjectId(params.id)) throw requestError('Mã sản phẩm không hợp lệ', 'INVALID_PRODUCT_ID');
  if (Number(headers['content-length']) > config.limit) throw requestError('Tệp vượt quá dung lượng cho phép', 'FILE_TOO_LARGE', 413);
  const mediaOperationId = String(headers['x-catalog-file-id'] || '');
  const expectedHash = String(headers['x-content-sha256'] || '');
  if (mediaOperationId && (!/^[a-zA-Z0-9_-]{16,100}$/.test(mediaOperationId) || !/^[a-f0-9]{64}$/.test(expectedHash))) {
    throw requestError('Mã tệp đồng bộ không hợp lệ', 'INVALID_MEDIA_OPERATION');
  }
  return { productId: params.id, kind: params.kind, config, mediaOperationId, expectedHash };
};
