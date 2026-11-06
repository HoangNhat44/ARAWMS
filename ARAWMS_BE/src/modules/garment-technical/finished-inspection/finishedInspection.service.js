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

  // Find fallback FINISHED_GOODS location if not provided
  let defaultLocation = await WarehouseLocation.findOne({ warehouseType: 'FINISHED_GOODS', status: 'ACTIVE' });
  if (!defaultLocation) {
    defaultLocation = await WarehouseLocation.findOne({ status: 'ACTIVE' });
  }

  // Build items array with valid barcodes & designated locations
  const resolvedItems = [];
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

    resolvedItems.push({
      skuId: sku._id,
      skuBarcode: sku.skuBarcode || sku.skuCode,
      designatedFifoLocationId: locationId,
      expectedQty: Number(item.expectedQty) || 0,
      scannedQty: 0,
    });
  }

  if (failed > 0 && !qcNote?.trim()) {
    const err = new Error('Vui lòng nhập ghi chú biên bản KCS khi phát hiện có hàng lỗi');
    err.status = 400;
    throw err;
  }

  const ticketCode = await CounterSequence.getNextSequence('FINISHED_GOODS_TICKET', 'PNTP', 6);

  const ticket = new FinishedGoodsTicket({
    ticketCode,
    ticketType: 'INBOUND_FROM_SEWING',
    garmentInspection: {
      inspectedByTechId: user?._id,
      inspectedAt: new Date(),
      totalBatchQty: total,
      passedQty: passed,
      failedDefectQty: failed,
      qcNote: qcNote?.trim() || '',
    },
    createdByManagerId: user?._id,
    status: 'READY_TO_CONFIRM', // Ready for Warehouse Manager confirmation & putaway
    defectAction: failed > 0 ? (defectAction !== 'NONE' ? defectAction : 'REPAIR_AT_WORKSHOP') : 'NONE',
    items: resolvedItems,
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

  return savedTicket;
};

