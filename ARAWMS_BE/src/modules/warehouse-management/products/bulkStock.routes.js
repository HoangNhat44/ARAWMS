/*
 * File: bulkStock.routes.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Quản lý nhập/xuất kho hàng loạt thành phẩm (Bulk Finished Goods Stock Management)
 * 
 * CHỨC NĂNG CHÍNH:
 * ================
 * 1. Nhập kho hàng loạt từ xưởng sản xuất
 *    - Xử lý số lượng: xưởng bàn giao → thực nhận → đạt nhập kho → trả xưởng sửa
 *    - Tự động tạo barcode cho từng sản phẩm
 *    - Tạo batch và product units
 *    - Cập nhật tồn kho SKU
 * 
 * 2. Xuất kho hàng loạt
 *    - Giảm tồn kho
 *    - Ghi nhận transaction
 * 
 * 3. Quản lý barcode
 *    - Tạo ảnh barcode tự động
 *    - Upload lên Cloudinary
 *    - Sync lại ảnh bị thiếu
 * 
 * 4. Phân bổ vị trí kệ (Putaway Allocation)
 *    - Chỉ định ô kệ cho hàng mới nhập
 *    - Theo dõi tiến độ xếp hàng
 * 
 * API ENDPOINTS:
 * ==============
 * GET    /bin-options                      - Lấy danh sách ô kệ còn chỗ
 * GET    /documents                        - Danh sách phiếu nhập/xuất gần nhất
 * GET    /documents/pending-allocation     - Hàng chờ phân bổ vị trí
 * GET    /documents/:id                    - Chi tiết phiếu + tiến độ
 * GET    /documents/:id/barcodes           - Danh sách tem barcode
 * POST   /documents/:id/barcodes/sync      - Tạo lại ảnh barcode
 * POST   /documents/:id/allocations        - Xác nhận phân bổ vị trí
 * POST   /documents                        - Tạo phiếu nhập/xuất
 * 
 * LUỒNG NHẬP KHO:
 * ===============
 * 1. Xưởng bàn giao (expectedQty: 100)
 * 2. Nhận hàng thực tế (receivedQty: 95) - mất 5 cái
 * 3. Kiểm tra chất lượng:
 *    - Đạt chuẩn (quantity: 90)
 *    - Lỗi cần sửa (repairQty: 5)
 * 4. Tạo barcode cho 90 sản phẩm đạt
 * 5. Cập nhật tồn kho SKU +90
 * 6. Tạo batch và product units
 * 7. Upload ảnh barcode lên Cloudinary
 * 8. Phân bổ vào ô kệ (nếu có)
 * 
 * VALIDATION:
 * ===========
 * - expectedQty >= receivedQty >= quantity
 * - repairQty = receivedQty - quantity
 * - Kiểm tra sức chứa vị trí kho
 * - Kiểm tra SKU tồn tại và active
 * - Ngăn tạo trùng phiếu (idempotency key)
 */
import express from 'express';
import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import FinishedGoodsBulkDocument from '../../../models/FinishedGoodsBulkDocument.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { scheduleBarcodeImages } from '../../../common/services/barcodeImageStorage.js';
import PutawayAllocation from '../../../models/PutawayAllocation.model.js';
import { confirmReceiptAllocation, fingerprint, parseLines, remainingQuantity } from '../location-layout/allocation.service.js';

const router = express.Router();

/**
 * Tạo custom error object với status code
 * @param {string} message - Thông báo lỗi
 * @param {string} code - Mã lỗi (VD: INVALID_QUANTITY)
 * @param {number} status - HTTP status code (default: 400)
 * @returns {Error} Error object với code và status
 */
const createBulkStockRequestError = (message, code, status = 400) => Object.assign(new Error(message), { code, status });

/**
 * Kiểm tra số lượng nhập kho có hợp lệ không
 * 
 * LOGIC KIỂM TRA:
 * - Số xưởng bàn giao (expectedQty): 1-500 sản phẩm
 * - Số thực nhận (receivedQty): <= expectedQty
 * - Số đạt nhập kho (quantity): 0 đến receivedQty
 * - Số trả xưởng (repairQty): = receivedQty - quantity
 * 
 * VÍ DỤ HỢP LỆ:
 * expectedQty: 100, receivedQty: 95, quantity: 90, repairQty: 5
 * => Xưởng giao 100 → nhận được 95 → đạt 90 → sửa 5
 * 
 * @param {Object} item - Dòng sản phẩm trong phiếu
 * @returns {string|null} Thông báo lỗi hoặc null nếu hợp lệ
 */
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

/**
 * Format response cho phiếu nhập kho
 * Chỉ trả về thông tin cần thiết, che giấu dữ liệu nội bộ
 * 
 * @param {Object} document - Document từ MongoDB
 * @returns {Object} Response object đã format
 */
const receiptResponse = (document) => ({ id: String(document._id), documentCode: document.documentCode,
  direction: document.direction, lineCount: document.items.length, totalQuantity: document.totalQuantity,
  items: document.direction === 'IN' ? document.items.map((item) => ({ skuId: String(item.skuId),
    barcodes: item.barcodes, expectedQty: item.expectedQty, receivedQty: item.receivedQty,
    acceptedQty: item.quantity, repairQty: item.repairQty, repairStatus: item.repairStatus })) : undefined });

/**
 * Tạo hash SHA256 của nội dung phiếu nhập
 * Dùng để ngăn tạo trùng phiếu khi retry request
 * 
 * IDEMPOTENCY:
 * Nếu cùng confirmationKey + cùng hash => trả về phiếu cũ
 * Nếu cùng confirmationKey + khác hash => báo lỗi CONFIRMATION_REUSED
 * 
 * @param {Object} body - Request body
 * @returns {string} SHA256 hash (64 ký tự hex)
 */
const inboundHash = (body) => createHash('sha256').update(JSON.stringify({
  direction: body.direction, documentCode: String(body.documentCode || '').trim().toUpperCase(),
  note: String(body.note || '').trim(),
  items: body.items, allocations: body.allocations || [],
})).digest('hex');

/**
 * Tạo hoặc lấy vị trí ảo "FG-UNPLACED" để chứa hàng chưa xếp kệ
 * 
 * MỤC ĐÍCH:
 * - Khi nhập kho không chỉ định vị trí cụ thể
 * - Hàng được lưu vào vị trí ảo này
 * - Sau đó nhân viên kho sẽ xếp vào ô kệ thực
 * 
 * ĐẶC ĐIỂM:
 * - locationCode: "FG-UNPLACED"
 * - isSystemUnplaced: true (đánh dấu là vị trí hệ thống)
 * - maxCapacity: 1 tỷ (không giới hạn)
 * - layoutBin: false (không hiện trên sơ đồ kho)
 * 
 * @returns {Promise<Object>} WarehouseLocation document
 */
async function ensureUnplacedLocation() {
  const code = 'FG-UNPLACED';
  try {
    return await WarehouseLocation.findOneAndUpdate({ locationCode: code }, { $setOnInsert: {
      barcode: `LOC-${code}`, warehouseType: 'FINISHED_GOODS', zoneCode: 'SYSTEM',
      rackCode: 'UNPLACED', shelfCode: 'UNPLACED', maxCapacity: 1_000_000_000,
      layoutBin: false, isSystemUnplaced: true, status: 'ACTIVE',
    } }, { upsert: true, new: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return WarehouseLocation.findOne({ locationCode: code, isSystemUnplaced: true });
  }
}

/**
 * GET /bin-options
 * 
 * Lấy danh sách ô kệ thành phẩm còn chỗ trống
 * 
 * QUERY PARAMS:
 * - skuIds: danh sách SKU ID cách nhau bởi dấu phẩy (tối đa 100)
 * 
 * RESPONSE:
 * - racks: tổng hợp theo từng kệ (capacity, actual, reserved, available)
 * - bins: chi tiết từng ô (locationCode, available space)
 * 
 * SỬ DỤNG:
 * - Hiển thị dropdown chọn vị trí khi nhập kho
 * - Hiển thị biểu đồ sức chứa kho
 * - Gợi ý vị trí xếp hàng
 */
router.get('/bin-options', async (req, res, next) => {
  try {
    const skuIds = String(req.query.skuIds || '').split(',').filter(Boolean);
    if (!skuIds.length || skuIds.length > 100 || skuIds.some((id) => !mongoose.isValidObjectId(id)))
      return sendError(res, 'SKU không hợp lệ', { code: 'INVALID_SKUS' }, 400);
    const scope = { warehouseType: 'FINISHED_GOODS', layoutBin: true, isDeleted: { $ne: true } };
    const locations = await WarehouseLocation.find(scope)
      .select('locationCode rackCode floorNo binNo maxCapacity currentOccupancy plannedReservedQty status isFrozenForStocktake')
      .sort({ rackCode: 1, floorNo: 1, binNo: 1 }).lean();
    const racks = new Map();
    for (const bin of locations) {
      const rackLabel = bin.locationCode.split('-T')[0];
      const rack = racks.get(rackLabel) || { rackLabel, capacity: 0, actual: 0, reserved: 0, available: 0 };
      rack.capacity += bin.maxCapacity;
      rack.actual += bin.currentOccupancy || 0;
      rack.reserved += bin.plannedReservedQty || 0;
      if (bin.status === 'ACTIVE' && !bin.isFrozenForStocktake)
        rack.available += Math.max(0, bin.maxCapacity - (bin.currentOccupancy || 0) - (bin.plannedReservedQty || 0));
      racks.set(rackLabel, rack);
    }
    const bins = locations.filter((bin) => bin.status === 'ACTIVE' && !bin.isFrozenForStocktake &&
      bin.maxCapacity > (bin.currentOccupancy || 0) + (bin.plannedReservedQty || 0));
    return sendSuccess(res, 'Ô kệ còn chỗ', { diagnostics: {
      totalBins: locations.length, withCapacity: locations.filter((bin) => bin.maxCapacity > 0).length },
      racks: [...racks.values()], bins: bins.map((bin) => ({ id: String(bin._id),
      locationCode: bin.locationCode, rackCode: bin.rackCode,
      rackLabel: bin.locationCode.split('-T')[0], floorNo: bin.floorNo, binNo: bin.binNo,
      maxCapacity: bin.maxCapacity, currentOccupancy: bin.currentOccupancy || 0,
      plannedReservedQty: bin.plannedReservedQty || 0,
      available: Math.max(0, bin.maxCapacity - (bin.currentOccupancy || 0) - (bin.plannedReservedQty || 0)) })) });
  } catch (error) { next(error); }
});

/**
 * GET /documents
 * 
 * Lấy danh sách 20 phiếu nhập/xuất gần nhất
 * 
 * THÔNG TIN TRẢ VỀ:
 * - documentCode, direction (IN/OUT)
 * - totalQuantity: tổng số sản phẩm
 * - barcodeImagesReady: số tem đã có ảnh
 * - unallocated: số sản phẩm chưa phân bổ vị trí
 * - pending: số sản phẩm đang chờ xếp
 * - placed: số sản phẩm đã xếp xong
 * 
 * TIẾN ĐỘ XẾP HÀNG:
 * Total = unallocated + pending + placed
 * 
 * TỰ ĐỘNG:
 * - Nếu phiếu nhập chưa có đủ ảnh barcode → schedule background job tạo ảnh
 */
router.get('/documents', async (req, res, next) => {
  try {
    const documents = await FinishedGoodsBulkDocument.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 }).limit(20).lean();
    const readyCounts = await ProductUnit.aggregate([{ $match: { receivingDocumentId: { $in: documents.map((item) => item._id) },
      barcodeImageUrl: { $type: 'string' } } }, { $group: { _id: '$receivingDocumentId', count: { $sum: 1 } } }]);
    const readyByDocument = new Map(readyCounts.map((item) => [String(item._id), item.count]));
    const allocations = await PutawayAllocation.find({ sourceReceiptId: { $in: documents.map((item) => item._id) },
      status: 'CONFIRMED' }).select('sourceReceiptId lines').lean();
    const progress = new Map();
    for (const allocation of allocations) for (const line of allocation.lines) {
      const key = String(allocation.sourceReceiptId);
      const row = progress.get(key) || { pending: 0, placed: 0 };
      row.pending += remainingQuantity(line);
      row.placed += line.placedQuantity || 0;
      progress.set(key, row);
    }
    for (const document of documents) if (document.direction === 'IN' &&
      (readyByDocument.get(String(document._id)) || 0) < document.totalQuantity) {
      scheduleBarcodeImages('FINISHED_GOODS', String(document._id));
    }
    return sendSuccess(res, 'Phiếu kho gần đây', { documents: documents.map((document) => ({
      id: String(document._id), documentCode: document.documentCode, direction: document.direction,
      totalQuantity: document.totalQuantity, createdAt: document.createdAt,
      barcodeImagesReady: readyByDocument.get(String(document._id)) || 0,
      lineCount: document.items.length,
      unallocated: Math.max(0, document.totalQuantity - (progress.get(String(document._id))?.pending || 0) -
        (progress.get(String(document._id))?.placed || 0)),
      pending: progress.get(String(document._id))?.pending || 0,
      placed: progress.get(String(document._id))?.placed || 0,
      items: document.direction === 'IN' ? document.items.map((item) => ({
        barcodes: item.barcodes || [], expectedQty: item.expectedQty, receivedQty: item.receivedQty, acceptedQty: item.quantity,
        repairQty: item.repairQty,
        repairStatus: item.repairStatus,
      })) : [],
    })) });
  } catch (error) { next(error); }
});

/**
 * GET /documents/:id/barcodes
 * 
 * Lấy danh sách tem barcode của 1 phiếu nhập
 * 
 * RESPONSE:
 * - total: tổng số tem
 * - ready: số tem đã có ảnh
 * - labels: mảng các tem {barcode, imageUrl, skuId, batchId}
 * 
 * SỬ DỤNG:
 * - Hiển thị danh sách tem để in
 * - Download tất cả tem dạng ZIP
 * - Kiểm tra tem nào chưa có ảnh
 * 
 * TỰ ĐỘNG:
 * - Nếu có tem chưa có ảnh → schedule background job
 */
router.get('/documents/:id/barcodes', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã phiếu không hợp lệ', { code: 'INVALID_DOCUMENT' }, 400);
    const document = await FinishedGoodsBulkDocument.findOne({ _id: req.params.id, direction: 'IN', isDeleted: { $ne: true } })
      .select('documentCode totalQuantity items').lean();
    if (!document) return sendError(res, 'Không tìm thấy phiếu nhập', { code: 'DOCUMENT_NOT_FOUND' }, 404);
    const units = await ProductUnit.find({ receivingDocumentId: document._id })
      .select('barcode barcodeImageUrl skuId batchId').sort({ createdAt: 1 }).lean();
    if (units.some((unit) => !unit.barcodeImageUrl)) scheduleBarcodeImages('FINISHED_GOODS', String(document._id));
    return sendSuccess(res, 'Tem sản phẩm của phiếu nhập', { documentCode: document.documentCode,
      total: units.length, ready: units.filter((unit) => unit.barcodeImageUrl).length,
      labels: units.map((unit) => ({ barcode: unit.barcode, imageUrl: unit.barcodeImageUrl || null,
        skuId: String(unit.skuId), batchId: String(unit.batchId) })) });
  } catch (error) { next(error); }
});

/**
 * POST /documents/:id/barcodes/sync
 * 
 * Tạo lại ảnh barcode bị thiếu
 * 
 * KHI NÀO DÙNG:
 * - Upload Cloudinary bị lỗi lần đầu
 * - Ảnh barcode bị xóa nhầm
 * - Cần regenerate ảnh với quality cao hơn
 * 
 * CƠ CHẾ:
 * - Schedule background job (async)
 * - Chỉ tạo lại ảnh chưa có (barcodeImageUrl === null)
 * - Barcode text không đổi
 * 
 * RESPONSE: 202 Accepted (background job đang chạy)
 */
router.post('/documents/:id/barcodes/sync', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã phiếu không hợp lệ', { code: 'INVALID_DOCUMENT' }, 400);
    const exists = await FinishedGoodsBulkDocument.exists({ _id: req.params.id, direction: 'IN', isDeleted: { $ne: true } });
    if (!exists) return sendError(res, 'Không tìm thấy phiếu nhập', { code: 'DOCUMENT_NOT_FOUND' }, 404);
    scheduleBarcodeImages('FINISHED_GOODS', req.params.id);
    return sendSuccess(res, 'Đang tạo các ảnh barcode còn thiếu', { scheduled: true }, 202);
  } catch (error) { next(error); }
});

/**
 * GET /documents/pending-allocation
 * 
 * Lấy danh sách hàng chưa phân bổ vị trí kệ
 * 
 * CÔNG THỨC:
 * unallocated = (số sản phẩm ở staging) - (đã phân bổ nhưng chưa xếp)
 * 
 * staging: vị trí tạm (chưa có trên sơ đồ kho)
 * allocated: đã chỉ định ô kệ đích
 * placed: đã xếp xong vào ô
 * 
 * SỬ DỤNG:
 * - Hiển thị badge "X đơn chờ phân bổ"
 * - Dropdown chọn phiếu khi tạo putaway plan
 * - Dashboard quản lý kho
 */
router.get('/documents/pending-allocation', async (req, res, next) => {
  try {
    const receipts = await FinishedGoodsBulkDocument.find({ direction: 'IN', isDeleted: { $ne: true } })
      .select('documentCode totalQuantity').sort({ createdAt: -1 }).lean();
    const staging = await WarehouseLocation.find({ warehouseType: 'FINISHED_GOODS',
      layoutBin: { $ne: true }, isDeleted: { $ne: true } }).select('_id').lean();
    const [allocations, sources] = await Promise.all([
      PutawayAllocation.find({ sourceReceiptId: { $in: receipts.map((item) => item._id) },
        status: 'CONFIRMED' }).select('sourceReceiptId lines').lean(),
      ProductUnit.aggregate([{ $match: { receivingDocumentId: { $in: receipts.map((item) => item._id) },
        warehouseId: { $in: staging.map((item) => item._id) }, inventoryStatus: 'AVAILABLE' } },
      { $group: { _id: '$receivingDocumentId', quantity: { $sum: 1 } } }]),
    ]);
    const sourceCounts = new Map(sources.map((item) => [String(item._id), item.quantity]));
    const assigned = new Map();
    for (const allocation of allocations) for (const line of allocation.lines) {
      const key = String(allocation.sourceReceiptId);
      assigned.set(key, (assigned.get(key) || 0) + remainingQuantity(line));
    }
    return sendSuccess(res, 'Hàng chờ phân bổ', { receipts: receipts.map((receipt) => ({
      id: String(receipt._id), documentCode: receipt.documentCode,
      unallocated: Math.max(0, (sourceCounts.get(String(receipt._id)) || 0) - (assigned.get(String(receipt._id)) || 0)),
    })).filter((receipt) => receipt.unallocated > 0) });
  } catch (error) { next(error); }
});

/**
 * GET /documents/:id
 * 
 * Lấy chi tiết phiếu + tiến độ xếp hàng
 * 
 * RESPONSE:
 * - document: thông tin phiếu (code, items, quantities)
 * - progress: tiến độ từng SKU
 *   + accepted: số đạt nhập kho
 *   + unallocated: chưa phân bổ
 *   + pending: đã phân bổ, chưa xếp
 *   + placed: đã xếp xong
 *   + rows: chi tiết từng allocation (allocationCode, location, quantities)
 * 
 * SỬ DỤNG:
 * - Màn hình chi tiết phiếu nhập
 * - Theo dõi tiến độ xếp hàng real-time
 * - Kiểm tra hàng đã vào kệ chưa
 */
router.get('/documents/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 'Mã phiếu không hợp lệ', { code: 'INVALID_DOCUMENT' }, 400);
    const document = await FinishedGoodsBulkDocument.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
    if (!document) return sendError(res, 'Không tìm thấy phiếu', { code: 'DOCUMENT_NOT_FOUND' }, 404);
    const allocations = await PutawayAllocation.find({ sourceReceiptId: document._id, status: 'CONFIRMED' })
      .select('allocationCode lines').populate('lines.targetLocationId', 'locationCode rackCode floorNo binNo').lean();
    return sendSuccess(res, 'Chi tiết phiếu kho', { document: receiptResponse(document),
      progress: document.items.map((item) => {
        const rows = allocations.flatMap((allocation) => allocation.lines.filter((line) =>
          String(line.skuId) === String(item.skuId)).map((line) => ({ allocationCode: allocation.allocationCode,
          location: line.targetLocationId, allocated: line.allocatedQuantity,
          pending: remainingQuantity(line), placed: line.placedQuantity || 0 })));
        return { skuId: String(item.skuId), accepted: item.quantity,
          unallocated: Math.max(0, item.quantity - rows.reduce((sum, row) => sum + row.pending + row.placed, 0)),
          pending: rows.reduce((sum, row) => sum + row.pending, 0),
          placed: rows.reduce((sum, row) => sum + row.placed, 0), rows };
      }) });
  } catch (error) { next(error); }
});

/**
 * POST /documents/:id/allocations
 * 
 * Xác nhận phân bổ vị trí kệ cho hàng mới nhập
 * 
 * REQUEST BODY:
 * {
 *   "idempotencyKey": "unique-key-123",
 *   "lines": [
 *     {
 *       "skuId": "674abc...",
 *       "targetLocationId": "674def...",
 *       "allocatedQuantity": 50
 *     }
 *   ]
 * }
 * 
 * VALIDATION:
 * - Tổng allocatedQuantity <= số sản phẩm đạt nhập kho
 * - Location phải còn chỗ trống
 * - idempotencyKey để ngăn duplicate allocation
 * 
 * CƠ CHẾ:
 * - Tạo PutawayAllocation record
 * - Giữ chỗ trên ô kệ (plannedReservedQty)
 * - Nhân viên kho sau đó scan barcode để xếp hàng
 * 
 * TRANSACTION SAFETY:
 * - Dùng MongoDB session để đảm bảo tính toàn vẹn
 * - Nếu duplicate key → check hash để trả về allocation cũ
 */
router.post('/documents/:id/allocations', async (req, res, next) => {
  const key = String(req.body?.idempotencyKey || '').trim();
  if (!mongoose.isValidObjectId(req.params.id) || key.length < 8 || key.length > 100)
    return sendError(res, 'Yêu cầu phân bổ không hợp lệ', { code: 'INVALID_ALLOCATION' }, 400);
  let session;
  try {
    const lines = parseLines(req.body?.lines);
    const hash = fingerprint(lines);
    const prior = await PutawayAllocation.findOne({ idempotencyKey: key }).lean();
    if (prior) return String(prior.sourceReceiptId) === req.params.id && prior.confirmationHash === hash
      ? sendSuccess(res, 'Phân bổ đã được xác nhận', { allocation: prior })
      : sendError(res, 'Khóa phân bổ đã dùng cho nội dung khác', { code: 'ALLOCATION_REUSED' }, 409);
    session = await mongoose.startSession();
    let allocation;
    await session.withTransaction(async () => {
      allocation = await confirmReceiptAllocation(req.user, req.params.id, lines, session, key);
    });
    return sendSuccess(res, 'Đã giữ chỗ chờ xếp', { allocation }, 201);
  } catch (error) {
    if (error.code === 11000) {
      const prior = await PutawayAllocation.findOne({ idempotencyKey: key }).lean();
      if (prior && String(prior.sourceReceiptId) === req.params.id &&
        prior.confirmationHash === fingerprint(parseLines(req.body?.lines)))
        return sendSuccess(res, 'Phân bổ đã được xác nhận', { allocation: prior });
    }
    if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
    if (error.code === 112 || error.hasErrorLabel?.('TransientTransactionError'))
      return sendError(res, 'Sức chứa vừa thay đổi; hãy kiểm tra lại', { code: 'STOCK_CHANGED' }, 409);
    if (error.code === 11000) return sendError(res, 'Phân bổ vừa được xác nhận; hãy tải lại',
      { code: 'ALLOCATION_CHANGED' }, 409);
    next(error);
  } finally { if (session) await session.endSession(); }
});

/**
 * POST /documents
 * 
 * TẠO PHIẾU NHẬP/XUẤT KHO HÀNG LOẠT
 * ==================================
 * 
 * Đây là endpoint QUAN TRỌNG NHẤT của module!
 * 
 * DIRECTION: 'IN' (Nhập kho) hoặc 'OUT' (Xuất kho)
 * 
 * --- NHẬP KHO (IN) ---
 * REQUEST BODY:
 * {
 *   "direction": "IN",
 *   "documentCode": "NH-2026-001",
 *   "confirmationKey": "unique-key-abc",  // Ngăn tạo trùng
 *   "locationId": "674...",               // Vị trí chứa hàng (optional)
 *   "note": "Nhập từ xưởng may",
 *   "items": [
 *     {
 *       "productId": "674...",
 *       "skuId": "674...",
 *       "expectedQty": 100,    // Xưởng bàn giao
 *       "receivedQty": 95,     // Thực nhận
 *       "quantity": 90,        // Đạt nhập kho
 *       "repairQty": 5         // Trả xưởng sửa (auto = receivedQty - quantity)
 *     }
 *   ],
 *   "allocations": [           // Optional: phân bổ luôn khi nhập
 *     {
 *       "skuId": "674...",
 *       "targetLocationId": "674...",
 *       "allocatedQuantity": 90
 *     }
 *   ]
 * }
 * 
 * LUỒNG XỬ LÝ NHẬP KHO:
 * 1. Validate số lượng (expectedQty >= receivedQty >= quantity)
 * 2. Kiểm tra SKU tồn tại và active
 * 3. Kiểm tra vị trí kho còn chỗ
 * 4. Tạo barcode cho từng sản phẩm (ARAxxxxxxxxxxxxxxxxxxxx)
 * 5. Tạo FinishedGoodsBatch
 * 6. Tạo ProductUnit cho từng barcode
 * 7. Cập nhật SKU.onHandQty (+quantity)
 * 8. Cập nhật Location.currentOccupancy
 * 9. Ghi InventoryTransaction
 * 10. Schedule background job tạo ảnh barcode
 * 11. Xử lý allocations nếu có (phân bổ vị trí ngay)
 * 
 * --- XUẤT KHO (OUT) ---
 * REQUEST BODY:
 * {
 *   "direction": "OUT",
 *   "documentCode": "XK-2026-001",
 *   "note": "Xuất hủy lỗi",
 *   "items": [
 *     {
 *       "productId": "674...",
 *       "skuId": "674...",
 *       "quantity": 10
 *     }
 *   ]
 * }
 * 
 * LUỒNG XỬ LÝ XUẤT KHO:
 * 1. Kiểm tra tồn kho khả dụng (onHandQty - reservedQty >= quantity)
 * 2. Giảm SKU.onHandQty (-quantity)
 * 3. Ghi InventoryTransaction
 * 
 * VALIDATION:
 * - documentCode: 2-80 ký tự, chỉ A-Z 0-9 . _ / -
 * - items: 1-100 dòng
 * - quantity mỗi dòng: IN (0-500), OUT (1-100,000)
 * - Tổng quantity: IN max 500, OUT không giới hạn
 * - Mỗi SKU chỉ xuất hiện 1 lần
 * - Không cho xuất hàng theo lô (phải dùng barcode)
 * 
 * IDEMPOTENCY:
 * - confirmationKey + confirmationHash ngăn tạo trùng phiếu
 * - Nếu retry với cùng key + hash → trả về phiếu cũ
 * - Nếu retry với cùng key + khác hash → lỗi CONFIRMATION_REUSED
 * 
 * TRANSACTION SAFETY:
 * - Tất cả thao tác trong 1 MongoDB session
 * - Nếu 1 bước fail → rollback toàn bộ
 * - Nếu conflict (version mismatch) → lỗi 409 STOCK_CHANGED
 * 
 * RESPONSE:
 * - document: {id, documentCode, direction, lineCount, totalQuantity}
 * - items: [{skuId, barcodes[], expectedQty, receivedQty, acceptedQty, repairQty}]
 */
router.post('/documents', async (req, res, next) => {
  const direction = req.body?.direction;
  const documentCode = String(req.body?.documentCode || '').trim().toUpperCase();
  const note = String(req.body?.note || '').trim();
  const items = req.body?.items;
  const locationId = req.body?.locationId;
  const confirmationKey = String(req.body?.confirmationKey || '').trim();
  const allocations = direction === 'IN' ? req.body?.allocations || [] : [];
  if (direction === 'IN' && Array.isArray(items)) {
    const invalidLine = items.findIndex((item) => receivingQuantityError(item));
    if (invalidLine !== -1) return sendError(res,
      `Dòng ${invalidLine + 1}: ${receivingQuantityError(items[invalidLine])}`,
      { code: 'INVALID_RECEIVING_QUANTITY' }, 400);
  }
  if (direction === 'IN' && (!confirmationKey || confirmationKey.length > 100 || !Array.isArray(allocations)))
    return sendError(res, 'Yêu cầu nhập kho không hợp lệ', { code: 'INVALID_CONFIRMATION' }, 400);
  const confirmationHash = direction === 'IN' ? inboundHash(req.body) : null;
  if (direction === 'IN') {
    const prior = await FinishedGoodsBulkDocument.findOne({ confirmationKey }).lean();
    if (prior) return prior.confirmationHash === confirmationHash
      ? sendSuccess(res, 'Phiếu nhập đã được xác nhận', { document: receiptResponse(prior) })
      : sendError(res, 'Khóa xác nhận đã dùng cho nội dung khác', { code: 'CONFIRMATION_REUSED' }, 409);
  }
  if (!['IN', 'OUT'].includes(direction) || !/^[A-Z0-9._/-]{2,80}$/.test(documentCode) ||
      note.length > 500 || !Array.isArray(items) || items.length < 1 || items.length > 100 ||
      (direction === 'IN' && locationId && !mongoose.isValidObjectId(locationId)) ||
      items.some((item) => !mongoose.isValidObjectId(item?.productId) ||
        (item?.skuId && !mongoose.isValidObjectId(item.skuId)) ||
        !Number.isSafeInteger(Number(item?.quantity)) || Number(item.quantity) < (direction === 'IN' ? 0 : 1) || Number(item.quantity) > (direction === 'IN' ? 500 : 100000) ||
        (direction === 'IN' && receivingQuantityError(item)))) {
    return sendError(res, 'Phiếu nhập/xuất không hợp lệ', { code: 'INVALID_BULK_DOCUMENT' }, 400);
  }
  if (direction === 'IN' && items.reduce((sum, item) => sum + Number(item.quantity), 0) > 500) {
    return sendError(res, 'Mỗi phiếu nhận tối đa 500 sản phẩm đạt', { code: 'TOO_MANY_UNITS' }, 400);
  }
  if (direction === 'IN' && items.reduce((sum, item) => sum + Number(item.receivedQty), 0) > 1000) {
    return sendError(res, 'Mỗi phiếu nhận tối đa 1000 sản phẩm', { code: 'TOO_MANY_RECEIVED_UNITS' }, 400);
  }
  const seen = new Set();
  for (const item of items) {
    const key = `${item.productId}:${item.skuId || ''}`;
    if (seen.has(key)) return sendError(res, 'Một SKU chỉ được xuất hiện một lần trong phiếu', { code: 'DUPLICATE_LINE' }, 400);
    seen.add(key);
  }

  let session;
  try {
    const unplaced = direction === 'IN' && !locationId ? await ensureUnplacedLocation() : null;
    if (direction === 'IN' && !locationId && (!unplaced || unplaced.warehouseType !== 'FINISHED_GOODS' ||
      unplaced.status !== 'ACTIVE' || !unplaced.isSystemUnplaced))
      throw createBulkStockRequestError('Nguồn hàng chưa xếp không khả dụng', 'UNPLACED_SOURCE_UNAVAILABLE', 409);
    session = await mongoose.startSession();
    let saved;
    await session.withTransaction(async () => {
      const documentId = new mongoose.Types.ObjectId();
      const lines = [];
      const resolvedSkus = new Set();
      const location = direction === 'IN' ? await WarehouseLocation.findOne({
        _id: locationId || unplaced._id, warehouseType: 'FINISHED_GOODS', layoutBin: { $ne: true },
        status: 'ACTIVE', isDeleted: { $ne: true },
      }).session(session) : null;
      if (direction === 'IN' && !location) throw createBulkStockRequestError('Vị trí kho thành phẩm không hợp lệ', 'LOCATION_NOT_FOUND', 404);
      for (const item of items) {
        const product = await Product.findOne({ _id: item.productId, isDeleted: { $ne: true } }).session(session);
        if (!product) throw createBulkStockRequestError('Không tìm thấy sản phẩm trong phiếu', 'PRODUCT_NOT_FOUND', 404);
        if (!product.isActive) throw createBulkStockRequestError(`Sản phẩm ${product.productCode} đang ở trạng thái nháp`, 'PRODUCT_INACTIVE', 409);
        let sku;
        if (item.skuId) {
          sku = await Sku.findOne({ _id: item.skuId, productId: product._id, isDeleted: { $ne: true } }).session(session);
        } else {
          const existing = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).limit(2).session(session);
          if (existing.length > 1) throw createBulkStockRequestError(`Hãy chọn SKU cho ${product.productCode}`, 'SKU_REQUIRED');
          if (existing.length === 1) sku = existing[0];
        }
        if (!sku) throw createBulkStockRequestError(`Không tìm thấy SKU cho ${product.productCode}`, 'SKU_NOT_FOUND', 404);
        if (!sku.isActive) throw createBulkStockRequestError(`SKU ${sku.skuCode} đã ngừng sử dụng`, 'SKU_INACTIVE', 409);
        if (direction === 'OUT' && await FinishedGoodsBatch.exists({ skuId: sku._id,
          currentOnHandQty: { $gt: 0 }, isDeleted: { $ne: true } }).session(session)) {
          throw createBulkStockRequestError('Hàng theo lô cần xuất bằng barcode từng chiếc', 'BARCODE_OUTBOUND_REQUIRED', 409);
        }
        const resolvedKey = String(sku._id);
        if (resolvedSkus.has(resolvedKey)) throw createBulkStockRequestError(`SKU ${sku.skuCode} bị lặp trong phiếu`, 'DUPLICATE_LINE');
        resolvedSkus.add(resolvedKey);
        const quantity = Number(item.quantity);
        const before = sku.onHandQty || 0;
        if (direction === 'OUT' && before - (sku.reservedQty || 0) < quantity) {
          throw createBulkStockRequestError(`Tồn khả dụng của ${sku.skuCode} không đủ`, 'INSUFFICIENT_STOCK', 409);
        }
        const delta = direction === 'IN' ? quantity : -quantity;
        const updated = delta === 0 ? sku : await Sku.findOneAndUpdate(
          { _id: sku._id, ...(direction === 'OUT' ? { $expr: { $gte: [{ $subtract: [{ $ifNull: ['$onHandQty', 0] }, { $ifNull: ['$reservedQty', 0] }] }, quantity] } } : {}) },
          { $inc: { onHandQty: delta } }, { new: true, session }
        );
        if (!updated) throw createBulkStockRequestError('Tồn kho đã thay đổi, hãy thử lại', 'STOCK_CHANGED', 409);
        if (delta !== 0) await InventoryTransaction.create([{
          transactionCode: `FGM-${randomUUID()}`, warehouseType: 'FINISHED_GOODS', itemType: 'FINISHED_SKU',
          skuId: sku._id, transactionType: direction === 'IN' ? 'MANUAL_INBOUND' : 'MANUAL_OUTBOUND',
          referenceModel: 'FinishedGoodsBulkDocument', referenceId: documentId,
          ...(direction === 'IN' ? { locationId: location._id } : {}),
          quantityChange: delta, onHandBefore: before, onHandAfter: updated.onHandQty,
          unitCostSnapshot: sku.unitCogs || 0, performedByUserId: req.user._id, note,
        }], { session });
        let barcodes = [];
        if (direction === 'IN' && quantity > 0) {
          barcodes = Array.from({ length: quantity }, () => `ARA${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`);
          const [batch] = await FinishedGoodsBatch.create([{
            batchCode: `FGB-${randomUUID()}`, skuId: sku._id, skuBarcode: sku.skuBarcode,
            locationId: location._id, initialQty: quantity, labeledQty: quantity, currentOnHandQty: quantity,
            fifoInboundTimestamp: new Date(),
          }], { session });
          await ProductUnit.insertMany(barcodes.map((barcode) => ({
            barcode, barcodeFormat: 'CODE_128', skuId: sku._id,
            warehouseId: location._id, batchId: batch._id,
            receivingDocumentId: documentId, inventoryStatus: 'AVAILABLE',
          })), { session });
        }
        lines.push({ productId: product._id, skuId: sku._id, quantity,
          ...(direction === 'IN' ? { expectedQty: Number(item.expectedQty),
            receivedQty: Number(item.receivedQty), repairQty: Number(item.receivedQty) - quantity,
            repairStatus: Number(item.receivedQty) > quantity ? 'WAITING_RETURN' : undefined, barcodes } : {}) });
      }
      if (direction === 'IN') {
        const totalAccepted = lines.reduce((sum, line) => sum + line.quantity, 0);
        const updatedLocation = await WarehouseLocation.findOneAndUpdate({
          _id: location._id, $expr: { $gte: [{ $subtract: ['$maxCapacity', { $ifNull: ['$currentOccupancy', 0] }] }, totalAccepted] },
        }, { $inc: { currentOccupancy: totalAccepted } }, { session, new: true });
        if (!updatedLocation) throw createBulkStockRequestError('Vị trí kho không đủ sức chứa', 'LOCATION_FULL', 409);
      }
      [saved] = await FinishedGoodsBulkDocument.create([{
        _id: documentId, documentCode, direction, items: lines,
        ...(direction === 'IN' ? { locationId: location._id } : {}),
        ...(direction === 'IN' ? { confirmationKey, confirmationHash } : {}),
        totalQuantity: lines.reduce((total, line) => total + line.quantity, 0),
        note, createdByUserId: req.user._id,
      }], { session });
      if (direction === 'IN' && allocations.length) {
        const acceptedBySku = new Map(lines.map((line) => [String(line.skuId), line.quantity]));
        const requestedBySku = new Map();
        for (const line of allocations) {
          const skuId = String(line.skuId || '');
          requestedBySku.set(skuId, (requestedBySku.get(skuId) || 0) + Number(line.allocatedQuantity));
        }
        for (const [skuId, quantity] of requestedBySku) if (!acceptedBySku.has(skuId) || quantity > acceptedBySku.get(skuId))
          throw createBulkStockRequestError('Phân bổ vượt số lượng đạt của SKU', 'ALLOCATION_EXCEEDS_ACCEPTED');
        await confirmReceiptAllocation(req.user, documentId, allocations, session);
      }
    });
    if (direction === 'IN' && saved.totalQuantity > 0) scheduleBarcodeImages('FINISHED_GOODS', String(saved._id));
    return sendSuccess(res, direction === 'IN' ? 'Đã nhập kho hàng loạt' : 'Đã xuất kho hàng loạt', {
      document: { id: String(saved._id), documentCode: saved.documentCode, direction: saved.direction,
        lineCount: saved.items.length, totalQuantity: saved.totalQuantity,
        items: direction === 'IN' ? saved.items.map((item) => ({ skuId: String(item.skuId), barcodes: item.barcodes, expectedQty: item.expectedQty,
          receivedQty: item.receivedQty, acceptedQty: item.quantity, repairQty: item.repairQty,
          repairStatus: item.repairStatus })) : undefined },
    }, 201);
  } catch (error) {
    if (error.code === 11000 && direction === 'IN') {
      const prior = await FinishedGoodsBulkDocument.findOne({ confirmationKey }).lean();
      if (prior?.confirmationHash === confirmationHash)
        return sendSuccess(res, 'Phiếu nhập đã được xác nhận', { document: receiptResponse(prior) });
    }
    if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
    if (error.code === 112 || error.hasErrorLabel?.('TransientTransactionError'))
      return sendError(res, 'Sức chứa hoặc nguồn hàng vừa thay đổi; hãy kiểm tra lại và thử lại',
        { code: 'STOCK_CHANGED' }, 409);
    if (error.code === 11000) return sendError(res, 'Số chứng từ hoặc mã SKU đã tồn tại', { code: 'DUPLICATE_DOCUMENT_OR_SKU' }, 409);
    next(error);
  } finally { if (session) await session.endSession(); }
});

export default router;
