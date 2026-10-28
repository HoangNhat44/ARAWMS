/*
 * File: orderQrManagement.service.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Looks up real orders and manages their QR tokens.
 */
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import SalesOrder from '../../../models/SalesOrder.model.js';
import Sku from '../../../models/Sku.model.js';
import Product from '../../../models/Product.model.js';
import OrderQrToken from '../../../models/OrderQrToken.js';
import { ensurePackingIndexes } from '../packing-verification/packingIndexes.js';
import { canViewOrder, canIssueQr } from '../../../common/services/orderAccessService.js';
import { uploadOrderQrImage, orderQrImageUrl, removeOrderQrImage } from '../../../common/services/orderQrImageStorage.js';

const QR_PREFIX = 'PACK:v1:';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const blockedStatuses = new Set(['CANCELLED', 'RETURNED']);

/** Generates a QR value carrying only a random 256-bit token. */
export const generateOrderQrValue = () => `${QR_PREFIX}${randomBytes(32).toString('hex')}`;

/** Accepts only the configured QR prefix followed by its token format. */
export const parseQrValue = (value) => {
  if (typeof value !== 'string' || !value.startsWith(QR_PREFIX)) return null;
  const token = value.slice(QR_PREFIX.length);
  return TOKEN_PATTERN.test(token) ? token : null;
};

/** Repairs QR records issued before image storage was introduced. */
async function ensureQrImage(order, record) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!record || record.revokedAt) return { error: 'QR_REVOKED' };
    if (record.qrImagePublicId) return { qrValue: `${QR_PREFIX}${record.token}`,
      qrImageUrl: orderQrImageUrl(record.qrImagePublicId) };
    const publicId = await uploadOrderQrImage(order.orderCode, `${QR_PREFIX}${record.token}`, record.token);
    const updated = await OrderQrToken.findOneAndUpdate(
      { _id: record._id, token: record.token, revokedAt: null,
        $or: [{ qrImagePublicId: null }, { qrImagePublicId: { $exists: false } }] },
      { $set: { qrImagePublicId: publicId } }, { new: true }).select('+token');
    if (updated) return { qrValue: `${QR_PREFIX}${updated.token}`, qrImageUrl: orderQrImageUrl(publicId) };
    record = await OrderQrToken.findById(record._id).select('+token');
  }
  throw new Error('Không thể đồng bộ ảnh QR đơn hàng');
}

/** Projects an order into customer-facing label and packing fields.
 * Resolves display values for SKU lines and omits internal cost and reservation details.
 */
export const publicOrderDetail = (order) => ({
  id: String(order._id),
  orderCode: order.orderCode,
  status: order.status,
  channel: order.channel || null,
  externalOrderNo: order.externalOrderNo || null,
  createdAt: order.createdAt || null,
  confirmedAt: order.confirmedAt || null,
  customer: order.customer ? {
    code: order.customer.code || null,
    name: order.customer.name || null,
    phone: order.customer.phone || null,
  } : null,
  recipientName: order.recipient?.name || order.shippingRecipient?.name || null,
  recipient: (order.recipient || order.shippingRecipient) ? {
    name: (order.recipient || order.shippingRecipient).name,
    phone: (order.recipient || order.shippingRecipient).phone,
    address: order.recipient
      ? [order.recipient.addressLine, order.recipient.ward, order.recipient.district, order.recipient.province].filter(Boolean).join(', ')
      : order.shippingRecipient.address,
  } : null,
  paymentMethod: order.paymentMethod || null,
  paymentStatus: order.paymentStatus || null,
  shipping: order.shipping ? {
    carrierCode: order.shipping.carrierCode || null,
    carrierName: order.shipping.marketplaceCarrierName || null,
    feeCustomer: order.shipping.feeCustomer ?? null,
  } : null,
  amounts: (order.amounts || order.financialSummary) ? {
    subtotal: order.amounts?.subtotal ?? order.financialSummary?.itemsSubtotal ?? null,
    discount: order.amounts?.discount ?? order.financialSummary?.discountAmount ?? null,
    total: order.amounts?.total ?? order.financialSummary?.totalOrderAmount ?? null,
    codAmount: order.amounts?.codAmount ?? order.financialSummary?.expectedCodAmount ?? null,
  } : null,
  items: order.items.map((item) => ({
    skuId: String(item.skuId),
    skuCode: item.skuCode || null,
    name: item.name || order.variantDetails?.[String(item.skuId)]?.productName || null,
    color: order.variantDetails?.[String(item.skuId)]?.color?.name ||
      order.variantDetails?.[String(item.skuId)]?.color || null,
    size: order.variantDetails?.[String(item.skuId)]?.size?.name ||
      order.variantDetails?.[String(item.skuId)]?.size || null,
    quantity: item.quantity ?? item.orderedQty,
    unitPrice: item.unitPrice ?? item.unitSalePrice ?? null,
    discountAmount: item.discountAmount ?? null,
    lineTotal: item.lineTotal ?? ((item.orderedQty != null && item.unitSalePrice != null)
      ? item.orderedQty * item.unitSalePrice : null),
  })),
  note: order.note || null,
  packingStatus: order.warehouseFulfillment?.packagingVideoUrl || order.packing?.videoPublicId
    ? 'VIDEO_SAVED' : order.packing?.isComplete ? 'LEGACY_COMPLETE' : 'NOT_STARTED',
  packagingVideoUrl: order.warehouseFulfillment?.packagingVideoUrl || null,
});

/** Finds an active MongoDB order and enriches its SKU display details. */
export const findOrder = async (idOrCode) => {
  if (typeof idOrCode !== 'string' || !idOrCode.trim()) return null;
  const value = idOrCode.trim();
  const query = mongoose.isValidObjectId(value)
    ? { $or: [{ _id: value }, { orderCode: value }] }
    : { orderCode: value };
  const order = await SalesOrder.findOne({ ...query, isDeleted: { $ne: true } }).lean();
  if (!order) return null;
  const skus = await Sku.find({ _id: { $in: order.items.map((item) => item.skuId) } })
    .select('productId styleName color size').lean();
  const products = await Product.find({ _id: { $in: skus.map((sku) => sku.productId) } })
    .select('productName').lean();
  const names = new Map(products.map((product) => [String(product._id), product.productName]));
  order.variantDetails = Object.fromEntries(skus.map((sku) => [String(sku._id), {
    productName: names.get(String(sku.productId)) || sku.styleName,
    color: sku.color, size: sku.size,
  }]));
  return order;
};

/** Lists only orders visible to the user and marks QR eligibility. */
export const listOrdersForQr = async (user) => {
  const isAdmin = user.roles?.includes('ADMIN');
  const isSales = user.roles?.includes('SALES');
  const isWarehouse = user.roles?.includes('WAREHOUSE_STAFF') || user.roles?.includes('WAREHOUSE_MANAGER');
  const query = isAdmin || isWarehouse ? {} : isSales ? { sellerId: user._id } : null;
  const realOrders = query === null ? [] : await SalesOrder.find({ ...query, isDeleted: { $ne: true } })
    .select('_id orderCode status shippingRecipient.name recipient.name items.quantity items.orderedQty items.fifoPickList.batchId items.fifoPickList.locationId items.fifoPickList.allocatedQty createdAt')
    .sort({ createdAt: -1 }).lean();
  const visibleRealOrders = realOrders.filter((order) => canViewOrder(user, order));
  const tokens = realOrders.length ? await OrderQrToken.find({
    orderId: { $in: visibleRealOrders.map((order) => order._id) }, revokedAt: null,
  }).select('orderId').lean() : [];
  const issuedReal = new Set(tokens.map((token) => String(token.orderId)));
  return visibleRealOrders.map((order) => {
    // ADMIN can issue QR for any eligible status
    // Others must meet canIssueQr requirements + status check
    const eligibleStatus = ['CONFIRMED_RESERVED', 'PICKING', 'PACKED'].includes(order.status);
    const canIssue = isAdmin 
      ? eligibleStatus && !blockedStatuses.has(order.status)
      : canIssueQr(user, order) && eligibleStatus;
    
    return {
      id: String(order._id), orderCode: order.orderCode, status: order.status,
      recipientName: order.recipient?.name || order.shippingRecipient?.name || null,
      itemCount: order.items.reduce((sum, item) => sum + (item.quantity ?? item.orderedQty ?? 0), 0),
      createdAt: order.createdAt, hasQr: issuedReal.has(String(order._id)),
      canIssueQr: canIssue,
    };
  });
};

/** Returns or creates a QR token for a reserved or packed order. */
export const issueQr = async (order, userId) => {
  if (!['CONFIRMED_RESERVED', 'PICKING', 'PACKED'].includes(order.status)) {
    return { error: 'ORDER_NOT_CONFIRMED' };
  }
  const token = generateOrderQrValue().slice(QR_PREFIX.length);
  await ensurePackingIndexes();
  const Model = OrderQrToken;
  const key = { orderId: order._id };
  const insert = { ...key, token, issuedBy: userId };
  try {
    const record = await Model.findOneAndUpdate(
      key,
      { $setOnInsert: insert },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).select('+token');
    if (record.revokedAt) return { error: 'QR_REVOKED' };
    return ensureQrImage(order, record);
  } catch (error) {
    if (error.code !== 11000) throw error;
    const record = await Model.findOne(key).select('+token');
    if (!record || record.revokedAt) return { error: 'QR_REVOKED' };
    return ensureQrImage(order, record);
  }
};

/** Replaces an order token so previously printed QR labels stop resolving. */
export const replaceQr = async (order, userId) => {
  if (!['CONFIRMED_RESERVED', 'PICKING', 'PACKED'].includes(order.status)) {
    return { error: 'ORDER_NOT_CONFIRMED' };
  }
  const token = generateOrderQrValue().slice(QR_PREFIX.length);
  await ensurePackingIndexes();
  const qrValue = `${QR_PREFIX}${token}`;
  const publicId = await uploadOrderQrImage(order.orderCode, qrValue, token);
  let previous;
  try {
    previous = await OrderQrToken.findOneAndUpdate(
      { orderId: order._id },
      { $set: { token, revokedAt: null, issuedBy: userId, qrImagePublicId: publicId } },
      { upsert: true, setDefaultsOnInsert: true }
    ).select('qrImagePublicId');
  } catch (error) {
    await removeOrderQrImage(publicId).catch((cleanupError) =>
      console.error('[Order QR] Could not remove failed upload', cleanupError));
    throw error;
  }
  if (previous?.qrImagePublicId && previous.qrImagePublicId !== publicId) {
    await removeOrderQrImage(previous.qrImagePublicId).catch((error) =>
      console.error('[Order QR] Could not remove replaced image', error));
  }
  return { qrValue, qrImageUrl: orderQrImageUrl(publicId) };
};

/** Resolves a live token to its real order without exposing customer data in the QR.
 * Unknown or revoked tokens and cancelled or returned orders are rejected.
 */
export const resolveQr = async (value) => {
  const token = parseQrValue(value);
  if (!token) return { error: 'INVALID_QR' };
  const record = await OrderQrToken.findOne({ token, revokedAt: null }).select('orderId');
  if (!record) return { error: 'QR_NOT_FOUND' };
  const order = await SalesOrder.findOne({ _id: record.orderId, isDeleted: { $ne: true } }).lean();
  if (!order || blockedStatuses.has(order.status)) return { error: 'ORDER_NOT_PACKABLE' };
  return { order: publicOrderDetail(order) };
};
