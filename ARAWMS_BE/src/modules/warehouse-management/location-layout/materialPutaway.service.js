import mongoose from 'mongoose';
import FabricRoll from '../../../models/FabricRoll.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import { ReceiptError, confirmMaterialPutaway } from '../../raw-material-warehousing/inbound-execution/inboundExecution.service.js';

const id = (value) => String(value || '');
const fail = (message, code, status = 400) => { throw new ReceiptError(message, code, status); };
// Raw-material putaway is one shared warehouse: warehouse managers and staff see every
// raw-material shelf, so a stale per-account warehouseIds list cannot hide tasks.
const warehouseRoles = ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'];
const accessible = (locationId, user) => warehouseRoles.includes(user.roleCode) ||
  user.roles?.some((role) => warehouseRoles.includes(role)) || !user.warehouseIds?.length ||
  user.warehouseIds.some((assigned) => id(assigned) === id(locationId));

/** Lists physical rolls and allocated accessory lots that still need a shelf scan. */
export async function listMaterialPutawayTasks(user) {
  const [rolls, lots] = await Promise.all([
    FabricRoll.find({ $or: [{ status: 'QC_PASSED', inboundTicketId: { $ne: null } },
      { pendingReturnQty: { $gt: 0 }, pendingReturnReceiptId: { $ne: null } }] })
      .select('rollBarcode barcodeImageUrl rawMaterialId inboundTicketId pendingReturnReceiptId pendingReturnQty locationId initialLengthMeters supplierRollCode supplierLotCode')
      .lean(),
    MaterialStockLot.find({ status: 'PENDING_PUTAWAY', quality: 'ACCEPTED' })
      .select('lotBarcode barcodeImageUrl rawMaterialId inboundTicketId allocations supplierLotCode')
      .lean(),
  ]);
  const receiptIds = [...new Set([...rolls, ...lots].map((item) =>
    id(item.pendingReturnReceiptId || item.inboundTicketId)))];
  const locationIds = [...new Set([...rolls.map((item) => id(item.locationId)),
    ...lots.flatMap((lot) => (lot.allocations || []).map((item) => id(item.locationId)))])].filter(Boolean);
  const materialIds = [...new Set([...rolls, ...lots].map((item) => id(item.rawMaterialId)))];
  const [receipts, locations, materials] = await Promise.all([
    MaterialTicket.find({ _id: { $in: receiptIds }, status: 'COMPLETED',
      ticketType: { $in: ['INBOUND_FROM_PLAN', 'INBOUND_FROM_SUPPLIER', 'INBOUND_FROM_REMNANT'] },
      isDeleted: { $ne: true } })
      .select('ticketCode receivingLocationId usesPlannedLocationReservation').lean(),
    WarehouseLocation.find({ _id: { $in: locationIds }, warehouseType: 'RAW_MATERIAL',
      isDeleted: { $ne: true } }).select('locationCode barcode rackName rackCode displayName').lean(),
    RawMaterial.find({ _id: { $in: materialIds } }).select('materialCode materialName color unit').lean(),
  ]);
  const receiptById = new Map(receipts.map((item) => [id(item._id), item]));
  const receivingLocations = await WarehouseLocation.find({ _id: {
    $in: receipts.map((item) => item.receivingLocationId) } }).select('zoneCode').lean();
  const receivingZoneById = new Map(receivingLocations.map((item) => [id(item._id), item.zoneCode]));
  const locationById = new Map(locations.map((item) => [id(item._id), item]));
  const materialById = new Map(materials.map((item) => [id(item._id), item]));
  const tasks = [];
  const add = (object, locationId, kind, barcode, quantity, placedQuantity = 0) => {
    const receipt = receiptById.get(id(object.pendingReturnReceiptId || object.inboundTicketId));
    const location = locationById.get(id(locationId));
    if (!receipt || !locationId && !receipt.usesPlannedLocationReservation ||
        locationId && !location || !accessible(receipt.receivingLocationId, user) ||
        locationId && !accessible(locationId, user) || quantity - placedQuantity <= 0.0001) return;
    const material = materialById.get(id(object.rawMaterialId));
    tasks.push({ kind, receiptId: id(receipt._id), receiptCode: receipt.ticketCode,
      receivingZone: receivingZoneById.get(id(receipt.receivingLocationId)) || '',
      objectBarcode: barcode, imageUrl: object.barcodeImageUrl || null,
      lotOrRollCode: object.supplierRollCode || object.supplierLotCode || barcode,
      materialCode: material?.materialCode || '', materialName: material?.materialName || '',
      color: material?.color || '', unit: kind === 'ROLL' ? 'METER' : material?.unit || '',
      locationId: id(location?._id), locationCode: location?.locationCode || '',
      locationBarcode: location?.barcode || '', rackName: location?.rackName || location?.rackCode || '',
      allocatedQuantity: quantity, placedQuantity,
      remainingQuantity: Math.round((quantity - placedQuantity) * 1000) / 1000 });
  };
  rolls.forEach((roll) => add(roll, roll.locationId, 'ROLL', roll.rollBarcode,
    roll.pendingReturnReceiptId ? roll.pendingReturnQty : roll.initialLengthMeters));
  lots.forEach((lot) => {
    (lot.allocations || []).forEach((allocation) =>
      add(lot, allocation.locationId, 'LOT', lot.lotBarcode, allocation.quantity, allocation.putawayQty || 0));
    const unallocated = Math.round((lot.initialQty - (lot.allocations || [])
      .reduce((sum, allocation) => sum + allocation.quantity, 0)) * 1000) / 1000;
    if (unallocated > 0) add(lot, null, 'LOT', lot.lotBarcode, unallocated);
  });
  return tasks.sort((a, b) => a.receiptCode.localeCompare(b.receiptCode) ||
    a.materialCode.localeCompare(b.materialCode) || a.locationCode.localeCompare(b.locationCode));
}

export async function listMaterialPutawayLocations(user) {
  const locations = await WarehouseLocation.find({ warehouseType: 'RAW_MATERIAL', status: 'ACTIVE',
    isFrozenForStocktake: false, isDeleted: { $ne: true } })
    .select('locationCode barcode rackName rackCode zoneCode capacityUnit maxCapacity currentOccupancy plannedReservedQty')
    .sort({ locationCode: 1 }).lean();
  return locations.filter((item) => accessible(item._id, user)).map((item) => ({
    id: id(item._id), code: item.locationCode, barcode: item.barcode,
    rackName: item.rackName || item.rackCode || '', zoneCode: item.zoneCode,
    capacityUnit: item.capacityUnit || '', currentOccupancy: item.currentOccupancy || 0,
    freeQuantity: Math.round(((item.maxCapacity || 0) - (item.currentOccupancy || 0) -
      (item.plannedReservedQty || 0)) * 1000) / 1000,
  }));
}

/** Checks the current shelf barcode for the selected material task. */
export async function verifyMaterialPutawayLocation(user, input) {
  const task = (await listMaterialPutawayTasks(user)).find((item) =>
    item.receiptId === id(input.receiptId) && item.objectBarcode === String(input.objectBarcode || '').trim().toUpperCase() &&
    item.locationId === id(input.plannedLocationId));
  if (!task) fail('Công việc xếp kệ đã thay đổi, hãy tải lại', 'TASK_CHANGED', 409);

  const scanned = String(input.barcode || '').trim().toUpperCase();
  const allLocations = await listMaterialPutawayLocations(user);
  let location = allLocations.find((item) => item.id === id(input.locationId));
  if (!location && scanned) {
    location = allLocations.find((item) =>
      String(item.barcode || '').trim().toUpperCase() === scanned ||
      String(item.code || '').trim().toUpperCase() === scanned
    );
  }
  if (!location || (task.locationId && task.locationId !== location.id))
    fail('Kệ này không thuộc công việc đã chọn', 'WRONG_LOCATION', 409);

  // Check receiving zone only if receivingLocation is recorded and this task did not already designate this location
  if (!task.locationId || task.locationId !== location.id) {
    const ticket = await MaterialTicket.findById(task.receiptId).select('receivingLocationId').lean();
    if (ticket?.receivingLocationId) {
      const receiving = await WarehouseLocation.findById(ticket.receivingLocationId).select('zoneCode').lean();
      if (receiving?.zoneCode && location.zoneCode && location.zoneCode !== receiving.zoneCode)
        fail('Kệ không thuộc khu nhận của phiếu', 'WRONG_RECEIVING_ZONE', 409);
    }
  }

  // Allow empty shelves (currentOccupancy === 0) to adapt to the material unit
  if (location.capacityUnit && (location.currentOccupancy || 0) > 0 && location.capacityUnit !== task.unit)
    fail('Đơn vị sức chứa của kệ không khớp nguyên phụ liệu', 'LOCATION_UNIT_MISMATCH', 409);

  const locBarcode = String(location.barcode || '').trim().toUpperCase();
  const locCode = String(location.code || '').trim().toUpperCase();
  if (scanned !== locBarcode && scanned !== locCode)
    fail(`Sai kệ. Hãy quét ${location.code}`, 'WRONG_LOCATION', 409);

  return { id: location.id, barcode: location.barcode, locationCode: location.code };
}

/** Binds the scanned object and shelf to the selected row before the stock transaction. */
export async function scanMaterialPutawayTask(user, input) {
  const receiptId = id(input.receiptId);
  const objectBarcode = String(input.objectBarcode || '').trim().toUpperCase();
  const scannedBarcode = String(input.scannedBarcode || '').trim().toUpperCase();
  const locationBarcode = String(input.locationBarcode || '').trim().toUpperCase();
  if (!mongoose.isValidObjectId(receiptId) || !mongoose.isValidObjectId(input.locationId))
    fail('Công việc xếp kệ không hợp lệ', 'INVALID_TASK');

  let targetObjectBarcode = objectBarcode;
  if (!scannedBarcode || scannedBarcode !== objectBarcode) {
    const [matchingRoll, matchingLot] = await Promise.all([
      FabricRoll.findOne({
        $or: [{ inboundTicketId: receiptId }, { pendingReturnReceiptId: receiptId }],
        $or: [
          { rollBarcode: scannedBarcode },
          { supplierRollCode: scannedBarcode },
          { supplierLotCode: scannedBarcode },
        ],
      }).select('rollBarcode').lean(),
      MaterialStockLot.findOne({
        inboundTicketId: receiptId,
        $or: [
          { lotBarcode: scannedBarcode },
          { supplierLotCode: scannedBarcode },
        ],
      }).select('lotBarcode').lean(),
    ]);

    if (matchingRoll) {
      targetObjectBarcode = matchingRoll.rollBarcode;
    } else if (matchingLot) {
      targetObjectBarcode = matchingLot.lotBarcode;
    } else {
      fail('Sai barcode nguyên phụ liệu của công việc đã chọn', 'WRONG_MATERIAL', 409);
    }
  }

  const location = await WarehouseLocation.findById(input.locationId).select('barcode locationCode zoneCode').lean();
  if (!location)
    fail('Không tìm thấy kệ của công việc', 'WRONG_LOCATION', 409);
  const locBarcode = String(location.barcode || '').trim().toUpperCase();
  const locCode = String(location.locationCode || '').trim().toUpperCase();
  if (locBarcode !== locationBarcode && locCode !== locationBarcode)
    fail('Sai barcode kệ của công việc đã chọn', 'WRONG_LOCATION', 409);

  return confirmMaterialPutaway(receiptId, {
    objectBarcode: targetObjectBarcode, locationBarcode: location.barcode, quantity: input.quantity,
    idempotencyKey: input.idempotencyKey,
  }, user);
}
