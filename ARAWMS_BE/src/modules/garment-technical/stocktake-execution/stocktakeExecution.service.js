/*
 * File: stocktakeExecution.service.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Business logic for Garment Technician executing inventory stocktakes assigned by Warehouse Managers.
 * Implements two-step scanning: 1. Shelf/Rack Barcode -> 2. Product Barcode on that shelf.
 */
import mongoose from 'mongoose';
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import StocktakeRecord from '../../../models/StocktakeRecord.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import Sku from '../../../models/Sku.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';

const fail = (ok, message, code = 'INVALID_INPUT', status = 400) => {
  if (!ok) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    throw error;
  }
};

/**
 * List all stocktake sessions assigned to garment technician or available for counting
 */
export async function listAssignedSessions(user, query = {}) {
  const filter = {
    isDeleted: { $ne: true },
  };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  } else {
    // Default show sessions that are active or in review
    filter.status = { $in: ['WAITING', 'FROZEN_COUNTING', 'VARIANCE_REVIEW', 'APPROVED_COMPLETED'] };
  }

  // If specific inspector is assigned, allow filtering, but in dev/general allow Garment Technicians to access
  const sessions = await StocktakeSession.find(filter)
    .sort({ scheduledAt: -1, createdAt: -1 })
    .populate('inspectorId', 'fullName employeeCode roleCode')
    .populate('approverId', 'fullName employeeCode roleCode')
    .populate('createdByManagerId', 'fullName employeeCode roleCode')
    .populate('scopeLocationIds', 'locationCode barcode zoneCode rackCode shelfCode warehouseType')
    .lean();

  return sessions;
}

/**
 * Get full session details along with counted records
 */
export async function getSessionDetails(sessionId) {
  fail(mongoose.isValidObjectId(sessionId), 'ID phiên kiểm kê không hợp lệ');

  const session = await StocktakeSession.findOne({ _id: sessionId, isDeleted: { $ne: true } })
    .populate('inspectorId', 'fullName employeeCode roleCode')
    .populate('approverId', 'fullName employeeCode roleCode')
    .populate('createdByManagerId', 'fullName employeeCode roleCode')
    .populate('scopeLocationIds', 'locationCode barcode zoneCode rackCode shelfCode warehouseType')
    .lean();

  fail(session, 'Không tìm thấy đợt kiểm kê', 'SESSION_NOT_FOUND', 404);

  const records = await StocktakeRecord.find({ sessionId, isDeleted: { $ne: true } })
    .populate('locationId', 'locationCode barcode zoneCode rackCode shelfCode')
    .populate({
      path: 'skuId',
      select: 'skuCode productName color size barcode unit price',
    })
    .populate({
      path: 'rawMaterialId',
      select: 'materialCode materialName unit color materialGroup',
    })
    .populate({
      path: 'fabricRollId',
      select: 'rollBarcode currentLengthMeters initialLengthMeters status',
    })
    .sort({ updatedAt: -1 })
    .lean();

  return { session, records };
}

/**
 * Step 1: Scan and verify shelf/rack barcode
 * Verifies whether location exists and belongs to the stocktake session scope.
 * Pre-populates/snapshots existing database inventory if not yet snapshotted.
 */
export async function verifyShelfLocation(sessionId, shelfBarcode) {
  fail(mongoose.isValidObjectId(sessionId), 'ID phiên kiểm kê không hợp lệ');
  const barcode = String(shelfBarcode || '').trim();
  fail(barcode, 'Vui lòng nhập hoặc quét mã kệ kho');

  const session = await StocktakeSession.findOne({ _id: sessionId, isDeleted: { $ne: true } });
  fail(session, 'Không tìm thấy đợt kiểm kê', 'SESSION_NOT_FOUND', 404);
  fail(
    !['APPROVED_COMPLETED', 'CANCELLED'].includes(session.status),
    'Đợt kiểm kê này đã kết thúc hoặc đã bị hủy, không thể quét thêm',
    'SESSION_CLOSED',
    400
  );

  // Find location by barcode or locationCode
  const location = await WarehouseLocation.findOne({
    $or: [
      { barcode: barcode },
      { locationCode: barcode.toUpperCase() },
      { barcode: barcode.toUpperCase() },
    ],
    isDeleted: { $ne: true },
  }).lean();

  fail(location, `Không tìm thấy vị trí / kệ nào khớp với mã "${barcode}"`, 'LOCATION_NOT_FOUND', 404);

  // Validate scope
  if (session.warehouseType !== 'ALL' && location.warehouseType !== session.warehouseType) {
    const locWarehouseName = location.warehouseType === 'RAW_MATERIAL' ? 'Kho Nguyên phụ liệu' : 'Kho Thành phẩm';
    const reqWarehouseName = session.warehouseType === 'RAW_MATERIAL' ? 'Kho Nguyên phụ liệu' : 'Kho Thành phẩm';
    fail(
      false,
      `Kệ ${location.locationCode} thuộc ${locWarehouseName}, nhưng phiên kiểm kê này áp dụng cho ${reqWarehouseName}.`,
      'LOCATION_OUT_OF_SCOPE',
      400
    );
  }

  if (session.scopeType === 'ZONE' && session.zoneCode) {
    fail(
      String(location.zoneCode).toUpperCase() === String(session.zoneCode).toUpperCase(),
      `Kệ ${location.locationCode} thuộc Khu ${location.zoneCode}, ngoài phạm vi kiểm kê Khu ${session.zoneCode}.`,
      'LOCATION_OUT_OF_SCOPE',
      400
    );
  }

  if (Array.isArray(session.scopeLocationIds) && session.scopeLocationIds.length > 0) {
    const isInScope = session.scopeLocationIds.some((locId) => String(locId) === String(location._id));
    fail(
      isInScope,
      `Kệ ${location.locationCode} không nằm trong danh sách các vị trí chỉ định của đợt kiểm kê này.`,
      'LOCATION_OUT_OF_SCOPE',
      400
    );
  }

  // If session was waiting, transition to counting
  if (session.status === 'WAITING') {
    session.status = 'FROZEN_COUNTING';
    await session.save();
  }

  // Freeze location
  await WarehouseLocation.findByIdAndUpdate(location._id, { isFrozenForStocktake: true });

  // Check if records already exist for this location in this session
  let records = await StocktakeRecord.find({
    sessionId,
    locationId: location._id,
    isDeleted: { $ne: true },
  })
    .populate({
      path: 'skuId',
      select: 'skuCode productName color size barcode unit price',
    })
    .populate({
      path: 'rawMaterialId',
      select: 'materialCode materialName unit color materialGroup',
    })
    .populate({
      path: 'fabricRollId',
      select: 'rollBarcode currentLengthMeters initialLengthMeters status',
    })
    .lean();

  // If no records exist yet for this shelf, create snapshot from current inventory in database
  if (records.length === 0) {
    const newRecords = [];

    // Snapshot Finished Goods
    if (location.warehouseType === 'FINISHED_GOODS' || session.warehouseType === 'ALL') {
      const productUnits = await ProductUnit.find({
        warehouseId: location._id,
        inventoryStatus: { $in: ['AVAILABLE', 'UNAVAILABLE'] },
      }).lean();

      for (const unit of productUnits) {
        newRecords.push({
          sessionId,
          locationId: location._id,
          itemType: 'SKU_BATCH',
          skuId: unit.skuId,
          batchId: unit.batchId,
          barcode: unit.barcode,
          systemSnapshotQty: 1,
          actualScannedQty: 0,
          varianceQty: -1,
        });
      }
    }

    // Snapshot Raw Materials
    if (location.warehouseType === 'RAW_MATERIAL' || session.warehouseType === 'ALL') {
      const rolls = await FabricRoll.find({
        locationId: location._id,
        status: { $in: ['IN_STOCK', 'AVAILABLE', 'REMNANT', 'PENDING_QC'] },
        isDeleted: { $ne: true },
      }).lean();

      for (const roll of rolls) {
        newRecords.push({
          sessionId,
          locationId: location._id,
          itemType: 'FABRIC_ROLL',
          fabricRollId: roll._id,
          rawMaterialId: roll.rawMaterialId,
          barcode: roll.rollBarcode,
          systemSnapshotQty: 1,
          actualScannedQty: 0,
          varianceQty: -1,
          fifoInboundTimestamp: roll.fifoInboundTimestamp,
        });
      }

      const lots = await MaterialStockLot.find({
        'allocations.locationId': location._id,
        isDeleted: { $ne: true },
      }).lean();

      for (const lot of lots) {
        const alloc = lot.allocations.find((a) => String(a.locationId) === String(location._id));
        const expectedQty = alloc ? (alloc.putawayQty || alloc.quantity || 0) : lot.currentQty;
        newRecords.push({
          sessionId,
          locationId: location._id,
          itemType: 'RAW_MATERIAL',
          rawMaterialId: lot.rawMaterialId,
          barcode: lot.lotBarcode,
          systemSnapshotQty: expectedQty,
          actualScannedQty: 0,
          varianceQty: -expectedQty,
          fifoInboundTimestamp: lot.fifoInboundTimestamp,
        });
      }
    }

    if (newRecords.length > 0) {
      await StocktakeRecord.insertMany(newRecords);
    }

    // Reload populated records
    records = await StocktakeRecord.find({
      sessionId,
      locationId: location._id,
      isDeleted: { $ne: true },
    })
      .populate({
        path: 'skuId',
        select: 'skuCode productName color size barcode unit price',
      })
      .populate({
        path: 'rawMaterialId',
        select: 'materialCode materialName unit color materialGroup',
      })
      .populate({
        path: 'fabricRollId',
        select: 'rollBarcode currentLengthMeters initialLengthMeters status',
      })
      .lean();
  }

  // Update total items expected in session
  const allRecords = await StocktakeRecord.find({ sessionId, isDeleted: { $ne: true } }).lean();
  const totalExpected = allRecords.reduce((sum, r) => sum + (r.systemSnapshotQty || 0), 0);
  await StocktakeSession.findByIdAndUpdate(sessionId, { totalItemsExpected: totalExpected });

  return {
    location,
    records,
  };
}

/**
 * Step 2: Scan product barcode on the active shelf
 * Increments scanned quantity, recalculates variance, or creates surprise item record if foreign to shelf.
 */
export async function recordScannedItem(sessionId, { locationId, barcode, qty = 1 }, user) {
  fail(mongoose.isValidObjectId(sessionId), 'ID phiên kiểm kê không hợp lệ');
  fail(mongoose.isValidObjectId(locationId), 'ID vị trí kệ không hợp lệ');
  const code = String(barcode || '').trim();
  fail(code, 'Mã barcode sản phẩm không hợp lệ');

  const session = await StocktakeSession.findOne({ _id: sessionId, isDeleted: { $ne: true } });
  fail(session, 'Không tìm thấy đợt kiểm kê', 'SESSION_NOT_FOUND', 404);
  fail(
    !['APPROVED_COMPLETED', 'CANCELLED'].includes(session.status),
    'Đợt kiểm kê này đã kết thúc hoặc đã bị hủy, không thể quét thêm',
    'SESSION_CLOSED',
    400
  );

  let record = await StocktakeRecord.findOne({
    sessionId,
    locationId,
    barcode: code,
    isDeleted: { $ne: true },
  });

  let isNewItem = false;

  if (record) {
    record.actualScannedQty = (record.actualScannedQty || 0) + Number(qty);
    record.varianceQty = record.actualScannedQty - record.systemSnapshotQty;
    record.scannedByStaffId = user?._id;
    record.scannedAt = new Date();
    await record.save();
  } else {
    // Barcode was not in this shelf's snapshot! Find what it is in database
    isNewItem = true;
    let itemType = 'SKU_BATCH';
    let skuId = null;
    let fabricRollId = null;
    let rawMaterialId = null;
    let batchId = null;

    const unit = await ProductUnit.findOne({ barcode: code }).lean();
    if (unit) {
      itemType = 'SKU_BATCH';
      skuId = unit.skuId;
      batchId = unit.batchId;
    } else {
      const roll = await FabricRoll.findOne({ rollBarcode: code }).lean();
      if (roll) {
        itemType = 'FABRIC_ROLL';
        fabricRollId = roll._id;
        rawMaterialId = roll.rawMaterialId;
      } else {
        const lot = await MaterialStockLot.findOne({ lotBarcode: code }).lean();
        if (lot) {
          itemType = 'RAW_MATERIAL';
          rawMaterialId = lot.rawMaterialId;
        } else {
          const sku = await Sku.findOne({
            $or: [{ barcode: code }, { skuCode: code.toUpperCase() }],
          }).lean();
          if (sku) {
            itemType = 'SKU_BATCH';
            skuId = sku._id;
          }
        }
      }
    }

    record = await StocktakeRecord.create({
      sessionId,
      locationId,
      itemType,
      skuId,
      fabricRollId,
      rawMaterialId,
      batchId,
      barcode: code,
      systemSnapshotQty: 0,
      actualScannedQty: Number(qty),
      varianceQty: Number(qty),
      scannedByStaffId: user?._id,
      scannedAt: new Date(),
    });
  }

  // Load populated record
  const populatedRecord = await StocktakeRecord.findById(record._id)
    .populate({
      path: 'skuId',
      select: 'skuCode productName color size barcode unit price',
    })
    .populate({
      path: 'rawMaterialId',
      select: 'materialCode materialName unit color materialGroup',
    })
    .populate({
      path: 'fabricRollId',
      select: 'rollBarcode currentLengthMeters initialLengthMeters status',
    })
    .lean();

  // Load all records for this location to return fresh list
  const shelfRecords = await StocktakeRecord.find({
    sessionId,
    locationId,
    isDeleted: { $ne: true },
  })
    .populate({
      path: 'skuId',
      select: 'skuCode productName color size barcode unit price',
    })
    .populate({
      path: 'rawMaterialId',
      select: 'materialCode materialName unit color materialGroup',
    })
    .populate({
      path: 'fabricRollId',
      select: 'rollBarcode currentLengthMeters initialLengthMeters status',
    })
    .sort({ updatedAt: -1 })
    .lean();

  return {
    scannedRecord: populatedRecord,
    isNewItem,
    shelfRecords,
  };
}

/**
 * Manually update counted quantity for a record (e.g. if mis-scanned or editing count)
 */
export async function updateRecordQty(recordId, { actualScannedQty }, user) {
  fail(mongoose.isValidObjectId(recordId), 'ID bản ghi không hợp lệ');
  const qty = Number(actualScannedQty);
  fail(!Number.isNaN(qty) && qty >= 0, 'Số lượng kiểm kê thực tế phải là số không âm');

  const record = await StocktakeRecord.findById(recordId);
  fail(record, 'Không tìm thấy bản ghi kiểm kê', 'RECORD_NOT_FOUND', 404);

  record.actualScannedQty = qty;
  record.varianceQty = qty - record.systemSnapshotQty;
  record.scannedByStaffId = user?._id;
  record.scannedAt = new Date();
  await record.save();

  const updated = await StocktakeRecord.findById(recordId)
    .populate({
      path: 'skuId',
      select: 'skuCode productName color size barcode unit price',
    })
    .populate({
      path: 'rawMaterialId',
      select: 'materialCode materialName unit color materialGroup',
    })
    .populate({
      path: 'fabricRollId',
      select: 'rollBarcode currentLengthMeters initialLengthMeters status',
    })
    .lean();

  return updated;
}

/**
 * Submit stocktake count to Warehouse Manager for variance review
 */
export async function submitSessionCompletion(sessionId, user) {
  fail(mongoose.isValidObjectId(sessionId), 'ID phiên kiểm kê không hợp lệ');

  const session = await StocktakeSession.findOne({ _id: sessionId, isDeleted: { $ne: true } });
  fail(session, 'Không tìm thấy đợt kiểm kê', 'SESSION_NOT_FOUND', 404);

  const records = await StocktakeRecord.find({ sessionId, isDeleted: { $ne: true } }).lean();

  const totalItemsExpected = records.reduce((sum, r) => sum + (r.systemSnapshotQty || 0), 0);
  const totalActualScanned = records.reduce((sum, r) => sum + (r.actualScannedQty || 0), 0);
  const totalDiscrepancies = records.filter((r) => r.varianceQty !== 0).length;

  session.status = 'VARIANCE_REVIEW';
  session.totalItemsExpected = totalItemsExpected;
  session.totalDiscrepancyCount = totalDiscrepancies;
  await session.save();

  // Unfreeze locations associated with this session
  if (Array.isArray(session.scopeLocationIds) && session.scopeLocationIds.length > 0) {
    await WarehouseLocation.updateMany(
      { _id: { $in: session.scopeLocationIds } },
      { $set: { isFrozenForStocktake: false } }
    );
  }

  return {
    session,
    summary: {
      totalItemsExpected,
      totalActualScanned,
      totalDiscrepancies,
      totalRecords: records.length,
    },
  };
}

