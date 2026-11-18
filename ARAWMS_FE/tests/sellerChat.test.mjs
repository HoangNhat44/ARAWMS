/*
 * File: sellerChat.test.mjs
 * Author: Nguyễn Quang Huy & AraStore Frontend Team
 * Description: Unit tests for Seller Chat and Messaging Utilities (UC-72, UC-73, UC-74).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanChatMessageText,
  getMediaUrl,
  classifyOrderReceiptMessage,
  parseOrderReceiptDetails,
  formatVnd,
  validateOutgoingMessage,
  filterConversations,
} from '../src/utils/sellerChatUtils.js';

// ============================================================================
// 1. cleanChatMessageText: Làm sạch tin nhắn chat hiển thị
// ============================================================================
test('cleanChatMessageText: Loại bỏ các mã trạng thái kỹ thuật GHN trong ngoặc', () => {
  const raw1 = 'Đơn hàng ORD-0001 đang được giao (delivering) đến quý khách.';
  const cleaned1 = cleanChatMessageText(raw1);
  assert.equal(cleaned1, 'Đơn hàng ORD-0001 đang được giao đến quý khách.');

  const raw2 = 'Đơn hàng đã được lấy hàng (ready_to_pick) bởi shipper (GHN).';
  const cleaned2 = cleanChatMessageText(raw2);
  assert.equal(cleaned2, 'Đơn hàng đã được lấy hàng bởi shipper.');

  const raw3 = 'Đã hủy đơn hàng (cancel). Vui lòng đặt lại đơn mới.';
  const cleaned3 = cleanChatMessageText(raw3);
  assert.equal(cleaned3, 'Đã hủy đơn hàng. Vui lòng đặt lại đơn mới.');

  const raw4 = 'Số tiền thu hộ: 250.000 đ (COD) từ kênh (TMĐT).';
  const cleaned4 = cleanChatMessageText(raw4);
  assert.equal(cleaned4, 'Số tiền thu hộ: 250.000 đ từ kênh.');
});

test('cleanChatMessageText: Xử lý an toàn giá trị rỗng, null hoặc undefined', () => {
  assert.equal(cleanChatMessageText(''), '');
  assert.equal(cleanChatMessageText(null), '');
  assert.equal(cleanChatMessageText(undefined), '');
});

// ============================================================================
// 2. getMediaUrl: Xử lý đường dẫn media tệp đính kèm trong chat
// ============================================================================
test('getMediaUrl: Giữ nguyên URL ngoài (Facebook CDN, Cloudinary, blob, data)', () => {
  const fbUrl = 'https://scontent.fhan14-2.fna.fbcdn.net/v/t39.30808-6/photo.jpg';
  assert.equal(getMediaUrl(fbUrl), fbUrl);

  const cloudUrl = 'https://res.cloudinary.com/arastore/image/upload/v1/sample.png';
  assert.equal(getMediaUrl(cloudUrl), cloudUrl);

  const blobUrl = 'blob:http://localhost:5173/12345-abcde';
  assert.equal(getMediaUrl(blobUrl), blobUrl);

  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  assert.equal(getMediaUrl(dataUrl), dataUrl);
});

test('getMediaUrl: Ghép chuẩn origin backend cho đường dẫn nội bộ /uploads', () => {
  const localPath = '/uploads/chat/attachments-12345.jpg';
  const mockBaseUrl = 'http://127.0.0.1:5000/api';

  const fullUrl = getMediaUrl(localPath, mockBaseUrl);
  assert.equal(fullUrl, 'http://127.0.0.1:5000/uploads/chat/attachments-12345.jpg');
});

test('getMediaUrl: Xử lý an toàn khi url rỗng hoặc null', () => {
  assert.equal(getMediaUrl(''), '');
  assert.equal(getMediaUrl(null), '');
  assert.equal(getMediaUrl(undefined), '');
});

// ============================================================================
// 3. classifyOrderReceiptMessage: Phân loại thẻ biên nhận đơn hàng
// ============================================================================
test('classifyOrderReceiptMessage: Phân loại chính xác các loại thẻ thông báo', () => {
  const successText = '🎉 XÁC NHẬN CHỐT ĐƠN THÀNH CÔNG 🎉\nMã đơn hàng: ORD-00100';
  assert.equal(classifyOrderReceiptMessage(successText), 'CONFIRM_SUCCESS');

  const requestText = '📋 THÔNG TIN XÁC NHẬN ĐƠN HÀNG 📋\nQuý khách vui lòng kiểm tra thông tin';
  assert.equal(classifyOrderReceiptMessage(requestText), 'CONFIRM_REQUEST');

  const requestAltText = 'PHIẾU XÁC NHẬN ĐƠN HÀNG\nTổng thanh toán: 350.000 đ';
  assert.equal(classifyOrderReceiptMessage(requestAltText), 'CONFIRM_REQUEST');

  const packingText = '📦 Kiện hàng ĐÃ ĐƯỢC ĐÓNG GÓI XONG\nMã vận đơn: GHN-123';
  assert.equal(classifyOrderReceiptMessage(packingText), 'PACKING_NOTICE');

  const normalChat = 'Chào bạn, shop còn áo thun trắng size M không ạ?';
  assert.equal(classifyOrderReceiptMessage(normalChat), 'STANDARD');
  assert.equal(classifyOrderReceiptMessage(null), 'STANDARD');
});

// ============================================================================
// 4. parseOrderReceiptDetails: Trích xuất thông tin mã đơn, vận đơn, COD
// ============================================================================
test('parseOrderReceiptDetails: Trích xuất thông tin đơn từ nội dung tin nhắn', () => {
  const message = `
    🎉 XÁC NHẬN CHỐT ĐƠN THÀNH CÔNG 🎉
    Mã đơn hàng: ORD-00555
    Mã vận đơn: GHN-HN-98765
    TỔNG THU HỘ (COD): 320.000 đ
    Người nhận: Nguyễn Văn A
  `;

  const details = parseOrderReceiptDetails(message);
  assert.equal(details.orderCode, 'ORD-00555');
  assert.equal(details.waybillCode, 'GHN-HN-98765');
  assert.equal(details.codAmount, '320.000 đ');
});

test('parseOrderReceiptDetails: Trả về null cho các trường không có trong tin nhắn', () => {
  const normalText = 'Dạ shop còn hàng bạn nhé!';
  const details = parseOrderReceiptDetails(normalText);
  assert.equal(details.orderCode, null);
  assert.equal(details.waybillCode, null);
  assert.equal(details.codAmount, null);
});

// ============================================================================
// 5. validateOutgoingMessage: Xác thực tin nhắn gửi đi
// ============================================================================
test('validateOutgoingMessage: Cho phép tin nhắn có nội dung text hợp lệ', () => {
  const result = validateOutgoingMessage({ text: 'Dạ shop chào bạn ạ!' });
  assert.equal(result.isValid, true);
  assert.equal(result.error, undefined);
});

test('validateOutgoingMessage: Cho phép tin nhắn không text nhưng có attachment', () => {
  const result = validateOutgoingMessage({
    text: '',
    attachments: [{ url: 'https://cdn.example.com/sample.jpg', type: 'image' }],
  });
  assert.equal(result.isValid, true);
});

test('validateOutgoingMessage: Từ chối tin nhắn rỗng (không text và không attachment)', () => {
  const result1 = validateOutgoingMessage({ text: '   ' });
  assert.equal(result1.isValid, false);
  assert.match(result1.error, /không được để trống/);

  const result2 = validateOutgoingMessage({});
  assert.equal(result2.isValid, false);
});

test('validateOutgoingMessage: Từ chối tin nhắn vượt quá 2000 ký tự', () => {
  const longText = 'a'.repeat(2001);
  const result = validateOutgoingMessage({ text: longText });
  assert.equal(result.isValid, false);
  assert.match(result.error, /không được vượt quá 2000 ký tự/);
});

// ============================================================================
// 6. filterConversations: Lọc và tìm kiếm danh sách cuộc hội thoại
// ============================================================================
test('filterConversations: Lọc hội thoại theo tag và tìm kiếm theo tên/SĐT khách', () => {
  const conversations = [
    {
      _id: 'conv1',
      customerName: 'Nguyễn Văn An',
      customerPhone: '0988111222',
      tags: ['VIP', 'Khách quen'],
      lastMessageText: 'Shop gửi hàng chưa ạ?',
      status: 'OPEN',
    },
    {
      _id: 'conv2',
      customerName: 'Trần Thị Bình',
      customerPhone: '0977333444',
      tags: ['Tư vấn size'],
      lastMessageText: 'Mình cao 1m65 nặng 55kg mặc size gì?',
      status: 'OPEN',
    },
    {
      _id: 'conv3',
      customerName: 'Lê Hoàng Cường',
      customerPhone: '0912555666',
      tags: ['VIP', 'Đã chốt đơn'],
      lastMessageText: 'Cảm ơn shop nhé',
      status: 'RESOLVED',
    },
  ];

  // 1. Lọc theo tag VIP
  const vipList = filterConversations(conversations, { tag: 'VIP' });
  assert.equal(vipList.length, 2);
  assert.deepEqual(vipList.map((c) => c._id), ['conv1', 'conv3']);

  // 2. Tìm kiếm theo tên khách
  const searchByName = filterConversations(conversations, { search: 'Bình' });
  assert.equal(searchByName.length, 1);
  assert.equal(searchByName[0]._id, 'conv2');

  // 3. Tìm kiếm theo số điện thoại
  const searchByPhone = filterConversations(conversations, { search: '0912555' });
  assert.equal(searchByPhone.length, 1);
  assert.equal(searchByPhone[0]._id, 'conv3');

  // 4. Tìm kiếm theo nội dung tin nhắn cuối
  const searchByMsg = filterConversations(conversations, { search: '1m65' });
  assert.equal(searchByMsg.length, 1);
  assert.equal(searchByMsg[0]._id, 'conv2');

  // 5. Kết hợp tìm kiếm và lọc trạng thái
  const searchResolved = filterConversations(conversations, { tag: 'VIP', status: 'RESOLVED' });
  assert.equal(searchResolved.length, 1);
  assert.equal(searchResolved[0]._id, 'conv3');
});

// ============================================================================
// 7. formatVnd: Định dạng tiền tệ
// ============================================================================
test('formatVnd: Định dạng đúng số tiền chuẩn VND', () => {
  assert.match(formatVnd(150000), /150[.,]000\s*đ/);
  assert.match(formatVnd(0), /0\s*đ/);
  assert.match(formatVnd(null), /0\s*đ/);
});

