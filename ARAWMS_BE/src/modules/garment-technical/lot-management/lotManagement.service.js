/**
 * ============================================================================
 * @title        : Garment Lot Management Service
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Quản lý lô thành phẩm và lô nguyên phụ liệu phía Kỹ thuật may (Garment Technician),
 *                 hỗ trợ tạo/sửa/xóa lô nháp và chọn nhiều lô gửi yêu cầu nhập kho sang Quản lý kho
 *                 kèm đầy đủ mã lô (lotCode/batchCode) và chuỗi QR chuẩn (LOT:FG:... / LOT:RM:...) để sinh QR.
 * @module       : Garment Technical / Lot Management
 * @layer        : Service
 * ============================================================================
 */

import mongoose from 'mongoose';
import GarmentLot from '../../../models/GarmentLot.model.js';
import Sku from '../../../models/Sku.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Supplier from '../../../models/Supplier.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import FinishedGoodsTicket from '../../../models/FinishedGoodsTicket.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import { isFractionalMaterialUnit } from '../../../common/constants/materialUnits.js';
import { publishRealtime } from '../../../common/services/realtime.js';

const VALID_DEFECT_CATEGORIES = new Set([
  'NONE',
  'SEWING_DEFECT',
  'FABRIC_DEFECT',
  'SIZE_SPEC_ERROR',
  'ACCESSORY_LABEL_ERROR',
  'STAIN_DAMAGE',
  'OTHER',
]);

const makeError = (message, status = 400, code = 'BAD_REQUEST') => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

const roundQty = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

export const buildLotQrValue = (lotType, lotCode) =>
  `${lotType === 'FINISHED_GOODS' ? 'LOT:FG' : 'LOT:RM'}:${String(lotCode || '').trim().toUpperCase()}`;

export const generateNextLotCode = async (lotType, session) => {
  const counterKey = lotType === 'FINISHED_GOODS' ? 'GARMENT_LOT_FG' : 'GARMENT_LOT_RM';
  const prefix = lotType === 'FINISHED_GOODS' ? 'LOT-TP' : 'LOT-NL';
  return CounterSequence.getNextSequence(counterKey, prefix, 6, session ? { session } : undefined);
};

const normalizeCustomLotCode = (raw) => {
  const clean = String(raw || '').trim().toUpperCase();
  if (!clean) return '';
  if (!/^[A-Z0-9._-]{3,60}$/.test(clean)) {
    throw makeError('Mã lô chỉ gồm chữ in hoa, số và ký tự ".", "_", "-" (3-60 ký tự)', 400, 'INVALID_LOT_CODE');
  }
  return clean;
};

/**
 * Returns active SKUs, raw materials, and suppliers for the Garment Lot create/edit forms.
 */
export const getLotFormOptions = async () => {
  const [skus, materials, suppliers] = await Promise.all([
    Sku.find({ isActive: true, isDeleted: { $ne: true } })
      .populate('productId', 'productCode productName category')
      .select('skuCode skuBarcode styleName color size retailPrice productId')
      .sort({ skuCode: 1 })
      .lean(),
    RawMaterial.find({ isActive: true, isDeleted: { $ne: true } })
      .select('materialCode materialName materialType unit color widthCm gsm primarySupplierId')
      .sort({ materialCode: 1 })
      .lean(),
    Supplier.find({ isActive: true, isDeleted: { $ne: true } })
      .select('supplierCode supplierName phone')
      .sort({ supplierName: 1 })
      .lean(),
  ]);

  return { skus, materials, suppliers };
};

/**
 * Syncs REQUESTED lots to RECEIVED when their linked warehouse ticket has been completed by Warehouse Manager.
 */
const syncReceivedLotStatuses = async (lots) => {
  const requestedFgIds = [];
  const requestedRmIds = [];

  for (const lot of lots) {
    if (lot.status !== 'REQUESTED' || !lot.linkedTicketId) continue;
    if (lot.linkedTicketModel === 'FinishedGoodsTicket') requestedFgIds.push(lot.linkedTicketId);
    if (lot.linkedTicketModel === 'MaterialTicket') requestedRmIds.push(lot.linkedTicketId);
  }

  const [completedFg, completedRm] = await Promise.all([
    requestedFgIds.length
      ? FinishedGoodsTicket.find({ _id: { $in: requestedFgIds }, status: 'COMPLETED' }).select('_id').lean()
      : [],
    requestedRmIds.length
      ? MaterialTicket.find({ _id: { $in: requestedRmIds }, status: 'COMPLETED' }).select('_id').lean()
      : [],
  ]);

  const doneTicketSet = new Set([
    ...completedFg.map((t) => String(t._id)),
    ...completedRm.map((t) => String(t._id)),
  ]);
  if (doneTicketSet.size === 0) return lots;

  const lotIdsToUpdate = [];
  for (const lot of lots) {
    if (lot.status === 'REQUESTED' && lot.linkedTicketId && doneTicketSet.has(String(lot.linkedTicketId))) {
      lot.status = 'RECEIVED';
      lotIdsToUpdate.push(lot._id);
    }
  }
  if (lotIdsToUpdate.length > 0) {
    await GarmentLot.updateMany({ _id: { $in: lotIdsToUpdate } }, { $set: { status: 'RECEIVED' } });
  }
  return lots;
};

/**
 * Lists GarmentLots with filtering, search, pagination, and KPI stats.
 */
export const listGarmentLots = async (query = {}) => {
  const filter = { isDeleted: { $ne: true } };

  if (query.lotType && ['FINISHED_GOODS', 'RAW_MATERIAL'].includes(query.lotType)) {
    filter.lotType = query.lotType;
  }
  if (query.status && ['DRAFT', 'REQUESTED', 'RECEIVED', 'CANCELLED'].includes(query.status)) {
    filter.status = query.status;
  } else if (query.status !== 'ALL') {
    filter.status = { $ne: 'CANCELLED' };
  }

  if (query.search) {
    const s = String(query.search).trim();
    filter.$or = [
      { lotCode: { $regex: s, $options: 'i' } },
      { qrValue: { $regex: s, $options: 'i' } },
      { skuCode: { $regex: s, $options: 'i' } },
      { productName: { $regex: s, $options: 'i' } },
      { materialCode: { $regex: s, $options: 'i' } },
      { materialName: { $regex: s, $options: 'i' } },
      { workshopName: { $regex: s, $options: 'i' } },
      { productionOrderCode: { $regex: s, $options: 'i' } },
      { supplierNameSnapshot: { $regex: s, $options: 'i' } },
      { supplierLotCode: { $regex: s, $options: 'i' } },
      { dyeLot: { $regex: s, $options: 'i' } },
      { linkedTicketCode: { $regex: s, $options: 'i' } },
    ];
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const skip = (page - 1) * limit;

  const baseStatsFilter = { isDeleted: { $ne: true }, status: { $ne: 'CANCELLED' } };
  if (query.lotType && ['FINISHED_GOODS', 'RAW_MATERIAL'].includes(query.lotType)) {
    baseStatsFilter.lotType = query.lotType;
  }

  const [totalFiltered, rawLots, totalCount, fgCount, rmCount, draftCount, requestedCount, receivedCount] =
    await Promise.all([
      GarmentLot.countDocuments(filter),
      GarmentLot.find(filter)
        .populate('createdByTechId', 'fullName username')
        .populate('supplierId', 'supplierCode supplierName')
        .populate('inboundPlanId', 'planCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      GarmentLot.countDocuments({ isDeleted: { $ne: true }, status: { $ne: 'CANCELLED' } }),
      GarmentLot.countDocuments({ isDeleted: { $ne: true }, status: { $ne: 'CANCELLED' }, lotType: 'FINISHED_GOODS' }),
      GarmentLot.countDocuments({ isDeleted: { $ne: true }, status: { $ne: 'CANCELLED' }, lotType: 'RAW_MATERIAL' }),
      GarmentLot.countDocuments({ ...baseStatsFilter, status: 'DRAFT' }),
      GarmentLot.countDocuments({ ...baseStatsFilter, status: 'REQUESTED' }),
      GarmentLot.countDocuments({ ...baseStatsFilter, status: 'RECEIVED' }),
    ]);

  const lots = await syncReceivedLotStatuses(rawLots);

  return {
    lots,
    stats: {
      totalCount,
      fgCount,
      rmCount,
      draftCount,
      requestedCount,
      receivedCount,
    },
    pagination: {
      page,
      limit,
      totalRecords: totalFiltered,
      totalPages: Math.ceil(totalFiltered / limit) || 1,
    },
  };
};

/**
 * Reads a single GarmentLot by ID.
 */
export const getGarmentLotById = async (lotId) => {
  if (!mongoose.Types.ObjectId.isValid(lotId)) {
    throw makeError('Mã định danh lô không hợp lệ', 400, 'INVALID_LOT_ID');
  }
  const lot = await GarmentLot.findOne({ _id: lotId, isDeleted: { $ne: true } })
    .populate('createdByTechId', 'fullName username')
    .populate('supplierId', 'supplierCode supplierName phone')
    .populate('inboundPlanId', 'planCode')
    .lean();
  if (!lot) throw makeError('Không tìm thấy lô hàng', 404, 'LOT_NOT_FOUND');
  await syncReceivedLotStatuses([lot]);
  return lot;
};

/** Validates and normalizes lot payload for FINISHED_GOODS or RAW_MATERIAL. */
const resolveLotFields = async (lotType, payload) => {
  if (lotType === 'FINISHED_GOODS') {
    if (!payload.skuId || !mongoose.Types.ObjectId.isValid(payload.skuId)) {
      throw makeError('Vui lòng chọn SKU thành phẩm cho lô', 400, 'SKU_REQUIRED');
    }
    const sku = await Sku.findOne({ _id: payload.skuId, isDeleted: { $ne: true } })
      .populate('productId', 'productName productCode')
      .lean();
    if (!sku) throw makeError('Không tìm thấy SKU thành phẩm', 404, 'SKU_NOT_FOUND');

    const passedQty = Number(payload.quantity);
    const failedQty = payload.failedQty !== undefined && payload.failedQty !== '' ? Number(payload.failedQty) : 0;
    const totalQty =
      payload.totalQty !== undefined && payload.totalQty !== '' ? Number(payload.totalQty) : passedQty + failedQty;

    if (!Number.isSafeInteger(passedQty) || passedQty <= 0 || passedQty > 500) {
      throw makeError('Số lượng đạt KCS của lô thành phẩm phải là số nguyên từ 1 đến 500', 400, 'INVALID_QUANTITY');
    }
    if (!Number.isSafeInteger(failedQty) || failedQty < 0) {
      throw makeError('Số lượng lỗi phải là số nguyên không âm', 400, 'INVALID_FAILED_QTY');
    }
    if (passedQty + failedQty !== totalQty) {
      throw makeError(`Tổng may (${totalQty}) phải bằng số đạt (${passedQty}) + số lỗi (${failedQty})`, 400, 'QTY_MISMATCH');
    }

    const rawCat = String(payload.defectCategory || '').trim().toUpperCase();
    const defectCategory =
      failedQty > 0 ? (VALID_DEFECT_CATEGORIES.has(rawCat) && rawCat !== 'NONE' ? rawCat : 'OTHER') : 'NONE';

    return {
      skuId: sku._id,
      skuCode: sku.skuCode,
      skuBarcode: sku.skuBarcode || sku.skuCode,
      productName: sku.styleName || sku.productId?.productName || sku.skuCode,
      color: sku.color || '',
      size: sku.size || '',
      totalQty,
      quantity: passedQty,
      failedQty,
      defectCategory,
      defectNote: failedQty > 0 ? String(payload.defectNote || '').trim() : '',
      productionDate: payload.productionDate ? new Date(payload.productionDate) : new Date(),
      workshopName: String(payload.workshopName || '').trim(),
      productionOrderCode: String(payload.productionOrderCode || '').trim(),
      note: String(payload.note || '').trim(),
    };
  }

  if (lotType === 'RAW_MATERIAL') {
    if (!payload.rawMaterialId || !mongoose.Types.ObjectId.isValid(payload.rawMaterialId)) {
      throw makeError('Vui lòng chọn nguyên phụ liệu cho lô', 400, 'MATERIAL_REQUIRED');
    }
    const material = await RawMaterial.findOne({ _id: payload.rawMaterialId, isDeleted: { $ne: true } }).lean();
    if (!material) throw makeError('Không tìm thấy nguyên phụ liệu', 404, 'MATERIAL_NOT_FOUND');

    const qty = roundQty(payload.quantity);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) {
      throw makeError('Số lượng lô nguyên phụ liệu phải lớn hơn 0', 400, 'INVALID_QUANTITY');
    }
    if (!isFractionalMaterialUnit(material.unit) && !Number.isInteger(qty)) {
      throw makeError(`Đơn vị "${material.unit}" yêu cầu số lượng là số nguyên`, 400, 'INVALID_INTEGER_QTY');
    }

    if (!payload.supplierId || !mongoose.Types.ObjectId.isValid(payload.supplierId)) {
      throw makeError('Vui lòng chọn Nhà cung cấp cho lô nguyên phụ liệu', 400, 'SUPPLIER_REQUIRED');
    }
    const supplierDoc = await Supplier.findOne({ _id: payload.supplierId, isDeleted: { $ne: true } })
      .select('_id supplierName')
      .lean();
    if (!supplierDoc) {
      throw makeError('Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động', 404, 'SUPPLIER_NOT_FOUND');
    }

    const packageCount =
      payload.packageCount !== undefined && payload.packageCount !== '' ? Number(payload.packageCount) : undefined;
    const unitsPerPackage =
      payload.unitsPerPackage !== undefined && payload.unitsPerPackage !== ''
        ? Number(payload.unitsPerPackage)
        : undefined;

    return {
      rawMaterialId: material._id,
      materialCode: material.materialCode,
      materialName: material.materialName,
      materialType: material.materialType || null,
      unit: material.unit || '',
      color: material.color || '',
      quantity: qty,
      supplierId: supplierDoc?._id || undefined,
      supplierNameSnapshot: supplierDoc?.supplierName || String(payload.supplierNameSnapshot || '').trim(),
      supplierLotCode: String(payload.supplierLotCode || '').trim(),
      dyeLot: String(payload.dyeLot || '').trim(),
      manufactureDate: payload.manufactureDate ? new Date(payload.manufactureDate) : undefined,
      expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : undefined,
      packageUnit: String(payload.packageUnit || '').trim(),
      packageCount: Number.isFinite(packageCount) && packageCount >= 0 ? packageCount : undefined,
      unitsPerPackage: Number.isFinite(unitsPerPackage) && unitsPerPackage >= 0 ? unitsPerPackage : undefined,
      note: String(payload.note || '').trim(),
    };
  }

  throw makeError('Loại lô phải là FINISHED_GOODS hoặc RAW_MATERIAL', 400, 'INVALID_LOT_TYPE');
};

/**
 * Creates a DRAFT GarmentLot (Finished Goods or Raw Material) with standardized lotCode and qrValue.
 */
export const createGarmentLot = async (payload = {}, user) => {
  const lotType = payload.lotType;
  if (!['FINISHED_GOODS', 'RAW_MATERIAL'].includes(lotType)) {
    throw makeError('Loại lô phải là FINISHED_GOODS hoặc RAW_MATERIAL', 400, 'INVALID_LOT_TYPE');
  }

  const fields = await resolveLotFields(lotType, payload);
  const lotCode = normalizeCustomLotCode(payload.lotCode) || (await generateNextLotCode(lotType));
  const qrValue = buildLotQrValue(lotType, lotCode);

  const created = await GarmentLot.create({
    lotCode,
    lotType,
    qrValue,
    status: 'DRAFT',
    ...fields,
    createdByTechId: user._id,
  });

  return created.toObject();
};

/**
 * Updates a DRAFT GarmentLot; prevents editing once already sent to Warehouse Manager.
 */
export const updateGarmentLot = async (lotId, payload = {}) => {
  if (!mongoose.Types.ObjectId.isValid(lotId)) {
    throw makeError('Mã định danh lô không hợp lệ', 400, 'INVALID_LOT_ID');
  }
  const existing = await GarmentLot.findOne({ _id: lotId, isDeleted: { $ne: true } });
  if (!existing) throw makeError('Không tìm thấy lô hàng', 404, 'LOT_NOT_FOUND');
  if (existing.status !== 'DRAFT') {
    throw makeError('Chỉ được chỉnh sửa lô đang ở trạng thái Nháp (chưa gửi Quản lý kho)', 409, 'LOT_LOCKED');
  }

  const fields = await resolveLotFields(existing.lotType, payload);
  if (payload.lotCode !== undefined && String(payload.lotCode).trim()) {
    const nextCode = normalizeCustomLotCode(payload.lotCode);
    existing.lotCode = nextCode;
    existing.qrValue = buildLotQrValue(existing.lotType, nextCode);
  }

  Object.assign(existing, fields);
  await existing.save();
  return existing.toObject();
};

/**
 * Deletes/cancels a DRAFT GarmentLot.
 */
export const deleteGarmentLot = async (lotId) => {
  if (!mongoose.Types.ObjectId.isValid(lotId)) {
    throw makeError('Mã định danh lô không hợp lệ', 400, 'INVALID_LOT_ID');
  }
  const existing = await GarmentLot.findOne({ _id: lotId, isDeleted: { $ne: true } });
  if (!existing) throw makeError('Không tìm thấy lô hàng', 404, 'LOT_NOT_FOUND');
  if (existing.status !== 'DRAFT') {
    throw makeError('Không thể xóa lô đã gửi sang Quản lý kho', 409, 'LOT_LOCKED');
  }

  existing.status = 'CANCELLED';
  existing.isDeleted = true;
  await existing.save();
  return { deletedId: String(existing._id), lotCode: existing.lotCode };
};

/**
 * Bundles one or more DRAFT GarmentLots of the same type into an official inbound request ticket
 * sent to Warehouse Manager (FinishedGoodsTicket PNTP-... or MaterialTicket YCNNL-...).
 */
export const sendLotsToWarehouse = async (payload = {}, user) => {
  const { lotType, lotIds = [], qcNote = '', defectAction = 'NONE', requestNote = '' } = payload;

  if (!['FINISHED_GOODS', 'RAW_MATERIAL'].includes(lotType)) {
    throw makeError('Loại lô phải là FINISHED_GOODS hoặc RAW_MATERIAL', 400, 'INVALID_LOT_TYPE');
  }
  if (!Array.isArray(lotIds) || lotIds.length === 0) {
    throw makeError('Vui lòng chọn ít nhất một lô ở trạng thái Nháp để gửi Quản lý kho', 400, 'EMPTY_LOTS');
  }

  const uniqueIds = [...new Set(lotIds.map(String))];
  if (uniqueIds.some((v) => !mongoose.Types.ObjectId.isValid(v))) {
    throw makeError('Danh sách mã lô có phần tử không hợp lệ', 400, 'INVALID_LOT_ID');
  }

  const dbSession = await mongoose.startSession();
  try {
    let result;
    await dbSession.withTransaction(async () => {
      const lots = await GarmentLot.find({
        _id: { $in: uniqueIds },
        lotType,
        status: 'DRAFT',
        isDeleted: { $ne: true },
      }).session(dbSession);

      if (lots.length !== uniqueIds.length) {
        throw makeError(
          'Một số lô không tồn tại, không cùng loại hoặc đã được gửi yêu cầu nhập kho trước đó',
          409,
          'LOT_UNAVAILABLE'
        );
      }

      const now = new Date();

      if (lotType === 'FINISHED_GOODS') {
        const totalBatchQty = lots.reduce((sum, lot) => sum + (Number(lot.totalQty) || Number(lot.quantity) || 0), 0);
        const passedQty = lots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
        const failedDefectQty = lots.reduce((sum, lot) => sum + (Number(lot.failedQty) || 0), 0);

        if (passedQty <= 0 || passedQty > 500) {
          throw makeError(
            `Tổng số lượng đạt KCS trong 1 phiếu nhập kho phải từ 1 đến 500 (hiện tại: ${passedQty})`,
            400,
            'INVALID_REQUEST_QUANTITY'
          );
        }

        let defaultLocation = await WarehouseLocation.findOne({
          warehouseType: 'FINISHED_GOODS',
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        }).session(dbSession);
        if (!defaultLocation) {
          defaultLocation = await WarehouseLocation.findOne({ status: 'ACTIVE', isDeleted: { $ne: true } }).session(
            dbSession
          );
        }
        if (!defaultLocation) {
          throw makeError('Hệ thống chưa có vị trí kho hoạt động để chỉ định nhập thành phẩm', 400, 'NO_LOCATION');
        }

        const ticketCode = await CounterSequence.getNextSequence('FINISHED_GOODS_TICKET', 'PNTP', 6, {
          session: dbSession,
        });
        const lotCodesStr = lots.map((l) => l.lotCode).join(', ');
        const rowDefectNotes = lots
          .filter((l) => (l.failedQty || 0) > 0 && l.defectNote)
          .map((l) => `${l.lotCode} (${l.skuCode}): ${l.defectNote}`);
        const finalQcNote =
          String(qcNote || '').trim() ||
          rowDefectNotes.join(' | ') ||
          `Yêu cầu nhập kho ${lots.length} lô thành phẩm: ${lotCodesStr}`;

        const ticketItems = lots.map((lot) => ({
          skuId: lot.skuId,
          skuBarcode: lot.skuBarcode || lot.skuCode,
          designatedFifoLocationId: defaultLocation._id,
          totalQty: Number(lot.totalQty) || Number(lot.quantity),
          expectedQty: Number(lot.quantity),
          failedQty: Number(lot.failedQty) || 0,
          defectCategory: lot.defectCategory || 'NONE',
          defectNote: lot.defectNote || '',
          lotId: lot._id,
          batchCode: lot.lotCode,
          qrValue: lot.qrValue,
          productionDate: lot.productionDate,
          workshopName: lot.workshopName || '',
          productionOrderCode: lot.productionOrderCode || '',
          batchNote: lot.note || '',
          scannedQty: 0,
        }));

        const [ticket] = await FinishedGoodsTicket.create(
          [
            {
              ticketCode,
              ticketType: 'INBOUND_FROM_SEWING',
              garmentInspection: {
                inspectedByTechId: user._id,
                inspectedAt: now,
                totalBatchQty,
                passedQty,
                failedDefectQty,
                qcNote: finalQcNote,
              },
              createdByManagerId: user._id,
              status: 'READY_TO_CONFIRM',
              defectAction:
                failedDefectQty > 0 ? (defectAction && defectAction !== 'NONE' ? defectAction : 'REPAIR_AT_WORKSHOP') : 'NONE',
              items: ticketItems,
            },
          ],
          { session: dbSession }
        );

        await GarmentLot.updateMany(
          { _id: { $in: lots.map((l) => l._id) } },
          {
            $set: {
              status: 'REQUESTED',
              linkedTicketModel: 'FinishedGoodsTicket',
              linkedTicketId: ticket._id,
              linkedTicketCode: ticket.ticketCode,
              requestedAt: now,
            },
          },
          { session: dbSession }
        );

        result = {
          lotType,
          ticketModel: 'FinishedGoodsTicket',
          ticket: ticket.toObject(),
          sentCount: lots.length,
          lotCodes: lots.map((l) => l.lotCode),
        };
      } else {
        // RAW_MATERIAL -> MaterialTicket (INBOUND_REQUEST): bắt buộc tất cả các lô cùng 1 Nhà cung cấp
        if (lots.some((l) => !l.supplierId)) {
          throw makeError(
            'Tất cả các lô nguyên phụ liệu phải có Nhà cung cấp trước khi gửi Quản lý kho',
            400,
            'SUPPLIER_REQUIRED'
          );
        }
        const supplierIds = [...new Set(lots.map((l) => String(l.supplierId)))];
        if (supplierIds.length > 1) {
          throw makeError(
            'Các lô nguyên phụ liệu trong cùng 1 phiếu yêu cầu nhập kho phải thuộc cùng 1 Nhà cung cấp. Vui lòng tách gửi theo từng Nhà cung cấp.',
            400,
            'MIXED_SUPPLIER_LOTS'
          );
        }
        const sharedSupplierId = lots[0].supplierId;

        const ticketCode = await CounterSequence.getNextSequence('TECHNICIAN_MATERIAL_INBOUND_REQUEST', 'YCNNL', 6, {
          session: dbSession,
        });
        const lotCodesStr = lots.map((l) => l.lotCode).join(', ');
        const finalRequestNote =
          String(requestNote || '').trim() || `Yêu cầu nhập kho ${lots.length} lô nguyên phụ liệu: ${lotCodesStr}`;

        const requestLines = lots.map((lot) => ({
          clientLineId: `LOT-${lot._id}`,
          rawMaterialId: lot.rawMaterialId,
          supplierId: lot.supplierId || sharedSupplierId,
          supplierNameSnapshot: lot.supplierNameSnapshot || undefined,
          requestedQty: roundQty(lot.quantity),
          acceptedQty: roundQty(lot.quantity),
          receivedQty: 0,
          unitCost: lot.unitCost,
          inspectionRef: lot.lotCode,
          inspectedAt: now,
          inspectedByUserId: user._id,
          inspectionConclusion: 'Đã kiểm tra theo lô',
          lotId: lot._id,
          lotCode: lot.lotCode,
          qrValue: lot.qrValue,
          supplierLotCode: lot.supplierLotCode || '',
          dyeLot: lot.dyeLot || '',
          manufactureDate: lot.manufactureDate,
          expiryDate: lot.expiryDate,
          packageUnit: lot.packageUnit || '',
          packageCount: lot.packageCount,
          unitsPerPackage: lot.unitsPerPackage,
          lotNote: lot.note || '',
          rolls:
            lot.materialType === 'FABRIC'
              ? [
                  {
                    clientLineId: `ROLL-${lot._id}`,
                    supplierRollCode: lot.supplierLotCode || lot.lotCode,
                    lotCode: lot.dyeLot || lot.lotCode,
                    lengthMeters: roundQty(lot.quantity),
                  },
                ]
              : [],
          lots:
            lot.materialType !== 'FABRIC'
              ? [
                  {
                    clientLineId: `MLOT-${lot._id}`,
                    supplierLotCode: lot.supplierLotCode || lot.lotCode,
                    packageUnit: lot.packageUnit || '',
                    packageCount: lot.packageCount,
                    unitsPerPackage: lot.unitsPerPackage,
                    countedQty: roundQty(lot.quantity),
                    allocations: [],
                  },
                ]
              : [],
        }));

        const [ticket] = await MaterialTicket.create(
          [
            {
              ticketCode,
              ticketType: 'INBOUND_REQUEST',
              supplierId: sharedSupplierId,
              status: 'WAITING_RECEIPT',
              createdByUserId: user._id,
              requestedByTechnicianId: user._id,
              requestedAt: now,
              inspectionCompletedAt: now,
              requestNote: finalRequestNote,
              requestLines,
            },
          ],
          { session: dbSession }
        );

        await GarmentLot.updateMany(
          { _id: { $in: lots.map((l) => l._id) } },
          {
            $set: {
              status: 'REQUESTED',
              linkedTicketModel: 'MaterialTicket',
              linkedTicketId: ticket._id,
              linkedTicketCode: ticket.ticketCode,
              requestedAt: now,
            },
          },
          { session: dbSession }
        );

        result = {
          lotType,
          ticketModel: 'MaterialTicket',
          ticket: ticket.toObject(),
          sentCount: lots.length,
          lotCodes: lots.map((l) => l.lotCode),
        };
      }
    });

    if (result?.ticketModel === 'MaterialTicket' && result.ticket?._id) {
      publishRealtime('material-inbound-request:changed', {
        requestId: String(result.ticket._id),
        status: result.ticket.status,
      });
    }

    return result;
  } finally {
    await dbSession.endSession();
  }
};
