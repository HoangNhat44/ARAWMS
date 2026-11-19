/*
 * File: binLabel.service.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Shelf bin labels and history: label data, label images (Code 128 / QR), print requests,
 * and rotating a bin barcode so old printed labels stop working.
 */
import mongoose from 'mongoose';
import bwipjs from 'bwip-js';
import { randomBytes } from 'node:crypto';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import WarehouseLayout from '../../../models/WarehouseLayout.model.js';
import WarehouseBarcodeHistory from '../../../models/WarehouseBarcodeHistory.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import { requestError } from '../shared/warehouseHttp.js';

const findBin = async (binId, select) => {
  const bin = await WarehouseLocation.findOne({ _id: binId, layoutBin: true, isDeleted: { $ne: true } }).select(select).lean();
  if (!bin) throw requestError('Không tìm thấy ô', 'BIN_NOT_FOUND', 404);
  return bin;
};

/** The last 50 logged changes of a bin. */
export async function getBinHistory(binId) {
  const bin = await findBin(binId, '_id');
  const history = await SystemLog.find({ targetId: bin._id }).select('action actorId createdAt beforeSnapshot afterSnapshot')
    .sort({ createdAt: -1 }).limit(50).lean();
  return { history };
}

export async function getBinLabel(binId) {
  return { bin: await findBin(binId, 'locationCode barcode zoneCode rackCode floorNo binNo') };
}

/** Renders the bin label as PNG. The QR carries the same rotating location barcode as the Code 128 label.
 * @param {'code128'|'qr'} kind
 * @returns {Promise<{ png: Buffer, filename: string }>} */
export async function renderBinLabelPng(binId, kind) {
  const bin = await findBin(binId, 'locationCode barcode');
  const png = kind === 'qr'
    ? await bwipjs.toBuffer({ bcid: 'qrcode', text: bin.barcode, scale: 5, padding: 12 })
    : await bwipjs.toBuffer({ bcid: 'code128', text: bin.barcode, scale: 3,
      height: 16, includetext: true, textxalign: 'center', paddingwidth: 12, paddingheight: 10 });
  return { png, filename: kind === 'qr' ? `${bin.locationCode}-qr.png` : `${bin.locationCode}.png` };
}

/** Logs that a label was printed. */
export async function recordLabelPrint(binId, user) {
  const bin = await findBin(binId);
  await SystemLog.create({ actorId: user._id, actorRole: user.roleCode,
    majorFeature: 'WAREHOUSE_LAYOUT', subFeature: 'LOCATION_LABEL', action: 'PRINT_REQUEST',
    targetCollection: 'warehouse_locations', targetId: bin._id, targetCode: bin.locationCode });
}

/** Issues a new barcode for a bin on the active layout and revokes the old one. */
export async function rotateBinBarcode(binId, reason, user) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const bin = await WarehouseLocation.findOne({ _id: binId, layoutBin: true, isDeleted: { $ne: true } }).session(session);
      if (!bin) throw requestError('Không tìm thấy ô', 'BIN_NOT_FOUND', 404);
      const layout = await WarehouseLayout.findOne({ warehouseType: 'FINISHED_GOODS' }).session(session);
      const index = layout?.active?.bins?.findIndex((item) => String(item.id) === String(bin._id));
      if (!layout || index == null || index < 0) throw requestError('Ô không có trên sơ đồ đang áp dụng', 'BIN_NOT_ACTIVE', 409);
      const oldBarcode = bin.barcode;
      const barcode = `LOC-${bin.locationCode}-${randomBytes(6).toString('hex').toUpperCase()}`;
      await WarehouseBarcodeHistory.updateOne({ barcode: oldBarcode },
        { $set: { revokedAt: new Date(), reason }, $setOnInsert: { locationId: bin._id } }, { upsert: true, session });
      await WarehouseBarcodeHistory.create([{ barcode, locationId: bin._id }], { session });
      await WarehouseLocation.updateOne({ _id: bin._id, barcode: oldBarcode }, { $set: { barcode } }, { session });
      const updated = await WarehouseLayout.updateOne({ _id: layout._id, activeVersion: layout.activeVersion },
        { $set: { [`active.bins.${index}.barcode`]: barcode }, $inc: { activeVersion: 1 } }, { session });
      if (!updated.modifiedCount) throw requestError('Sơ đồ đã thay đổi', 'VERSION_CONFLICT', 409);
      await SystemLog.create([{ actorId: user._id, actorRole: user.roleCode,
        majorFeature: 'WAREHOUSE_LAYOUT', subFeature: 'LOCATION_LABEL', action: 'ROTATE',
        targetCollection: 'warehouse_locations', targetId: bin._id, targetCode: bin.locationCode,
        beforeSnapshot: { barcode: oldBarcode }, afterSnapshot: { barcode, reason } }], { session });
      result = { locationCode: bin.locationCode, barcode };
    });
    return { bin: result };
  } finally { await session.endSession(); }
}
