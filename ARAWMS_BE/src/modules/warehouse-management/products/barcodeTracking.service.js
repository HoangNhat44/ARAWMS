/*
 * File: barcodeTracking.service.js
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Warehouse-side movement history of one finished-goods unit barcode: entered the
 * warehouse, placed on a shelf, left the warehouse, and re-entered after a return. Only events that
 * happen in the warehouse are reported; customer returns and technician inspection are not.
 *
 * A returned item re-enters under a NEW barcode (issued when the warehouse manager confirms the
 * technician's return inbound request). The link old barcode -> new barcode is not stored, so it is
 * derived: order of the old unit -> return inspections of that order -> return inbound ticket ->
 * confirmed receipt -> units of the same SKU. It is exact only when a single unit can match.
 */
import ProductUnit from '../../../models/ProductUnit.js';
import Sku from '../../../models/Sku.model.js';
import Product from '../../../models/Product.model.js';
import FinishedGoodsBulkDocument from '../../../models/FinishedGoodsBulkDocument.model.js';
import FinishedGoodsTicket from '../../../models/FinishedGoodsTicket.model.js';
import PutawayScanEvent from '../../../models/PutawayScanEvent.model.js';
import CarrierHandover from '../../../models/CarrierHandover.model.js';
import ReturnInspection from '../../../models/ReturnInspection.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import User from '../../../models/User.model.js';

const id = (value) => String(value || '');
const MAX_CHAIN = 5;
const confirmedReceipt = { direction: 'IN', status: 'COMPLETED', isDeleted: { $ne: true } };

const userName = async (userId) => (userId ? (await User.findById(userId).select('fullName').lean())?.fullName || '' : '');
const locationCode = async (locationId) => (locationId
  ? (await WarehouseLocation.findById(locationId).select('locationCode').lean())?.locationCode || '' : '');

/** Receipt that issued this unit, with whether it came from a return inbound request. */
async function receiptOf(unit) {
  if (!unit.receivingDocumentId) return null;
  const document = await FinishedGoodsBulkDocument.findOne({ _id: unit.receivingDocumentId, ...confirmedReceipt })
    .select('documentCode sourceTicketId createdByUserId createdAt').lean();
  if (!document) return null;
  const ticket = document.sourceTicketId
    ? await FinishedGoodsTicket.findById(document.sourceTicketId).select('ticketCode ticketType').lean() : null;
  return { document, ticket, isReturn: ticket?.ticketType === 'INBOUND_FROM_RETURN' };
}

/** Old units (already shipped in an order) that a unit from a return receipt may have replaced. */
async function previousCandidates(unit, receipt) {
  if (!receipt?.isReturn) return [];
  const inspections = await ReturnInspection.find({ inboundTicketId: receipt.ticket._id }).select('orderId').lean();
  if (!inspections.length) return [];
  return ProductUnit.find({ packedOrderId: { $in: inspections.map((item) => item.orderId) }, skuId: unit.skuId,
    _id: { $ne: unit._id } }).select('barcode').lean();
}

/** Units issued when the warehouse confirmed the return of this unit's order (same SKU). */
async function nextCandidates(unit) {
  if (!unit.packedOrderId) return { receipt: null, units: [] };
  const inspections = await ReturnInspection.find({ orderId: unit.packedOrderId, inboundTicketId: { $ne: null } })
    .select('inboundTicketId').lean();
  if (!inspections.length) return { receipt: null, units: [] };
  const receipt = await FinishedGoodsBulkDocument.findOne({ ...confirmedReceipt,
    sourceTicketId: { $in: inspections.map((item) => item.inboundTicketId) } })
    .sort({ createdAt: 1 }).select('documentCode createdAt createdByUserId').lean();
  if (!receipt) return { receipt: null, units: [] };
  const units = await ProductUnit.find({ receivingDocumentId: receipt._id, skuId: unit.skuId }).select('barcode').lean();
  return { receipt, units };
}

/** Events of one barcode inside the warehouse, oldest first. */
async function unitEvents(unit, receipt) {
  const events = [];
  if (receipt) {
    events.push({ type: receipt.isReturn ? 'REENTRY' : 'IN', at: receipt.document.createdAt,
      title: receipt.isReturn ? 'Vào lại kho (hàng hoàn)' : 'Vào kho',
      details: [`Phiếu nhập ${receipt.document.documentCode}`,
        receipt.ticket ? `Lệnh nhập ${receipt.ticket.ticketCode}` : null,
        `Quản lý kho duyệt: ${await userName(receipt.document.createdByUserId) || '—'}`].filter(Boolean) });
  } else {
    events.push({ type: 'IN', at: unit.createdAt, title: 'Vào kho', details: ['Dữ liệu cũ, không có phiếu nhập'] });
  }
  const scans = await PutawayScanEvent.find({ productUnitId: unit._id }).sort({ createdAt: 1 }).lean();
  for (const scan of scans) {
    events.push({ type: 'PUTAWAY', at: scan.createdAt, title: 'Xếp lên kệ',
      details: [`Kệ ${await locationCode(scan.targetLocationId) || '—'}`, `Nhân viên kho: ${await userName(scan.actorId) || '—'}`] });
  }
  if (unit.inventoryStatus !== 'AVAILABLE') {
    if (unit.packedOrderId) {
      const order = await SalesOrder.findById(unit.packedOrderId).select('orderCode').lean();
      events.push({ type: 'OUT', at: unit.packedAt, title: 'Ra kho · Đóng vào đơn',
        details: [`Đơn ${order?.orderCode || '—'}`], orderCode: order?.orderCode || '' });
      const handover = await CarrierHandover.findOne({ orderId: unit.packedOrderId, 'packedUnitsSnapshot.barcode': unit.barcode })
        .select('waybillCode scannedAt scannedByName').lean();
      if (handover) events.push({ type: 'HANDOVER', at: handover.scannedAt, title: 'Bàn giao vận chuyển',
        details: [`Vận đơn ${handover.waybillCode}`, handover.scannedByName ? `Người bàn giao: ${handover.scannedByName}` : null].filter(Boolean) });
    } else {
      const outbound = await FinishedGoodsBulkDocument.findOne({ direction: 'OUT', 'items.scannedBarcodes': unit.barcode })
        .select('documentCode recipient').lean();
      events.push({ type: 'OUT', at: unit.packedAt, title: 'Ra kho · Xuất kho theo phiếu',
        details: [outbound ? `Phiếu xuất ${outbound.documentCode}` : 'Phiếu xuất không xác định',
          outbound?.recipient ? `Người nhận: ${outbound.recipient}` : null].filter(Boolean) });
    }
  }
  return events;
}

async function currentState(unit) {
  if (unit.inventoryStatus !== 'AVAILABLE') return { code: 'OUT', label: 'Đã ra kho' };
  const location = await WarehouseLocation.findById(unit.warehouseId).select('locationCode layoutBin').lean();
  return location?.layoutBin ? { code: 'ON_SHELF', label: `Trên kệ ${location.locationCode}` }
    : { code: 'UNPLACED', label: 'Chờ xếp kệ' };
}

/** Full warehouse history of a barcode, following returns to the barcode issued on re-entry. */
export async function getBarcodeTimeline(rawBarcode) {
  const barcode = String(rawBarcode || '').trim();
  if (!barcode) throw Object.assign(new Error('Nhập hoặc quét barcode sản phẩm'), { status: 400, code: 'NO_BARCODE' });
  const found = await ProductUnit.findOne({ barcode }).lean()
    || await ProductUnit.findOne({ barcode: barcode.toUpperCase() }).lean();
  if (!found) throw Object.assign(new Error(`Không tìm thấy barcode sản phẩm ${barcode}`), { status: 404, code: 'BARCODE_NOT_FOUND' });

  // Walk back to earlier barcodes of the same item while the link is unambiguous.
  const chain = [found];
  const notes = [];
  while (chain.length < MAX_CHAIN) {
    const head = chain[0];
    const candidates = await previousCandidates(head, await receiptOf(head));
    if (candidates.length > 1) notes.push(`Barcode ${head.barcode} được cấp khi vào lại kho; không xác định được barcode trước đó (một trong: ${candidates.map((item) => item.barcode).join(', ')}).`);
    if (candidates.length !== 1) break;
    chain.unshift(await ProductUnit.findById(candidates[0]._id).lean());
  }

  // Walk forward from the searched barcode, following each re-entry to the barcode issued for it.
  let reentryPending = null;
  while (chain.length < MAX_CHAIN) {
    const next = await nextCandidates(chain[chain.length - 1]);
    if (!next.units.length) break;
    if (next.units.length > 1) { reentryPending = next; break; }
    chain.push(await ProductUnit.findById(next.units[0]._id).lean());
  }

  const segments = [];
  for (const unit of chain) {
    segments.push({ barcode: unit.barcode, searched: unit.barcode === found.barcode,
      events: await unitEvents(unit, await receiptOf(unit)) });
  }
  if (reentryPending) {
    segments[segments.length - 1].events.push({ type: 'REENTRY', at: reentryPending.receipt.createdAt,
      title: 'Vào lại kho (hàng hoàn)',
      details: [`Phiếu nhập ${reentryPending.receipt.documentCode}`,
        `Quản lý kho duyệt: ${await userName(reentryPending.receipt.createdByUserId) || '—'}`,
        'Được cấp barcode mới, là một trong các barcode bên dưới'],
      candidateBarcodes: reentryPending.units.map((item) => item.barcode) });
  }

  const last = chain[chain.length - 1];
  const sku = await Sku.findById(found.skuId).select('skuCode color size productId').lean();
  const product = sku ? await Product.findById(sku.productId).select('productCode productName').lean() : null;
  return {
    barcode: found.barcode,
    product: { id: id(product?._id), productCode: product?.productCode || '', productName: product?.productName || '',
      skuCode: sku?.skuCode || '', color: sku?.color || '', size: sku?.size || '' },
    current: reentryPending
      ? { barcode: last.barcode, code: 'REENTERED_UNKNOWN', label: `Đã vào lại kho qua phiếu ${reentryPending.receipt.documentCode}, barcode mới chưa xác định` }
      : { barcode: last.barcode, ...(await currentState(last)) },
    segments, notes,
  };
}

