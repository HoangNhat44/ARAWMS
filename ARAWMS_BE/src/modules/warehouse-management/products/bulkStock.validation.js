/*
 * File: bulkStock.validation.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Input validation for finished-goods receiving, bulk outbound requests, outbound scanning and
 * shelf allocation. Pure checks only; checks that need the database live in bulkStock.service.js.
 */
import mongoose from 'mongoose';
import { requestError } from '../shared/warehouseHttp.js';

/** Receiving quantities: expectedQty >= receivedQty >= quantity, repairQty = receivedQty - quantity.
 * @returns {string|null} the error message, or null when the line is valid. */
export const receivingQuantityError = (item) => {
  const expected = Number(item?.expectedQty);
  const received = Number(item?.receivedQty);
  const accepted = Number(item?.quantity);
  if (item?.expectedQty === '' || item?.expectedQty == null ||
    !Number.isSafeInteger(expected) || expected < 1 || expected > 500)
    return 'Số xưởng bàn giao phải là số nguyên dương, tối đa 500.';
  if (item?.receivedQty === '' || item?.receivedQty == null ||
    !Number.isSafeInteger(received) || received < 1 || received > expected)
    return 'Số thực nhận phải là số nguyên dương và không vượt số xưởng bàn giao.';
  if (item?.quantity === '' || item?.quantity == null ||
    !Number.isSafeInteger(accepted) || accepted < 0 || accepted > received)
    return 'Số đạt nhập kho phải là số nguyên từ 0 đến số thực nhận.';
  if (item?.repairQty != null && item.repairQty !== '' &&
    Number(item.repairQty) !== received - accepted)
    return 'Số trả xưởng phải bằng thực nhận trừ đạt nhập kho.';
  return null;
};

/** Every accepted unit must be assigned to a shelf bin before the receipt is confirmed.
 * @returns {{code: string, message: string}|null} */
export const receiptAllocationError = (lines, allocations) => {
  const acceptedBySku = new Map(lines.map((line) => [String(line.skuId), Number(line.quantity)]));
  const allocatedBySku = new Map();
  for (const line of allocations) {
    const skuId = String(line.skuId || '');
    const quantity = Number(line.allocatedQuantity);
    if (!acceptedBySku.has(skuId) || !Number.isSafeInteger(quantity) || quantity < 1)
      return { code: 'INVALID_ALLOCATION', message: 'Ô kệ hoặc số lượng phân bổ không hợp lệ' };
    allocatedBySku.set(skuId, (allocatedBySku.get(skuId) || 0) + quantity);
  }
  for (const [skuId, accepted] of acceptedBySku) {
    const allocated = allocatedBySku.get(skuId) || 0;
    if (allocated > accepted)
      return { code: 'ALLOCATION_EXCEEDS_ACCEPTED', message: 'Phân bổ vượt số lượng đạt của SKU' };
    if (allocated < accepted)
      return { code: 'ALLOCATION_INCOMPLETE', message: 'Cần chọn đủ ô kệ cho toàn bộ số lượng đạt nhập kho' };
  }
  return null;
};

/** Throws `message`/`code` (400) when `value` is not a MongoDB ObjectId. */
export const assertObjectId = (value, message, code) => {
  if (!mongoose.isValidObjectId(value)) throw requestError(message, code);
};

/** Comma-separated SKU IDs for the bin picker: 1–100 valid IDs. */
export const parseSkuIdList = (value) => {
  const skuIds = String(value || '').split(',').filter(Boolean);
  if (!skuIds.length || skuIds.length > 100 || skuIds.some((id) => !mongoose.isValidObjectId(id)))
    throw requestError('SKU không hợp lệ', 'INVALID_SKUS');
  return skuIds;
};

export const parseConfirmationKey = (body) => {
  const key = String(body?.confirmationKey || '').trim();
  if (!key) throw requestError('Thiếu mã xác nhận', 'INVALID_CONFIRMATION');
  return key;
};

export const parseScanBarcode = (body) => {
  const barcode = String(body?.barcode || '').trim();
  if (!barcode) throw requestError('Vui lòng cung cấp mã barcode để quét', 'BARCODE_REQUIRED');
  return barcode;
};

/** Shelf allocation request: a receipt ID and an 8–100 character idempotency key. */
export const parseAllocationRequest = (documentId, body) => {
  const key = String(body?.idempotencyKey || '').trim();
  if (!mongoose.isValidObjectId(documentId) || key.length < 8 || key.length > 100)
    throw requestError('Yêu cầu phân bổ không hợp lệ', 'INVALID_ALLOCATION');
  return key;
};

/** Normalized fields of a bulk receiving (IN) or outbound request (OUT). */
export const readBulkDocument = (body) => {
  const direction = body?.direction;
  return {
    direction,
    documentCode: String(body?.documentCode || '').trim().toUpperCase(),
    note: String(body?.note || '').trim(),
    items: body?.items,
    locationId: body?.locationId,
    confirmationKey: String(body?.confirmationKey || '').trim(),
    allocations: direction === 'IN' ? body?.allocations || [] : [],
    sourceTicketId: body?.sourceTicketId,
    recipient: body?.recipient || '',
  };
};

/** First check of a receipt: every line's receiving quantities. */
export const assertReceivingLines = ({ direction, items }) => {
  if (direction !== 'IN' || !Array.isArray(items)) return;
  const invalidLine = items.findIndex((item) => receivingQuantityError(item));
  if (invalidLine !== -1) throw requestError(`Dòng ${invalidLine + 1}: ${receivingQuantityError(items[invalidLine])}`,
    'INVALID_RECEIVING_QUANTITY');
};

/** The confirmation key is required for both directions; a receipt also needs an allocation list. */
export const assertConfirmation = ({ direction, confirmationKey, allocations }) => {
  if (!confirmationKey || confirmationKey.length > 100 || (direction === 'IN' && !Array.isArray(allocations)))
    throw requestError('Yêu cầu xác nhận kho không hợp lệ', 'INVALID_CONFIRMATION');
};

/** A receipt must repeat the technician ticket exactly: same document code, SKUs and handed-over quantities. */
export const assertMatchesTechnicalTicket = (sourceTicket, { documentCode, items }) => {
  if (documentCode !== `NK-${sourceTicket.ticketCode}`)
    throw requestError('Mã phiếu nhập phải theo lệnh kỹ thuật', 'RECEIPT_CODE_MISMATCH');
  const expected = new Map();
  for (const line of sourceTicket.items || []) {
    if (!(Number(line.expectedQty) > 0)) continue;
    const skuId = String(line.skuId);
    expected.set(skuId, (expected.get(skuId) || 0) + Number(line.expectedQty));
  }
  const submitted = Array.isArray(items) ? items : [];
  if (new Set(submitted.map((item) => String(item.skuId))).size !== submitted.length)
    throw requestError('SKU bị lặp trong phiếu nhập', 'DUPLICATE_LINE');
  if (submitted.length !== expected.size || new Set(submitted.map((item) => String(item.skuId))).size !== expected.size ||
    submitted.some((item) => !expected.has(String(item.skuId)) ||
      Number(item.expectedQty) !== expected.get(String(item.skuId)) ||
      Number(item.receivedQty) > expected.get(String(item.skuId))))
    throw requestError('SKU hoặc số lượng không khớp lệnh kỹ thuật', 'TECHNICAL_REQUEST_MISMATCH', 409);
};

/** Document shape, per-line quantity ranges, unit limits and one line per SKU. */
export const assertBulkDocumentShape = ({ direction, documentCode, note, items, locationId }) => {
  if (!['IN', 'OUT'].includes(direction) || !/^[A-Z0-9._/-]{2,80}$/.test(documentCode) ||
      note.length > 500 || !Array.isArray(items) || items.length < 1 || items.length > 100 ||
      (direction === 'IN' && locationId && !mongoose.isValidObjectId(locationId)) ||
      items.some((item) => !mongoose.isValidObjectId(item?.productId) ||
        (item?.skuId && !mongoose.isValidObjectId(item.skuId)) ||
        !Number.isSafeInteger(Number(item?.quantity)) || Number(item.quantity) < (direction === 'IN' ? 0 : 1) || Number(item.quantity) > (direction === 'IN' ? 500 : 100000) ||
        (direction === 'IN' && receivingQuantityError(item)))) {
    throw requestError('Phiếu nhập/xuất không hợp lệ', 'INVALID_BULK_DOCUMENT');
  }
  if (direction === 'IN' && items.reduce((sum, item) => sum + Number(item.quantity), 0) > 500) {
    throw requestError('Mỗi phiếu nhận tối đa 500 sản phẩm đạt', 'TOO_MANY_UNITS');
  }
  if (direction === 'IN' && items.reduce((sum, item) => sum + Number(item.receivedQty), 0) > 1000) {
    throw requestError('Mỗi phiếu nhận tối đa 1000 sản phẩm', 'TOO_MANY_RECEIVED_UNITS');
  }
  const seen = new Set();
  for (const item of items) {
    const key = `${item.productId}:${item.skuId || ''}`;
    if (seen.has(key)) throw requestError('Một SKU chỉ được xuất hiện một lần trong phiếu', 'DUPLICATE_LINE');
    seen.add(key);
  }
};
