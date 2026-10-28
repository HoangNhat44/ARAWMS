# KẾ HOẠCH TRIỂN KHAI PHÂN HỆ SELLER (ARAWMS)
> **Được điều chỉnh và chuẩn hóa theo:**
> 1. Tài liệu kiến trúc và phân quyền Actor: `chú thích AraWMS.docx` (102 Use Cases toàn hệ thống, 15 Use Cases cho Actor Seller).
> 2. Kế hoạch ban đầu: `kehoach seller.docx`.
> 3. Cấu trúc mã nguồn thực tế: `ARAWMS_BE` (Node.js/Express, Mongoose Models, Module-based Architecture) và `ARAWMS_FE` (React, Vite).
> 4. Từ điển dữ liệu chuẩn: `DATA_DICTIONARY.md`.

---

## I. TỔNG QUAN & PHẠM VI NGHIỆP VỤ SELLER

Theo tài liệu chuẩn hóa `chú thích AraWMS`, **Seller (Nhân viên bán hàng)** đảm nhiệm phân hệ bán lẻ đa kênh tích hợp chat, giữ vai trò đầu mối trong chuỗi:
$$\text{Facebook Messenger} \longrightarrow \text{Tư vấn / CRM} \longrightarrow \text{Tra cứu tồn khả dụng} \longrightarrow \text{Tạo đơn & Giữ chỗ kho} \longrightarrow \text{Tiếp nhận yêu cầu Đổi / Trả (RMA)}$$

### 1. Phạm vi 15 Use Cases thuộc 3 Major Features
Actor Seller phụ trách đúng **15 Use Cases** (từ UC-69 đến UC-83):

| STT | Use Case ID | Tên Use Case | Major Feature (Level 1) | Sub Feature (Level 2) | Mục tiêu nghiệp vụ ngắn gọn |
|:---:|:---:|:---|:---|:---|:---|
| 1 | **UC-69** | Auto-assign Customers to Sales | Conversational Commerce | Chat Routing | Tự động phân bổ phiên chat Facebook Messenger cho Seller đang online và ít việc nhất. |
| 2 | **UC-70** | Edit Customer Information | Conversational Commerce | CRM Profile | Chỉnh sửa, cập nhật thông tin khách hàng (tên, số điện thoại, sổ địa chỉ nhận hàng). |
| 3 | **UC-71** | Create New Customer Profile | Conversational Commerce | CRM Profile | Tạo hồ sơ khách hàng mới ngay khi tiếp nhận khách lạ qua khung chat. |
| 4 | **UC-72** | View Messenger Conversations | Conversational Commerce | Chat Interface | Màn hình chat tập trung: xem danh sách hội thoại, nội dung tin nhắn, hồ sơ khách và đơn liên quan. |
| 5 | **UC-73** | Tag Customer Chat | Conversational Commerce | Chat Interface | Gắn thẻ (tags) phân loại nội dung hội thoại, trạng thái chăm sóc hoặc sở thích khách hàng. |
| 6 | **UC-74** | Message Customer | Conversational Commerce | Chat Interface | Gửi tin nhắn, hình ảnh, gợi ý sản phẩm trực tiếp cho khách qua Facebook Messenger API. |
| 7 | **UC-75** | View Customer Interaction History | Conversational Commerce | CRM Profile | Xem lại lịch sử các phiên chat và tương tác trong quá khứ để hiểu thói quen khách. |
| 8 | **UC-76** | View Customer Purchase History | Conversational Commerce | CRM Profile | Tra cứu lịch sử các đơn hàng đã mua để tư vấn bán thêm (Upsell/Cross-sell). |
| 9 | **UC-77** | Lookup Real-time Available Stock by SKU | Conversational Commerce | Inventory Widget | Widget tra cứu số lượng tồn khả dụng ($Available = OnHand - Reserved$) ngay trên giao diện chat. |
| 10 | **UC-78** | Create Direct New Order | Order Fulfillment | Order Management | Tạo đơn hàng bán lẻ mới trực tiếp từ thông tin trao đổi qua chat. |
| 11 | **UC-79** | Confirm Order Creation | Order Fulfillment | Order Management | Xác nhận đơn hàng, kích hoạt cơ chế giữ chỗ tồn kho ($+Reserved$) phục vụ nhặt hàng FIFO. |
| 12 | **UC-80** | Update Order Status | Order Fulfillment | Order Management | Cập nhật thông tin nhận hàng, ghi chú hoặc chuyển đổi trạng thái đơn hàng hợp lệ. |
| 13 | **UC-81** | Cancel Order | Order Fulfillment | Order Management | Hủy đơn trước khi đóng gói, tự động giải phóng lượng hàng đã giữ chỗ ($-Reserved$). |
| 14 | **UC-82** | Create Merchandise Return Request | Reverse Logistics | Return Merchandise Authorization | Tiếp nhận phản hồi và tạo phiếu yêu cầu đổi/trả hàng (RMA) cho khách. |
| 15 | **UC-83** | Create Customer Exchange Order | Reverse Logistics | Customer Exchange Processing | Tạo đơn hàng đổi mới (chọn mã SKU thay thế, liên kết mã RMA) cho khách. |

---

## II. ĐỐI CHIẾU VÀ ĐIỀU CHỈNH THEO CẤU TRÚC CODE THỰC TẾ

### 1. Điều chỉnh cấu trúc thư mục Backend (`ARAWMS_BE`)
Trong bản `kehoach seller.docx` cũ, các service bị chia rời rạc không đồng bộ với cấu trúc module của dự án. 
Dự án thực tế tổ chức mã nguồn backend theo cấu trúc **Module Domain** (tương ứng 11 Major Features trong file chú thích):

```
ARAWMS_BE/
├── src/
│   ├── common/
│   │   ├── constants/
│   │   │   └── enums.js                   # Chứa ROLES, ORDER_STATUS, WAREHOUSE_TYPES...
│   │   ├── middlewares/
│   │   │   ├── authenticate.js            # Xác thực JWT Token & giải mã req.user
│   │   │   ├── authorizeRole.js           # Kiểm tra quyền: authorizeRole('SELLER', 'OWNER')
│   │   │   └── errorHandler.js            # Xử lý lỗi tập trung
│   │   └── utils/
│   │       ├── apiResponse.js             # Chuẩn hóa format response { success, data, message }
│   │       └── logger.js                  # Ghi log file / console
│   ├── config/
│   │   ├── db.js                          # Mongoose Connection
│   │   └── env.js                         # Biến môi trường
│   ├── models/                            # [ĐÃ ĐẦY ĐỦ MODEL SCHEMAS]
│   │   ├── User.model.js
│   │   ├── Customer.model.js
│   │   ├── ChatConversation.model.js
│   │   ├── ChatMessage.model.js
│   │   ├── Sku.model.js
│   │   ├── SalesOrder.model.js
│   │   ├── ReturnRequest.model.js
│   │   ├── CounterSequence.model.js
│   │   ├── InventoryTransaction.model.js
│   │   └── SystemLog.model.js
│   ├── modules/                           # [CÁC MODULE CHỨC NĂNG CHÍNH]
│   │   ├── conversational-commerce/       # Phân hệ Thương mại Hội thoại (Seller chính)
│   │   │   ├── chat-messenger/            # Phụ trách UC-70, 71, 72, 73, 74, 75, 76, 77
│   │   │   │   ├── chatMessenger.controller.js
│   │   │   │   ├── chatMessenger.routes.js
│   │   │   │   ├── chatMessenger.service.js
│   │   │   │   └── chatMessenger.validation.js
│   │   │   └── chat-routing/              # Phụ trách UC-69 (Auto-assign chat)
│   │   │       ├── chatRouting.controller.js
│   │   │       ├── chatRouting.routes.js
│   │   │       ├── chatRouting.service.js
│   │   │       └── chatRouting.validation.js
│   │   ├── order-fulfillment/             # Phân hệ Xử lý Đơn hàng (Seller + Warehouse)
│   │   │   └── order-management/          # Phụ trách UC-78, 79, 80, 81 (Seller order flow)
│   │   │       ├── orderManagement.controller.js
│   │   │       ├── orderManagement.routes.js
│   │   │       ├── orderManagement.service.js
│   │   │       └── orderManagement.validation.js
│   │   └── reverse-logistics/             # Phân hệ Hậu cần ngược (Seller + Warehouse + Kế toán)
│   │       └── return-rma/                # Phụ trách UC-82, 83 (RMA & Exchange Order)
│   │           ├── returnRma.controller.js
│   │           ├── returnRma.routes.js
│   │           ├── returnRma.service.js
│   │           └── returnRma.validation.js
│   └── routes/
│       ├── api.js                         # Mount các router con vào /api/...
│       └── index.js
```

### 2. Chuẩn hóa Schema & Fields theo Model đã có trong code
Không tự tạo tên trường tùy tiện, mà bám sát 100% schema đã định nghĩa trong `src/models/`:

1. **`Customer`** (`Customer.model.js`):
   - Mã khách hàng: `customerCode` (tự động sinh qua `CounterSequence.getNextSequence('CUSTOMER_CODE', 'CUST')`).
   - Định danh Facebook: `facebookPsid` (unique, sparse, indexed).
   - Thông tin cá nhân: `fullName`, `phone`, `email`.
   - Sổ địa chỉ: `addresses`: `[{ recipientName, phone, fullAddress, isDefault }]`.
   - Phân loại & CRM: `tags: [String]`, `totalOrders`, `totalSpent`.

2. **`ChatConversation`** (`ChatConversation.model.js`):
   - `fbConversationId` (unique, index), `customerId` (ref `Customer`).
   - `assignedSellerId` (ref `User`, index) - Seller phụ trách phiên chat.
   - `status`: enum `['UNASSIGNED', 'ACTIVE', 'RESOLVED']`.
   - `lastMessagePreview`, `lastMessageAt`, `unreadCount`, `tags: [String]`.

3. **`ChatMessage`** (`ChatMessage.model.js`):
   - `conversationId` (ref `ChatConversation`), `fbMessageId`.
   - `senderType`: enum `['CUSTOMER', 'SELLER', 'SYSTEM']`.
   - `senderSellerId`: ref `User` (khi senderType là SELLER).
   - `messageText`, `attachments`: `[{ type, url }]`.
   - `referencedSkuId`: ref `Sku` (gợi ý/tư vấn sản phẩm nhanh trong khung chat).
   - `sentAt`: Date (compound index: `{ conversationId: 1, sentAt: -1 }`).

4. **`User`** (`User.model.js` - Chuyên biệt cho Seller):
   - `roleCode: 'SELLER'`.
   - Trạng thái trực: `isOnlineForChat` (Boolean, index).
   - Tải công việc hiện tại: `activeChatCount` (Number, default 0).
   - Dùng cho thuật toán Round-Robin / Least-Busy Routing trong UC-69.

5. **`Sku`** (`Sku.model.js` - Tra cứu tồn kho):
   - `skuCode`, `skuBarcode`, `productId` (ref `Product`), `styleName`, `color`, `size` (`XS`..`XXL`, `FREESIZE`).
   - `retailPrice`, `unitCogs`.
   - Tồn vật lý: `onHandQty`, Tồn giữ chỗ: `reservedQty`, Tồn cách ly lỗi: `defectQuarantineQty`.
   - Virtual Field chuẩn: `availableQty = onHandQty - reservedQty`.
   - Khóa lạc quan chống Race Condition: `optimisticConcurrency: true, versionKey: 'version'`.

6. **`SalesOrder`** (`SalesOrder.model.js`):
   - Mã đơn: `orderCode` (sinh qua `CounterSequence.getNextSequence('ORDER_CODE', 'ORD')`).
   - Khách & Nhân viên: `customerId`, `sellerId`, `conversationId`.
   - Loại đơn: `orderType` (`'DIRECT_SALES'` hoặc `'EXCHANGE_ORDER'`).
   - Liên kết RMA: `linkedReturnRequestId` (ref `ReturnRequest`, dùng cho UC-83).
   - Trạng thái vòng đời chuẩn từ `enums.js`:
     ```
     PENDING ──(UC-79)──> CONFIRMED_RESERVED ──(Kho nhặt)──> PICKING ──(Kho đóng gói)──> PACKED 
        │                        │
        └──(UC-81)───────────────┴──(UC-81: Nhả Reserved)──> CANCELLED
     ```
   - Chi tiết sản phẩm: `items: [{ skuId, skuCode, skuBarcode, orderedQty, unitSalePrice, unitCogsSnapshot }]`.
   - Tài chính: `financialSummary: { itemsSubtotal, shippingFee, discountAmount, totalOrderAmount, expectedCodAmount }`.
   - Người nhận: `shippingRecipient: { name, phone, address }`.
   - Khóa lạc quan: `optimisticConcurrency: true, versionKey: 'version'`.

7. **`ReturnRequest`** (`ReturnRequest.model.js`):
   - Mã RMA: `rmaCode` (sinh qua `CounterSequence.getNextSequence('RMA_CODE', 'RMA')`).
   - Đơn gốc: `originalOrderId`, Khách: `customerId`, Người tạo: `createdBySellerId`.
   - Loại: `returnType`: enum `['RETURN_FOR_REFUND', 'EXCHANGE_PRODUCT']`.
   - Mã vận đơn hoàn: `returnWaybillCode`.
   - Trạng thái RMA: `status`: enum `['REQUESTED', 'UNBOXED_INSPECTED', 'ACCOUNTANT_APPROVED', 'COMPLETED', 'REJECTED']`.
   - **Lưu ý nghiệp vụ cốt lõi từ `chú thích AraWMS`**:
     * Seller chỉ được tạo ở trạng thái `REQUESTED`.
     * **TUYỆT ĐỐI KHÔNG** tự ý cộng lại `onHandQty` ở bước này! Việc kiểm đếm, quay video unboxing và phân loại tái nhập kho thuộc thẩm quyền của Warehouse Staff (UC-67) và Kế toán phê duyệt khấu trừ phụ phí 10% (UC-100).

8. **`InventoryTransaction` & `SystemLog`**:
   - Mọi thao tác giữ chỗ hoặc nhả tồn giữ chỗ của Seller **BẮT BUỘC** phải tạo bản ghi:
     * Giữ chỗ khi Confirm: `transactionType: 'ORDER_RESERVE'`, `referenceModel: 'SalesOrder'`.
     * Nhả chỗ khi Cancel: `transactionType: 'ORDER_CANCEL_RELEASE'`, `referenceModel: 'SalesOrder'`.
   - Mọi thao tác tạo đơn, hủy đơn, sửa khách hàng, tạo RMA phải ghi `SystemLog` với `actorRole: 'SELLER'`.

---

## III. KẾ HOẠCH TRIỂN KHAI CHI TIẾT 15 USE CASES (THEO MODULE & FLOW)

---

### GIAI ĐOẠN 1: NỀN TẢNG BẢO MẬT & PHÂN QUYỀN SELLER
*Nền tảng bảo vệ toàn bộ 15 Use Cases.*

#### 1. Backend:
- Hoàn thiện middleware `src/common/middlewares/authenticate.js`: Kiểm tra Bearer Token, gán thông tin `req.user` (`{ _id, employeeCode, roleCode, fullName }`).
- Hoàn thiện middleware `src/common/middlewares/authorizeRole.js`:
  ```javascript
  export const authorizeRole = (...allowedRoles) => (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.roleCode)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient role permissions' });
    }
    next();
  };
  ```
- Seller Data Isolation: Trong các truy vấn Chat và Order, kiểm tra nếu user có `roleCode === 'SELLER'`, tự động gán query condition `sellerId: req.user._id` (hoặc `assignedSellerId`), không để Seller can thiệp vào khách/đơn của Seller khác (trừ khi có quyền phân bổ lại).

#### 2. Frontend (`ARAWMS_FE`):
- Thêm route protection: `RoleRoute` kiểm tra `user.roleCode === 'SELLER' || user.roleCode === 'OWNER'`.
- Layout riêng cho Seller: Sidebar chỉ hiển thị các mục thuộc quyền: *Hội thoại (Chat & CRM)*, *Đơn hàng bán lẻ*, *Đổi trả hàng (RMA)*. Ẩn toàn bộ các menu Nhập kho, KCS xưởng, Quản trị hợp đồng NCC và Báo cáo P&L kế toán.

---

### GIAI ĐOẠN 2: UC-69 - AUTO-ASSIGN CUSTOMERS TO SALES
*Tự động tiếp nhận và điều phối hội thoại Facebook Messenger.*

- **Thư mục Backend**: `src/modules/conversational-commerce/chat-routing/`
- **File thực hiện**:
  * `chatRouting.service.js`
  * `chatRouting.controller.js`
  * `chatRouting.routes.js`
  * `chatRouting.validation.js`

#### Chi tiết xử lý Backend:
1. **Webhook Facebook Inbound**: Endpoint tiếp nhận tin nhắn từ Facebook Messenger webhook (`POST /api/conversations/routing/inbound-webhook`).
2. **Khách hàng cũ vs Khách hàng mới**:
   - Tìm kiếm `Customer` theo `facebookPsid`.
   - Nếu đã tồn tại `Customer`: Tìm `ChatConversation` đang mở (`status: 'ACTIVE'`). Nếu đã có Seller phụ trách (`assignedSellerId`), tiếp tục giữ phiên cho Seller đó.
   - Nếu chưa có `Customer`: Tự động tạo hồ sơ khách hàng tạm thời (`customerCode` sinh bằng `CounterSequence`, gán `fullName` lấy từ Facebook Graph API Profile).
3. **Cơ chế Phân bổ Thông minh (Least-Busy Routing)**:
   - Truy vấn danh sách Seller khả dụng:
     ```javascript
     const availableSellers = await User.find({
       roleCode: 'SELLER',
       status: 'ACTIVE',
       isOnlineForChat: true
     }).sort({ activeChatCount: 1, updatedAt: 1 });
     ```
   - Chọn Seller có `activeChatCount` thấp nhất.
   - Gán `assignedSellerId = chosenSeller._id`.
   - Tăng `activeChatCount` của Seller lên 1:
     `await User.findByIdAndUpdate(chosenSeller._id, { $inc: { activeChatCount: 1 } });`
   - Tạo hoặc kích hoạt `ChatConversation` với `status: 'ACTIVE'`, `assignedSellerId`.
4. **Realtime Broadcast**: Phát sự kiện qua Socket.io / SSE tới riêng phòng của Seller đó: `chat:assigned_new`.

---

### GIAI ĐOẠN 3: UC-71 & UC-70 - CRM KHÁCH HÀNG (CREATE & EDIT CUSTOMER)
*Tạo và cập nhật hồ sơ khách hàng ngay trong phiên chat.*

- **Thư mục Backend**: `src/modules/conversational-commerce/chat-messenger/`
- **Use Cases liên quan**:
  * **UC-71**: Create New Customer Profile (khi khách lần đầu nhắn tin).
  * **UC-70**: Edit Customer Information (bổ sung số điện thoại, địa chỉ nhận hàng).

#### Chi tiết xử lý Backend:
1. **API UC-71: Tạo khách hàng mới (`POST /api/conversations/customers`)**:
   - Sinh `customerCode` tự động qua `CounterSequence.getNextSequence('CUSTOMER_CODE', 'CUST')`.
   - Lưu `fullName`, `phone`, `addresses: [{ recipientName, phone, fullAddress, isDefault: true }]`, `facebookPsid`.
   - Liên kết khách hàng vừa tạo vào `ChatConversation.customerId`.
2. **API UC-70: Cập nhật thông tin khách (`PUT /api/conversations/customers/:id`)**:
   - Validate thông tin: Không cho phép sửa đổi `facebookPsid` (vì là định danh cố định từ Facebook).
   - Cho phép thêm/sửa/xóa sổ địa chỉ (`addresses`).
   - Cập nhật thông tin liên hệ và ghi `SystemLog` thay đổi (`beforeSnapshot`, `afterSnapshot`).

---

### GIAI ĐOẠN 4: UC-72, UC-73, UC-74 - GIAO DIỆN CHAT TẬP TRUNG, GẮN THẺ & NHẮN TIN
*Không gian làm việc trung tâm hàng ngày của Seller.*

- **Thư mục Backend**: `src/modules/conversational-commerce/chat-messenger/`

#### 1. UC-72: View Messenger Conversations
- **API `GET /api/conversations`**:
  * Query params: `status`, `tag`, `search` (tên/SĐT khách), `page`, `limit`.
  * Tự động filter theo `assignedSellerId: req.user._id` (nếu role là SELLER).
  * Sort theo `lastMessageAt: -1`.
  * Populate: `customerId` (lấy tên, SĐT, tags, địa chỉ mặc định).
- **API `GET /api/conversations/:id/messages`**:
  * Phân trang tin nhắn theo thời gian giảm dần (Cursor-based hoặc Page-based).
  * Populate `referencedSkuId` để hiển thị thẻ sản phẩm đính kèm nếu có.

#### 2. UC-73: Tag Customer Chat
- **API `POST /api/conversations/:id/tags` & `DELETE /api/conversations/:id/tags`**:
  * Cho phép gắn các nhãn nghiệp vụ (VD: `VIP`, `Khách sỉ`, `Cần tư vấn size`, `Chờ chuyển khoản`, `Đã chốt đơn`).
  * Đồng bộ tag vào `ChatConversation.tags` và `Customer.tags` (nếu là tag khách hàng).

#### 3. UC-74: Message Customer
- **API `POST /api/conversations/:id/messages`**:
  * Payload: `{ messageText, attachments: [{ type, url }], referencedSkuId }`.
  * Kiểm tra quyền: Đảm bảo conversation này đang do Seller hiện tại phụ trách.
  * Lưu bản ghi `ChatMessage` vào MongoDB (`senderType: 'SELLER'`, `senderSellerId: req.user._id`).
  * Gọi Facebook Send API để gửi tin nhắn đến Facebook Messenger của khách.
  * Cập nhật `ChatConversation`: `lastMessagePreview = messageText`, `lastMessageAt = new Date()`.
  * Phát socket `chat:new_message` cho màn hình chat của Seller.

---

### GIAI ĐOẠN 5: UC-75 & UC-76 - LỊCH SỬ TƯƠNG TÁC & LỊCH SỬ MUA HÀNG
*Cung cấp thông tin đa chiều để Seller tư vấn cá nhân hóa và Upsell.*

- **Thư mục Backend**: `src/modules/conversational-commerce/chat-messenger/`

#### 1. UC-75: View Customer Interaction History
- **API `GET /api/conversations/customers/:customerId/interaction-history`**:
  * Lấy danh sách tất cả các phiên chat trước đây của khách hàng.
  * Trả về thông tin tóm tắt: Thời gian bắt đầu, thời gian kết thúc, Seller từng tư vấn, các tag đã gắn, bản tóm tắt nội dung trao đổi.

#### 2. UC-76: View Customer Purchase History
- **API `GET /api/conversations/customers/:customerId/purchase-history`**:
  * Truy vấn bảng `SalesOrder` theo `customerId`.
  * Trả về: Mã đơn `orderCode`, ngày đặt, trạng thái đơn (`status`), danh sách SKU, tổng tiền `financialSummary.totalOrderAmount`, trạng thái COD.
  * Hiển thị ngay tab bên phải màn hình chat giúp Seller biết khách hay mặc size gì, màu gì để tư vấn sản phẩm mới phù hợp.

---

### GIAI ĐOẠN 6: UC-77 - TRA CỨU TỒN KHẢ DỤNG THEO SKU THỜI GIAN THỰC
*Trọng tâm nghiệp vụ: Đảm bảo Seller không bán vượt quá số lượng hàng có thể giao.*

- **Thư mục Backend**: `src/modules/conversational-commerce/chat-messenger/` (hoặc kết nối `master-data` SKU)
- **Use Case**: **UC-77: Lookup Real-time Available Stock by SKU**

#### Chi tiết xử lý Backend:
- **API `GET /api/conversations/inventory/sku-lookup`**:
  * Query params: `search` (tìm theo `skuCode`, `skuBarcode`, hoặc tên mẫu/màu/size).
  * Công thức tính tồn kho chuẩn trong `Sku.model.js`:
    $$\text{Available Stock} = \text{onHandQty} - \text{reservedQty}$$
  * Lọc chỉ lấy các SKU đang active (`isActive: true`).
  * Trả về response chi tiết:
    ```json
    {
      "skuId": "65b...",
      "skuCode": "AO-POLO-TRANG-L",
      "skuBarcode": "8931234567890",
      "styleName": "Áo Polo Pima Cotton",
      "color": "Trắng",
      "size": "L",
      "retailPrice": 350000,
      "onHandQty": 50,
      "reservedQty": 12,
      "availableQty": 38,
      "status": "IN_STOCK"
    }
    ```
- **Frontend Widget**:
  * Đặt ngay khung tiện ích bên phải màn hình chat.
  * Seller gõ tìm mã hàng hoặc tên sản phẩm $\rightarrow$ Hệ thống gợi ý bảng màu, size kèm tồn khả dụng màu xanh (nếu $>0$) hoặc cảnh báo hết hàng màu đỏ (nếu $\le 0$).
  * Seller có thể click "Gửi thông tin cho khách" (tự động đính kèm `referencedSkuId` vào tin nhắn) hoặc click "Thêm vào đơn hàng".

---

### GIAI ĐOẠN 7: UC-78, UC-79, UC-80, UC-81 - QUẢN LÝ ĐƠN HÀNG BÁN LẺ & GIỮ CHỖ TỒN KHO
*Trọng tâm phân hệ Order Fulfillment: Xử lý đơn hàng, khoá tồn và giải phóng tồn.*

- **Thư mục Backend**: `src/modules/order-fulfillment/order-management/`
- **File thực hiện**:
  * `orderManagement.service.js`
  * `orderManagement.controller.js`
  * `orderManagement.routes.js`
  * `orderManagement.validation.js`

```
  ┌───────────────┐
  │ UC-78: Tạo Đơn │ ──> Status: PENDING (Chưa giữ chỗ kho)
  └───────┬───────┘
          │
  ┌───────▼───────┐
  │ UC-79: Confirm│ ──> Kiểm tra Available Qty >= Ordered Qty
  └───────┬───────┘     Nếu đủ: +reservedQty trên SKU, ghi InventoryTransaction (ORDER_RESERVE)
          │             Chuyển Status: CONFIRMED_RESERVED (Chờ Kho in Pick-list)
          │
          ├─── [Nếu khách đổi ý] ──> UC-81: CANCEL ORDER (Trước khi đóng gói PACKED)
          │                          - Giảm reservedQty trên SKU
          │                          - Ghi InventoryTransaction (ORDER_CANCEL_RELEASE)
          │                          - Chuyển Status: CANCELLED
          │
          └─── [Kho tiếp nhận] ────> UC-80: Update Status (PICKING -> PACKED -> DELIVERED)
```

#### 1. UC-78: Create Direct New Order
- **API `POST /api/orders`**:
  * Input: `{ customerId, conversationId, shippingRecipient: { name, phone, address }, items: [{ skuId, orderedQty, unitSalePrice }], financialSummary: { shippingFee, discountAmount } }`.
  * Validate:
    + Khách hàng tồn tại.
    + Danh sách sản phẩm: kiểm tra từng `skuId` hợp lệ, lấy `unitCogsSnapshot = sku.unitCogs`.
  * Tính toán tài chính:
    + `itemsSubtotal = sum(orderedQty * unitSalePrice)`
    + `totalOrderAmount = itemsSubtotal + shippingFee - discountAmount`
    + `expectedCodAmount = totalOrderAmount` (nếu thanh toán COD).
  * Sinh mã đơn nguyên tử qua Counter:
    `orderCode = await CounterSequence.getNextSequence('ORDER_CODE', 'ORD', 5);` $\rightarrow$ Ví dụ: `ORD-00125`.
  * Lưu `SalesOrder` với `status: 'PENDING'`, `sellerId: req.user._id`, `orderType: 'DIRECT_SALES'`.
  * Cập nhật chỉ số khách hàng: `totalOrders += 1`, `totalSpent += totalOrderAmount`.

#### 2. UC-79: Confirm Order Creation (Kích hoạt Giữ chỗ tồn kho)
- **API `POST /api/orders/:id/confirm`**:
  * Điều kiện tiên quyết: Đơn hàng tồn tại và đang ở trạng thái `status === 'PENDING'`.
  * **Sử dụng Mongoose Transaction để đảm bảo tính toàn vẹn (ACID)**:
    ```javascript
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await SalesOrder.findById(orderId).session(session);
      for (const item of order.items) {
        // Kiểm tra tồn kho khả dụng ngay tại thời điểm confirm
        const sku = await Sku.findById(item.skuId).session(session);
        const currentAvailable = sku.onHandQty - sku.reservedQty;
        if (currentAvailable < item.orderedQty) {
          throw new Error(`Sản phẩm ${sku.skuCode} không đủ tồn khả dụng (Còn ${currentAvailable}, yêu cầu ${item.orderedQty})`);
        }
        
        // Tăng reservedQty
        sku.reservedQty += item.orderedQty;
        await sku.save({ session });

        // Ghi nhận InventoryTransaction loại ORDER_RESERVE
        const txCode = await CounterSequence.getNextSequence('INVENTORY_TX', 'TX', 6);
        await InventoryTransaction.create([{
          transactionCode: txCode,
          warehouseType: 'FINISHED_GOODS',
          itemType: 'FINISHED_SKU',
          skuId: sku._id,
          transactionType: 'ORDER_RESERVE',
          referenceModel: 'SalesOrder',
          referenceId: order._id,
          quantityChange: item.orderedQty,
          onHandBefore: sku.onHandQty,
          onHandAfter: sku.onHandQty,
          unitCostSnapshot: sku.unitCogs,
          performedByUserId: req.user._id
        }], { session });
      }

      // Cập nhật trạng thái đơn hàng
      order.status = 'CONFIRMED_RESERVED';
      order.warehouseFulfillment.stockReservedAt = new Date();
      await order.save({ session });

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
    ```
  * Ghi `SystemLog` hành động Confirm Order của Seller.

#### 3. UC-80: Update Order Status
- **API `PATCH /api/orders/:id/status`**:
  * Kiểm tra máy trạng thái đơn hàng (Order State Machine):
    + `PENDING` $\rightarrow$ `CONFIRMED_RESERVED` (qua UC-79).
    + `CONFIRMED_RESERVED` $\rightarrow$ `CANCELLED` (qua UC-81).
    + `CONFIRMED_RESERVED` $\rightarrow$ `PICKING` $\rightarrow$ `PACKED` $\rightarrow$ `HANDED_OVER_CARRIER` $\rightarrow$ `DELIVERED` (các bước sau chủ yếu do Nhân viên kho và Hãng vận chuyển cập nhật).
  * Cho phép Seller cập nhật thông tin người nhận hàng (`shippingRecipient`) hoặc thêm ghi chú nếu đơn hàng chưa ở trạng thái `PACKED`.

#### 4. UC-81: Cancel Order (Giải phóng tồn kho đã giữ chỗ)
- **API `POST /api/orders/:id/cancel`**:
  * Ràng buộc nghiệp vụ quan trọng từ `chú thích AraWMS`: **Chỉ cho phép hủy đơn trước khi đơn được đóng gói (`status !== 'PACKED'`)**. Nếu hàng đã đóng gói và trừ tồn vật lý, phải chuyển sang quy trình Hàng hoàn / Đổi trả.
  * Nếu đơn đang ở trạng thái `CONFIRMED_RESERVED`:
    * Chạy Transaction giảm `reservedQty` của từng SKU:
      `sku.reservedQty -= item.orderedQty;`
    * Ghi `InventoryTransaction` loại `ORDER_CANCEL_RELEASE`.
  * Cập nhật `order.status = 'CANCELLED'`.
  * Hoàn trả lại chỉ số tích lũy của khách hàng (`totalOrders`, `totalSpent`).
  * Ghi `SystemLog` lý do hủy đơn.

---

### GIAI ĐOẠN 8: UC-82 & UC-83 - HẬU CẦN NGƯỢC: YÊU CẦU ĐỔI TRẢ (RMA) & TẠO ĐƠN HÀNG ĐỔI MỚI
*Xử lý khiếu nại khách hàng, đổi size/mẫu hoặc hoàn trả tiền.*

- **Thư mục Backend**: `src/modules/reverse-logistics/return-rma/`
- **File thực hiện**:
  * `returnRma.service.js`
  * `returnRma.controller.js`
  * `returnRma.routes.js`
  * `returnRma.validation.js`

#### 1. UC-82: Create Merchandise Return Request
- **API `POST /api/returns/rma`**:
  * Input: `{ originalOrderId, returnType: ('RETURN_FOR_REFUND' | 'EXCHANGE_PRODUCT'), returnWaybillCode, reasonDescription, returnItems: [{ skuId, returnedQty }] }`.
  * Validate:
    + Đơn hàng gốc tồn tại và đã ở trạng thái `DELIVERED` hoặc `HANDED_OVER_CARRIER`.
    + Sản phẩm yêu cầu trả phải có trong đơn hàng gốc với số lượng hợp lệ.
  * Sinh mã RMA tự động:
    `rmaCode = await CounterSequence.getNextSequence('RMA_CODE', 'RMA', 5);` $\rightarrow$ Ví dụ: `RMA-00042`.
  * Tạo bản ghi `ReturnRequest`:
    + `status = 'REQUESTED'`
    + `createdBySellerId = req.user._id`
    + `customerId = originalOrder.customerId`
  * Cập nhật đơn hàng gốc: `originalOrder.status = 'RETURN_REQUESTED'`.
  * **LƯU Ý**: KHÔNG cộng tồn kho ở bước này. Trạng thái RMA chuyển sang chờ Nhân viên kho quét kiện hoàn và quay video khui hàng (UC-67).

#### 2. UC-83: Create Customer Exchange Order
- **API `POST /api/returns/rma/:rmaId/create-exchange-order`**:
  * Điều kiện: RMA có `returnType === 'EXCHANGE_PRODUCT'`.
  * Input: Danh sách SKU đổi mới (`newItems: [{ skuId, orderedQty, unitSalePrice }]`), thông tin người nhận.
  * Kiểm tra tồn kho khả dụng của các SKU thay thế.
  * Sinh mã đơn hàng mới: `orderCode` qua `CounterSequence`.
  * Tạo bản ghi `SalesOrder`:
    + `orderType = 'EXCHANGE_ORDER'`
    + `linkedReturnRequestId = rma._id`
    + `sellerId = req.user._id`
    + `status = 'PENDING'` (hoặc gọi luôn luồng confirm nếu chính sách cho phép giữ hàng trước).
  * Tính chênh lệch giá giữa hàng đổi mới và hàng trả về:
    `exchangePriceVarianceAmount = newOrderTotal - originalReturnedValue`.
  * Cập nhật ID đơn đổi vào RMA: `rma.financialAccounting.exchangeOrderId = newOrder._id`.

---

### GIAI ĐOẠN 9: FRONTEND - THIẾT KẾ GIAO DIỆN SELLER CHUYÊN BIỆT (`ARAWMS_FE`)

Để đáp ứng thao tác nhanh chóng và mượt mà cho nhân viên bán hàng, frontend cần xây dựng màn hình **Seller Chat Workspace** theo layout **3 cột tập trung (Triple-Pane Workspace)**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               SELLER CONVERSATION WORKSPACE                            │
├────────────────────┬───────────────────────────────────┬───────────────────────────────┤
│ CỘT 1: CONVERSATIONS│ CỘT 2: CHAT WINDOW                │ CỘT 3: INTEGRATED WIDGETS     │
│                    │                                   │                               │
│ [Search & Tag]     │ Header: Khách hàng + Trạng thái   │ [TAB 1: CRM Profile & Edit]   │
│ ────────────────── │ ───────────────────────────────── │ - Tên, SĐT, Sổ địa chỉ (UC-70)│
│ Conv #1 (VIP)      │ Tin nhắn khách: "Shop còn áo này  │ - Lịch sử tương tác (UC-75)   │
│ Conv #2 (Chờ chốt) │ size L trắng không ạ?"            │                               │
│ Conv #3 (Đã gửi)   │                                   │ [TAB 2: Tra cứu tồn (UC-77)]  │
│                    │ Tin nhắn Seller: Gửi ảnh & thẻ    │ - Search SKU, Màu, Size       │
│                    │ sản phẩm Polo Trắng L             │ - Tồn khả dụng: Còn 38 (Xanh) │
│                    │                                   │                               │
│                    │ ───────────────────────────────── │ [TAB 3: Tạo đơn hàng (UC-78)] │
│                    │ Input chat: Gõ tin nhắn + Gửi SKU │ - Chọn sản phẩm vừa tra cứu   │
│                    │ Nút: [Tạo đơn nhanh từ chat]      │ - Nút [Xác nhận giữ chỗ UC-79]│
│                    │                                   │                               │
│                    │                                   │ [TAB 4: Đổi trả RMA (UC-82)]  │
└────────────────────┴───────────────────────────────────┴───────────────────────────────┘
```

#### Cấu trúc thư mục Frontend đề xuất:
```
ARAWMS_FE/src/
├── pages/
│   └── seller/
│       ├── SellerChatPage.jsx              # Màn hình chính 3 cột
│       ├── SellerOrdersPage.jsx            # Danh sách quản lý đơn bán lẻ
│       └── SellerReturnsPage.jsx           # Quản lý yêu cầu RMA & đổi hàng
├── components/
│   └── seller/
│       ├── ConversationList.jsx            # Cột 1: Danh sách hội thoại
│       ├── ChatBox.jsx                     # Cột 2: Khung chat, bong bóng tin nhắn
│       ├── CustomerProfilePanel.jsx        # Cột 3 (Tab 1): Thông tin CRM & Sửa khách
│       ├── SkuStockLookupWidget.jsx        # Cột 3 (Tab 2): Tra cứu tồn khả dụng SKU
│       ├── QuickOrderModal.jsx             # Cột 3 (Tab 3): Tạo đơn & Confirm giữ chỗ
│       ├── CustomerOrderHistory.jsx        # Lịch sử mua hàng của khách (Upsell)
│       └── CreateRmaModal.jsx              # Modal tạo yêu cầu trả/đổi hàng
├── services/
│   ├── chatService.js                      # Gọi API /api/conversations/...
│   ├── orderService.js                     # Gọi API /api/orders/...
│   └── returnService.js                    # Gọi API /api/returns/...
└── routes/
    └── AppRouter.jsx                       # Bổ sung route /seller/... với RoleRoute
```

---

## IV. MA TRẬN ÁNH XẠ 15 USE CASES VỚI CÁC FILE MÃ NGUỒN CỤ THỂ

| Mã UC | Tên chức năng | File Controller & Routes (Backend) | File Service (Backend Logic) | Model tương tác | Component Frontend |
|:---:|:---|:---|:---|:---|:---|
| **UC-69** | Auto-assign Customers | `chatRouting.controller.js`<br>`chatRouting.routes.js` | `chatRouting.service.js` | `User`, `ChatConversation`, `Customer` | `ConversationList.jsx` |
| **UC-70** | Edit Customer Info | `chatMessenger.controller.js`<br>`chatMessenger.routes.js` | `chatMessenger.service.js` | `Customer`, `SystemLog` | `CustomerProfilePanel.jsx` |
| **UC-71** | Create New Customer | `chatMessenger.controller.js`<br>`chatMessenger.routes.js` | `chatMessenger.service.js` | `Customer`, `CounterSequence` | `CustomerProfilePanel.jsx` |
| **UC-72** | View Conversations | `chatMessenger.controller.js`<br>`chatMessenger.routes.js` | `chatMessenger.service.js` | `ChatConversation`, `ChatMessage` | `SellerChatPage.jsx`<br>`ConversationList.jsx` |
| **UC-73** | Tag Customer Chat | `chatMessenger.controller.js`<br>`chatMessenger.routes.js` | `chatMessenger.service.js` | `ChatConversation`, `Customer` | `ConversationList.jsx`<br>`TagBadge.jsx` |
| **UC-74** | Message Customer | `chatMessenger.controller.js`<br>`chatMessenger.routes.js` | `chatMessenger.service.js` | `ChatMessage`, `ChatConversation` | `ChatBox.jsx` |
| **UC-75** | Interaction History | `chatMessenger.controller.js`<br>`chatMessenger.routes.js` | `chatMessenger.service.js` | `ChatConversation`, `ChatMessage` | `CustomerProfilePanel.jsx` |
| **UC-76** | Purchase History | `chatMessenger.controller.js`<br>`chatMessenger.routes.js` | `chatMessenger.service.js` | `SalesOrder` | `CustomerOrderHistory.jsx` |
| **UC-77** | Real-time Stock Lookup | `chatMessenger.controller.js`<br>`chatMessenger.routes.js` | `chatMessenger.service.js` | `Sku`, `Product` | `SkuStockLookupWidget.jsx` |
| **UC-78** | Create Direct Order | `orderManagement.controller.js`<br>`orderManagement.routes.js` | `orderManagement.service.js` | `SalesOrder`, `CounterSequence`, `Customer` | `QuickOrderModal.jsx` |
| **UC-79** | Confirm Order (Reserve) | `orderManagement.controller.js`<br>`orderManagement.routes.js` | `orderManagement.service.js` | `SalesOrder`, `Sku`, `InventoryTransaction` | `QuickOrderModal.jsx`<br>`OrderActionButtons.jsx` |
| **UC-80** | Update Order Status | `orderManagement.controller.js`<br>`orderManagement.routes.js` | `orderManagement.service.js` | `SalesOrder`, `SystemLog` | `SellerOrdersPage.jsx` |
| **UC-81** | Cancel Order (Release) | `orderManagement.controller.js`<br>`orderManagement.routes.js` | `orderManagement.service.js` | `SalesOrder`, `Sku`, `InventoryTransaction` | `OrderActionButtons.jsx` |
| **UC-82** | Create RMA Request | `returnRma.controller.js`<br>`returnRma.routes.js` | `returnRma.service.js` | `ReturnRequest`, `CounterSequence`, `SalesOrder` | `CreateRmaModal.jsx` |
| **UC-83** | Create Exchange Order | `returnRma.controller.js`<br>`returnRma.routes.js` | `returnRma.service.js` | `SalesOrder`, `ReturnRequest`, `Sku` | `CreateRmaModal.jsx` |

---

## V. LỘ TRÌNH THỰC THI (IMPLEMENTATION ROADMAP)

Để đảm bảo code chạy ổn định và kiểm thử được từng phần, thứ tự triển khai khuyến nghị chia thành **4 Sprint**:

```
Sprint 1: Nền tảng & CRM Khách hàng (UC-69, 70, 71, 72, 73, 74)
   │     - Middleware Authenticate & Role Guard
   │     - Routing phân bổ Seller
   │     - Quản lý Chat & Hồ sơ Customer
   ▼
Sprint 2: Trợ lý Bán hàng & Tồn kho khả dụng (UC-75, 76, 77)
   │     - Tra cứu lịch sử tương tác & mua sắm
   │     - API tra cứu tồn kho khả dụng thời gian thực
   │     - Stock Widget nhúng trong màn hình chat
   ▼
Sprint 3: Xử lý Đơn hàng & Giữ chỗ kho (UC-78, 79, 80, 81)
   │     - Tạo đơn hàng bán lẻ từ chat
   │     - Giao dịch giữ chỗ (+Reserved) & nhả chỗ (-Reserved)
   │     - Ghi chép InventoryTransaction & SystemLog
   ▼
Sprint 4: Hậu cần ngược Đổi/Trả & Hoàn thiện UI/UX (UC-82, 83)
         - Tạo phiếu RMA và đơn hàng đổi mới
         - Hoàn thiện giao diện 3 cột Seller trên Frontend
         - Kiểm thử luồng End-to-End từ Chat -> Chốt Đơn -> Đổi Trả
```

---

## VI. CÁC QUY TẮC CỐT LÕI CẦN TUÂN THỦ (CHECKLIST)

1. **Không vi phạm thẩm quyền vai trò (Role Isolation)**:
   - Seller chỉ thực hiện: Giữ chỗ (`+Reserved`) và Giải phóng chỗ (`-Reserved`).
   - Seller **KHÔNG BAO GIỜ** được tự tiện trừ tồn kho vật lý (`-onHandQty`) $\rightarrow$ Việc này thuộc về Warehouse Staff khi quét đóng gói (UC-64).
   - Seller tạo RMA chỉ ở trạng thái `REQUESTED`, **KHÔNG ĐƯỢC** tự cộng lại tồn kho $\rightarrow$ Việc này thuộc về Warehouse Staff kiểm hàng hoàn (UC-67) và Kế toán duyệt (UC-100).
2. **Nguyên tử hóa mã chứng từ (Atomic Sequence)**:
   - Mọi mã định danh nghiệp vụ (`orderCode`, `rmaCode`, `customerCode`, `transactionCode`) phải được tạo thông qua `CounterSequence.getNextSequence()` để tránh trùng lặp khi nhiều Seller thao tác đồng thời.
3. **Chống Race Condition tồn kho**:
   - Tận dụng `optimisticConcurrency: true` và `versionKey: 'version'` có sẵn trong `Sku.model.js` và `SalesOrder.model.js`.
   - Các thao tác cộng/trừ số lượng tồn phải dùng atomic operators của MongoDB (`$inc`) hoặc nằm trong Mongoose Transaction.
4. **Audit Trail đầy đủ**:
   - Tất cả các thao tác thay đổi trạng thái đơn, hủy đơn, giữ chỗ, nhả chỗ và tạo RMA phải được lưu vết đầy đủ trong `SystemLog` và `InventoryTransaction`.

---

## VII. TIẾN ĐỘ THỰC TẾ & BỔ SUNG NÂNG CAO (PROGRESS TRACKING & ENHANCEMENTS)

### 1. Xử lý Đa phương tiện Khung Chat (UC-74 - Chat Multi-media Enhancements)
- **Hiển thị hình ảnh/tệp đính kèm khách gửi từ Messenger (Inbound Attachments)**:
  - Khung chat `ChatBox.jsx` tự động bóc tách mảng `attachments` từ tin nhắn Messenger.
  - Phân loại trực quan: Ảnh (grid thumbnail), Tệp âm thanh/video, File tài liệu (kèm biểu tượng và dung lượng).
  - Tích hợp Lightbox Modal phóng to hình ảnh sắc nét khi click.
- **Seller gửi ảnh và tệp đính kèm trực tiếp cho khách hàng (Outbound Attachments)**:
  - Middleware Backend `chatUpload.js` (Multer 2.x): Hỗ trợ upload tối đa 5 file, dung lượng tối đa 25MB/tệp, lọc MIME types an toàn (Images, PDF, Docs, Zip).
  - Endpoint `POST /api/conversations/:id/attachments` truyền multipart `filedata` lên Facebook Graph API (`/me/messages`) và lưu trữ cục bộ tại `/uploads/chat`.
  - Khay tải tệp preview ở giao diện chat cho phép xem trước, xóa tệp đã chọn, gửi kèm chú thích văn bản (caption).

### 2. Chuẩn hóa Ma trận Chuyển trạng thái & Khắc phục lỗi 400 (UC-80, GBR-10, GBR-11, GBR-13)
- **Khắc phục lỗi `400 Bad Request` khi gọi `/api/orders/:id/status`**:
  - Đồng bộ hóa 100% enum trạng thái giữa Frontend `OrderDetailModal.jsx` và Backend `SalesOrder.model.js`.
  - Thiết lập ma trận chuyển đổi hợp lệ `ORDER_STATUS_TRANSITIONS` ngăn chặn hành vi nhảy cóc trạng thái trái phép.
- **Ràng buộc nghiệp vụ giữ chỗ và hủy đơn**:
  - Chuyển sang `CONFIRMED_RESERVED`: Tự động gọi `confirmOrderReserve` để khóa tồn kho khả dụng `+Reserved` ([BR: GBR-10]).
  - Chuyển sang `CANCELLED`: Tự động gọi `cancelOrder` để giải phóng lượng tồn đang giữ `-Reserved` ([BR: GBR-11]), hỗ trợ cả đơn đang nhặt hàng (`PICKING`).
  - Chuyển sang `HANDED_OVER_CARRIER`: Bắt buộc cung cấp mã vận đơn hợp lệ `waybillCode` ([BR: GBR-13]).

### 3. Giao diện Danh sách Đơn hàng theo chuẩn Layout Pancake / PosCake (Ảnh 2)
- **Thanh tác vụ & Kênh bán hàng (Channel Tabs)**:
  - Header: Tìm kiếm đa tiêu chí (mã đơn, SĐT, khách hàng), nút Quay lại Chat, Đồng bộ dữ liệu, Xuất Excel/CSV, Tạo đơn mới.
  - Bộ lọc kênh bán: "Tất cả", "Bán tại quầy", "Online (Facebook/Web)".
  - Tab phân loại công việc: "Đơn hàng", "Cần xử lý", "ĐƠN ĐÃ HOÀN".
- **Thanh trạng thái với số đếm động (Dynamic Status Pill Counters)**:
  - Hiển thị đầy đủ các trạng thái đơn hàng: Tất cả, Chờ xử lý, Đã xác nhận (giữ chỗ), Đang nhặt hàng, Đã đóng gói, Đã bàn giao ĐVVC, Đã giao hàng, Yêu cầu đổi/trả, Đã hủy, Đã hoàn trả.
  - Số lượng đơn tương ứng từng trạng thái được tính toán bằng MongoDB Aggregation thời gian thực từ API `GET /api/orders`.
- **Bảng danh sách đơn hàng 13 cột chi tiết chuẩn Pancake**:
  1. Checkbox chọn hàng loạt đơn.
  2. ID đơn hàng: Kèm biểu tượng Facebook nhận diện nguồn đơn chat.
  3. Mã vận đơn: Hiển thị kèm đối tác vận chuyển.
  4. Thời gian tạo đơn: Hiển thị định dạng ngày giờ kèm nhãn kênh (HT/POS).
  5. Thời gian cập nhật trạng thái gần nhất.
  6. Khách hàng: Tên khách hàng + Avatar định danh.
  7. Số điện thoại: Tự động phân tích đầu số và gắn badge nhà mạng (`Viettel`, `Mobifone`, `Vinaphone`).
  8. Mã mẫu mã SKU: Hiển thị kèm số lượng đặt mua (`SKU x Qty`).
  9. Tên sản phẩm: Tên hàng hóa chi tiết.
  10. Tổng tiền COD: Định dạng tiền tệ VNĐ nổi bật.
  11. Ghi chú: Ghi chú nội bộ cho đơn hàng.
  12. Trạng thái: Badge trạng thái màu sắc chuẩn Pancake.
  13. Thao tác: Nút "Chi tiết" mở popup `OrderDetailModal` và nút "Đổi trả" mở `CreateRmaModal`.

### 4. Kiểm soát Tuân thủ Comment & Quy tắc Nghiệp vụ
- **Quy chuẩn Commenting**:
  - Tất cả các tệp Backend và Frontend thuộc phạm vi Seller đều tuân thủ [COMMENTING_GUIDELINE.md](file:///d:/ARAWMS/COMMENTING_GUIDELINE.md):
  - File Header: Khai báo `@author : Nguyễn Quang Huy`, ngày tạo/cập nhật, mô tả tệp.
  - JSDoc: Định nghĩa tham số, kiểu trả về và ánh xạ mã Use Case.
  - Inline comment: Chú thích rõ ràng từng bước nghiệp vụ và gắn mã quy tắc `[BR: GBR-xx]`.

