/*
 * File: sellerConversationalCommerce.unit.test.mjs
 * Author: Nguyễn Quang Huy & ARAWMS Team
 * Description: Self-contained Unit Tests for Seller Conversational Commerce services:
 *              - Tag Management (UC-04)
 *              - CRM Profile & Customer Directory (UC-01, UC-02, UC-06, UC-07, UC-10)
 *              - Real-Time SKU Inventory Widget (UC-08)
 *              - Chat Routing & Two-Way Webhook Processing (UC-09)
 *              - Chat Interface & Notification Templates (UC-03, UC-04, UC-05)
 *              Each test clears collections in beforeEach and mocks external Meta HTTP calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import axios from 'axios';
import { MongoMemoryServer } from 'mongodb-memory-server';

import Role from '../src/models/Role.model.js';
import User from '../src/models/User.model.js';
import Customer from '../src/models/Customer.model.js';
import ChatConversation from '../src/models/ChatConversation.model.js';
import ChatMessage from '../src/models/ChatMessage.model.js';
import ConversationTag from '../src/models/ConversationTag.model.js';
import Product from '../src/models/Product.model.js';
import Sku from '../src/models/Sku.model.js';
import SalesOrder from '../src/models/SalesOrder.model.js';
import { ENV } from '../src/config/env.js';
import { ghnService } from '../src/modules/ghn/ghn.service.js';

import tagService, { DEFAULT_TAGS } from '../src/modules/conversational-commerce/chat-interface/tagManagement.service.js';
import crmService from '../src/modules/conversational-commerce/crm-profile/crmProfile.service.js';
import inventoryWidgetService from '../src/modules/conversational-commerce/inventory-widget/inventoryWidget.service.js';
import chatRoutingService from '../src/modules/conversational-commerce/chat-routing/chatRouting.service.js';
import chatInterfaceService from '../src/modules/conversational-commerce/chat-interface/chatInterface.service.js';
import notificationTemplateService from '../src/modules/conversational-commerce/chat-interface/notificationTemplate.service.js';

let mongoServer;
const originalAxiosPost = axios.post;
const originalAxiosGet = axios.get;
const originalGetPageToken = ENV.FB.getPageToken;
const originalGhnCreate = ghnService.createShippingOrderFromSalesOrder;

async function createSellerUser(overrides = {}) {
  const role = await Role.findOneAndUpdate(
    { roleCode: 'SELLER' },
    { $setOnInsert: { roleName: 'Nhân viên bán hàng', isActive: true } },
    { upsert: true, new: true }
  );
  const uid = randomUUID().slice(0, 8).toUpperCase();
  return User.create({
    employeeCode: `SEL-${uid}`,
    fullName: `Seller ${uid}`,
    email: `seller-${uid}@test.local`,
    roleId: role._id,
    roleCode: 'SELLER',
    status: 'ACTIVE',
    isOnlineForChat: true,
    activeChatCount: 0,
    ...overrides,
  });
}

async function createProductAndSku(skuOverrides = {}, prodOverrides = {}) {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const product = await Product.create({
    productCode: `PRD${suffix}`,
    productName: `Áo Len ${suffix}`,
    category: 'Áo len',
    basePrice: 250000,
    isActive: true,
    ...prodOverrides,
  });
  const sku = await Sku.create({
    skuCode: `PRD${suffix}-KEM-M`,
    skuBarcode: `BAR-${suffix}`,
    productId: product._id,
    styleName: product.productName,
    color: 'Kem',
    size: 'M',
    retailPrice: 250000,
    unitCogs: 120000,
    onHandQty: 30,
    reservedQty: 5,
    safetyStockThreshold: 10,
    isActive: true,
    ...skuOverrides,
  });
  return { product, sku };
}

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri('arawms_seller_cc_unit'));
});

test.beforeEach(async () => {
  axios.post = originalAxiosPost;
  axios.get = originalAxiosGet;
  ENV.FB.getPageToken = originalGetPageToken;
  ghnService.createShippingOrderFromSalesOrder = async (order) => ({
    waybillCode: `GHN-${order.orderCode}`,
    ghnStatus: 'ready_to_pick',
    ghnStatusName: 'Chờ lấy hàng',
  });
  for (const col of Object.values(mongoose.connection.collections)) {
    await col.deleteMany({});
  }
});

test.after(async () => {
  axios.post = originalAxiosPost;
  axios.get = originalAxiosGet;
  ENV.FB.getPageToken = originalGetPageToken;
  ghnService.createShippingOrderFromSalesOrder = originalGhnCreate;
  await mongoose.disconnect();
  await mongoServer?.stop();
});

// ============================================================================
// 1. TAG MANAGEMENT
// ============================================================================

test('[N][B] tagManagement: seeds 8 default tags idempotently and sorts default tags before custom tags', async () => {
  const seller = await createSellerUser();
  await tagService.seedDefaultTags();
  await tagService.seedDefaultTags(); // Idempotent second call

  const created = await tagService.createTag({ name: '  Khách sỉ  ' }, seller);
  assert.equal(created.name, 'Khách sỉ');
  assert.equal(created.color, '#9F8365');
  assert.equal(created.isDefault, false);

  const all = await tagService.getAllTags();
  assert.equal(all.length, DEFAULT_TAGS.length + 1);
  assert.equal(all[0].isDefault, true);
  assert.equal(all[all.length - 1].name, 'Khách sỉ');
});

test('[A] tagManagement: rejects blank name, duplicate tag name, deleting default tag, and non-existent tag', async () => {
  const seller = await createSellerUser();
  await tagService.seedDefaultTags();

  await assert.rejects(() => tagService.createTag({ name: '   ' }, seller), /không được để trống/);
  await assert.rejects(() => tagService.createTag({ name: DEFAULT_TAGS[0].name }, seller), /đã tồn tại/);

  const defaultTag = await ConversationTag.findOne({ isDefault: true });
  await assert.rejects(() => tagService.deleteTag(defaultTag._id), /thẻ mặc định/);
  await assert.rejects(() => tagService.deleteTag(new mongoose.Types.ObjectId()), /không tồn tại/);

  const customTag = await tagService.createTag({ name: 'Custom Temp' }, seller);
  const delRes = await tagService.deleteTag(customTag._id);
  assert.equal(delRes.deleted, true);
});

// ============================================================================
// 2. CRM PROFILE & CUSTOMER LIST
// ============================================================================

test('[N] crmProfile.createCustomer: creates customer with generated CUST code and links active conversation', async () => {
  const seller = await createSellerUser();
  const placeholderCustomer = await Customer.create({
    customerCode: 'CUST-PLACEHOLDER',
    fullName: 'Tạm thời',
  });
  const conv = await ChatConversation.create({
    fbConversationId: `fb_${randomUUID()}`,
    customerId: placeholderCustomer._id,
    assignedSellerId: seller._id,
  });

  const customer = await crmService.createCustomer(
    {
      fullName: '  Nguyễn Lan Anh  ',
      phone: '0988111222',
      email: 'lananh@example.com',
      conversationId: conv._id,
    },
    seller
  );

  assert.match(customer.customerCode, /^CUST-\d{5}$/);
  assert.equal(customer.fullName, 'Nguyễn Lan Anh');
  assert.deepEqual(customer.tags, ['Khách mới']);

  const updatedConv = await ChatConversation.findById(conv._id);
  assert.equal(String(updatedConv.customerId), String(customer._id));
});

test('[N][A] crmProfile.updateCustomer: syncs removed tags to conversations, blocks PSID modification, and handles missing customer', async () => {
  const seller = await createSellerUser();
  const customer = await Customer.create({
    customerCode: 'CUST-00010',
    facebookPsid: 'PSID_LOCKED_1',
    fullName: 'Trần Hà',
    tags: ['Khách VIP', 'Tư vấn'],
  });
  const conv = await ChatConversation.create({
    fbConversationId: 'fb_conv_PSID_LOCKED_1',
    customerId: customer._id,
    tags: ['Khách VIP', 'Tư vấn', 'Facebook'],
  });

  const updated = await crmService.updateCustomer(
    customer._id,
    {
      fullName: 'Trần Thu Hà',
      phone: '0911222333',
      tags: ['Khách VIP'], // Removed 'Tư vấn'
      conversationId: conv._id,
    },
    seller
  );

  assert.equal(updated.fullName, 'Trần Thu Hà');
  const refreshedConv = await ChatConversation.findById(conv._id);
  assert.ok(!refreshedConv.tags.includes('Tư vấn'));
  assert.ok(refreshedConv.tags.includes('Khách VIP'));

  await assert.rejects(
    () => crmService.updateCustomer(customer._id, { facebookPsid: 'PSID_HACKED' }, seller),
    /Facebook PSID/
  );
  await assert.rejects(
    () => crmService.updateCustomer(new mongoose.Types.ObjectId(), { fullName: 'X' }, seller),
    /không tồn tại/
  );
});

test('[N][A][B] crmProfile.getCustomerList & getCustomerById: filters by search/tag/channel, summarizes KPIs, clamps pagination, rejects deleted', async () => {
  const fbCust = await Customer.create({
    customerCode: 'CUST-FB1',
    facebookPsid: 'PSID_1001',
    fullName: 'Phạm Minh Ngọc',
    phone: '0977111222',
    tags: ['Khách VIP'],
    totalOrders: 3,
    totalSpent: 900000,
  });
  const directCust = await Customer.create({
    customerCode: 'CUST-DIR1',
    fullName: 'Lê Hoàng Nam',
    phone: '0966333444',
    tags: ['Khách mới'],
    totalOrders: 1,
    totalSpent: 250000,
  });
  const deletedCust = await Customer.create({
    customerCode: 'CUST-DEL1',
    fullName: 'Đã Xóa',
    isDeleted: true,
  });
  await ChatConversation.create({
    fbConversationId: 'fb_conv_PSID_1001',
    customerId: fbCust._id,
    pageName: 'AraStore Main',
    lastMessageAt: new Date(),
  });

  const fbOnly = await crmService.getCustomerList({ channel: 'FACEBOOK', page: 0, limit: 500 });
  assert.equal(fbOnly.items.length, 1);
  assert.equal(String(fbOnly.items[0]._id), String(fbCust._id));
  assert.ok(fbOnly.items[0].latestConversationId);
  assert.equal(fbOnly.pagination.page, 1); // Boundary clamp
  assert.equal(fbOnly.pagination.limit, 100); // Boundary clamp
  assert.equal(fbOnly.summary.totalCustomers, 2);
  assert.equal(fbOnly.summary.messengerLinkedCount, 1);
  assert.equal(fbOnly.summary.vipCount, 1);
  assert.equal(fbOnly.summary.totalRevenue, 1150000);

  const directOnly = await crmService.getCustomerList({ channel: 'DIRECT', search: '0966333' });
  assert.equal(directOnly.items.length, 1);
  assert.equal(String(directOnly.items[0]._id), String(directCust._id));

  const detail = await crmService.getCustomerById(fbCust._id);
  assert.equal(detail.latestPageName, 'AraStore Main');

  await assert.rejects(() => crmService.getCustomerById(deletedCust._id), /không tồn tại/);
});

test('[N] crmProfile: getCustomerInteractionHistory & getCustomerPurchaseHistory return sorted histories', async () => {
  const seller = await createSellerUser();
  const { sku } = await createProductAndSku();
  const customer = await Customer.create({ customerCode: 'CUST-HIST', fullName: 'Khách Lịch Sử' });

  const oldDate = new Date(Date.now() - 86400000);
  const newDate = new Date();
  await ChatConversation.create([
    { fbConversationId: 'fb_old', customerId: customer._id, assignedSellerId: seller._id, lastMessagePreview: 'Cũ', lastMessageAt: oldDate },
    { fbConversationId: 'fb_new', customerId: customer._id, assignedSellerId: seller._id, lastMessagePreview: 'Mới', lastMessageAt: newDate },
  ]);

  await SalesOrder.create({
    orderCode: 'ORD-HIST1',
    customerId: customer._id,
    sellerId: seller._id,
    status: 'DELIVERED',
    items: [{ skuId: sku._id, skuCode: sku.skuCode, skuBarcode: sku.skuBarcode, orderedQty: 1, unitSalePrice: 250000 }],
    financialSummary: { itemsSubtotal: 250000, totalOrderAmount: 280000, expectedCodAmount: 280000 },
  });

  const interactions = await crmService.getCustomerInteractionHistory(customer._id);
  assert.equal(interactions.length, 2);
  assert.equal(interactions[0].lastMessagePreview, 'Mới');

  const purchases = await crmService.getCustomerPurchaseHistory(customer._id);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].orderCode, 'ORD-HIST1');
});

// ============================================================================
// 3. REAL-TIME SKU INVENTORY WIDGET
// ============================================================================

test('[N][A][B] inventoryWidget.lookupRealtimeStock: computes stock statuses, excludes inactive SKUs, and safely escapes regex chars', async () => {
  await createProductAndSku({ skuCode: 'SKU-HIGH-M', onHandQty: 50, reservedQty: 10, safetyStockThreshold: 10 }); // avail 40 -> IN_STOCK
  await createProductAndSku({ skuCode: 'SKU-LOW-S', onHandQty: 15, reservedQty: 5, safetyStockThreshold: 10 }); // Boundary: avail 10 === threshold -> LOW_STOCK
  await createProductAndSku({ skuCode: 'SKU-ZERO-L', onHandQty: 5, reservedQty: 5, safetyStockThreshold: 10 }); // Boundary: avail 0 -> OUT_OF_STOCK
  await createProductAndSku({ skuCode: 'SKU-STOP-XL', onHandQty: 100, reservedQty: 0, isActive: false }); // Inactive -> excluded

  const all = await inventoryWidgetService.lookupRealtimeStock('');
  assert.equal(all.length, 3);
  assert.equal(all.find((i) => i.skuCode === 'SKU-HIGH-M').stockStatus, 'IN_STOCK');
  assert.equal(all.find((i) => i.skuCode === 'SKU-LOW-S').stockStatus, 'LOW_STOCK');
  assert.equal(all.find((i) => i.skuCode === 'SKU-ZERO-L').stockStatus, 'OUT_OF_STOCK');
  assert.equal(all.find((i) => i.skuCode === 'SKU-STOP-XL'), undefined);

  const inStockOnly = await inventoryWidgetService.lookupRealtimeStock('', 'IN_STOCK');
  assert.equal(inStockOnly.length, 2);
  assert.ok(inStockOnly.every((i) => i.availableQty > 0));

  const outOfStockOnly = await inventoryWidgetService.lookupRealtimeStock('', 'OUT_OF_STOCK');
  assert.equal(outOfStockOnly.length, 1);
  assert.equal(outOfStockOnly[0].skuCode, 'SKU-ZERO-L');

  const bySearch = await inventoryWidgetService.lookupRealtimeStock('SKU-LOW');
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].availableQty, 10);

  // Boundary: regex metacharacters must not throw SyntaxError
  const safe = await inventoryWidgetService.lookupRealtimeStock('(.*+?[^$');
  assert.deepEqual(safe, []);
});

// ============================================================================
// 4. CHAT ROUTING & TWO-WAY WEBHOOK PROCESSING
// ============================================================================

test('[N][B] chatRouting.findBestAvailableSeller: prioritizes online least-busy seller, falls back to offline active, returns null if none', async () => {
  assert.equal(await chatRoutingService.findBestAvailableSeller(), null);

  const offlineSeller = await createSellerUser({ isOnlineForChat: false, activeChatCount: 0 });
  const fallback = await chatRoutingService.findBestAvailableSeller();
  assert.equal(String(fallback._id), String(offlineSeller._id));

  const busyOnline = await createSellerUser({ isOnlineForChat: true, activeChatCount: 5 });
  const freeOnline = await createSellerUser({ isOnlineForChat: true, activeChatCount: 1 });
  await createSellerUser({ status: 'INACTIVE', isOnlineForChat: true, activeChatCount: 0 });

  const best = await chatRoutingService.findBestAvailableSeller();
  assert.equal(String(best._id), String(freeOnline._id));
  assert.notEqual(String(best._id), String(busyOnline._id));
});

test('[N][A][B] chatRouting.processInboundWebhookMessage: routes new customer, deduplicates mid, ignores echo/page loop, and handles postback tags', async () => {
  ENV.FB.getPageToken = () => ''; // Prevent live Graph API profile call
  const seller = await createSellerUser({ isOnlineForChat: true, activeChatCount: 0 });

  // Abnormal: echo & self-page loop & missing sender
  assert.equal(await chatRoutingService.processInboundWebhookMessage({ sender: { id: 'U1' }, message: { is_echo: true, text: 'echo' } }, 'PAGE_1'), null);
  assert.equal(await chatRoutingService.processInboundWebhookMessage({ sender: { id: 'PAGE_1' }, message: { text: 'loop' } }, 'PAGE_1'), null);
  assert.equal(await chatRoutingService.processInboundWebhookMessage({ message: { text: 'no sender' } }, 'PAGE_1'), null);

  // Normal: first inbound customer message
  const first = await chatRoutingService.processInboundWebhookMessage(
    { sender: { id: 'PSID_NEW_99' }, message: { mid: 'MID_001', text: 'Shop còn mẫu áo len không?' }, timestamp: Date.now() },
    'PAGE_1'
  );
  assert.ok(first.customer);
  assert.equal(String(first.assignedSeller._id), String(seller._id));
  assert.equal(first.conversation.unreadCount, 1);

  const refreshedSeller = await User.findById(seller._id);
  assert.equal(refreshedSeller.activeChatCount, 1);

  // Boundary: duplicate mid must be deduplicated without creating second ChatMessage
  const dup = await chatRoutingService.processInboundWebhookMessage(
    { sender: { id: 'PSID_NEW_99' }, message: { mid: 'MID_001', text: 'Shop còn mẫu áo len không?' } },
    'PAGE_1'
  );
  assert.equal(String(dup._id), String(first.message._id));
  assert.equal(await ChatMessage.countDocuments({ conversationId: first.conversation._id }), 1);

  // Postback tags: EDIT_ORDER_ -> CANCEL_ORDER_ -> KEEP_ORDER_
  await chatRoutingService.processInboundWebhookMessage(
    { sender: { id: 'PSID_NEW_99' }, postback: { title: 'Sửa đơn', payload: 'EDIT_ORDER_123' } },
    'PAGE_1'
  );
  let conv = await ChatConversation.findById(first.conversation._id);
  assert.ok(conv.tags.includes('Cần sửa đơn'));

  await chatRoutingService.processInboundWebhookMessage(
    { sender: { id: 'PSID_NEW_99' }, postback: { title: 'Hủy', payload: 'CANCEL_ORDER_123' } },
    'PAGE_1'
  );
  conv = await ChatConversation.findById(first.conversation._id);
  assert.ok(conv.tags.includes('Khách xác nhận hủy'));

  await chatRoutingService.processInboundWebhookMessage(
    { sender: { id: 'PSID_NEW_99' }, postback: { title: 'Giữ đơn', payload: 'KEEP_ORDER_123' } },
    'PAGE_1'
  );
  conv = await ChatConversation.findById(first.conversation._id);
  assert.ok(!conv.tags.includes('Khách xác nhận hủy'));
});

test('[N][A] chatRouting two-way confirm: auto-confirms PENDING order on Vietnamese keyword, does NOT confirm on cancel negation', async () => {
  ENV.FB.getPageToken = () => '';
  const seller = await createSellerUser();
  const { sku } = await createProductAndSku({ onHandQty: 20, reservedQty: 0 });
  const customer = await Customer.create({
    customerCode: 'CUST-2WAY',
    facebookPsid: 'PSID_2WAY',
    fullName: 'Khách Hai Chiều',
  });
  const order = await SalesOrder.create({
    orderCode: 'ORD-2WAY1',
    customerId: customer._id,
    sellerId: seller._id,
    status: 'PENDING',
    items: [{ skuId: sku._id, skuCode: sku.skuCode, skuBarcode: sku.skuBarcode, orderedQty: 2, unitSalePrice: 250000 }],
    financialSummary: { itemsSubtotal: 500000, shippingFee: 30000, totalOrderAmount: 530000, expectedCodAmount: 530000 },
  });

  // Abnormal: "ok hủy đơn nhé" contains cancel negation -> must remain PENDING
  await chatRoutingService.processInboundWebhookMessage(
    { sender: { id: 'PSID_2WAY' }, message: { mid: 'MID_NEG_1', text: 'ok hủy đơn nhé shop' } },
    'PAGE_1'
  );
  let check = await SalesOrder.findById(order._id);
  assert.equal(check.status, 'PENDING');

  // Normal: "ok chốt đơn nhé" -> confirms and reserves stock
  await chatRoutingService.processInboundWebhookMessage(
    { sender: { id: 'PSID_2WAY' }, message: { mid: 'MID_POS_1', text: 'ok chốt đơn nhé shop' } },
    'PAGE_1'
  );
  check = await SalesOrder.findById(order._id);
  assert.equal(check.status, 'CONFIRMED_RESERVED');
  const updatedSku = await Sku.findById(sku._id);
  assert.equal(updatedSku.reservedQty, 2);
});

// ============================================================================
// 5. CHAT INTERFACE & AUTO NOTIFICATION TEMPLATES
// ============================================================================

test('[N][A] chatInterface: lists/searches conversations, reads messages, tags/untags, and marks as read', async () => {
  const sellerA = await createSellerUser();
  const sellerB = await createSellerUser();
  const cust = await Customer.create({ customerCode: 'CUST-CHAT1', fullName: 'Đặng Quỳnh Chi', phone: '0988777666' });

  const conv = await ChatConversation.create({
    fbConversationId: 'fb_conv_chat1',
    customerId: cust._id,
    assignedSellerId: sellerA._id,
    status: 'ACTIVE',
    tags: ['Tư vấn'],
    unreadCount: 3,
    lastMessagePreview: 'Còn size M không ạ?',
    lastMessageAt: new Date(),
  });
  await ChatMessage.create([
    { conversationId: conv._id, senderType: 'CUSTOMER', messageText: 'Tin 1', sentAt: new Date(Date.now() - 2000) },
    { conversationId: conv._id, senderType: 'SELLER', senderSellerId: sellerA._id, messageText: 'Tin 2', sentAt: new Date() },
  ]);

  const shared = await chatInterfaceService.getConversations({ search: 'Quỳnh Chi', tag: 'Tư vấn' }, sellerB);
  assert.equal(shared.items.length, 1);

  const onlyMine = await chatInterfaceService.getConversations({ onlyMyChats: 'true' }, sellerB);
  assert.equal(onlyMine.items.length, 0);

  const detail = await chatInterfaceService.getConversationById(conv._id, sellerA);
  assert.equal(detail.unreadCount, 0);

  const msgs = await chatInterfaceService.getConversationMessages(conv._id, { page: 1, limit: 10 });
  assert.equal(msgs.items.length, 2);
  assert.equal(msgs.items[0].messageText, 'Tin 1'); // Chronological order

  const tagged = await chatInterfaceService.addConversationTag(conv._id, ['Khách VIP', 'Tư vấn'], sellerA);
  assert.equal(tagged.tags.filter((t) => t === 'Tư vấn').length, 1); // No duplicates
  const untagged = await chatInterfaceService.removeConversationTag(conv._id, 'Khách VIP', sellerA);
  assert.ok(!untagged.tags.includes('Khách VIP'));

  await ChatConversation.findByIdAndUpdate(conv._id, { unreadCount: 4 });
  await chatInterfaceService.markConversationAsRead(conv._id);
  assert.equal((await ChatConversation.findById(conv._id)).unreadCount, 0);

  // Abnormal: non-existent conversation ID
  const fakeId = new mongoose.Types.ObjectId();
  await assert.rejects(() => chatInterfaceService.getConversationById(fakeId, sellerA), /không tồn tại/);
  await assert.rejects(() => chatInterfaceService.addConversationTag(fakeId, 'VIP', sellerA), /không tồn tại/);
  await assert.rejects(() => chatInterfaceService.removeConversationTag(fakeId, 'VIP', sellerA), /không tồn tại/);
});

test('[N][A] chatInterface.sendCustomerMessage: auto-takes over conversation and handles NOT_CONNECTED, DELIVERED, FAILED_24H_EXPIRED, FAILED_META_ERROR', async () => {
  const seller = await createSellerUser();
  const cust = await Customer.create({
    customerCode: 'CUST-SEND1',
    facebookPsid: 'PSID_SEND_1',
    fullName: 'Khách Gửi Tin',
  });
  const conv = await ChatConversation.create({
    fbConversationId: 'fb_conv_send1',
    pageId: 'PAGE_TEST',
    customerId: cust._id,
  });

  // 1. NOT_CONNECTED when no page token
  ENV.FB.getPageToken = () => '';
  const msgNotConn = await chatInterfaceService.sendCustomerMessage(conv._id, { messageText: 'Tin nội bộ' }, seller);
  assert.equal(msgNotConn.deliveryStatus, 'NOT_CONNECTED');
  assert.equal(String((await ChatConversation.findById(conv._id)).assignedSellerId), String(seller._id));

  // 2. DELIVERED when mocked Meta Graph API succeeds
  ENV.FB.getPageToken = () => 'VALID_PAGE_TOKEN';
  axios.post = async () => ({ data: { message_id: 'fb_mid_ok_1' } });
  const msgOk = await chatInterfaceService.sendCustomerMessage(conv._id, { messageText: 'Đã gửi Meta' }, seller);
  assert.equal(msgOk.deliveryStatus, 'DELIVERED');
  assert.equal(msgOk.fbMessageId, 'fb_mid_ok_1');

  // 3. FAILED_24H_EXPIRED on Meta error code 10
  axios.post = async () => {
    throw { response: { data: { error: { code: 10, message: 'Outside 24h window' } } } };
  };
  const msg24h = await chatInterfaceService.sendCustomerMessage(conv._id, { messageText: 'Quá 24h' }, seller);
  assert.equal(msg24h.deliveryStatus, 'FAILED_24H_EXPIRED');

  // 4. FAILED_META_ERROR on generic API failure
  axios.post = async () => {
    throw new Error('Network timeout');
  };
  const msgErr = await chatInterfaceService.sendCustomerMessage(conv._id, { messageText: 'Lỗi mạng' }, seller);
  assert.equal(msgErr.deliveryStatus, 'FAILED_META_ERROR');

  // 5. Abnormal: non-existent conversation & empty attachment list
  await assert.rejects(() => chatInterfaceService.sendCustomerMessage(new mongoose.Types.ObjectId(), { messageText: 'hi' }, seller), /không tồn tại/);
  await assert.rejects(() => chatInterfaceService.sendCustomerAttachments(conv._id, [], 'caption', seller), /ít nhất một tệp/);
  await assert.rejects(() => chatInterfaceService.sendCustomerAttachments(new mongoose.Types.ObjectId(), [{ originalname: 'a.png' }], '', seller), /không tồn tại/);
});

test('[N][B] notificationTemplate.sendOrderNotificationToChat: strips technical tags, deduplicates within 45s, returns null without conversation', async () => {
  ENV.FB.getPageToken = () => '';
  const seller = await createSellerUser();
  const cust = await Customer.create({ customerCode: 'CUST-NOTIF', fullName: 'Khách Thông Báo' });

  // Boundary: no linked conversation -> returns null gracefully
  const noConv = await notificationTemplateService.sendOrderNotificationToChat({
    order: { orderCode: 'ORD-NOCONV', customerId: cust._id },
    messageText: 'Đơn hàng (ready_to_pick)',
  });
  assert.equal(noConv, null);

  const conv = await ChatConversation.create({ fbConversationId: 'fb_conv_notif', customerId: cust._id });
  const msg1 = await notificationTemplateService.sendOrderNotificationToChat({
    order: { orderCode: 'ORD-N1', customerId: cust._id, conversationId: conv._id },
    messageText: 'Đơn #ORD-N1 đang giao (delivering) (GHN)',
    senderSellerId: seller._id,
  });
  assert.equal(msg1.messageText, 'Đơn #ORD-N1 đang giao');
  assert.equal(msg1.deliveryStatus, 'NOT_CONNECTED');

  // Deduplication within 45s returns existing message without duplicating DB row
  const msg2 = await notificationTemplateService.sendOrderNotificationToChat({
    order: { orderCode: 'ORD-N1', customerId: cust._id, conversationId: conv._id },
    messageText: 'Đơn #ORD-N1 đang giao (delivering) (GHN)',
    senderSellerId: seller._id,
  });
  assert.equal(String(msg2._id), String(msg1._id));
  assert.equal(await ChatMessage.countDocuments({ conversationId: conv._id }), 1);
});
