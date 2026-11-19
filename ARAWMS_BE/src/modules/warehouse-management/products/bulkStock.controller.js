/*
 * File: bulkStock.controller.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: HTTP handlers for finished-goods receiving, bulk outbound requests, outbound picking and shelf
 * allocation. Reads the request, calls bulkStock.service.js and sends the standard response.
 */
import { handle, reply } from '../shared/warehouseHttp.js';
import { parseSkuIdList, parseConfirmationKey, parseScanBarcode, parseAllocationRequest,
  assertObjectId } from './bulkStock.validation.js';
import {
  listBinOptions, listTechnicalRequests, getConfirmationStatus, listInboundProgress, listOutboundDocuments,
  getOutboundDocument, scanOutboundBarcode, removeOutboundScan, confirmOutboundDispatch, listRecentDocuments,
  getDocumentBarcodes, listPendingAllocation, getDocumentProgress, confirmAllocation, createBulkDocument,
} from './bulkStock.service.js';

const withMessage = ({ message, data }) => reply(data, message);

export const binOptions = handle('Ô kệ còn chỗ', (req) => {
  parseSkuIdList(req.query.skuIds);
  return listBinOptions();
});
export const technicalRequests = handle('Lệnh nhập thành phẩm từ nhân viên kỹ thuật', () => listTechnicalRequests());
export const confirmationStatus = handle('Trạng thái xác nhận', async (req) =>
  withMessage(await getConfirmationStatus(req.body, req.user, parseConfirmationKey(req.body))));
export const inboundProgress = handle('Tiến độ nhập và xếp kệ', () => listInboundProgress());

export const outboundDocuments = handle('Phiếu xuất kho thành phẩm', () => listOutboundDocuments());
export const outboundDocument = handle('Chi tiết yêu cầu xuất kho thành phẩm', (req) => getOutboundDocument(req.params.id));
export const scanOutbound = handle('Đã quét', async (req) => {
  // The document ID is checked before the barcode.
  assertObjectId(req.params.id, 'Mã yêu cầu không hợp lệ', 'INVALID_ID');
  return withMessage(await scanOutboundBarcode(req.params.id, parseScanBarcode(req.body)));
});
export const removeOutbound = handle('Đã gỡ mã quét thành công', (req) =>
  removeOutboundScan(req.params.id, String(req.body?.barcode || '').trim(), String(req.body?.skuId || '').trim()));
export const confirmOutbound = handle('Đã xuất kho', async (req) => withMessage(await confirmOutboundDispatch(req.params.id, req.user)));

export const recentDocuments = handle('Phiếu kho gần đây', () => listRecentDocuments());
export const documentBarcodes = handle('Tem sản phẩm của phiếu nhập', (req) => getDocumentBarcodes(req.params.id));
export const pendingAllocation = handle('Hàng chờ phân bổ', () => listPendingAllocation());
export const documentProgress = handle('Chi tiết phiếu kho', (req) => getDocumentProgress(req.params.id));

export const createAllocation = handle('Đã giữ chỗ chờ xếp', async (req) => {
  const key = parseAllocationRequest(req.params.id, req.body);
  const { allocation, created } = await confirmAllocation(req.params.id, key, req.body, req.user);
  return created ? reply({ allocation }, 'Đã giữ chỗ chờ xếp', 201) : reply({ allocation }, 'Phân bổ đã được xác nhận');
});

export const createDocument = handle('Đã nhập kho hàng loạt', async (req) => {
  const { document, created, direction } = await createBulkDocument(req.body, req.user);
  if (!created) return reply({ document }, 'Phiếu kho đã được xác nhận');
  return reply({ document }, direction === 'IN' ? 'Đã nhập kho hàng loạt' : 'Đã tạo yêu cầu xuất kho hàng loạt', 201);
});
