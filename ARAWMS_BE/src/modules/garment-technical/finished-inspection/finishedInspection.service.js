/*
 * File: finishedInspection.service.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Business logic for Garment Technician (KCS) to inspect sewn finished goods and request warehouse inbound to Warehouse Manager.
 */
import mongoose from 'mongoose';
import FinishedGoodsTicket from '../../../models/FinishedGoodsTicket.model.js';
import Sku from '../../../models/Sku.model.js';
import Product from '../../../models/Product.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import GarmentLot from '../../../models/GarmentLot.model.js';
import { buildLotQrValue, generateNextLotCode } from '../lot-management/lotManagement.service.js';
import { announceTechnicalInbound } from '../../../common/services/workflowNotify.js';

/**
 * Returns options for finished goods inspection (SKUs, Products, Finished Goods Shelves)
 */
export const getFinishedInspectionOptions = async () => {
  const [skus, locations] = await Promise.all([
    Sku.find({ isActive: true })
      .populate('productId', 'productCode productName category style gender')
      .select('skuCode skuBarcode productId styleName color size retailPrice onHandQty')
      .lean(),
    WarehouseLocation.find({ warehouseType: 'FINISHED_GOODS', status: 'ACTIVE' })
      .select('locationCode barcode zoneCode rackCode shelfCode currentOccupancy maxCapacity')
      .lean(),
  ]);

  return { skus, locations };
};

/**
 * List FinishedGoodsTickets for Inbound from Sewing
 */
export const listFinishedGoodsTickets = async (query = {}, user) => {
  const filter = { ticketType: 'INBOUND_FROM_SEWING' };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
      { ticketCode: { $regex: s, $options: 'i' } },
      { 'garmentInspection.qcNote': { $regex: s, $options: 'i' } },
    ];
  }

  // Summary stats
  const [totalTickets, waitingTickets, readyTickets, completedTickets] = await Promise.all([
    FinishedGoodsTicket.countDocuments({ ticketType: 'INBOUND_FROM_SEWING' }),
    FinishedGoodsTicket.countDocuments({ ticketType: 'INBOUND_FROM_SEWING', status: 'WAITING_QC' }),
    FinishedGoodsTicket.countDocuments({ ticketType: 'INBOUND_FROM_SEWING', status: 'READY_TO_CONFIRM' }),
    FinishedGoodsTicket.countDocuments({ ticketType: 'INBOUND_FROM_SEWING', status: 'COMPLETED' }),
  ]);

  const tickets = await FinishedGoodsTicket.find(filter)
    .populate('garmentInspection.inspectedByTechId', 'fullName username email')
    .populate('createdByManagerId', 'fullName username')
    .populate({
      path: 'items.skuId',
      select: 'skuCode skuBarcode styleName color size retailPrice productId',
      populate: { path: 'productId', select: 'productCode productName category' },
    })
    .populate('items.designatedFifoLocationId', 'locationCode barcode zoneCode')
    .sort({ createdAt: -1 })
    .lean();

  return {
    tickets,
    stats: {
      totalTickets,
      waitingTickets,
      readyTickets,
      completedTickets,
    },
  };
};

/**
 * Get single FinishedGoodsTicket details
 */
export const getFinishedGoodsTicketDetails = async (ticketId) => {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    const err = new Error('Mã phiếu không hợp lệ');
    err.status = 400;
    throw err;
  }

  const ticket = await FinishedGoodsTicket.findById(ticketId)
    .populate('garmentInspection.inspectedByTechId', 'fullName username email phone')
    .populate('createdByManagerId', 'fullName username')
    .populate({
      path: 'items.skuId',
      select: 'skuCode skuBarcode styleName color size retailPrice productId',
      populate: { path: 'productId', select: 'productCode productName category' },
    })
    .populate('items.designatedFifoLocationId', 'locationCode barcode zoneCode rackCode shelfCode')
    .populate('items.scannedByStaffId', 'fullName username')
    .lean();

  if (!ticket) {
    const err = new Error('Không tìm thấy phiếu yêu cầu nhập thành phẩm');
    err.status = 404;
    throw err;
  }

  return ticket;
};

/**
 * Create FinishedGoodsTicket from Sewing Inspection
 * Sends inbound request to Warehouse Manager with verified quantities and defect actions
 */
export const createFinishedGoodsInboundTicket = async (payload = {}, user) => {
  if (!user?.roles?.includes('GARMENT_TECHNICIAN')) {
    const err = new Error('Chỉ nhân viên kỹ thuật được gửi lệnh nhập kho thành phẩm');
    err.status = 403; err.code = 'TECHNICIAN_REQUIRED'; throw err;
  }
  const {
    totalBatchQty = 0,
    passedQty = 0,
    failedDefectQty = 0,
    qcNote = '',
    defectAction = 'NONE',
    items = [],
  } = payload;

  const total = Number(totalBatchQty);
  const passed = Number(passedQty);
  const failed = Number(failedDefectQty);

  if (total <= 0) {
    const err = new Error('Tổng số lượng may bàn giao phải lớn hơn 0');
    err.status = 400;
    throw err;
  }

  if (passed < 0 || failed < 0) {
    const err = new Error('Số lượng đạt và số lượng lỗi không được âm');
    err.status = 400;
    throw err;
  }

  if (passed + failed !== total) {
    const err = new Error(`Tổng số lượng (${total}) phải bằng số lượng đạt (${passed}) + số lượng lỗi (${failed})`);
    err.status = 400;
    throw err;
  }

  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Vui lòng chọn ít nhất một SKU thành phẩm');
    err.status = 400;
    throw err;
  }

  // Calculate sum of expectedQty in items
  const itemsSum = items.reduce((acc, curr) => acc + (Number(curr.expectedQty) || 0), 0);
  if (itemsSum !== passed) {
    const err = new Error(`Tổng số lượng phân bổ theo SKU (${itemsSum}) phải bằng số lượng đạt chuẩn KCS (${passed})`);
    err.status = 400;
    throw err;
  }
  if (passed > 500 || !items.every((item) => Number.isSafeInteger(Number(item.expectedQty)) &&
    Number(item.expectedQty) >= 0 && Number(item.expectedQty) <= 500)) {
    const err = new Error('Mỗi lệnh nhập tối đa 500 thành phẩm đạt và cần số nguyên hợp lệ');
    err.status = 400; err.code = 'INVALID_REQUEST_QUANTITY'; throw err;
  }

  // Find fallback FINISHED_GOODS location if not provided
  let defaultLocation = await WarehouseLocation.findOne({ warehouseType: 'FINISHED_GOODS', status: 'ACTIVE' });
  if (!defaultLocation) {
    defaultLocation = await WarehouseLocation.findOne({ status: 'ACTIVE' });
  }

  const validDefectCategories = new Set([
    'NONE',
    'SEWING_DEFECT',
    'FABRIC_DEFECT',
    'SIZE_SPEC_ERROR',
    'ACCESSORY_LABEL_ERROR',
    'STAIN_DAMAGE',
    'OTHER',
  ]);

  // Build items array with valid barcodes, per-SKU defect stats/reasons & designated locations
  const resolvedItems = [];
  let rowFailedSum = 0;
  let hasPerRowFailedField = false;

  for (const item of items) {
    if (!item.skuId || !mongoose.Types.ObjectId.isValid(item.skuId)) {
      const err = new Error('Mã SKU không hợp lệ');
      err.status = 400;
      throw err;
    }

    const sku = await Sku.findById(item.skuId);
    if (!sku) {
      const err = new Error(`Không tìm thấy SKU với mã ID: ${item.skuId}`);
      err.status = 404;
      throw err;
    }

    let locationId = item.designatedFifoLocationId;
    if (!locationId || !mongoose.Types.ObjectId.isValid(locationId)) {
      if (!defaultLocation) {
        const err = new Error('Hệ thống chưa có vị trí kho hoạt động để phân bổ thành phẩm');
        err.status = 400;
        throw err;
      }
      locationId = defaultLocation._id;
    }

    const itemExpected = Number(item.expectedQty) || 0;
    const itemFailed = item.failedQty !== undefined && item.failedQty !== '' ? Number(item.failedQty) : 0;
    if (item.failedQty !== undefined && item.failedQty !== '') hasPerRowFailedField = true;
    if (!Number.isSafeInteger(itemFailed) || itemFailed < 0) {
      const err = new Error('Số lượng lỗi theo từng SKU phải là số nguyên không âm');
      err.status = 400;
      throw err;
    }
    const itemTotal =
      item.totalQty !== undefined && item.totalQty !== '' ? Number(item.totalQty) : itemExpected + itemFailed;
    if (itemExpected + itemFailed !== itemTotal) {
      const err = new Error(
        `SKU ${sku.skuCode}: Tổng may (${itemTotal}) phải bằng số đạt (${itemExpected}) + số lỗi (${itemFailed})`
      );
      err.status = 400;
      throw err;
    }

    const rawCategory = String(item.defectCategory || '').trim().toUpperCase();
    const resolvedCategory =
      itemFailed > 0
        ? validDefectCategories.has(rawCategory) && rawCategory !== 'NONE'
          ? rawCategory
          : 'OTHER'
        : 'NONE';
    const resolvedNote = itemFailed > 0 ? String(item.defectNote || '').trim() : '';

    rowFailedSum += itemFailed;

    const batchCode = String(item.batchCode || '').trim().toUpperCase() || (await generateNextLotCode('FINISHED_GOODS'));
    const qrValue = buildLotQrValue('FINISHED_GOODS', batchCode);

    resolvedItems.push({
      skuId: sku._id,
      skuBarcode: sku.skuBarcode || sku.skuCode,
      skuCodeSnapshot: sku.skuCode,
      productNameSnapshot: sku.styleName || sku.skuCode,
      colorSnapshot: sku.color || '',
      sizeSnapshot: sku.size || '',
      designatedFifoLocationId: locationId,
      totalQty: itemTotal,
      expectedQty: itemExpected,
      failedQty: itemFailed,
      defectCategory: resolvedCategory,
      defectNote: resolvedNote,
      batchCode,
      qrValue,
      productionDate: item.productionDate ? new Date(item.productionDate) : new Date(),
      workshopName: String(item.workshopName || '').trim(),
      productionOrderCode: String(item.productionOrderCode || '').trim(),
      batchNote: String(item.batchNote || '').trim(),
      scannedQty: 0,
    });
  }

  if (hasPerRowFailedField && rowFailedSum !== failed) {
    const err = new Error(`Tổng số lỗi các dòng SKU (${rowFailedSum}) không khớp tổng số lỗi cả phiếu (${failed})`);
    err.status = 400;
    throw err;
  }

  const rowDefectNotes = resolvedItems
    .filter((it) => it.failedQty > 0 && it.defectNote)
    .map((it) => `${it.skuBarcode}: ${it.defectNote}`);
  const finalQcNote = qcNote?.trim() || rowDefectNotes.join(' | ');

  if (failed > 0 && !finalQcNote) {
    const err = new Error('Vui lòng nhập lý do / ghi chú lỗi (ở từng dòng hoặc biên bản KCS) khi có hàng lỗi');
    err.status = 400;
    throw err;
  }

  const ticketCode = await CounterSequence.getNextSequence('FINISHED_GOODS_TICKET', 'PNTP', 6);
  const now = new Date();

  const ticket = new FinishedGoodsTicket({
    ticketCode,
    ticketType: 'INBOUND_FROM_SEWING',
    garmentInspection: {
      inspectedByTechId: user?._id,
      inspectedAt: now,
      totalBatchQty: total,
      passedQty: passed,
      failedDefectQty: failed,
      qcNote: finalQcNote,
    },
    createdByManagerId: user?._id,
    status: 'READY_TO_CONFIRM', // Ready for Warehouse Manager confirmation & putaway
    defectAction: failed > 0 ? (defectAction !== 'NONE' ? defectAction : 'REPAIR_AT_WORKSHOP') : 'NONE',
    items: resolvedItems.map(({ skuCodeSnapshot, productNameSnapshot, colorSnapshot, sizeSnapshot, ...doc }) => doc),
  });

  await ticket.save();

  // Đồng bộ tạo GarmentLot ở trạng thái REQUESTED cho từng dòng để Quản lý Lô & Quản lý kho cùng truy vết
  const createdLots = await GarmentLot.insertMany(
    resolvedItems.map((it) => ({
      lotCode: it.batchCode,
      lotType: 'FINISHED_GOODS',
      qrValue: it.qrValue,
      status: 'REQUESTED',
      skuId: it.skuId,
      skuCode: it.skuCodeSnapshot,
      skuBarcode: it.skuBarcode,
      productName: it.productNameSnapshot,
      color: it.colorSnapshot,
      size: it.sizeSnapshot,
      totalQty: it.totalQty,
      quantity: it.expectedQty,
      failedQty: it.failedQty,
      defectCategory: it.defectCategory,
      defectNote: it.defectNote,
      productionDate: it.productionDate,
      workshopName: it.workshopName,
      productionOrderCode: it.productionOrderCode,
      note: it.batchNote,
      linkedTicketModel: 'FinishedGoodsTicket',
      linkedTicketId: ticket._id,
      linkedTicketCode: ticket.ticketCode,
      requestedAt: now,
      createdByTechId: user?._id,
    }))
  );

  // Gắn lotId ngược lại lên items[] của FinishedGoodsTicket
  const lotIdByCode = new Map(createdLots.map((l) => [l.lotCode, l._id]));
  ticket.items.forEach((item) => {
    if (item.batchCode && lotIdByCode.has(item.batchCode)) {
      item.lotId = lotIdByCode.get(item.batchCode);
    }
  });
  await ticket.save();

  const savedTicket = await FinishedGoodsTicket.findById(ticket._id)
    .populate('garmentInspection.inspectedByTechId', 'fullName username')
    .populate({
      path: 'items.skuId',
      select: 'skuCode skuBarcode styleName color size retailPrice productId',
      populate: { path: 'productId', select: 'productCode productName category' },
    })
    .populate('items.designatedFifoLocationId', 'locationCode barcode zoneCode')
    .lean();

  announceTechnicalInbound({ ticketCodes: [savedTicket?.ticketCode], label: 'phiếu nhập thành phẩm đã kiểm định', actor: user });
  return savedTicket;
};

