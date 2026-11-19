/*
 * File: productConfiguration.controller.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: HTTP handlers for product setup: reads the request, calls productConfiguration.service.js
 * and sends the standard response. Business rules live in the service, input checks in the validation file.
 */
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { handle, reply, sendKnownError } from '../shared/warehouseHttp.js';
import { assertExcelBuffer, assertSkuPriceRequest } from './productConfiguration.validation.js';
import {
  syncCatalogOperation, inspectProductWorkbook, importProductWorkbook, createConfiguredProduct, listDiscontinuedStock,
  getProductConfiguration, updateProductDetails, addVariants, updateSkuPrice,
} from './productConfiguration.service.js';

const productErrors = {
  duplicate: { message: 'Mã sản phẩm hoặc biến thể đã tồn tại', code: 'DUPLICATE_PRODUCT_OR_VARIANT' },
};

export const syncOperation = handle('Đã đồng bộ', async (req) => {
  const { result, status } = await syncCatalogOperation(req.body, req.user);
  return reply(result, 'Đã đồng bộ', status);
}, productErrors);

/** Preview reports validation and database conflicts without writing; commit saves the whole workbook or nothing. */
const excelHandler = (preview) => async (req, res, next) => {
  try {
    assertExcelBuffer(req.body);
    if (preview) return sendSuccess(res, 'Kết quả kiểm tra file Excel', (await inspectProductWorkbook(req.body)).summary);
    return sendSuccess(res, 'Đã import sản phẩm và biến thể', await importProductWorkbook(req.body), 201);
  } catch (error) {
    if (['INVALID_EXCEL_FILE', 'INVALID_EXCEL_DATA'].includes(error.code)) return sendKnownError(error, res);
    if (error.status === 400) return sendError(res, error.message, { code: 'INVALID_EXCEL_FILE' }, 400);
    if (error.code === 11000) return sendError(res, 'Mã sản phẩm, mã mẫu mã hoặc mã vạch đã tồn tại; chưa import sản phẩm nào',
      { code: 'DUPLICATE_PRODUCT_OR_VARIANT' }, 409);
    if (/zip|xlsx|workbook|archive/i.test(error.message)) return sendError(res, 'Không đọc được file Excel', { code: 'INVALID_EXCEL_FILE' }, 400);
    next(error);
  }
};
export const previewImport = excelHandler(true);
export const commitImport = excelHandler(false);

export const createProduct = handle('Đã cấu hình sản phẩm', async (req) => {
  const { product, skus, created } = await createConfiguredProduct(req.body);
  return created ? reply({ product, skus }, 'Đã cấu hình sản phẩm', 201) : reply({ product, skus }, 'Sản phẩm đã được tạo');
}, productErrors);

export const discontinuedStock = handle('SKU ngừng bán còn tồn', () => listDiscontinuedStock());

export const productConfiguration = handle('Cấu hình sản phẩm', (req) => getProductConfiguration(req.params.id));

export const updateProduct = handle('Đã cập nhật thông tin sản phẩm',
  (req) => updateProductDetails(req.params.id, req.body), productErrors);

export const createVariants = handle('Đã thêm biến thể', (req) => addVariants(req.params.id, req.body),
  { ...productErrors, status: 201 });

export const updateVariantPrice = handle('Đã cập nhật giá SKU', (req) => {
  assertSkuPriceRequest(req.params.id, req.params.skuId, req.body);
  return updateSkuPrice(req.params.id, req.params.skuId, req.body.retailPrice);
});
