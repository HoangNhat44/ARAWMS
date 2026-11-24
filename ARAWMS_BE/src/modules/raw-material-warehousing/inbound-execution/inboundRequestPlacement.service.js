/*
 * File: inboundRequestPlacement.service.js
 * Author: Duy Anh
 * Date: 2026-11-22
 * Description: Rebuilds everything the warehouse manager decided for a technician inbound request:
 * the receipts created from it, who prepared/confirmed them, and the planned and actual bin of every roll or lot.
 */
import mongoose from 'mongoose';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import { ReceiptError, getMaterialReceiptLabels } from './inboundExecution.service.js';
import { canAccessLocation } from '../../../common/services/warehouseAccess.js';

const id = (value) => String(value?._id || value || '');

/** Location summary shown to the manager: bin code plus its rack/zone context. */
const describeLocation = (location) => location ? {
  id: id(location._id), locationCode: location.locationCode, zoneCode: location.zoneCode || null,
  rackCode: location.rackCode || null, rackName: location.rackName || null,
  floorNo: location.floorNo ?? null, binNo: location.binNo ?? null, warehouseType: location.warehouseType,
} : null;

/** Lists receipts made from one inbound request with every manager-chosen location resolved. */
export async function getInboundRequestPlacements(requestId, user) {
  if (!mongoose.isValidObjectId(requestId)) throw new ReceiptError('Yêu cầu nhập kho không hợp lệ', 'INVALID_INBOUND_REQUEST', 400);
  const request = await MaterialTicket.findOne({ _id: requestId, isDeleted: { $ne: true } })
    .select('ticketCode receivingLocationId').lean();
  if (!request) throw new ReceiptError('Không tìm thấy yêu cầu nhập kho', 'INBOUND_REQUEST_NOT_FOUND', 404);

  const receipts = (await MaterialTicket.find({ ticketType: 'INBOUND_FROM_SUPPLIER', inboundRequestId: requestId,
    status: { $ne: 'CANCELLED' }, isDeleted: { $ne: true } })
    .select('ticketCode status receivedAt receivingLocationId receiptNote receiptLines createdAt createdByManagerId confirmedAt confirmedByUserId')
    .populate('createdByManagerId', 'fullName')
    .populate('confirmedByUserId', 'fullName')
    .sort({ createdAt: 1 }).lean())
    .filter((receipt) => canAccessLocation({ _id: receipt.receivingLocationId }, user));

  const locationIds = new Set();
  const materialIds = new Set();
  for (const receipt of receipts) {
    locationIds.add(id(receipt.receivingLocationId));
    for (const line of receipt.receiptLines || []) {
      materialIds.add(id(line.rawMaterialId));
      for (const roll of line.rolls || []) locationIds.add(id(roll.locationId));
      for (const lot of line.lots || []) for (const allocation of lot.allocations || []) locationIds.add(id(allocation.locationId));
    }
  }
  const [locations, materials] = await Promise.all([
    WarehouseLocation.find({ _id: { $in: [...locationIds].filter(mongoose.isValidObjectId) } })
      .select('locationCode zoneCode rackCode rackName floorNo binNo warehouseType').lean(),
    RawMaterial.find({ _id: { $in: [...materialIds].filter(mongoose.isValidObjectId) } })
      .select('materialCode materialName color unit materialType').lean(),
  ]);
  const byLocation = new Map(locations.map((item) => [id(item._id), item]));
  const byMaterial = new Map(materials.map((item) => [id(item._id), item]));

  // Confirmed receipts have stock objects: barcode, putaway progress and the bin the staff actually used.
  const labelsByReceipt = new Map();
  await Promise.all(receipts.filter((receipt) => receipt.status === 'COMPLETED').map(async (receipt) => {
    const result = await getMaterialReceiptLabels(receipt._id, user).catch(() => null);
    labelsByReceipt.set(id(receipt._id), new Map((result?.labels || []).map((label) => [label.sourceLineId, label])));
  }));

  return { requestCode: request.ticketCode, receipts: receipts.map((receipt) => {
    const labels = labelsByReceipt.get(id(receipt._id)) || new Map();
    const stockInfo = (clientLineId) => {
      const label = labels.get(clientLineId);
      return label ? { barcode: label.barcode, putawayComplete: Boolean(label.putawayComplete),
        actualLocationCodes: label.actualLocationCodes || [], stockStatus: label.stockStatus } : null;
    };
    return {
      id: id(receipt._id), ticketCode: receipt.ticketCode, status: receipt.status,
      receivedAt: receipt.receivedAt || null, createdAt: receipt.createdAt || null,
      preparedBy: receipt.createdByManagerId?.fullName || null,
      confirmedAt: receipt.confirmedAt || null, confirmedBy: receipt.confirmedByUserId?.fullName || null,
      receivingLocation: describeLocation(byLocation.get(id(receipt.receivingLocationId))),
      note: receipt.receiptNote || '',
      lines: (receipt.receiptLines || []).map((line) => {
        const material = byMaterial.get(id(line.rawMaterialId));
        return {
          materialCode: material?.materialCode || null, materialName: material?.materialName || null,
          color: material?.color || null, unit: material?.unit || null,
          supplierName: line.supplierNameSnapshot || null, unitCost: line.unitCost ?? null,
          acceptedQty: line.acceptedQty || 0, rejectedQty: line.rejectedQty || 0,
          objects: [
            ...(line.rolls || []).map((roll, index) => ({ kind: 'ROLL', label: `Cây ${index + 1}`,
              sourceCode: roll.supplierRollCode || roll.lotCode || null,
              quantity: roll.lengthMeters, unit: 'METER', weightKg: roll.weightKg || null,
              quality: roll.quality || null, defectReason: roll.defectReason || '',
              plannedLocations: roll.locationId ? [{ ...describeLocation(byLocation.get(id(roll.locationId))),
                quantity: roll.lengthMeters }] : [],
              stock: stockInfo(roll.clientLineId) })),
            ...(line.lots || []).map((lot, index) => ({ kind: 'LOT', label: `Lô ${index + 1}`,
              sourceCode: lot.supplierLotCode || null,
              quantity: lot.countedQty, unit: material?.unit || null,
              quality: lot.quality || null, defectReason: lot.defectReason || '',
              plannedLocations: (lot.allocations || []).filter((allocation) => allocation.locationId)
                .map((allocation) => ({ ...describeLocation(byLocation.get(id(allocation.locationId))),
                  quantity: allocation.quantity })),
              stock: stockInfo(lot.clientLineId) })),
          ],
        };
      }),
    };
  }) };
}
