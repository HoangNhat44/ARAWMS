/*
 * File: bulkStock.service.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Finished-goods stock documents.
 * - Receiving (IN) from a technician ticket: issues one barcode per accepted unit, creates the batch and
 *   product units, raises stock and occupancy, optionally reserves shelf bins, and closes the ticket.
 * - Bulk outbound requests (OUT): created by the manager, picked and scanned by warehouse staff, then dispatched.
 * - Shelf allocation and receipt progress.
 * Every confirmation is idempotent through a confirmation key bound to a payload hash.
 */
import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import FinishedGoodsBulkDocument from '../../../models/FinishedGoodsBulkDocument.model.js';
import FinishedGoodsTicket from '../../../models/FinishedGoodsTicket.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import PutawayAllocation from '../../../models/PutawayAllocation.model.js';
import { code128DataUrl } from '../../../common/services/codeImageRenderer.js';
import { publishRealtime } from '../../../common/services/realtime.js';
import { confirmReceiptAllocation, fingerprint, parseLines, remainingQuantity } from '../location-layout/allocation.service.js';
import { listWarehouseInboundProgress } from './warehouseInboundProgress.service.js';
import { requestError } from '../shared/warehouseHttp.js';
import {
  receiptAllocationError, assertObjectId, readBulkDocument, assertReceivingLines, assertConfirmation,
  assertMatchesTechnicalTicket, assertBulkDocumentShape,
} from './bulkStock.validation.js';

const TECHNICAL_TICKET_TYPES = ['INBOUND_FROM_SEWING', 'INBOUND_FROM_RETURN'];
const isTransactionConflict = (error) => error.code === 112 || error.hasErrorLabel?.('TransientTransactionError');

/** The committed document identity and issued unit barcodes, returned on an idempotent retry. */
export const receiptResponse = (document) => ({ id: String(document._id), documentCode: document.documentCode,
  sourceTicketId: document.sourceTicketId ? String(document.sourceTicketId) : null,
  direction: document.direction, lineCount: document.items.length, totalQuantity: document.totalQuantity,
  items: document.direction === 'IN' ? document.items.map((item) => ({ skuId: String(item.skuId),
    barcodes: item.barcodes, expectedQty: item.expectedQty, receivedQty: item.receivedQty,
    acceptedQty: item.quantity, repairQty: item.repairQty, repairStatus: item.repairStatus })) : undefined });

/** Fingerprints the normalized request bound to one confirmation key; reusing the key with changed
 * stock lines, bins or notes is rejected. */
export const confirmationPayloadHash = (body) => createHash('sha256').update(JSON.stringify({
  direction: body.direction, documentCode: String(body.documentCode || '').trim().toUpperCase(),
  sourceTicketId: String(body.sourceTicketId || ''),
  note: String(body.note || '').trim(),
  items: body.items, allocations: body.allocations || [],
})).digest('hex');

/** Creates or returns the virtual FG-UNPLACED location that holds received units not yet on a shelf. */
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

/* ---------------------------------------------------------------- Lists and lookups */

/** Shelf bins with free capacity, plus per-rack totals, for choosing where received units go. */
export async function listBinOptions() {
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
  return { diagnostics: {
    totalBins: locations.length, withCapacity: locations.filter((bin) => bin.maxCapacity > 0).length },
    racks: [...racks.values()], bins: bins.map((bin) => ({ id: String(bin._id),
    locationCode: bin.locationCode, rackCode: bin.rackCode,
    rackLabel: bin.locationCode.split('-T')[0], floorNo: bin.floorNo, binNo: bin.binNo,
    maxCapacity: bin.maxCapacity, currentOccupancy: bin.currentOccupancy || 0,
    plannedReservedQty: bin.plannedReservedQty || 0,
    available: Math.max(0, bin.maxCapacity - (bin.currentOccupancy || 0) - (bin.plannedReservedQty || 0)) })) };
}

/** Warehouse receiving queue, sourced only from technician inspection tickets. */
export async function listTechnicalRequests() {
  const tickets = await FinishedGoodsTicket.find({ ticketType: { $in: TECHNICAL_TICKET_TYPES }, isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .populate({ path: 'items.skuId', select: 'skuCode productId color size',
      populate: { path: 'productId', select: 'productCode productName' } })
    .populate('garmentInspection.inspectedByTechId', 'fullName username').lean();
  const documents = await FinishedGoodsBulkDocument.find({ sourceTicketId: { $in: tickets.map((item) => item._id) },
    direction: 'IN', isDeleted: { $ne: true } }).select('_id sourceTicketId documentCode').lean();
  const byTicket = new Map(documents.map((item) => [String(item.sourceTicketId), item]));
  return { requests: tickets.map((ticket) => {
    const document = byTicket.get(String(ticket._id));
    const lines = new Map();
    for (const item of ticket.items || []) {
      if (!(Number(item.expectedQty) > 0)) continue;
      const sku = item.skuId;
      const skuId = String(sku?._id || sku || '');
      const current = lines.get(skuId) || { skuId, skuCode: sku?.skuCode || '',
        productId: String(sku?.productId?._id || ''), productCode: sku?.productId?.productCode || '',
        productName: sku?.productId?.productName || '', color: sku?.color || '', size: sku?.size || '',
        expectedQty: 0 };
      current.expectedQty += Number(item.expectedQty) || 0;
      lines.set(skuId, current);
    }
    return { id: String(ticket._id), code: ticket.ticketCode, ticketType: ticket.ticketType, status: ticket.status,
      createdAt: ticket.createdAt, inspectedAt: ticket.garmentInspection?.inspectedAt,
      technician: ticket.garmentInspection?.inspectedByTechId?.fullName ||
        ticket.garmentInspection?.inspectedByTechId?.username || '',
      totalBatchQty: ticket.garmentInspection?.totalBatchQty || 0,
      passedQty: ticket.garmentInspection?.passedQty || 0,
      failedDefectQty: ticket.garmentInspection?.failedDefectQty || 0,
      qcNote: ticket.garmentInspection?.qcNote || '', defectAction: ticket.defectAction,
      lines: [...lines.values()], receiptId: document ? String(document._id) : null,
      receiptCode: document?.documentCode || '' };
  }) };
}

/** Checks an earlier confirmation without creating inventory during retry backoff.
 * @returns {Promise<{ message: string, data: object }>} */
export async function getConfirmationStatus(body, user, confirmationKey) {
  const prior = await FinishedGoodsBulkDocument.findOne({ confirmationKey }).lean();
  if (prior && (prior.confirmationHash !== confirmationPayloadHash(body) ||
    (user?._id && prior.createdByUserId && String(prior.createdByUserId) !== String(user._id))))
    throw requestError('Mã xác nhận thuộc nội dung khác', 'CONFIRMATION_REUSED', 409);
  if (prior) return { message: 'Phiếu đã được xác nhận',
    data: { document: receiptResponse(prior), matchType: 'CONFIRMATION_KEY', confirmed: true } };
  // A receipt may have reached the server under another local attempt. The source ticket
  // is unique, so this local operation must not be sent again once that ticket is received.
  const sourceTicketId = String(body?.sourceTicketId || '');
  const documentCode = String(body?.documentCode || '').trim().toUpperCase();
  if (body?.direction === 'IN' && mongoose.isValidObjectId(sourceTicketId) && documentCode) {
    const received = await FinishedGoodsBulkDocument.findOne({ sourceTicketId,
      documentCode, direction: 'IN', isDeleted: { $ne: true } }).lean();
    if (received) return { message: 'Lệnh đã có phiếu nhập kho',
      data: { document: receiptResponse(received), matchType: 'SOURCE_TICKET', confirmed: true } };
  }
  return { message: 'Chưa có phiếu được xác nhận với mã này',
    data: { confirmed: false, document: null, code: 'CONFIRMATION_NOT_FOUND' } };
}

/** Placement progress for confirmed receipts from both warehouse types. */
export const listInboundProgress = async () => ({ receipts: await listWarehouseInboundProgress() });

/** The 20 most recent documents with putaway progress (unallocated + pending + placed = total). */
export async function listRecentDocuments() {
  const documents = await FinishedGoodsBulkDocument.find({ isDeleted: { $ne: true } })
    .sort({ createdAt: -1 }).limit(20).lean();
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
  return { documents: documents.map((document) => ({
    id: String(document._id), documentCode: document.documentCode, direction: document.direction,
    totalQuantity: document.totalQuantity, createdAt: document.createdAt,
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
  })) };
}

/** Unit labels of one receipt; each image is rendered from the stored barcode at request time. */
export async function getDocumentBarcodes(documentId) {
  assertObjectId(documentId, 'Mã phiếu không hợp lệ', 'INVALID_DOCUMENT');
  const document = await FinishedGoodsBulkDocument.findOne({ _id: documentId, direction: 'IN', isDeleted: { $ne: true } })
    .select('documentCode totalQuantity items').lean();
  if (!document) throw requestError('Không tìm thấy phiếu nhập', 'DOCUMENT_NOT_FOUND', 404);
  const units = await ProductUnit.find({ receivingDocumentId: document._id })
    .select('barcode skuId batchId').sort({ createdAt: 1 }).lean();
  return { documentCode: document.documentCode,
    total: units.length,
    labels: units.map((unit) => ({ barcode: unit.barcode, imageUrl: code128DataUrl(unit.barcode),
      skuId: String(unit.skuId), batchId: String(unit.batchId) })) };
}

/** Receipts with units still in staging that are not yet allocated to a bin
 * (unallocated = units in staging - allocated but not placed). */
export async function listPendingAllocation() {
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
  return { receipts: receipts.map((receipt) => ({
    id: String(receipt._id), documentCode: receipt.documentCode,
    unallocated: Math.max(0, (sourceCounts.get(String(receipt._id)) || 0) - (assigned.get(String(receipt._id)) || 0)),
  })).filter((receipt) => receipt.unallocated > 0) };
}

/** A document with per-SKU putaway progress: accepted, unallocated, pending and placed, plus allocation rows. */
export async function getDocumentProgress(documentId) {
  assertObjectId(documentId, 'Mã phiếu không hợp lệ', 'INVALID_DOCUMENT');
  const document = await FinishedGoodsBulkDocument.findOne({ _id: documentId, isDeleted: { $ne: true } }).lean();
  if (!document) throw requestError('Không tìm thấy phiếu', 'DOCUMENT_NOT_FOUND', 404);
  const allocations = await PutawayAllocation.find({ sourceReceiptId: document._id, status: 'CONFIRMED' })
    .select('allocationCode lines').populate('lines.targetLocationId', 'locationCode rackCode floorNo binNo').lean();
  return { document: receiptResponse(document),
    progress: document.items.map((item) => {
      const rows = allocations.flatMap((allocation) => allocation.lines.filter((line) =>
        String(line.skuId) === String(item.skuId)).map((line) => ({ allocationCode: allocation.allocationCode,
        location: line.targetLocationId, allocated: line.allocatedQuantity,
        pending: remainingQuantity(line), placed: line.placedQuantity || 0 })));
      return { skuId: String(item.skuId), accepted: item.quantity,
        unallocated: Math.max(0, item.quantity - rows.reduce((sum, row) => sum + row.pending + row.placed, 0)),
        pending: rows.reduce((sum, row) => sum + row.pending, 0),
        placed: rows.reduce((sum, row) => sum + row.placed, 0), rows };
    }) };
}

/* ---------------------------------------------------------------- Outbound picking */

/** Adds product, SKU and a current shelf location to each outbound line. */
async function populateOutboundDocument(doc) {
  const docObj = doc.toObject ? doc.toObject() : doc;
  const skuIds = (docObj.items || []).map((it) => it.skuId);
  const skus = await Sku.find({ _id: { $in: skuIds } }).select('skuCode skuBarcode color size productId').lean();
  const products = await Product.find({ _id: { $in: skus.map((s) => s.productId) } }).select('productName productCode thumbnailUrl').lean();
  const units = await ProductUnit.find({ skuId: { $in: skuIds }, inventoryStatus: 'AVAILABLE' })
    .populate('warehouseId', 'locationCode rackCode floorNo binNo').limit(50).lean();
  const bySku = new Map(skus.map((s) => [String(s._id), s]));
  const byProduct = new Map(products.map((p) => [String(p._id), p]));
  const locBySku = new Map();
  for (const u of units) {
    const k = String(u.skuId);
    if (!locBySku.has(k) && u.warehouseId) locBySku.set(k, u.warehouseId);
  }
  const items = (docObj.items || []).map((line) => {
    const sku = bySku.get(String(line.skuId));
    const product = byProduct.get(String(sku?.productId || line.productId));
    const loc = locBySku.get(String(line.skuId));
    return {
      productId: String(line.productId || sku?.productId || ''),
      productName: product?.productName || '',
      productCode: product?.productCode || '',
      thumbnailUrl: product?.thumbnailUrl || null,
      skuId: String(line.skuId),
      skuCode: sku?.skuCode || '',
      skuBarcode: sku?.skuBarcode || '',
      color: sku?.color || '',
      size: sku?.size || '',
      quantity: line.quantity,
      scannedQty: line.scannedQty || 0,
      scannedBarcodes: line.scannedBarcodes || [],
      location: loc ? { locationCode: loc.locationCode, rackCode: loc.rackCode, floorNo: loc.floorNo, binNo: loc.binNo } : null,
      isCompleted: (line.scannedQty || 0) >= line.quantity,
    };
  });
  const totalScannedQty = items.reduce((sum, it) => sum + (it.scannedQty || 0), 0);
  const isAllScanned = items.length > 0 && items.every((it) => it.isCompleted);
  return {
    id: String(docObj._id),
    _id: String(docObj._id),
    documentCode: docObj.documentCode,
    code: docObj.documentCode,
    direction: docObj.direction,
    status: docObj.status || 'WAITING_PICKING',
    recipient: docObj.recipient || '',
    note: docObj.note || '',
    createdAt: docObj.createdAt,
    totalQuantity: docObj.totalQuantity,
    totalScannedQty,
    isAllScanned,
    items,
    lines: items.map((it) => ({ code: it.skuCode, name: it.productName, quantity: it.quantity, scannedQty: it.scannedQty })),
  };
}

const findOutboundDocument = async (documentId, lean = false) => {
  assertObjectId(documentId, 'Mã yêu cầu không hợp lệ', 'INVALID_ID');
  const query = FinishedGoodsBulkDocument.findOne({ _id: documentId, direction: 'OUT', isDeleted: { $ne: true } });
  const document = await (lean ? query.lean() : query);
  if (!document) throw requestError('Không tìm thấy yêu cầu xuất kho', 'DOCUMENT_NOT_FOUND', 404);
  return document;
};

export async function listOutboundDocuments() {
  const documents = await FinishedGoodsBulkDocument.find({ direction: 'OUT', isDeleted: { $ne: true } })
    .sort({ createdAt: -1 }).lean();
  return { documents: await Promise.all(documents.map(populateOutboundDocument)) };
}

export async function getOutboundDocument(documentId) {
  return { document: await populateOutboundDocument(await findOutboundDocument(documentId, true)) };
}

/** Records one picked unit. A unit barcode must belong to a requested SKU; a SKU barcode or code picks the
 * next available unit of that SKU. @returns {Promise<{ message: string, data: object }>} */
export async function scanOutboundBarcode(documentId, rawBarcode) {
  const document = await findOutboundDocument(documentId);
  if (document.status === 'COMPLETED') throw requestError('Yêu cầu xuất kho này đã hoàn tất', 'ALREADY_COMPLETED');
  if (document.status === 'CANCELLED') throw requestError('Yêu cầu xuất kho này đã bị hủy', 'CANCELLED');
  if (document.items.some((line) => line.scannedBarcodes?.includes(rawBarcode))) {
    throw requestError(`Mã tem ${rawBarcode} đã được quét trong yêu cầu này rồi`, 'ALREADY_SCANNED');
  }
  let matchedLine = null;
  let registeredBarcode = rawBarcode;
  let matchedSku = null;
  const matchedUnit = await ProductUnit.findOne({ barcode: rawBarcode, inventoryStatus: 'AVAILABLE' });
  if (matchedUnit) {
    matchedLine = document.items.find((line) => String(line.skuId) === String(matchedUnit.skuId));
    if (!matchedLine) throw requestError(`Sản phẩm quét (${rawBarcode}) không thuộc danh sách yêu cầu xuất kho này`, 'SKU_NOT_IN_REQUEST');
    matchedSku = await Sku.findById(matchedUnit.skuId).select('skuCode color size').lean();
  } else {
    const sku = await Sku.findOne({
      $or: [{ skuBarcode: rawBarcode }, { skuCode: { $regex: new RegExp(`^${rawBarcode}$`, 'i') } }],
      isDeleted: { $ne: true },
    }).lean();
    if (sku) {
      matchedLine = document.items.find((line) => String(line.skuId) === String(sku._id));
      if (!matchedLine) throw requestError(`SKU ${sku.skuCode} không thuộc danh sách yêu cầu xuất kho này`, 'SKU_NOT_IN_REQUEST');
      matchedSku = sku;
      const allScannedBarcodes = document.items.flatMap((l) => l.scannedBarcodes || []);
      const availableUnit = await ProductUnit.findOne({ skuId: sku._id, inventoryStatus: 'AVAILABLE',
        barcode: { $nin: allScannedBarcodes } }).lean();
      if (availableUnit) registeredBarcode = availableUnit.barcode;
    }
  }
  if (!matchedLine) throw requestError(`Không tìm thấy sản phẩm khả dụng với mã: ${rawBarcode}`, 'BARCODE_NOT_FOUND', 404);
  if ((matchedLine.scannedQty || 0) >= matchedLine.quantity) {
    throw requestError(`Mặt hàng ${matchedSku?.skuCode || 'này'} đã quét đủ số lượng (${matchedLine.quantity} chiếc)`, 'QUANTITY_REACHED');
  }
  matchedLine.scannedQty = (matchedLine.scannedQty || 0) + 1;
  if (!matchedLine.scannedBarcodes) matchedLine.scannedBarcodes = [];
  matchedLine.scannedBarcodes.push(registeredBarcode);
  document.status = 'PICKING';
  await document.save();
  return { message: `Đã quét thành công ${matchedSku?.skuCode || registeredBarcode}`, data: {
    document: await populateOutboundDocument(document),
    scannedBarcode: registeredBarcode,
    matchedSku: matchedSku?.skuCode,
    lineScanned: matchedLine.scannedQty,
    lineTotal: matchedLine.quantity,
  } };
}

/** Removes an accidental scan, by barcode or the last scan of a SKU. */
export async function removeOutboundScan(documentId, rawBarcode, skuId) {
  const document = await findOutboundDocument(documentId);
  if (document.status === 'COMPLETED') throw requestError('Yêu cầu xuất kho này đã hoàn tất', 'ALREADY_COMPLETED');
  let modified = false;
  for (const line of document.items) {
    if (skuId && String(line.skuId) !== skuId) continue;
    if (rawBarcode) {
      const idx = (line.scannedBarcodes || []).indexOf(rawBarcode);
      if (idx !== -1) {
        line.scannedBarcodes.splice(idx, 1);
        line.scannedQty = Math.max(0, (line.scannedQty || 1) - 1);
        modified = true;
        break;
      }
    } else if (skuId && (line.scannedQty || 0) > 0) {
      line.scannedQty = Math.max(0, line.scannedQty - 1);
      if (line.scannedBarcodes?.length) line.scannedBarcodes.pop();
      modified = true;
      break;
    }
  }
  if (!modified) throw requestError('Không tìm thấy mã vạch để hủy trong danh sách đã quét', 'SCAN_NOT_FOUND', 404);
  if (document.items.reduce((s, l) => s + (l.scannedQty || 0), 0) === 0) document.status = 'WAITING_PICKING';
  await document.save();
  return { document: await populateOutboundDocument(document) };
}

/** Dispatches the scanned units: lowers stock, records transactions and marks the units as gone.
 * @returns {Promise<{ message: string, data: object }>} */
export async function confirmOutboundDispatch(documentId, user) {
  const document = await findOutboundDocument(documentId);
  if (document.status === 'COMPLETED') {
    throw requestError('Yêu cầu xuất kho này đã được hoàn tất trước đó', 'ALREADY_COMPLETED');
  }
  const totalScanned = document.items.reduce((sum, item) => sum + (item.scannedQty || 0), 0);
  if (totalScanned === 0) {
    throw requestError('Chưa quét sản phẩm nào. Vui lòng quét mã sản phẩm trước khi xuất kho', 'NOTHING_SCANNED');
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const allBarcodesToMark = [];
      for (const line of document.items) {
        const qtyToDeduct = line.scannedQty || 0;
        if (qtyToDeduct <= 0) continue;
        const sku = await Sku.findById(line.skuId).session(session);
        if (!sku) throw requestError('Không tìm thấy SKU trong hệ thống', 'SKU_NOT_FOUND', 404);
        const before = sku.onHandQty || 0;
        const updated = await Sku.findOneAndUpdate({ _id: sku._id }, { $inc: { onHandQty: -qtyToDeduct } }, { new: true, session });
        if (!updated) throw requestError('Tồn kho đã thay đổi, vui lòng thử lại', 'STOCK_CHANGED', 409);
        await InventoryTransaction.create([{
          transactionCode: `FGM-${randomUUID()}`,
          warehouseType: 'FINISHED_GOODS',
          itemType: 'FINISHED_SKU',
          skuId: sku._id,
          transactionType: 'MANUAL_OUTBOUND',
          referenceModel: 'FinishedGoodsBulkDocument',
          referenceId: document._id,
          quantityChange: -qtyToDeduct,
          onHandBefore: before,
          onHandAfter: updated.onHandQty,
          unitCostSnapshot: sku.unitCogs || 0,
          totalValueSnapshot: qtyToDeduct * (sku.unitCogs || 0),
          performedByUserId: user?._id || document.createdByUserId,
          note: document.note || `Xuất kho thành phẩm theo yêu cầu ${document.documentCode}`,
        }], { session });
        if (line.scannedBarcodes?.length) allBarcodesToMark.push(...line.scannedBarcodes);
      }
      if (allBarcodesToMark.length > 0) {
        await ProductUnit.updateMany({ barcode: { $in: allBarcodesToMark } },
          { $set: { inventoryStatus: 'UNAVAILABLE', packedAt: new Date() } }, { session });
      }
      document.status = 'COMPLETED';
      await document.save({ session });
    });
  } finally { await session.endSession(); }
  publishRealtime('finished-goods:changed', {
    warehouseType: 'FINISHED_GOODS', direction: 'OUT', status: 'COMPLETED',
    documentId: String(document._id), documentCode: document.documentCode,
    totalQuantity: totalScanned, skuIds: document.items.map((i) => String(i.skuId)),
  });
  return { message: `Đã xuất kho thành công ${totalScanned} sản phẩm thành phẩm`,
    data: { document: await populateOutboundDocument(document) } };
}

/* ---------------------------------------------------------------- Shelf allocation */

/** Reserves shelf bins for a receipt. A repeated idempotency key returns the first allocation.
 * @returns {Promise<{ allocation: object, created: boolean }>} */
export async function confirmAllocation(documentId, key, body, user) {
  let session;
  try {
    const lines = parseLines(body?.lines);
    const hash = fingerprint(lines);
    const prior = await PutawayAllocation.findOne({ idempotencyKey: key }).lean();
    if (prior) {
      if (String(prior.sourceReceiptId) === documentId && prior.confirmationHash === hash) return { allocation: prior, created: false };
      throw requestError('Khóa phân bổ đã dùng cho nội dung khác', 'ALLOCATION_REUSED', 409);
    }
    session = await mongoose.startSession();
    let allocation;
    await session.withTransaction(async () => {
      allocation = await confirmReceiptAllocation(user, documentId, lines, session, key);
    });
    publishRealtime('warehouse-putaway:changed', { warehouseType: 'FINISHED_GOODS',
      receiptId: documentId, allocationId: String(allocation._id), reason: 'ALLOCATION_CONFIRMED' });
    return { allocation, created: true };
  } catch (error) {
    if (error.code === 11000) {
      const prior = await PutawayAllocation.findOne({ idempotencyKey: key }).lean();
      if (prior && String(prior.sourceReceiptId) === documentId &&
        prior.confirmationHash === fingerprint(parseLines(body?.lines))) return { allocation: prior, created: false };
    }
    if (error.status) throw error;
    if (isTransactionConflict(error)) throw requestError('Sức chứa vừa thay đổi; hãy kiểm tra lại', 'STOCK_CHANGED', 409);
    if (error.code === 11000) throw requestError('Phân bổ vừa được xác nhận; hãy tải lại', 'ALLOCATION_CHANGED', 409);
    throw error;
  } finally { if (session) await session.endSession(); }
}

/* ---------------------------------------------------------------- Receiving and bulk outbound requests */

/** Validates a receipt against its technician ticket, which must still wait for the warehouse. */
async function loadTechnicalTicket(input) {
  if (!mongoose.isValidObjectId(input.sourceTicketId))
    throw requestError('Chỉ nhập kho từ lệnh của nhân viên kỹ thuật', 'TECHNICAL_REQUEST_REQUIRED');
  const sourceTicket = await FinishedGoodsTicket.findOne({ _id: input.sourceTicketId,
    ticketType: { $in: TECHNICAL_TICKET_TYPES }, status: 'READY_TO_CONFIRM', isDeleted: { $ne: true } }).lean();
  if (!sourceTicket) throw requestError('Lệnh kỹ thuật không còn chờ nhập kho', 'TECHNICAL_REQUEST_UNAVAILABLE', 409);
  assertMatchesTechnicalTicket(sourceTicket, input);
  if (await FinishedGoodsBulkDocument.exists({ sourceTicketId: sourceTicket._id }))
    throw requestError('Lệnh kỹ thuật đã có phiếu nhập kho', 'REQUEST_ALREADY_RECEIVED', 409);
  return sourceTicket;
}

/** Resolves a line's product and SKU inside the transaction. */
async function resolveLineSku(item, session, resolvedSkus) {
  const product = await Product.findOne({ _id: item.productId, isDeleted: { $ne: true } }).session(session);
  if (!product) throw requestError('Không tìm thấy sản phẩm trong phiếu', 'PRODUCT_NOT_FOUND', 404);
  if (!product.isActive) throw requestError(`Sản phẩm ${product.productCode} đang ở trạng thái nháp`, 'PRODUCT_INACTIVE', 409);
  let sku;
  if (item.skuId) {
    sku = await Sku.findOne({ _id: item.skuId, productId: product._id, isDeleted: { $ne: true } }).session(session);
  } else {
    const existing = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).limit(2).session(session);
    if (existing.length > 1) throw requestError(`Hãy chọn SKU cho ${product.productCode}`, 'SKU_REQUIRED');
    if (existing.length === 1) [sku] = existing;
  }
  if (!sku) throw requestError(`Không tìm thấy SKU cho ${product.productCode}`, 'SKU_NOT_FOUND', 404);
  if (!sku.isActive) throw requestError(`SKU ${sku.skuCode} đã ngừng sử dụng`, 'SKU_INACTIVE', 409);
  if (resolvedSkus.has(String(sku._id))) throw requestError(`SKU ${sku.skuCode} bị lặp trong phiếu`, 'DUPLICATE_LINE');
  resolvedSkus.add(String(sku._id));
  return { product, sku };
}

/** Receives one line: raises stock and issues one barcode, one batch and product units for the accepted quantity. */
async function receiveLine({ product, sku }, item, { documentId, location, note, user }, session) {
  const quantity = Number(item.quantity);
  const before = sku.onHandQty || 0;
  const updated = quantity === 0 ? sku
    : await Sku.findOneAndUpdate({ _id: sku._id }, { $inc: { onHandQty: quantity } }, { new: true, session });
  if (!updated) throw requestError('Tồn kho đã thay đổi, hãy thử lại', 'STOCK_CHANGED', 409);
  if (quantity !== 0) await InventoryTransaction.create([{
    transactionCode: `FGM-${randomUUID()}`, warehouseType: 'FINISHED_GOODS', itemType: 'FINISHED_SKU',
    skuId: sku._id, transactionType: 'MANUAL_INBOUND',
    referenceModel: 'FinishedGoodsBulkDocument', referenceId: documentId,
    locationId: location._id,
    quantityChange: quantity, onHandBefore: before, onHandAfter: updated.onHandQty,
    unitCostSnapshot: sku.unitCogs || 0, totalValueSnapshot: quantity * (sku.unitCogs || 0), performedByUserId: user?._id, note,
  }], { session });
  let barcodes = [];
  if (quantity > 0) {
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
  return { productId: product._id, skuId: sku._id, quantity,
    expectedQty: Number(item.expectedQty),
    receivedQty: Number(item.receivedQty), repairQty: Number(item.receivedQty) - quantity,
    repairStatus: Number(item.receivedQty) > quantity ? 'WAITING_RETURN' : undefined, barcodes };
}

const createdDocumentResponse = (saved, direction) => ({ id: String(saved._id), documentCode: saved.documentCode,
  direction: saved.direction, status: saved.status, recipient: saved.recipient,
  lineCount: saved.items.length, totalQuantity: saved.totalQuantity,
  items: direction === 'IN' ? saved.items.map((item) => ({ skuId: String(item.skuId), barcodes: item.barcodes, expectedQty: item.expectedQty,
    receivedQty: item.receivedQty, acceptedQty: item.quantity, repairQty: item.repairQty,
    repairStatus: item.repairStatus })) : saved.items.map((item) => ({
    skuId: String(item.skuId), quantity: item.quantity, scannedQty: item.scannedQty || 0,
  })) });

/**
 * Confirms a receipt (IN) or creates a bulk outbound request (OUT) in one transaction.
 * The confirmation key is required for both directions. A retry by the same user with an identical payload
 * returns the committed document instead of writing another stock transaction; the same key with other
 * content is rejected.
 * @returns {Promise<{ document: object, created: boolean, direction: string }>}
 */
export async function createBulkDocument(body, user) {
  const input = readBulkDocument(body);
  const { direction, documentCode, note, items, locationId, confirmationKey, allocations } = input;
  // Checks run in a fixed order so the same request always gets the same error.
  assertReceivingLines(input);
  assertConfirmation(input);
  const confirmationHash = confirmationPayloadHash(body);
  const priorResult = (prior) => (prior.confirmationHash === confirmationHash && String(prior.createdByUserId) === String(user._id)
    ? { document: receiptResponse(prior), created: false, direction } : null);
  // Resolve a previously committed attempt before checking mutable stock or bin capacity.
  if (['IN', 'OUT'].includes(direction)) {
    const prior = await FinishedGoodsBulkDocument.findOne({ confirmationKey }).lean();
    if (prior) {
      const replay = priorResult(prior);
      if (replay) return replay;
      throw requestError('Khóa xác nhận đã dùng cho nội dung khác', 'CONFIRMATION_REUSED', 409);
    }
  }
  const sourceTicket = direction === 'IN' ? await loadTechnicalTicket(input) : null;
  assertBulkDocumentShape(input);

  let session;
  try {
    const unplaced = direction === 'IN' && !locationId ? await ensureUnplacedLocation() : null;
    if (direction === 'IN' && !locationId && (!unplaced || unplaced.warehouseType !== 'FINISHED_GOODS' ||
      unplaced.status !== 'ACTIVE' || !unplaced.isSystemUnplaced))
      throw requestError('Nguồn hàng chưa xếp không khả dụng', 'UNPLACED_SOURCE_UNAVAILABLE', 409);
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
      if (direction === 'IN' && !location) throw requestError('Vị trí kho thành phẩm không hợp lệ', 'LOCATION_NOT_FOUND', 404);
      for (const item of items) {
        const resolved = await resolveLineSku(item, session, resolvedSkus);
        const quantity = Number(item.quantity);
        const before = resolved.sku.onHandQty || 0;
        if (direction === 'OUT' && before < quantity) {
          throw requestError(`Tồn kho của ${resolved.sku.skuCode} không đủ (hiện có ${before}, yêu cầu ${quantity})`, 'INSUFFICIENT_STOCK', 409);
        }
        if (direction === 'IN') lines.push(await receiveLine(resolved, item, { documentId, location, note, user }, session));
        // OUT: created as a bulk outbound request for warehouse staff to pick and scan.
        else lines.push({ productId: resolved.product._id, skuId: resolved.sku._id, quantity, scannedQty: 0, scannedBarcodes: [] });
      }
      if (direction === 'IN') {
        const totalAccepted = lines.reduce((sum, line) => sum + line.quantity, 0);
        const updatedLocation = await WarehouseLocation.findOneAndUpdate({
          _id: location._id, $expr: { $gte: [{ $subtract: ['$maxCapacity', { $ifNull: ['$currentOccupancy', 0] }] }, totalAccepted] },
        }, { $inc: { currentOccupancy: totalAccepted } }, { session, new: true });
        if (!updatedLocation) throw requestError('Vị trí kho không đủ sức chứa', 'LOCATION_FULL', 409);
      }
      [saved] = await FinishedGoodsBulkDocument.create([{
        _id: documentId, documentCode, direction, items: lines,
        status: direction === 'OUT' ? 'WAITING_PICKING' : 'COMPLETED',
        recipient: input.recipient,
        ...(direction === 'IN' ? { sourceTicketId: sourceTicket._id, locationId: location._id } : {}),
        // The document and inventory writes share a transaction and one immutable retry identity.
        confirmationKey, confirmationHash,
        totalQuantity: lines.reduce((total, line) => total + line.quantity, 0),
        note, createdByUserId: user?._id || new mongoose.Types.ObjectId(),
      }], { session });
      if (direction === 'IN') {
        const allocationError = receiptAllocationError(lines, allocations);
        if (allocationError) throw requestError(allocationError.message, allocationError.code);
        if (allocations.length) await confirmReceiptAllocation(user, documentId, allocations, session);
        const claimed = await FinishedGoodsTicket.updateOne(
          { _id: sourceTicket._id, ticketType: { $in: TECHNICAL_TICKET_TYPES }, status: 'READY_TO_CONFIRM' },
          { $set: { status: 'COMPLETED' } }, { session });
        if (claimed.matchedCount !== 1) throw requestError('Lệnh kỹ thuật đã được xử lý', 'TECHNICAL_REQUEST_CHANGED', 409);
      }
    });
    const changed = { warehouseType: 'FINISHED_GOODS', direction, documentId: String(saved._id),
      documentCode: saved.documentCode, totalQuantity: saved.totalQuantity, skuIds: saved.items.map((item) => String(item.skuId)) };
    if (direction === 'IN' && saved.totalQuantity > 0) {
      publishRealtime('finished-goods:changed', changed);
      if (allocations.length) publishRealtime('warehouse-putaway:changed', { warehouseType: 'FINISHED_GOODS',
        receiptId: String(saved._id), documentCode: saved.documentCode, reason: 'RECEIPT_AND_ALLOCATION_CONFIRMED' });
    } else if (direction === 'OUT') {
      publishRealtime('finished-goods:changed', { ...changed, status: saved.status });
    }
    return { document: createdDocumentResponse(saved, direction), created: true, direction };
  } catch (error) {
    // A concurrent retry may race the unique index; return the first committed result only if it matches.
    if (error.code === 11000) {
      const prior = await FinishedGoodsBulkDocument.findOne({ confirmationKey }).lean();
      const replay = prior && priorResult(prior);
      if (replay) return replay;
    }
    if (error.status) throw error;
    if (isTransactionConflict(error)) throw requestError('Sức chứa hoặc nguồn hàng vừa thay đổi; hãy kiểm tra lại và thử lại', 'STOCK_CHANGED', 409);
    if (error.code === 11000 && direction === 'IN') throw requestError('Lệnh kỹ thuật đã có phiếu nhập kho', 'REQUEST_ALREADY_RECEIVED', 409);
    if (error.code === 11000) throw requestError('Số chứng từ hoặc mã SKU đã tồn tại', 'DUPLICATE_DOCUMENT_OR_SKU', 409);
    throw error;
  } finally { if (session) await session.endSession(); }
}
