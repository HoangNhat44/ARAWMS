/*
 * File: product.controller.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: HTTP handlers for the finished-goods catalog: stock list, receiving locations, single-SKU issue,
 * product media, the product detail page and barcode tracking.
 */
import { sendSuccess } from '../../../common/utils/responseHandler.js';
import { handle, reply, sendKnownError } from '../shared/warehouseHttp.js';
import { parseLocationInput, parseStockMovement, parseMediaUpload } from './product.validation.js';
import { listReceivingLocations, createReceivingLocation, listProductsWithStock, issueSkuStock,
  saveProductMedia } from './product.service.js';
import { getProductDetail, getShelfStock, listProductReceipts, getReceiptUnits,
  renderProductLabels } from './productDetail.service.js';
import { getBarcodeTimeline } from './barcodeTracking.service.js';

export const locations = handle('Vị trí kho thành phẩm', () => listReceivingLocations());
export const createLocation = handle('Đã tạo vị trí kho', (req) => createReceivingLocation(parseLocationInput(req.body)),
  { status: 201 });
export const products = handle('Danh sách kho thành phẩm', () => listProductsWithStock());

export const issueStock = handle('Đã xuất kho', async (req) => {
  const movement = parseStockMovement(req.params.id, req.body);
  return reply(await issueSkuStock(req.params.id, movement, req.user), movement.direction === 'IN' ? 'Đã nhập kho' : 'Đã xuất kho');
}, { duplicate: { message: 'Mã SKU đã tồn tại', code: 'DUPLICATE_SKU' } });

/** The request body is the raw file stream, so headers are validated before any byte is read. */
export const uploadMedia = async (req, res, next) => {
  try {
    const upload = parseMediaUpload(req.params, req.headers);
    const { product, alreadySaved } = await saveProductMedia(upload, req, req.user);
    return sendSuccess(res, alreadySaved ? 'Tệp đã được lưu' : 'Đã lưu tệp sản phẩm', { product });
  } catch (error) {
    if (!(error.expected && sendKnownError(error, res))) next(error);
  }
};

// Product detail page and barcode tracking: read-only, available to warehouse staff.
export const barcodeTimeline = handle('Hành trình barcode', (req) => getBarcodeTimeline(req.params.barcode));
export const productDetail = handle('Chi tiết sản phẩm', (req) => getProductDetail(req.params.id));
export const shelfStock = handle('Hàng đang trên kệ', (req) => getShelfStock(req.params.id));
export const productReceipts = handle('Phiếu nhập đã xác nhận', (req) =>
  listProductReceipts(req.params.id, { page: req.query.page, limit: req.query.limit }));
export const receiptUnits = handle('Barcode của sản phẩm trong phiếu', (req) =>
  getReceiptUnits(req.params.id, req.params.documentId));
export const productLabels = handle('Tem barcode', (req) => renderProductLabels(req.params.id, req.body?.barcodes));
