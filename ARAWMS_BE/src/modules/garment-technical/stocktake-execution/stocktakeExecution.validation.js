/*
 * File: stocktakeExecution.validation.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Input validation helpers for stocktake execution operations.
 */
export function validateVerifyShelf(body = {}) {
  const shelfBarcode = String(body.shelfBarcode || '').trim();
  if (!shelfBarcode) {
    const error = new Error('Vui lòng quét hoặc nhập mã vạch kệ kho.');
    error.status = 400;
    error.code = 'INVALID_SHELF_BARCODE';
    throw error;
  }
  return { shelfBarcode };
}

export function validateScanItem(body = {}) {
  const barcode = String(body.barcode || '').trim();
  const locationId = String(body.locationId || '').trim();
  const qty = Number(body.qty ?? 1);

  if (!barcode) {
    const error = new Error('Vui lòng quét hoặc nhập mã barcode sản phẩm.');
    error.status = 400;
    error.code = 'INVALID_ITEM_BARCODE';
    throw error;
  }
  if (!locationId) {
    const error = new Error('Thiếu ID vị trí kệ đang kiểm kê.');
    error.status = 400;
    error.code = 'MISSING_LOCATION_ID';
    throw error;
  }
  if (Number.isNaN(qty) || qty <= 0) {
    const error = new Error('Số lượng quét phải lớn hơn 0.');
    error.status = 400;
    error.code = 'INVALID_QUANTITY';
    throw error;
  }
  return { barcode, locationId, qty };
}

