import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import SalesOrder from '../../../models/SalesOrder.model.js';
import Sku from '../../../models/Sku.model.js';
import OrderQrToken from '../../../models/OrderQrToken.js';
import DemoOrderQrToken from '../../../models/DemoOrderQrToken.js';
import PackingSession from '../../../models/PackingSession.js';
import { findDemoOrder, listDemoOrders } from '../../../common/services/demoOrderService.js';
import { ensurePackingIndexes } from '../packing-verification/packingIndexes.js';
import { canViewOrder, canIssueQr } from '../../../common/services/orderAccessService.js';

const QR_PREFIX = 'PACK:v1:';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const blockedStatuses = new Set(['CANCELLED', 'RETURNED']);

export const newQrValue = () => `${QR_PREFIX}${randomBytes(32).toString('hex')}`;

export const parseQrValue = (value) => {
  if (typeof value !== 'string' || !value.startsWith(QR_PREFIX)) return null;
  const token = value.slice(QR_PREFIX.length);
  return TOKEN_PATTERN.test(token) ? token : null;
};

export const publicOrderDetail = (order) => order.demoOnly ? ({
  id: order.id,
  orderCode: order.orderCode,
  status: order.packingVideoUrl ? 'PACKED' : order.status,
  channel: null,
  externalOrderNo: null,
  createdAt: null,
  confirmedAt: null,
  customer: null,
  recipientName: null,
  recipient: null,
  paymentMethod: null,
  paymentStatus: null,
  shipping: null,
  amounts: null,
  items: order.items.map((item) => ({
    skuId: null,
    skuCode: item.sku,
    name: [item.productName, item.color, item.size].filter(Boolean).join(' · '),
    quantity: item.quantity,
  })),
  note: null,
  packingStatus: order.packingVideoUrl ? 'VIDEO_SAVED' : 'DEMO_NOT_STARTED',
  packagingVideoUrl: order.packingVideoUrl || null,
  demoOnly: true,
}) : ({
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
    color: order.variantDetails?.[String(item.skuId)]?.color?.name || null,
    size: order.variantDetails?.[String(item.skuId)]?.size?.name || null,
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
  demoOnly: false,
});

export const findOrder = async (idOrCode) => {
  if (typeof idOrCode !== 'string' || !idOrCode.trim()) return null;
  const value = idOrCode.trim();
  const demoOrder = await findDemoOrder(value);
  if (demoOrder) {
    const packing = await PackingSession.findOne({ sourceType: 'DEMO', orderKey: demoOrder.id })
      .select('video.url').lean();
    return { ...demoOrder, packingVideoUrl: packing?.video?.url || null };
  }
  const query = mongoose.isValidObjectId(value)
    ? { $or: [{ _id: value }, { orderCode: value }] }
    : { orderCode: value };
  const order = await SalesOrder.findOne(query).lean();
  if (!order) return null;
  const skus = await Sku.find({ _id: { $in: order.items.map((item) => item.skuId) } })
    .select('productName color size').lean();
  order.variantDetails = Object.fromEntries(skus.map((sku) => [String(sku._id), sku]));
  return order;
};

export const listOrdersForQr = async (user) => {
  const isAdmin = user.roles?.includes('ADMIN');
  const isSales = user.roles?.includes('SALES');
  const isWarehouse = user.roles?.includes('WAREHOUSE_STAFF') || user.roles?.includes('WAREHOUSE_MANAGER');
  const query = isAdmin || isWarehouse ? {} : isSales ? { sellerId: user._id } : null;
  const realOrders = query === null ? [] : await SalesOrder.find(query)
    .select('_id orderCode status shippingRecipient.name recipient.name items.quantity items.orderedQty items.reservation.warehouseId items.fifoPickList.locationId createdAt')
    .sort({ createdAt: -1 }).lean();
  const visibleRealOrders = realOrders.filter((order) => canViewOrder(user, order));
  const tokens = realOrders.length ? await OrderQrToken.find({
    orderId: { $in: visibleRealOrders.map((order) => order._id) }, revokedAt: null,
  }).select('orderId').lean() : [];
  const demoOrders = isAdmin || isSales || isWarehouse ? await listDemoOrders() : [];
  const completedDemoSessions = demoOrders.length ? await PackingSession.find({
    sourceType: 'DEMO', orderKey: { $in: demoOrders.map((order) => order.id) }, 'video.publicId': { $exists: true },
  }).select('orderKey').lean() : [];
  const packedDemoIds = new Set(completedDemoSessions.map((session) => session.orderKey));
  const demoTokens = demoOrders.length ? await DemoOrderQrToken.find({
    demoOrderId: { $in: demoOrders.map((order) => order.id) }, revokedAt: null,
  }).select('demoOrderId').lean() : [];
  const issuedReal = new Set(tokens.map((token) => String(token.orderId)));
  const issuedDemo = new Set(demoTokens.map((token) => token.demoOrderId));
  return [
    ...visibleRealOrders.map((order) => ({
      id: String(order._id), orderCode: order.orderCode, status: order.status,
      recipientName: order.recipient?.name || order.shippingRecipient?.name || null,
      itemCount: order.items.reduce((sum, item) => sum + (item.quantity ?? item.orderedQty ?? 0), 0),
      createdAt: order.createdAt, demoOnly: false, hasQr: issuedReal.has(String(order._id)),
      canIssueQr: canIssueQr(user, order) && ['CONFIRMED', 'CONFIRMED_RESERVED', 'PICKING', 'PACKED'].includes(order.status),
    })),
    ...demoOrders.map((order) => ({
      id: order.id, orderCode: order.orderCode, status: packedDemoIds.has(order.id) ? 'PACKED' : order.status,
      recipientName: null,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      createdAt: null, demoOnly: true, hasQr: issuedDemo.has(order.id),
      canIssueQr: canIssueQr(user, order) && !blockedStatuses.has(order.status),
    })),
  ];
};

export const issueQr = async (order, userId) => {
  if (order.demoOnly ? blockedStatuses.has(order.status) : !['CONFIRMED', 'CONFIRMED_RESERVED', 'PICKING', 'PACKED'].includes(order.status)) {
    return { error: 'ORDER_NOT_CONFIRMED' };
  }
  const token = newQrValue().slice(QR_PREFIX.length);
  await ensurePackingIndexes();
  const Model = order.demoOnly ? DemoOrderQrToken : OrderQrToken;
  const key = order.demoOnly ? { demoOrderId: order.id } : { orderId: order._id };
  const insert = { ...key, token, issuedBy: userId };
  try {
    const record = await Model.findOneAndUpdate(
      key,
      { $setOnInsert: insert },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).select('+token');
    if (record.revokedAt) return { error: 'QR_REVOKED' };
    return { qrValue: `${QR_PREFIX}${record.token}` };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const record = await Model.findOne(key).select('+token');
    if (!record || record.revokedAt) return { error: 'QR_REVOKED' };
    return { qrValue: `${QR_PREFIX}${record.token}` };
  }
};

export const replaceQr = async (order, userId) => {
  if (order.demoOnly ? blockedStatuses.has(order.status) : !['CONFIRMED', 'CONFIRMED_RESERVED', 'PICKING', 'PACKED'].includes(order.status)) {
    return { error: 'ORDER_NOT_CONFIRMED' };
  }
  const token = newQrValue().slice(QR_PREFIX.length);
  await ensurePackingIndexes();
  const Model = order.demoOnly ? DemoOrderQrToken : OrderQrToken;
  const key = order.demoOnly ? { demoOrderId: order.id } : { orderId: order._id };
  const record = await Model.findOneAndUpdate(
    key,
    { $set: { token, revokedAt: null, issuedBy: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).select('+token');
  return { qrValue: `${QR_PREFIX}${record.token}` };
};

export const resolveQr = async (value) => {
  const token = parseQrValue(value);
  if (!token) return { error: 'INVALID_QR' };
  const record = await OrderQrToken.findOne({ token, revokedAt: null }).select('orderId');
  if (!record) {
    const demoRecord = await DemoOrderQrToken.findOne({ token }).select('demoOrderId');
    if (!demoRecord) return { error: 'QR_NOT_FOUND' };
    const demoOrder = await findDemoOrder(demoRecord.demoOrderId);
    return demoOrder ? { order: publicOrderDetail(demoOrder) } : { error: 'QR_NOT_FOUND' };
  }
  const order = await SalesOrder.findById(record.orderId).lean();
  if (!order || blockedStatuses.has(order.status)) return { error: 'ORDER_NOT_PACKABLE' };
  return { order: publicOrderDetail(order) };
};
