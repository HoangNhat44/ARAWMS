/*
 * File: productDetail.service.js
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Read model for the finished-goods product detail page: product and SKU stock,
 * units currently on shelves, and the inbound receipts confirmed by the warehouse manager
 * together with the barcodes of this product in each receipt.
 */
import mongoose from 'mongoose';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import FinishedGoodsBulkDocument from '../../../models/FinishedGoodsBulkDocument.model.js';
import FinishedGoodsTicket from '../../../models/FinishedGoodsTicket.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import User from '../../../models/User.model.js';
import { code128DataUrl } from '../../../common/services/codeImageRenderer.js';

const id = (value) => String(value || '');
const notFound = (message, code) => Object.assign(new Error(message), { status: 404, code });
const invalid = (message, code) => Object.assign(new Error(message), { status: 400, code });

/** Confirmed finished-goods receipts: created only when the warehouse manager confirms inbound. */
const confirmedReceiptFilter = { direction: 'IN', status: 'COMPLETED', isDeleted: { $ne: true } };

/** Stock that can be picked: batches on usable, non-staging locations minus what is reserved for picking. */
export async function pickableQtyBySku(skuIds) {
  const batches = await FinishedGoodsBatch.find({ skuId: { $in: skuIds },
    currentOnHandQty: { $gt: 0 }, isDefectQuarantine: false, isDeleted: { $ne: true } })
    .select('skuId locationId currentOnHandQty reservedPickQty').lean();
  const locations = await WarehouseLocation.find({ _id: { $in: batches.map((batch) => batch.locationId) },
    warehouseType: 'FINISHED_GOODS', status: { $in: ['ACTIVE', 'FULL'] }, isFrozenForStocktake: false,
    isSystemUnplaced: { $ne: true }, isDeleted: { $ne: true } }).select('_id').lean();
  const usable = new Set(locations.map((location) => id(location._id)));
  const pickable = new Map();
  for (const batch of batches) if (usable.has(id(batch.locationId))) {
    const key = id(batch.skuId);
    pickable.set(key, (pickable.get(key) || 0) + Math.max(0, batch.currentOnHandQty - (batch.reservedPickQty || 0)));
  }
  return pickable;
}

async function loadProduct(productId) {
  if (!mongoose.isValidObjectId(productId)) throw invalid('Mã sản phẩm không hợp lệ', 'INVALID_PRODUCT_ID');
  const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } }).lean();
  if (!product) throw notFound('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND');
  const skus = await Sku.find({ productId: product._id, isDeleted: { $ne: true } }).sort({ color: 1, size: 1 }).lean();
  return { product, skus };
}

/** Product information and per-SKU stock. Version fields are returned for the offline edit queue. */
export async function getProductDetail(productId) {
  const { product, skus } = await loadProduct(productId);
  const pickable = await pickableQtyBySku(skus.map((sku) => sku._id));
  return {
    product: {
      id: id(product._id), productCode: product.productCode, productName: product.productName,
      category: product.category, season: product.season || '', description: product.description || '',
      basePrice: product.basePrice, thumbnailUrl: product.thumbnailUrl || '', videoUrl: product.videoUrl || '',
      additionalImageUrls: product.additionalImageUrls || [], isActive: product.isActive,
      codeLockedAt: product.codeLockedAt || null, version: product.version ?? 0,
    },
    skus: skus.map((sku) => ({
      id: id(sku._id), skuCode: sku.skuCode, color: sku.color, size: sku.size,
      retailPrice: sku.retailPrice, isActive: sku.isActive, discontinuedAt: sku.discontinuedAt || null,
      version: sku.version ?? 0, onHandQty: sku.onHandQty || 0, reservedQty: sku.reservedQty || 0,
      pickableQty: pickable.get(id(sku._id)) || 0,
    })),
  };
}

/** Units in stock (not packed into an order) that sit in a real shelf bin, grouped by SKU and bin,
 * with the barcodes of each group so their labels can be printed.
 * Receiving areas and the virtual FG-UNPLACED location are not shelves. */
export async function getShelfStock(productId) {
  const { skus } = await loadProduct(productId);
  const bins = await WarehouseLocation.find({ warehouseType: 'FINISHED_GOODS', layoutBin: true }).select('_id').lean();
  const rows = await ProductUnit.aggregate([
    { $match: { skuId: { $in: skus.map((sku) => sku._id) }, inventoryStatus: 'AVAILABLE',
      warehouseId: { $in: bins.map((location) => location._id) } } },
    { $group: { _id: { skuId: '$skuId', locationId: '$warehouseId' }, quantity: { $sum: 1 }, barcodes: { $push: '$barcode' } } },
  ]);
  const locations = await WarehouseLocation.find({ _id: { $in: rows.map((row) => row._id.locationId) } })
    .select('locationCode').lean();
  const locationCode = new Map(locations.map((location) => [id(location._id), location.locationCode]));
  const skuById = new Map(skus.map((sku) => [id(sku._id), sku]));
  const items = rows.map((row) => {
    const sku = skuById.get(id(row._id.skuId));
    return { skuId: id(row._id.skuId), skuCode: sku?.skuCode || '', color: sku?.color || '', size: sku?.size || '',
      locationId: id(row._id.locationId), locationCode: locationCode.get(id(row._id.locationId)) || '—',
      quantity: row.quantity, barcodes: [...row.barcodes].sort() };
  }).sort((a, b) => a.skuCode.localeCompare(b.skuCode) || a.locationCode.localeCompare(b.locationCode));
  return { items, total: items.reduce((sum, item) => sum + item.quantity, 0) };
}

/** Confirmed receipts containing this product, newest first. */
export async function listProductReceipts(productId, { page = 1, limit = 10 } = {}) {
  const { product } = await loadProduct(productId);
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 10));
  const filter = { ...confirmedReceiptFilter, 'items.productId': product._id };
  const [total, documents] = await Promise.all([
    FinishedGoodsBulkDocument.countDocuments(filter),
    FinishedGoodsBulkDocument.find(filter).sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize).limit(pageSize)
      .select('documentCode sourceTicketId createdByUserId createdAt items.productId items.quantity').lean(),
  ]);
  const [tickets, users] = await Promise.all([
    FinishedGoodsTicket.find({ _id: { $in: documents.map((doc) => doc.sourceTicketId).filter(Boolean) } })
      .select('ticketCode ticketType').lean(),
    User.find({ _id: { $in: documents.map((doc) => doc.createdByUserId).filter(Boolean) } }).select('fullName').lean(),
  ]);
  const ticketById = new Map(tickets.map((ticket) => [id(ticket._id), ticket]));
  const userName = new Map(users.map((user) => [id(user._id), user.fullName]));
  return {
    receipts: documents.map((doc) => {
      const ticket = ticketById.get(id(doc.sourceTicketId));
      return {
        id: id(doc._id), documentCode: doc.documentCode, confirmedAt: doc.createdAt,
        confirmedBy: userName.get(id(doc.createdByUserId)) || '',
        requestCode: ticket?.ticketCode || '', requestType: ticket?.ticketType || '',
        quantity: doc.items.filter((item) => id(item.productId) === id(product._id))
          .reduce((sum, item) => sum + (item.quantity || 0), 0),
      };
    }),
    total, page: pageNumber, pageSize,
  };
}

/** Barcodes of this product issued by one confirmed receipt, with where each unit is now.
 * Images are not included here; they are rendered only when labels are printed. */
export async function getReceiptUnits(productId, documentId) {
  const { product, skus } = await loadProduct(productId);
  if (!mongoose.isValidObjectId(documentId)) throw invalid('Mã phiếu không hợp lệ', 'INVALID_DOCUMENT');
  const document = await FinishedGoodsBulkDocument.findOne({ _id: documentId, ...confirmedReceiptFilter,
    'items.productId': product._id }).select('documentCode').lean();
  if (!document) throw notFound('Không tìm thấy phiếu nhập đã xác nhận của sản phẩm này', 'DOCUMENT_NOT_FOUND');
  const units = await ProductUnit.find({ receivingDocumentId: document._id, skuId: { $in: skus.map((sku) => sku._id) } })
    .select('barcode skuId warehouseId inventoryStatus packedOrderId').sort({ barcode: 1 }).lean();
  const [locations, orders] = await Promise.all([
    WarehouseLocation.find({ _id: { $in: units.map((unit) => unit.warehouseId) } })
      .select('locationCode layoutBin').lean(),
    SalesOrder.find({ _id: { $in: units.map((unit) => unit.packedOrderId).filter(Boolean) } }).select('orderCode').lean(),
  ]);
  const locationById = new Map(locations.map((location) => [id(location._id), location]));
  const orderCode = new Map(orders.map((order) => [id(order._id), order.orderCode]));
  const skuById = new Map(skus.map((sku) => [id(sku._id), sku]));
  return {
    documentCode: document.documentCode,
    units: units.map((unit) => {
      const sku = skuById.get(id(unit.skuId));
      const location = locationById.get(id(unit.warehouseId));
      // Defective units keep their own status; only other non-available units have left in an order or outbound.
      const status = ['DEFECT_PENDING', 'DEFECTIVE', 'DEFECT_OUT'].includes(unit.inventoryStatus) ? unit.inventoryStatus
        : unit.inventoryStatus !== 'AVAILABLE' ? 'PACKED' : location?.layoutBin ? 'ON_SHELF' : 'UNPLACED';
      return {
        barcode: unit.barcode, status,
        locationCode: status === 'ON_SHELF' ? location?.locationCode || '' : '',
        orderCode: status === 'PACKED' ? orderCode.get(id(unit.packedOrderId)) || '' : '',
        skuId: id(unit.skuId), skuCode: sku?.skuCode || '', color: sku?.color || '', size: sku?.size || '',
        productName: product.productName,
      };
    }),
  };
}

export const MAX_LABELS_PER_PRINT = 500;

/** Renders printable labels for barcodes that belong to this product. Unknown barcodes are rejected. */
export async function renderProductLabels(productId, barcodes) {
  const { product, skus } = await loadProduct(productId);
  const requested = [...new Set((Array.isArray(barcodes) ? barcodes : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!requested.length) throw invalid('Chọn ít nhất một barcode để in', 'NO_BARCODE');
  if (requested.length > MAX_LABELS_PER_PRINT)
    throw invalid(`Mỗi lần in tối đa ${MAX_LABELS_PER_PRINT} tem`, 'TOO_MANY_LABELS');
  const units = await ProductUnit.find({ barcode: { $in: requested }, skuId: { $in: skus.map((sku) => sku._id) } })
    .select('barcode skuId').lean();
  if (units.length !== requested.length) throw invalid('Có barcode không thuộc sản phẩm này', 'BARCODE_NOT_IN_PRODUCT');
  const skuById = new Map(skus.map((sku) => [id(sku._id), sku]));
  const byBarcode = new Map(units.map((unit) => [unit.barcode, unit]));
  return { labels: requested.map((barcode) => {
    const sku = skuById.get(id(byBarcode.get(barcode).skuId));
    return { barcode, imageUrl: code128DataUrl(barcode), productName: product.productName,
      skuCode: sku?.skuCode || '', color: sku?.color || '', size: sku?.size || '' };
  }) };
}
