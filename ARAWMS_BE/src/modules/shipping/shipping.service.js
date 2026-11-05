import mongoose from 'mongoose';
import { createHash, timingSafeEqual } from 'node:crypto';
import CarrierShipment from '../../models/CarrierShipment.model.js';
import CarrierShipmentEvent from '../../models/CarrierShipmentEvent.model.js';
import CarrierHandover from '../../models/CarrierHandover.model.js';
import PackingSession from '../../models/PackingSession.js';
import PackingVideo from '../../models/PackingVideo.js';
import ProductUnit from '../../models/ProductUnit.js';
import SalesOrder from '../../models/SalesOrder.model.js';
import WarehouseLocation from '../../models/WarehouseLocation.model.js';

export class ShippingError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

const shipmentView = (row) => ({
  id: row._id, orderId: row.orderId, orderCode: row.orderCode, clientOrderCode: row.clientOrderCode,
  createStatus: row.createStatus, shipmentStatus: row.shipmentStatus, providerStatus: row.providerStatus,
  warehouseType: row.warehouseType, handoverStatus: row.handoverStatus,
  waybillCode: row.waybillCode, fee: row.fee, expectedDeliveryTime: row.expectedDeliveryTime,
  lastError: row.lastError, createdAt: row.createdAt,
});

const completedVideoFor = async (session) => {
  if (!session?.video?.recordingId) return null;
  if (session.video.status === 'COMPLETED') return session.video;
  return PackingVideo.findOne({ sessionId: session._id,
    recordingId: session.video.recordingId, status: 'COMPLETED' }).lean();
};

export async function listShippingOrders() {
  const orders = await SalesOrder.find({ status: 'PACKED' })
    .select('orderCode status shippingRecipient financialSummary items warehouseFulfillment updatedAt')
    .sort({ 'warehouseFulfillment.packedAt': -1 }).lean();
  const rows = await Promise.all(orders.map(async (order) => {
    const session = await PackingSession.findOne({ orderId: order._id }).lean();
    if (!session?.video?.publicId || !session.scannedUnits?.length || !await completedVideoFor(session)) return null;
    const active = await CarrierShipment.findOne({ orderId: order._id, packingSessionId: session._id,
      createStatus: { $in: ['PREPARED', 'CREATING', 'UNKNOWN', 'CREATED'] } }).sort({ createdAt: -1 }).lean();
    return {
      id: order._id, orderCode: order.orderCode, recipient: order.shippingRecipient || {},
      packedAt: order.warehouseFulfillment?.packedAt, packedUnits: session.scannedUnits.map((unit) => {
        const item = session.items.find((line) => line.lineKey === unit.lineKey);
        return { barcode: unit.barcode, skuCode: item?.skuCode, name: item?.name };
      }),
      items: order.items.map(({ skuCode, orderedQty, unitSalePrice }) => ({ skuCode, quantity: orderedQty, unitSalePrice })),
      warehouseType: active?.warehouseType || null,
      codAmount: order.financialSummary?.expectedCodAmount ?? 0,
      shipment: active ? shipmentView(active) : null,
    };
  }));
  return rows.filter(Boolean);
}

const ghnConfig = () => {
  const token = process.env.GHN_TOKEN;
  const shopId = process.env.GHN_SHOP_ID;
  const baseUrl = process.env.GHN_BASE_URL || process.env.GHN_API_BASE_URL || 'https://dev-online-gateway.ghn.vn';
  if (!token || !shopId) throw new ShippingError('GHN_NOT_CONFIGURED', 503);
  return { token, shopId, baseUrl: baseUrl.replace(/\/$/, '') };
};

async function ghnRequest(path, body, timeoutMs = 15000) {
  const config = ghnConfig();
  const apiBase = config.baseUrl.endsWith('/shiip/public-api')
    ? config.baseUrl : `${config.baseUrl}/shiip/public-api`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBase}${path.replace(/^\/shiip\/public-api/, '')}`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Token: config.token, ShopId: config.shopId },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.code !== 200) {
      const error = new Error(result?.message || `GHN_HTTP_${response.status}`);
      error.ghnResult = result; throw error;
    }
    return result.data;
  } finally { clearTimeout(timer); }
}

async function ghnGet(path, params, timeoutMs = 15000) {
  const config = ghnConfig();
  const apiBase = config.baseUrl.endsWith('/shiip/public-api') ? config.baseUrl : `${config.baseUrl}/shiip/public-api`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${apiBase}${path.replace(/^\/shiip\/public-api/, '')}?${query}`, {
      signal: controller.signal, headers: { Token: config.token, ShopId: config.shopId },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.code !== 200) {
      const error = new Error(result?.message || `GHN_HTTP_${response.status}`);
      error.ghnResult = result; throw error;
    }
    return result.data;
  } finally { clearTimeout(timer); }
}

const normalizeCreatePayload = (input, order, clientOrderCode) => {
  const { address, wardName, provinceName, weight, length, width, height, serviceTypeId,
    paymentTypeId, codAmount, declaredValue, requiredNote, note = '' } = input || {};
  if (!address?.trim() || !wardName?.trim() || !provinceName?.trim()) throw new ShippingError('GHN_ADDRESS_REQUIRED');
  if (![weight, length, width, height].every((value) => Number.isFinite(Number(value)) && Number(value) > 0)) {
    throw new ShippingError('PARCEL_DIMENSIONS_REQUIRED');
  }
  if (![2, 5].includes(Number(serviceTypeId))) throw new ShippingError('GHN_SERVICE_REQUIRED');
  if (![1, 2].includes(Number(paymentTypeId))) throw new ShippingError('GHN_PAYER_REQUIRED');
  if (!['CHOTHUHANG', 'CHOXEMHANGKHONGTHU', 'KHONGCHOXEMHANG'].includes(requiredNote)) throw new ShippingError('GHN_DELIVERY_NOTE_REQUIRED');
  for (const key of ['name', 'phone']) if (!order.shippingRecipient?.[key]) throw new ShippingError(`RECIPIENT_${key.toUpperCase()}_REQUIRED`);
  const cod = Number(codAmount);
  const declared = Number(declaredValue);
  if (!Number.isFinite(cod) || cod < 0 || !Number.isFinite(declared) || declared < 0) throw new ShippingError('INVALID_COD_OR_DECLARED_VALUE');
  return {
    client_order_code: clientOrderCode,
    to_name: order.shippingRecipient.name,
    to_phone: order.shippingRecipient.phone,
    to_address: address.trim(), to_ward_name: wardName.trim(), to_province_name: provinceName.trim(),
    is_new_to_address: true,
    content: order.items.map((item) => item.skuCode).join(', ').slice(0, 200),
    weight: Math.round(Number(weight)), length: Math.round(Number(length)), width: Math.round(Number(width)), height: Math.round(Number(height)),
    service_type_id: Number(serviceTypeId), payment_type_id: Number(paymentTypeId),
    required_note: requiredNote, cod_amount: Math.round(cod), insurance_value: Math.min(Math.round(declared), 5000000),
    order_value: Math.round(declared), note: String(note).slice(0, 500),
    items: order.items.map((item) => ({ name: item.skuCode, code: item.skuCode, quantity: item.orderedQty, price: item.unitSalePrice })),
  };
};

export async function createCarrierShipment(orderId, input, userId) {
  if (!mongoose.isValidObjectId(orderId)) throw new ShippingError('ORDER_NOT_FOUND', 404);
  const order = await SalesOrder.findById(orderId);
  if (!order || order.status !== 'PACKED') throw new ShippingError('ORDER_NOT_READY_FOR_SHIPPING', 409);
  const session = await PackingSession.findOne({ orderId: order._id });
  if (!session?.video?.publicId || !session.scannedUnits?.length || !await completedVideoFor(session)) throw new ShippingError('FINAL_PACKING_NOT_CONFIRMED', 409);
  if (!order.shippingRecipient?.name || !order.shippingRecipient?.phone) throw new ShippingError('RECIPIENT_DETAILS_REQUIRED', 409);

  let shipment = await CarrierShipment.findOne({ orderId: order._id, packingSessionId: session._id });
  if (shipment?.createStatus === 'CREATED') return shipmentView(shipment);
  if (!shipment) {
    const locationIds = [
      ...order.items.flatMap((item) => (item.fifoPickList || []).map((pick) => pick.locationId).filter(Boolean)),
      ...session.items.map((item) => item.warehouseId).filter(Boolean),
    ];
    const locations = locationIds.length ? await WarehouseLocation.find({ _id: { $in: locationIds } }).select('warehouseType').lean() : [];
    const warehouseTypes = [...new Set(locations.map((location) => location.warehouseType))];
    if (warehouseTypes.length > 1) throw new ShippingError('ORDER_HAS_MULTIPLE_WAREHOUSES', 409);
    if (!warehouseTypes[0]) throw new ShippingError('WAREHOUSE_CANNOT_RESOLVE', 409);
    shipment = new CarrierShipment({ orderId: order._id, orderCode: order.orderCode, packingSessionId: session._id,
      clientOrderCode: `SHIP-${new mongoose.Types.ObjectId().toString()}`, createStatus: 'PREPARED',
      warehouseType: warehouseTypes[0],
      recipientSnapshot: order.shippingRecipient.toObject?.() || order.shippingRecipient,
      packedUnitsSnapshot: session.scannedUnits.map((unit) => {
        const item = session.items.find((line) => line.lineKey === unit.lineKey);
        return { barcode: unit.barcode, skuCode: item?.skuCode || '', name: item?.name || '' };
      }), createdBy: userId });
  }
  const wasUncertain = shipment.createStatus === 'UNKNOWN' || shipment.createStatus === 'CREATING';
  // Keep the original body with the same client code when the provider result was uncertain.
  const payload = wasUncertain && shipment.requestSnapshot
    ? shipment.requestSnapshot : normalizeCreatePayload(input, order, shipment.clientOrderCode);
  if (!shipment.requestSnapshot || !wasUncertain) shipment.requestSnapshot = payload;
  shipment.createStatus = 'CREATING';
  shipment.lastError = undefined;
  try { await shipment.save(); }
  catch (error) {
    if (error?.code === 11000) return createCarrierShipment(orderId, input, userId);
    throw error;
  }

  try {
    let result;
    if (wasUncertain) {
      // A prior CREATING/UNKNOWN attempt may have succeeded at GHN before its response was lost.
      try { result = await ghnGet('/shiip/public-api/v2/shipping-order/detail-by-client-code', { client_order_code: shipment.clientOrderCode }); }
      catch (error) { if (error.ghnResult?.code !== 400 && error.ghnResult?.code !== 404) throw error; }
    }
    if (!result) result = await ghnRequest('/shiip/public-api/v2/shipping-order/create', payload);
    shipment.waybillCode = result.order_code;
    shipment.fee = result.total_fee;
    shipment.expectedDeliveryTime = result.expected_delivery_time ? new Date(result.expected_delivery_time) : undefined;
    shipment.providerStatus = result.status || 'ready_to_pick';
    shipment.shipmentStatus = 'WAITING_FOR_PICKUP';
    shipment.createStatus = 'CREATED';
    shipment.lastError = undefined;
    await shipment.save();
    return shipmentView(shipment);
  } catch (error) {
    shipment.createStatus = error.name === 'AbortError' || !error.ghnResult ? 'UNKNOWN' : 'FAILED';
    shipment.lastError = error.message;
    await shipment.save();
    throw new ShippingError(shipment.createStatus === 'UNKNOWN' ? 'SHIPMENT_RESULT_UNKNOWN' : 'GHN_CREATE_FAILED', shipment.createStatus === 'UNKNOWN' ? 409 : 502);
  }
}

export async function listShipments() {
  const rows = await CarrierShipment.find().sort({ createdAt: -1 }).limit(500).lean();
  return rows.map(shipmentView);
}

const handoverView = (row) => ({
  id: row._id, reportCode: row.reportCode, carrier: row.carrier, warehouseType: row.warehouseType,
  senderName: row.senderName, receiverName: row.receiverName, note: row.note, status: row.status,
  parcels: row.parcels, confirmedAt: row.confirmedAt, createdAt: row.createdAt,
});

export async function listHandovers() {
  const rows = await CarrierHandover.find().sort({ createdAt: -1 }).limit(200).lean();
  return rows.map(handoverView);
}

export async function createHandoverDraft(input) {
  const { senderName, receiverName, note } = input || {};
  if (!senderName?.trim() || !receiverName?.trim()) throw new ShippingError('HANDOVER_PEOPLE_REQUIRED');
  const draft = await CarrierHandover.create({ senderName: senderName.trim(), receiverName: receiverName.trim(), note: String(note || '').slice(0, 500) });
  return handoverView(draft);
}

export async function scanParcelIntoHandover(handoverId, rawCode, scannedByName = '') {
  const code = String(rawCode || '').trim();
  if (!code) throw new ShippingError('PARCEL_CODE_REQUIRED');
  const draft = await CarrierHandover.findOne({ _id: handoverId, status: 'DRAFT' });
  if (!draft) throw new ShippingError('HANDOVER_NOT_DRAFT', 409);
  const shipment = await CarrierShipment.findOne({ $or: [{ waybillCode: code }, { clientOrderCode: code }] });
  if (!shipment) {
    const productUnit = await ProductUnit.exists({ barcode: code });
    throw new ShippingError(productUnit ? 'PRODUCT_BARCODE_NOT_PARCEL' : 'PARCEL_NOT_FOUND', 404);
  }
  if (draft.parcels.some((parcel) => String(parcel.shipmentId) === String(shipment._id))) {
    return { duplicate: true, handover: handoverView(draft) };
  }
  if (shipment.createStatus !== 'CREATED') throw new ShippingError('SHIPMENT_NOT_CREATED', 409);
  if (!shipment.warehouseType) throw new ShippingError('WAREHOUSE_CANNOT_RESOLVE', 409);
  if (draft.warehouseType && shipment.warehouseType !== draft.warehouseType) throw new ShippingError('PARCEL_WRONG_WAREHOUSE', 409);
  if (shipment.shipmentStatus !== 'WAITING_FOR_PICKUP') throw new ShippingError('PARCEL_NOT_WAITING_FOR_PICKUP', 409);
  const order = await SalesOrder.findById(shipment.orderId).select('status shippingRecipient').lean();
  if (!order || order.status !== 'PACKED') throw new ShippingError('ORDER_NOT_PACKED', 409);
  const warehouseClaim = await CarrierHandover.updateOne({ _id: draft._id, status: 'DRAFT',
    $or: [{ warehouseType: null }, { warehouseType: shipment.warehouseType }] }, {
    $set: { warehouseType: shipment.warehouseType },
  });
  if (!warehouseClaim.matchedCount) throw new ShippingError('PARCEL_WRONG_WAREHOUSE', 409);
  draft.warehouseType = shipment.warehouseType;
  const reserved = await CarrierShipment.updateOne({ _id: shipment._id, handoverStatus: 'WAITING' }, {
    $set: { handoverStatus: 'IN_DRAFT', handoverId: draft._id },
  });
  if (!reserved.modifiedCount) throw new ShippingError('PARCEL_ALREADY_IN_HANDOVER', 409);
  draft.parcels.push({ shipmentId: shipment._id, waybillCode: shipment.waybillCode,
    clientOrderCode: shipment.clientOrderCode, orderId: shipment.orderId, orderCode: shipment.orderCode,
    recipientSnapshot: shipment.recipientSnapshot, packedUnitsSnapshot: shipment.packedUnitsSnapshot,
    scannedAt: new Date(), scannedByName: String(scannedByName).slice(0, 120) });
  await draft.save();
  return { duplicate: false, handover: handoverView(draft) };
}

export async function removeParcelFromHandover(handoverId, waybillCode) {
  const draft = await CarrierHandover.findOne({ _id: handoverId, status: 'DRAFT' });
  if (!draft) throw new ShippingError('HANDOVER_NOT_DRAFT', 409);
  const parcel = draft.parcels.find((item) => item.waybillCode === waybillCode);
  if (!parcel) throw new ShippingError('PARCEL_NOT_IN_HANDOVER', 404);
  draft.parcels = draft.parcels.filter((item) => item.waybillCode !== waybillCode);
  if (!draft.parcels.length) draft.warehouseType = undefined;
  await draft.save();
  await CarrierShipment.updateOne({ _id: parcel.shipmentId, handoverId: draft._id, handoverStatus: 'IN_DRAFT' }, {
    $set: { handoverStatus: 'WAITING' }, $unset: { handoverId: 1 },
  });
  return handoverView(draft);
}

export async function confirmCarrierHandover(handoverId, confirmed) {
  if (confirmed !== true) throw new ShippingError('HANDOVER_CONFIRMATION_REQUIRED');
  const session = await mongoose.startSession();
  try {
    let output;
    await session.withTransaction(async () => {
      const draft = await CarrierHandover.findOne({ _id: handoverId, status: 'DRAFT' }).session(session);
      if (!draft) throw new ShippingError('HANDOVER_NOT_DRAFT', 409);
      if (!draft.parcels.length) throw new ShippingError('HANDOVER_EMPTY', 409);
      for (const parcel of draft.parcels) {
        const shipment = await CarrierShipment.findOne({ _id: parcel.shipmentId, handoverId: draft._id,
          handoverStatus: 'IN_DRAFT', createStatus: 'CREATED', shipmentStatus: 'WAITING_FOR_PICKUP' }).session(session);
        const order = await SalesOrder.findById(parcel.orderId).select('status').session(session);
        if (!shipment || !order || order.status !== 'PACKED') throw new ShippingError('HANDOVER_PARCEL_INVALID', 409);
      }
      const at = new Date();
      const suffix = String(draft._id).slice(-8).toUpperCase();
      draft.reportCode = `GHN-${at.toISOString().slice(0, 10).replaceAll('-', '')}-${suffix}`;
      draft.status = 'HANDED_OVER'; draft.confirmedAt = at;
      await draft.save({ session });
      await CarrierShipment.updateMany({ handoverId: draft._id, handoverStatus: 'IN_DRAFT' }, {
        $set: { handoverStatus: 'HANDED_OVER' },
      }, { session });
      output = handoverView(draft);
    });
    return output;
  } finally { await session.endSession(); }
}

export async function getGhnProvinces() {
  const config = ghnConfig();
  const response = await fetch(`${config.baseUrl.endsWith('/shiip/public-api') ? config.baseUrl : `${config.baseUrl}/shiip/public-api`}/v3/master-data/province/all?offset=0&limit=200`, {
    headers: { Token: config.token, ShopId: config.shopId },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.code !== 200) throw new ShippingError('GHN_MASTER_DATA_FAILED', 502);
  return (result.data || []).filter((item) => item.status === 1).map(({ _id, name }) => ({ id: _id, name }));
}

export async function getGhnWards(provinceId) {
  if (!/^\d+$/.test(String(provinceId || ''))) throw new ShippingError('INVALID_PROVINCE', 400);
  const config = ghnConfig();
  const apiBase = config.baseUrl.endsWith('/shiip/public-api') ? config.baseUrl : `${config.baseUrl}/shiip/public-api`;
  const response = await fetch(`${apiBase}/v3/master-data/ward/all-by-province-id?province_id=${encodeURIComponent(provinceId)}`, {
    headers: { Token: config.token, ShopId: config.shopId },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.code !== 200) throw new ShippingError('GHN_MASTER_DATA_FAILED', 502);
  return (result.data || []).filter((item) => item.status === 1).map(({ _id, name }) => ({ id: _id, name }));
}

export async function getPrintToken(id) {
  const shipment = await CarrierShipment.findById(id);
  if (!shipment?.waybillCode || shipment.createStatus !== 'CREATED') throw new ShippingError('SHIPMENT_NOT_CREATED', 409);
  const data = await ghnRequest('/shiip/public-api/v2/a5/gen-token', { order_codes: [shipment.waybillCode] });
  return { token: data?.token, url: `${new URL(ghnConfig().baseUrl).origin}/a5/public-api/printA5` };
}

const displayStatus = (providerStatus) => ({
  ready_to_pick: 'WAITING_FOR_PICKUP', picking: 'PICKUP_IN_PROGRESS', picked: 'IN_TRANSIT',
  storing: 'IN_TRANSIT', transporting: 'IN_TRANSIT', sorting: 'IN_TRANSIT', delivering: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED', delivery_fail: 'DELIVERY_FAILED', waiting_to_return: 'RETURNING', returning: 'RETURNING',
  returned: 'RETURNED_TO_SENDER', cancel: 'CANCELLED', exception: 'EXCEPTION',
}[String(providerStatus || '').toLowerCase()] || 'CARRIER_UPDATE');

export async function acceptGhnWebhook(payload, secretHeader) {
  const expected = process.env.GHN_WEBHOOK_SECRET;
  if (!expected || !secretHeader) throw new ShippingError('GHN_WEBHOOK_NOT_CONFIGURED', 503);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(String(secretHeader));
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    throw new ShippingError('GHN_WEBHOOK_UNAUTHORIZED', 401);
  }
  const orderCode = payload?.OrderCode || payload?.order_code;
  const providerStatus = payload?.Status || payload?.status;
  const sourceTimeValue = payload?.Time || payload?.time;
  if (!orderCode || !providerStatus) throw new ShippingError('GHN_WEBHOOK_INVALID', 400);
  const shipment = await CarrierShipment.findOne({ waybillCode: String(orderCode), createStatus: 'CREATED' });
  if (!shipment) return { accepted: true, unmatched: true };
  let sourceTime = sourceTimeValue ? new Date(sourceTimeValue) : null;
  if (sourceTime && Number.isNaN(sourceTime.getTime())) sourceTime = null;
  const eventIdentity = sourceTimeValue || JSON.stringify(payload);
  const eventKey = createHash('sha256').update(`${orderCode}|${payload?.Type || payload?.type || 'status'}|${eventIdentity}|${providerStatus}`).digest('hex');
  try {
    await CarrierShipmentEvent.create({ shipmentId: shipment._id, eventKey, providerStatus: String(providerStatus), sourceTime, rawPayload: payload });
  } catch (error) {
    if (error?.code === 11000) return { accepted: true, duplicate: true };
    throw error;
  }
  if (!sourceTime || !shipment.providerUpdatedAt || sourceTime >= shipment.providerUpdatedAt) {
    shipment.providerStatus = String(providerStatus);
    shipment.shipmentStatus = displayStatus(providerStatus);
    shipment.providerUpdatedAt = sourceTime || new Date();
    await shipment.save();
  }
  return { accepted: true };
}
