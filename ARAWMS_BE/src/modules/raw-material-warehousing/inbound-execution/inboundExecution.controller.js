/*
 * File: inboundExecution.controller.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Handles supplier raw-material receipt requests. Converts expected business conflicts into stable API responses and delegates inventory rules to the service.
 */
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { createFabricRollTemplate, previewFabricRollImport } from './fabricRollExcelImport.js';
import { scheduleBarcodeImages } from '../../../common/services/barcodeImageStorage.js';
import {
  getSupplierReceiptOptions, listSupplierReceipts, getSupplierReceipt, findDeliveryMatches,
  createSupplierReceipt, updateSupplierReceipt, cancelSupplierReceipt, confirmSupplierReceipt, createSupplierMaterial,
  uploadSupplierReceiptAttachment,
} from './supplierReceipt.service.js';
import {
  createReceiptLocation, getEligibleInboundPlans, getInboundPlanDetails,
  getMaterialReceipt, getMaterialReceiptLabels, confirmMaterialPutaway,
  requestMaterialSupplierReturn, confirmMaterialSupplierReturn,
} from './inboundExecution.service.js';

/** Sends known validation and duplicate-code failures without hiding unexpected errors. */
const respond = (error, res, next) => {
  if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
  if (error.code === 11000) return sendError(res, 'Mã phiếu giao hoặc mã vị trí đã tồn tại', { code: 'DUPLICATE_CODE' }, 409);
  if (error.name === 'ValidationError' || error.name === 'CastError') return sendError(res, 'Dữ liệu phiếu nhập không hợp lệ', { code: 'INVALID_RECEIPT_DATA' }, 400);
  next(error);
};

/** Wraps a request handler with consistent success and business-error responses. */
const handle = (message, task, status = 200) => async (req, res, next) => {
  try { return sendSuccess(res, message, await task(req), status); }
  catch (error) { return respond(error, res, next); }
};

export const options = handle('Dữ liệu chọn cho phiếu nhập', (req) => getSupplierReceiptOptions(req.user));
export const createLocation = handle('Đã tạo vị trí kho', async (req) => ({ location: await createReceiptLocation(req.body || {}, req.user) }), 201);
export const createMaterial = handle('Đã tạo nguyên phụ liệu', async (req) => ({ material: await createSupplierMaterial(req.body || {}) }), 201);
export const plans = handle('Kế hoạch nhập có thể nhận', async (req) => ({ plans: await getEligibleInboundPlans(req.query.supplierId) }));
export const planDetails = handle('Chi tiết kế hoạch nhập', async (req) => ({ plan: await getInboundPlanDetails(req.params.id) }));
export const receipts = handle('Phiếu nhập nguyên phụ liệu', async (req) => ({ receipts: await listSupplierReceipts(req.query, req.user) }));
export const receiptDetails = handle('Chi tiết phiếu nhập', (req) => getSupplierReceipt(req.params.id, req.user));
export const deliveryMatches = handle('Chứng từ giao trùng', async (req) => ({ matches: await findDeliveryMatches(req.query.supplierId, req.query.code, req.query.excludeId) }));
export const createReceipt = handle('Đã lưu nháp phiếu nhập', async (req) => ({ receipt: await createSupplierReceipt(req.body || {}, req.user) }), 201);
export const updateReceipt = handle('Đã cập nhật phiếu nhập', async (req) => ({ receipt: await updateSupplierReceipt(req.params.id, req.body || {}, req.user) }));
export const confirmReceipt = handle('Đã xác nhận nhập kho', async (req) => ({ receipt: await confirmSupplierReceipt(req.params.id, req.body || {}, req.user) }));
export const cancelReceipt = handle('Đã hủy phiếu nhập', async (req) => ({ receipt: await cancelSupplierReceipt(req.params.id, req.body || {}, req.user) }));
export const uploadReceiptAttachment = handle('Đã đính kèm chứng từ', async (req) => ({ receipt:
  await uploadSupplierReceiptAttachment(req.params.id, req.body, req.headers['content-type']?.split(';')[0],
    req.headers['x-file-name'], req.user) }));
export const receiptLabels = handle('Tem nguyên phụ liệu', (req) => getMaterialReceiptLabels(req.params.id, req.user));
export const syncReceiptBarcodes = handle('Đang tạo ảnh tem còn thiếu', async (req) => {
  const { receipt } = await getMaterialReceipt(req.params.id, req.user);
  if (receipt.status !== 'COMPLETED') throw Object.assign(new Error('Phiếu chưa được xác nhận'),
    { code: 'RECEIPT_NOT_CONFIRMED', status: 409 });
  scheduleBarcodeImages('RAW_MATERIAL', String(receipt._id));
  return { scheduled: true };
}, 202);
export const putaway = handle('Đã xác nhận cất hàng', async (req) => ({ putaway: await confirmMaterialPutaway(req.params.id, req.body || {}, req.user) }));
export const requestSupplierReturn = handle('Đã tạo yêu cầu trả nhà cung cấp',
  async (req) => requestMaterialSupplierReturn(req.params.id, req.body || {}, req.user));
export const confirmSupplierReturn = handle('Đã xác nhận bàn giao hàng trả',
  async (req) => confirmMaterialSupplierReturn(req.params.id, req.body || {}, req.user));

/** Streams the workbook template used by the roll preview endpoint. */
export const rollTemplate = async (req, res, next) => {
  try {
    const buffer = await createFabricRollTemplate();
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="fabric-roll-import.xlsx"');
    res.send(buffer);
  } catch (error) { next(error); }
};

/** Reports parsed rolls and row errors without writing database records. */
export const previewRolls = async (req, res, next) => {
  try { return sendSuccess(res, 'Kết quả kiểm tra cây vải', await previewFabricRollImport(req.body, req.user)); }
  catch (error) { return respond(error, res, next); }
};
