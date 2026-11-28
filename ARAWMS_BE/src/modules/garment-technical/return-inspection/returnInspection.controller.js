/**
 * ============================================================================
 * @title        : Return Inspection Controller
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Tiếp nhận và xử lý các yêu cầu HTTP liên quan đến Kiểm tra hàng hoàn/trả
 *                 thuộc phân hệ Nhân viên Kỹ thuật (Garment Technician).
 * @module       : Garment Technical / Return Inspection
 * @layer        : Controller
 * ============================================================================
 */

import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import {
  lookupOrderByCode,
  submitReturnInspection,
  listReturnInspections,
  createReturnInboundTicket,
  getRecentReturnableOrders,
  openReturnInspectionSession,
  scanReturnUnitBarcode,
  removeReturnScannedUnit,
  finishReturnRecordingSession,
  cancelReturnInspectionSession,
  finalizeReturnInspectionsAndRequestInbound,
} from './returnInspection.service.js';
import {
  ReturnVideoError,
  uploadReturnInspectionVideo,
  syncReturnInspectionVideo,
  streamReturnInspectionVideo,
} from './returnInspectionVideo.service.js';

/**
 * Xử lý lỗi trả về cho client theo cấu trúc chuẩn.
 */
const respond = (error, res, next) => {
  if (error instanceof ReturnVideoError || error.status) {
    return sendError(res, error.message, { code: error.code || 'BAD_REQUEST' }, error.status || 400);
  }
  if (error.code === 11000) {
    return sendError(res, 'Mã biên bản kiểm tra hoặc dữ liệu đã tồn tại', { code: 'DUPLICATE_CODE' }, 409);
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return sendError(res, error.message || 'Dữ liệu không hợp lệ', { code: 'INVALID_DATA' }, 400);
  }
  next(error);
};

/**
 * Higher-order function hỗ trợ bọc controller handlers.
 */
const handle = (message, task, status = 200) => async (req, res, next) => {
  try {
    const result = await task(req);
    return sendSuccess(res, message, result, status);
  } catch (error) {
    return respond(error, res, next);
  }
};

/**
 * Tra cứu thông tin đơn hàng / mã vận đơn khi nhân viên kỹ thuật quét mã.
 * @route GET /garment-technical/return-inspection/lookup/:code
 */
export const lookupOrder = handle('Tra cứu thông tin đơn hàng hoàn thành công', (req) =>
  lookupOrderByCode(req.params.code || req.query.code)
);

/**
 * Ghi lại biên bản kiểm tra KCS hàng hoàn (ĐẠT hoặc KHÔNG ĐẠT kèm video).
 * @route POST /garment-technical/return-inspection/submit
 */
// UC-100: Ghi nhận quá trình kiểm tra hàng hoàn - Nộp biên bản kiểm tra (FT-10)
export const submitInspection = handle(
  'Ghi nhận kết quả kiểm tra hàng hoàn thành công',
  (req) => submitReturnInspection(req.body, req.user),
  201
);

/**
 * Lấy danh sách kết quả kiểm tra hàng hoàn kèm bộ lọc Đạt / Không đạt và thống kê.
 * @route GET /garment-technical/return-inspection
 */
export const listInspections = handle('Danh sách kết quả kiểm tra hàng hoàn', (req) =>
  listReturnInspections(req.query)
);

/**
 * Tạo phiếu yêu cầu nhập kho hàng hoàn gửi Quản lý kho.
 * @route POST /garment-technical/return-inspection/inbound-ticket
 */
// UC-101: Tạo phiếu yêu cầu nhập kho hàng hoàn (FT-10)
export const requestInboundTicket = handle(
  'Đã tạo phiếu yêu cầu nhập kho hàng hoàn gửi Quản lý kho',
  (req) => createReturnInboundTicket(req.body, req.user),
  201
);

/**
 * Lấy danh sách các đơn hàng gợi ý để kiểm tra nhanh.
 * @route GET /garment-technical/return-inspection/recent-orders
 */
export const getRecentOrders = handle(
  'Danh sách đơn hàng gợi ý kiểm tra',
  () => getRecentReturnableOrders()
);

/**
 * Mở hoặc tiếp tục phiên kiểm hàng hoàn cho một đơn hàng bằng mã QR / mã đơn / vận đơn.
 * @route POST /garment-technical/return-inspection/sessions/open
 */
// UC-100: Ghi nhận quá trình kiểm tra hàng hoàn - Mở phiên kiểm hàng (FT-10)
export const openSession = handle(
  'Đã mở phiên kiểm tra & quay video hàng hoàn',
  (req) => openReturnInspectionSession(req.body?.code, req.user)
);

/**
 * Quét barcode sản phẩm vật lý (ProductUnit) hoặc SKU trong đơn hàng đang quay.
 * @route POST /garment-technical/return-inspection/sessions/:id/scan-unit
 */
// UC-100: Ghi nhận quá trình kiểm tra hàng hoàn - Quét mã sản phẩm hoàn (FT-10)
export const scanUnit = handle(
  'Đã xử lý quét barcode sản phẩm hoàn',
  (req) => scanReturnUnitBarcode(req.params.id, req.body?.barcode)
);

/**
 * Gỡ barcode sản phẩm quét nhầm khỏi phiên đang quay.
 * @route POST /garment-technical/return-inspection/sessions/:id/remove-unit
 */
export const removeUnit = handle(
  'Đã gỡ barcode sản phẩm khỏi phiên kiểm hoàn',
  (req) => removeReturnScannedUnit(req.params.id, req.body?.barcode)
);

/**
 * Chuyển phiên quay sang trạng thái chờ phân loại sau khi dừng ghi hình.
 * @route POST /garment-technical/return-inspection/sessions/:id/finish-recording
 */
export const finishRecording = handle(
  'Đã kết thúc ghi hình và đưa đơn vào danh sách chờ phân loại',
  (req) => finishReturnRecordingSession(req.params.id)
);

/**
 * Hủy phiên kiểm hàng hoàn nháp chưa có video lưu.
 * @route POST /garment-technical/return-inspection/sessions/:id/cancel
 */
export const cancelSession = handle(
  'Đã hủy phiên kiểm hàng hoàn nháp',
  (req) => cancelReturnInspectionSession(req.params.id)
);

/**
 * Stream video quay khui kiện hàng hoàn trực tiếp lên Cloudinary.
 * @route POST /garment-technical/return-inspection/sessions/:id/video
 */
// UC-100: Ghi nhận quá trình kiểm tra hàng hoàn - Tải lên video khui kiện (FT-10)
export const uploadVideo = async (req, res, next) => {
  try {
    const result = await uploadReturnInspectionVideo({
      sessionId: req.params.id,
      recordingId: req.header('X-Recording-Id'),
      durationMs: Number(req.header('X-Video-Duration-Ms')),
      mimeType: req.header('Content-Type')?.split(';')[0].toLowerCase(),
      input: req,
    });
    return sendSuccess(
      res,
      result.status === 'COMPLETED' ? 'Đã lưu video kiểm hàng hoàn' : 'Video đang chờ đồng bộ',
      result,
      result.status === 'COMPLETED' ? 201 : 202
    );
  } catch (error) {
    return respond(error, res, next);
  }
};

/**
 * Đồng bộ lại metadata video khi asset đã có sẵn trên Cloudinary.
 * @route POST /garment-technical/return-inspection/sessions/:id/video/:recordingId/sync
 */
export const syncVideo = handle('Đã đồng bộ video kiểm hàng hoàn', (req) =>
  syncReturnInspectionVideo({
    sessionId: req.params.id,
    recordingId: req.params.recordingId,
    durationMs: Number(req.body?.durationMs) || 1,
  })
);

/**
 * Phát video kiểm hàng hoàn đã lưu (authenticated Cloudinary stream, hỗ trợ Range).
 * @route GET /garment-technical/return-inspection/sessions/:id/video
 */
export const getVideo = async (req, res, next) => {
  try {
    await streamReturnInspectionVideo(req.params.id, req.header('Range'), res);
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    return respond(error, res, next);
  }
};

/**
 * Chốt phân loại sản phẩm (đạt / hàng lỗi DEFECTIVE), đổi trạng thái đơn và tạo phiếu nhập kho.
 * @route POST /garment-technical/return-inspection/finalize-and-request-inbound
 */
// UC-101: Chốt phân loại hàng hoàn và tạo yêu cầu nhập kho (FT-10)
export const finalizeAndRequestInbound = handle(
  'Đã chốt phân loại hàng hoàn và gửi yêu cầu nhập kho cho Quản lý kho',
  (req) => finalizeReturnInspectionsAndRequestInbound(req.body, req.user),
  201
);

