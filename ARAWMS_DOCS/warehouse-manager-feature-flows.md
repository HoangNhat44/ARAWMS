# ARAWMS - Luồng Chạy Các Chức Năng Quản Lý Kho

**Mục đích**: Tài liệu này giúp hiểu rõ luồng chạy dữ liệu của từng chức năng trong hệ thống quản lý kho, từ góc độ **Quản lý kho (Warehouse Manager)**.

**Format**: Mô tả đơn giản theo flow: User bấm nút → Hàm nào → Xử lý gì → Backend handler → Response

---

## 1. CẤU HÌNH VỊ TRÍ KHO (Warehouse Layout)

### 1.1. Xem danh sách kệ theo khu

**Luồng**:
1. User vào trang "Cấu hình vị trí kho"
2. Component mount → gọi `load()` ở `WarehouseLayoutPage.jsx` dòng ~83
3. `load()` gọi API: **GET** `/api/warehouse/layout` (service: `warehouseLayoutService.js`)
4. Backend: `layoutController.getLayout()` → `layoutService.getLayout()` ở `location-layout/layout.service.js` dòng ~89
5. `getLayout()` query MongoDB: `WarehouseLayout.findOne({ warehouseType: 'FINISHED_GOODS' })`
6. Trả về data:
   - `activeVersion`: phiên bản đang hoạt động
   - `active`: sơ đồ kho đang dùng (zones, racks, bins)
   - `draft`: bản nháp (nếu có)
   - `locations`: danh sách vị trí với occupancy
7. Frontend nhận response → hiển thị:
   - Khu A: Kho nguyên phụ liệu
   - Khu B: Kho thành phẩm
   - Mỗi kệ hiển thị: mã kệ, tên, số tầng/ô, % sử dụng

---

### 1.2. Tìm kiếm và lọc kệ

**Luồng**:
1. User nhập từ khóa vào ô "Tìm mã hoặc tên kệ..." hoặc chọn filter trạng thái
2. `onChange` → cập nhật state `search[zoneCode]` hoặc `statusFilter[zoneCode]` (ở `WarehouseLayoutPage.jsx` dòng ~43)
3. Hàm `visibleRacks(zoneRacks, zoneCode)` ở `WarehouseLayoutPage.jsx` dòng ~253 filter local:
   - So sánh chuỗi lowercase với `search[zoneCode]`
   - Filter theo `statusFilter[zoneCode]` (ACTIVE/INACTIVE)
4. Re-render danh sách kệ đã filter
5. **Không gọi API** - filter hoàn toàn trên client

---

### 1.3. Xem chi tiết kệ

**Luồng**:
1. User bấm vào card của 1 kệ → gọi `selectRack(rack)` ở `WarehouseLayoutPage.jsx` dòng ~122
2. `selectRack()` cập nhật state:
   - `selectedRackId`: lưu ID kệ
   - `rackForm`: thông tin kệ (code, name, floors, binsPerFloor...)
   - `binForms`: danh sách các ô trong kệ (filter từ `bins` theo `rackId`)
   - `panelTab`: 'contents' nếu kệ đã active, 'config' nếu chưa
3. Scroll xuống panel chi tiết → hiển thị thông tin kệ
4. **Không gọi API** - data đã load từ bước 1.1

---

### 1.4. Thêm kệ mới

**Luồng**:
1. User bấm nút "+ Thêm kệ" (khu A hoặc B) → gọi `startAdding(zoneCode)` ở `WarehouseLayoutPage.jsx` dòng ~135
2. `startAdding()` set state:
   - `adding = true`
   - `rackForm = { ...emptyRack, zoneCode }`
   - `panelTab = 'config'`
3. User nhập thông tin: Mã kệ, Tên kệ, Số tầng, Ô mỗi tầng, Sức chứa mỗi ô
4. User bấm "Xác nhận thêm kệ" → gọi `save()` ở `WarehouseLayoutPage.jsx` dòng ~148
5. `save()` validate bằng hàm `validRack(rackForm)`:
   - Kiểm tra mã phải match `/^[A-Z0-9_-]+$/`, số tầng 1-12, số ô 1-20...
   - Kiểm tra mã kệ chưa tồn tại trong zone
6. Nếu valid → gọi API: **POST** `/api/warehouse/layout/draft/open`
7. Backend: `openDraft()` ở `layout.service.js` dòng ~112 tạo draft từ active version (nếu chưa có)
8. Gọi API: **POST** `/api/warehouse/layout/draft/rack`
9. Backend: `addRack()` ở `layout.service.js` dòng ~176:
   - Validate input (zoneCode, rackCode, floors, binsPerFloor, capacityPerBin...)
   - Tạo `rackId` mới
   - Tạo `bins` với ID và barcode: `LOC-{locationCode}-{random}`
   - Thêm rack và bins vào `draft`
   - Tăng `draftVersion`
10. Gọi API: **GET** `/api/warehouse/layout/draft/validate`
11. Backend: `validate()` ở `layout.service.js` kiểm tra:
    - Không có ô nào trùng barcode
    - Mỗi kệ phải có ít nhất 1 ô
    - Các ô phải có capacity hợp lệ
12. Nếu không có lỗi → gọi API: **POST** `/api/warehouse/layout/publish`
13. Backend: `publish()` ở `layout.service.js`:
    - Kiểm tra draft tồn tại và baseVersion khớp
    - Copy `draft` → `active`
    - Tăng `activeVersion`
    - Lưu vào `WarehouseLocation` collection (tạo documents cho các ô mới)
    - Log audit: `SystemLog.create()`
    - Xóa `draft`
14. Frontend reload data: `load(savedRackId)` → hiển thị kệ mới

---

### 1.5. Chỉnh sửa thông tin kệ

**Luồng**:
1. User chọn 1 kệ → panel hiển thị tab "Cấu hình"
2. User sửa tên kệ, số tầng, số ô, trạng thái (ACTIVE/INACTIVE)
3. User bấm "Xác nhận lưu" → gọi `save()` ở `WarehouseLayoutPage.jsx` dòng ~148 (xử lý cả thêm và sửa)
4. `save()` validate giống như thêm kệ
5. So sánh `floors` và `binsPerFloor` với stored data:
   - Nếu thay đổi số tầng/ô → gọi API: **PATCH** `/api/warehouse/layout/draft/rack/:rackId/resize`
   - Backend: `resizeRack()` ở `layout.service.js` thêm/xóa bins, regenerate barcode cho ô mới
6. So sánh `name` và `status`:
   - Nếu thay đổi → gọi API: **PATCH** `/api/warehouse/layout/draft` với payload `{ racks: [...] }`
   - Backend: `saveDraft()` ở `layout.service.js` cập nhật thông tin trong draft
7. So sánh thông tin từng ô (capacity, capacityUnit, status):
   - Nếu thay đổi → gọi API: **PATCH** `/api/warehouse/layout/draft` với payload `{ bins: [...] }`
8. Validate và Publish giống như thêm kệ
9. Reload data → hiển thị "Đã lưu cấu hình kệ và ô."

---

### 1.6. Xóa kệ

**Luồng**:
1. User chọn kệ → bấm "Xóa kệ"
2. Hiển thị confirmation dialog: "Xóa kệ ... khỏi sơ đồ kho?"
3. User bấm "Xác nhận xóa kệ" → gọi `removeRack()` ở `WarehouseLayoutPage.jsx` dòng ~184
4. `removeRack()` gọi API: **POST** `/api/warehouse/layout/draft/open`
5. Gọi API: **DELETE** `/api/warehouse/layout/draft/rack/:rackId`
6. Backend: `removeRack()` ở `layout.service.js`:
   - Kiểm tra kệ có hàng không bằng `activeBinUsage(binIds)` ở `layout.service.js` dòng ~56
     - Query `WarehouseLocation`, `ProductUnit`, `FabricRoll`, `MaterialStockLot`, `PutawayAllocation`
     - Nếu có hàng hoặc hàng chờ xếp → reject
   - Xóa rack và bins khỏi draft
7. Validate và Publish
8. Reload data → hiển thị "Đã xóa kệ ... khỏi sơ đồ kho."

---

### 1.7. In tem vị trí (Print Location Labels) - CHỨC NĂNG PHỤ

#### 1.7.1. In tem 1 ô

**Luồng**:
1. User mở chi tiết kệ → chọn tầng → xem danh sách ô
2. Mỗi ô hiển thị barcode, có nút "Xem / in QR ô kệ"
3. User bấm nút → gọi `printBin(bin)` ở `WarehouseLayoutPage.jsx` dòng ~207
4. `printBin()` mở tab mới: `window.open('', '_blank')`
5. Gọi 2 API song song:
   - **GET** `/api/warehouse/layout/location/:binId/label` → thông tin ô (locationCode, capacity...)
   - **GET** `/api/warehouse/layout/location/:binId/label/qr` → ảnh QR code (Blob)
6. Backend `label()` ở `layout.controller.js`: trả về JSON với thông tin ô
7. Backend `labelQrImage()` ở `layout.controller.js`:
   - Generate QR code từ barcode (dùng `qrcode` library)
   - Trả về PNG image (content-type: image/png)
8. Frontend nhận response:
   - Convert Blob → `URL.createObjectURL(qrImage)`
   - Gọi `writeLocationLabel(printWindow, { ...label, imageUrl })` ở `utils/locationLabelPrint.js`
9. `writeLocationLabel()`:
   - Tạo HTML template với: Barcode text, QR code image, Location info (khu, kệ, tầng, ô), Capacity
   - Inject HTML vào print tab
   - Gọi `window.print()`
10. Gọi API: **POST** `/api/warehouse/layout/location/:binId/print-intent`
11. Backend `printIntent()` ở `layout.controller.js`:
    - Lưu log vào `WarehouseBarcodeHistory` collection
    - Record: `{ locationId, eventType: 'PRINT', actorId, timestamp }`
12. User in xong → đóng tab → `URL.revokeObjectURL(imageUrl)`

---

#### 1.7.2. In tem nhiều ô (In tem kệ)

**Luồng**:
1. User chọn kệ → bấm nút "In tem kệ"
2. Hiển thị modal với danh sách tất cả ô trong kệ
3. State `selectedLabels` được set với tất cả `binId` của kệ (ở `WarehouseLayoutPage.jsx` dòng ~44-45)
4. User có thể deselect một số ô không muốn in
5. User bấm "In tem đã chọn" → gọi `printSelectedLabels()` ở `WarehouseLayoutPage.jsx` dòng ~226
6. `printSelectedLabels()`:
   - Mở tab mới
   - Loop qua mỗi `binId` trong `selectedLabels`:
     - Gọi API `label(binId)` và `labelQrImage(binId)`
     - Convert Blob → URL
     - Gọi `printIntent(binId)`
     - Push vào array `labels`
7. Gọi `writeLocationLabels(printWindow, labels)` ở `utils/locationLabelPrint.js` - in nhiều tem
8. `writeLocationLabels()`:
   - Tạo HTML grid layout (3 cột mỗi dòng)
   - Mỗi tem có size chuẩn in nhãn (tương tự print 1 tem)
   - Inject HTML vào tab
   - `window.print()`
9. Đóng modal → revoke tất cả URLs

---

#### 1.7.3. In tem tất cả vị trí

**Luồng**:
1. User bấm nút "▣ In tem vị trí" ở header trang (ở `WarehouseLayoutPage.jsx` dòng ~272)
2. Set `selectedLabels` = tất cả `binId` trong `layout.active.bins`
3. Mở modal với checkbox list
4. Luồng tương tự 1.7.2

---

### 1.8. Xem hàng trong kệ (Rack Contents) - CHỨC NĂNG PHỤ

**Luồng**:
1. User chọn kệ đã active → bấm tab "Hàng trong kệ"
2. Render component `<WarehouseRackContents rackId={selectedRackId} />` ở `components/warehouse/WarehouseRackContents.jsx`
3. Component mount → gọi API: **GET** `/api/warehouse/layout/rack/:rackId/contents`
4. Backend: `layoutController.getRackContents()` ở `layout.controller.js`:
   - Query `WarehouseLocation` với `rackId`
   - Populate thông tin SKU, Product
   - Trả về danh sách ô với:
     - `locationCode`
     - `capacity`, `currentOccupancy`, `plannedReservedQty`
     - `contents`: array của { skuCode, productName, quantity, barcodes }
5. Frontend hiển thị table:
   - Mỗi dòng: Ô kệ | SKU | Số lượng | % sử dụng
   - User có thể expand row để xem từng barcode
6. Có nút "Xem barcode" cho mỗi SKU trong ô

---

### 1.9. Xem barcode sản phẩm trong ô - CHỨC NĂNG PHỤ

**Luồng**:
1. User trong tab "Hàng trong kệ" → expand 1 dòng SKU
2. Hiển thị danh sách barcode của SKU đó trong ô
3. Mỗi barcode có checkbox để chọn in tem
4. User chọn barcode → bấm "In tem đã chọn"
5. Gọi API: **POST** `/api/products/:productId/labels` với `{ barcodes: [...] }`
6. Backend: `renderProductLabels()` ở `productDetail.service.js` dòng ~169:
   - Validate số lượng barcode ≤ 500
   - Query `ProductUnit` để lấy thông tin SKU
   - Generate barcode images (CODE_128)
   - Trả về array `{ barcode, skuCode, productName, imageBase64 }`
7. Frontend: `printProductLabels(labels, tab)` ở `utils/productLabelPrint.js`:
   - Tạo HTML grid (3 cột)
   - Mỗi tem hiển thị: barcode image, SKU, product name
   - Inject vào tab → `window.print()`

---

## 2. KHO THÀNH PHẨM (Finished Goods)

### 2.1. Xem danh sách thành phẩm

**Luồng**:
1. User vào trang "Kho thành phẩm" (`FinishedGoodsPage.jsx`)
2. Component mount → gọi `loadOverview()`
3. `loadOverview()` gọi API: **GET** `/api/warehouse/finished-goods/overview`
4. Backend: `finishedGoodsController.overview()` ở `finished-goods/finishedGoods.controller.js`:
   - Query `Sku` với `isActive = true`
   - Aggregate tồn kho từ `ProductUnit`:
     - `onHandQty`: tồn thực tế (AVAILABLE + RESERVED)
     - `reservedQty`: tạm giữ cho đơn
     - `pickableQty`: khả dụng để soạn (AVAILABLE trên kệ)
   - Join với `Product` để lấy `productName`, `category`, `retailPrice`
5. Trả về danh sách SKU với tồn kho
6. Frontend hiển thị table (component `FinishedGoodsOverview.jsx`):
   - Mã SKU | Sản phẩm | Màu/Size | Giá bán | Tồn thực tế | Tạm giữ | Khả dụng
   - Có search bar và filter

---

### 2.2. Xem chi tiết sản phẩm

**Luồng**:
1. User bấm "Chi tiết" trong bảng → navigate `/warehouse/finished-goods/:productId`
2. Component `FinishedGoodsProductPage.jsx` mount → gọi `loadAll()` ở dòng ~76 = Promise.all([loadDetail(), loadShelf(), loadReceipts()])
3. **loadDetail()** → API: **GET** `/api/products/:productId/detail`
   - Backend: `productDetailService.getDetail()` ở `products/productDetail.service.js`
   - Query `Product` và `Sku`
   - Trả về: product info, skus array với tồn kho từng SKU
4. **loadShelf()** → API: **GET** `/api/products/:productId/shelf-stock`
   - Backend: `productDetailService.getShelfStock()` ở `productDetail.service.js` dòng ~77
   - Aggregate `ProductUnit` với:
     - `inventoryStatus = 'AVAILABLE'`
     - `layoutBin = true` (trên kệ, không phải staging/packed)
   - Group by `skuId` + `locationId`
   - Push `barcodes` vào array
   - Trả về: `{ items: [...], total: số lượng chiếc }`
5. **loadReceipts()** → API: **GET** `/api/products/:productId/receipts?page=1`
   - Backend: `productDetailService.getProductReceipts()`
   - Query `InboundReceipt` với `status = 'CONFIRMED'` và có SKU của product
   - Pagination: 10 phiếu/trang
   - Trả về: `{ receipts: [...], total, page, pageSize }`
6. Frontend hiển thị 3 sections:
   - **Tổng quan tồn kho**: tồn thực tế, đang trên kệ, số phiếu nhập
   - **Thông tin sản phẩm**: tên, mã, giá, biến thể
   - **Hàng đang trên kệ**: table với SKU, vị trí, số lượng
   - **Phiếu nhập kho**: table với mã phiếu, nguồn, ngày xác nhận

---

### 2.3. Xem hàng trong kệ và in barcode - CHỨC NĂNG PHỤ

**Luồng**:
1. User trong trang chi tiết sản phẩm (`FinishedGoodsProductPage.jsx`) → section "Hàng đang trên kệ"
2. Data đã load từ `loadShelf()` → hiển thị table với SKU, vị trí, số lượng
3. User expand 1 dòng (component `ExpandableRow` dòng ~160) → hiển thị danh sách barcode
4. User chọn barcode → bấm "In tem đã chọn" → gọi `print(barcodes)` ở dòng ~86
5. `printLabels(productId, barcodes)` ở dòng ~42:
   - Mở tab mới
   - Gọi API: **POST** `/api/products/:productId/labels`
   - Backend: `renderProductLabels()` ở `productDetail.service.js` dòng ~169 tạo CODE_128 barcode images
   - Trả về: `{ labels: [{ barcode, skuCode, imageBase64, ... }] }`
6. `printProductLabels(labels, tab)` ở `utils/productLabelPrint.js`:
   - Tạo HTML grid (3 cột, 10 dòng/trang)
   - Mỗi tem: 2.5cm × 1.5cm
   - Inject HTML → `window.print()`

---

### 2.4. Cập nhật giá SKU - CHỨC NĂNG PHỤ

**Luồng**:
1. User trong trang chi tiết sản phẩm (`FinishedGoodsProductPage.jsx`) → bấm "Chỉnh sửa"
2. `setEditing(true)` → hiển thị input giá cho mỗi SKU
3. User nhập giá mới → `onChange` cập nhật state `prices[skuId]`
4. User bấm "Lưu giá" → `saveSkuPrice(sku)` ở dòng ~335
5. Validate: giá ≥ 0
6. Gọi `submit()` ở dòng ~304 với operation `UPDATE_SKU`
7. `queueCatalogChange()` ở `services/offlineCatalogSync.js` → lưu vào IndexedDB (offline queue)
8. `syncCatalogChanges()` → API: **POST** `/api/catalog/sync`
9. Backend: `catalogQueueService.processSyncRequest()` ở `services/catalogQueueService.js`:
   - Xử lý operation `UPDATE_SKU`
   - `catalogService.updateSku()` ở `services/catalogService.js` → cập nhật `Product.variants[i].retailPrice`
   - Check `baseVersion` (optimistic locking)
   - Tăng `product.version`
10. Trả về response: status `DONE` hoặc `VERSION_CONFLICT`
11. Frontend hiển thị "Đã lưu giá [SKU]." hoặc lỗi

---

### 2.5. Xem phiếu nhập kho và barcode - CHỨC NĂNG PHỤ

**Luồng**:
1. User trong trang chi tiết sản phẩm (`FinishedGoodsProductPage.jsx`) → section "Phiếu nhập kho đã xác nhận"
2. Data đã load từ `loadReceipts()` → hiển thị table
3. User expand 1 phiếu (component `ExpandableRow` dòng ~160) → gọi `loadUnits()`
4. `loadUnits()` → API: **GET** `/api/products/:productId/receipts/:receiptId/units`
5. Backend: `productDetailService.getProductReceiptUnits()` ở `productDetail.service.js`:
   - Query `ProductUnit` với:
     - `receiptId = receiptId`
     - `productId = productId`
   - Trả về: `{ units: [{ barcode, skuCode, color, size, status, locationCode }] }`
6. Frontend hiển thị danh sách barcode
7. Preselect barcode còn trong kho (`status NOT IN ['PACKED', 'DEFECTIVE', ...]`)
8. User chọn barcode → bấm "In tem đã chọn" → gọi `onPrint(selected)`
9. Luồng in tem giống 2.3

---

## 3. XUẤT NHẬP KHO (Material Inbound/Outbound)

### 3.1. Nhập nguyên phụ liệu - Phê duyệt lệnh nhập (Manager)

**Luồng**:
1. User vào trang "Nhập nguyên phụ liệu" (`MaterialInboundPage.jsx`) → tab "Chờ xác nhận"
2. Component mount → gọi API: **GET** `/api/warehouse/inbound/requests?status=PENDING`
3. Backend: query `MaterialInboundRequest` với `status = 'PENDING'`
4. Hiển thị danh sách lệnh nhập chờ duyệt
5. User bấm "Chi tiết" → xem thông tin lệnh, danh sách vật tư
6. User bấm "Phê duyệt" → gọi API: **POST** `/api/warehouse/inbound/requests/:requestId/approve`
7. Backend: `inboundController.approveRequest()` ở `inbound/inbound.controller.js`:
   - Kiểm tra status = 'PENDING'
   - Update `status = 'APPROVED'`, `approvedByUserId`, `approvedAt`
   - Tạo transaction log
8. Trả về response → reload danh sách
9. Lệnh nhập chuyển sang tab "Đã duyệt - chờ nhân viên nhập kho"

---

### 3.2. Xuất nguyên phụ liệu - Duyệt và phân công (Manager)

**Luồng**:
1. User vào trang "Xuất nguyên phụ liệu" (`MaterialOutboundPage.jsx`) → tab "Chờ duyệt"
2. Hiển thị danh sách lệnh xuất từ xưởng may
3. User bấm "Chi tiết" → xem danh sách vật tư cần xuất
4. User bấm "Duyệt và phân công" → hiển thị modal chọn nhân viên kho
5. User chọn nhân viên → bấm "Xác nhận phân công"
6. Gọi API: **POST** `/api/warehouse/outbound/requests/:requestId/approve-and-assign` với Payload: `{ assignedUserId }`
7. Backend: `outboundController.approveAndAssign()` ở `outbound/outbound.controller.js`:
   - Update `status = 'APPROVED'`, `assignedUserId`, `assignedAt`
   - Tính FIFO allocation:
     - Query `MaterialStockLot` với `currentQty > 0` và `material.id` matching
     - Sort by `receivedDate` ASC (FIFO)
     - Allocate từng lot cho đến đủ `requestedQty`
     - Nếu thiếu hàng → ghi nhận `shortageQty`
   - Tạo `PickingTask` cho nhân viên
   - Log transaction
8. Trả về response với allocation details
9. Frontend reload → lệnh xuất chuyển sang tab "Đã phân công - chờ nhân viên soạn"

---

### 3.3. Xử lý thiếu hàng (Shortage Resolution) - Manager Only

**Luồng**:
1. Sau khi nhân viên soạn hàng → phát hiện thiếu hàng → báo cáo cho manager
2. Manager vào lệnh xuất → thấy status "SHORTAGE_REPORTED"
3. Hiển thị table: Vật tư | Yêu cầu | Đã soạn | Thiếu
4. Manager có 3 lựa chọn:
   - **Xuất thiếu**: chấp nhận xuất số lượng thực tế (ít hơn yêu cầu)
   - **Chờ nhập thêm**: giữ lệnh, chờ nhập hàng
   - **Hủy lệnh**: hủy hoàn toàn
5. Manager chọn "Xuất thiếu" → bấm "Xác nhận xuất thiếu"
6. Gọi API: **POST** `/api/warehouse/outbound/requests/:requestId/resolve-shortage` với Payload: `{ resolution: 'PARTIAL', adjustments: [...] }`
7. Backend: `resolveShortage()` ở `outbound/outbound.service.js`:
   - Update `MaterialStockLot`: trừ `currentQty`, tăng `reservedQty`
   - Update `MaterialOutboundRequest`:
     - `status = 'CONFIRMED'`
     - `shortageResolution = 'PARTIAL'`
     - `confirmedQty = actualQty` (ít hơn requestedQty)
   - Log transaction
8. Trả về response → lệnh xuất chuyển sang "Đã xác nhận"

---

## 4. KHO HÀNG LỖI (Defect Warehouse)

### 4.1. Xem danh sách hàng lỗi

**Luồng**:
1. User vào trang "Kho hàng lỗi" (`DefectWarehousePage.jsx`)
2. Component mount → gọi API: **GET** `/api/warehouse/defect/units`
3. Backend: `defectController.listDefectUnits()` ở `defect/defect.controller.js`:
   - Query `ProductUnit` với `inventoryStatus IN ['DEFECT_PENDING', 'DEFECTIVE']`
   - Populate SKU, Product
   - Filter theo search, status
4. Trả về: `{ units: [...], total }`
5. Frontend hiển thị table:
   - Barcode | SKU | Sản phẩm | Màu/Size | Trạng thái | Ngày phát hiện
   - **DEFECT_PENDING**: Chờ nhập kho lỗi
   - **DEFECTIVE**: Trong kho hàng lỗi

---

### 4.2. Xuất hàng lỗi - 6 bước xử lý

**Transaction flow**: CREATE → APPROVE → SCAN → PACK → CONFIRM → COMPLETE

**Luồng**:
1. Manager tạo phiếu xuất hàng lỗi → API: **POST** `/api/warehouse/defect/outbound`
   - Payload: `{ reason: 'DISPOSE' | 'RETURN_SUPPLIER', notes }`
   - Backend ở `defect/defect.service.js` tạo `DefectOutboundTransaction` với `status = 'DRAFT'`
2. Manager bấm "Duyệt phiếu" → API: **POST** `/api/warehouse/defect/outbound/:id/approve`
   - Backend update `status = 'APPROVED'`, tạo `PickingTask` cho nhân viên
3. Nhân viên scan barcode hàng lỗi → API: **POST** `/api/warehouse/defect/outbound/:id/scan`
   - Backend kiểm tra barcode có phải hàng lỗi không
   - Thêm vào `scannedUnits[]`
4. Nhân viên đóng gói → API: **POST** `/api/warehouse/defect/outbound/:id/pack`
   - Backend update `status = 'PACKED'`, `packedAt`, `packedByUserId`
5. Manager xác nhận xuất → API: **POST** `/api/warehouse/defect/outbound/:id/confirm`
   - Backend update `ProductUnit.inventoryStatus = 'DEFECT_OUT'`
   - Log transaction
6. Hoàn tất → API: **POST** `/api/warehouse/defect/outbound/:id/complete`
   - Backend update `status = 'COMPLETED'`, `completedAt`

---

## 5. KIỂM KÊ KHO (Stocktake)

### 5.1. Tạo phiên kiểm kê

**Luồng**:
1. User vào trang "Kiểm kê kho" (`StocktakePage.jsx`) → bấm "Tạo phiên kiểm kê" → hiển thị form
2. User chọn:
   - **Type**: ONCE (1 lần), WEEKLY (hàng tuần), MONTHLY (hàng tháng)
   - **Scope**: Kho nào (FINISHED_GOODS, RAW_MATERIALS, cả 2)
   - **Locations**: Chọn khu/kệ cụ thể hoặc toàn bộ
   - **Schedule**: Ngày giờ bắt đầu
3. User bấm "Tạo phiên" → API: **POST** `/api/warehouse/stocktake`
4. Backend: `stocktakeController.create()` ở `stocktake/stocktake.controller.js`:
   - Validate input
   - Tạo `StocktakeSession`:
     - `status = 'SCHEDULED'`
     - `type`, `scope`, `locations`, `scheduledAt`
   - Nếu type = WEEKLY/MONTHLY → tạo recurring schedule
5. Trả về session → hiển thị "Đã tạo phiên kiểm kê"

---

### 5.2. Bắt đầu kiểm kê

**Luồng**:
1. Đến giờ scheduled → Manager bấm "Bắt đầu" hoặc auto-start
2. API: **POST** `/api/warehouse/stocktake/:sessionId/start`
3. Backend: `stocktakeService.startSession()` ở `stocktake/stocktake.service.js`:
   - Update `status = 'IN_PROGRESS'`, `startedAt`
   - Snapshot tồn kho hiện tại:
     - Query `WarehouseLocation` → `expectedQty`
     - Query `ProductUnit` → count by locationId
   - Tạo `StocktakeCount` records (1 record/location)
4. Trả về session → Frontend chuyển sang màn hình kiểm kê

---

### 5.3. Tạm dừng và tiếp tục kiểm kê

**Luồng**:
1. Manager bấm "Tạm dừng" → API: **POST** `/api/warehouse/stocktake/:sessionId/pause`
2. Backend ở `stocktake/stocktake.service.js`: update `status = 'PAUSED'`, `pausedAt`
3. Manager bấm "Tiếp tục" → API: **POST** `/api/warehouse/stocktake/:sessionId/resume`
4. Backend: update `status = 'IN_PROGRESS'`, `resumedAt`

---

## 6. BÁO CÁO KHO (Warehouse Reports)

### 6.1. Tạo báo cáo

**Luồng**:
1. User vào trang "Báo cáo kho" (`WarehouseReportsPage.jsx`) → bấm "Tạo báo cáo" → chọn loại báo cáo:
   - **INVENTORY_SNAPSHOT**: Tồn kho snapshot
   - **INBOUND_OUTBOUND**: Xuất nhập tồn
   - **SLOW_MOVING**: Hàng tồn ế
   - **LOCATION_UTILIZATION**: Sử dụng vị trí kho
2. User chọn thời gian: từ ngày → đến ngày
3. User bấm "Tạo báo cáo" → API: **POST** `/api/warehouse/reports` với Payload: `{ type, startDate, endDate, filters }`
4. Backend: `reportsController.create()` ở `reports/reports.controller.js`:
   - Tạo `WarehouseReport` với `status = 'PENDING'`
   - Queue background job: `generateReport(reportId)`
5. Background job:
   - Query data theo type:
     - INVENTORY_SNAPSHOT: aggregate `ProductUnit`, `MaterialStockLot`
     - INBOUND_OUTBOUND: query transactions trong khoảng thời gian
     - SLOW_MOVING: tính số ngày không có xuất hàng
     - LOCATION_UTILIZATION: tính % sử dụng từng ô
   - Generate Excel file (dùng `exceljs`)
   - Upload file lên cloud storage (Cloudinary hoặc S3)
   - Update `WarehouseReport`:
     - `status = 'COMPLETED'`
     - `fileUrl = cloudUrl`
6. Frontend polling hoặc websocket notification → hiển thị "Báo cáo đã sẵn sàng"
7. User bấm "Tải xuống" → download Excel file

---

### 6.2. Làm mới báo cáo

**Luồng**:
1. User vào báo cáo đã tạo → bấm "Làm mới"
2. API: **POST** `/api/warehouse/reports/:reportId/refresh`
3. Backend ở `reports/reports.service.js`:
   - Kiểm tra báo cáo tồn tại
   - Update `status = 'PENDING'`
   - Queue lại background job
4. Luồng tương tự 6.1 từ bước 5

---

### 6.3. Gửi báo cáo qua email

**Luồng**:
1. User bấm "Gửi qua email" → nhập danh sách email
2. API: **POST** `/api/warehouse/reports/:reportId/send` với Payload: `{ recipients: ['email1@example.com', ...] }`
3. Backend ở `reports/reports.service.js`:
   - Kiểm tra report status = 'COMPLETED'
   - Gửi email với attachment (file Excel)
   - Dùng service email ở `services/emailService.js` (Nodemailer hoặc SendGrid)
   - Log audit
4. Trả về success → hiển thị "Đã gửi báo cáo"

---

## 7. CẤU HÌNH SẢN PHẨM (Product Configuration)

### 7.1. Tạo sản phẩm mới

**Luồng**:
1. User vào trang "Cấu hình sản phẩm" (`ProductConfigurationPage.jsx`) → bấm "Tạo sản phẩm" → hiển thị form
2. User nhập:
   - Tên sản phẩm
   - Mã sản phẩm (optional, auto-generate nếu để trống)
   - Danh mục
   - Giá bán cơ bản
   - Mô tả
   - Ảnh đại diện, video, ảnh bổ sung
3. User bấm "Lưu sản phẩm" → gọi `submit()`
4. `submit()` → `queueCatalogChange()` ở `services/offlineCatalogSync.js` với operation `CREATE_PRODUCT`
5. `syncCatalogChanges()` → API: **POST** `/api/catalog/sync`
6. Backend: `catalogQueueService.processSyncRequest()` ở `services/catalogQueueService.js`:
   - Validate `productCode` unique
   - Tạo `Product` document:
     - `productCode` (hoặc generate)
     - `productName`, `category`, `basePrice`, `description`
     - `isActive = false` (Draft)
     - `version = 1`
   - Upload media lên Cloudinary
   - Lưu URLs: `thumbnailUrl`, `videoUrl`, `additionalImages[]`
7. Trả về response → hiển thị "Đã tạo sản phẩm"

---

### 7.2. Thêm biến thể (Add Variants)

**Luồng**:
1. User chọn sản phẩm → bấm "Thêm biến thể"
2. User nhập:
   - Màu
   - Size (dropdown: XS, S, M, L, XL, XXL, FREESIZE)
   - Giá bán (optional, dùng basePrice nếu không nhập)
3. User bấm "Thêm biến thể" → `submit()` với operation `ADD_VARIANTS`
4. Backend: `catalogService.addVariants()` ở `services/catalogService.js`:
   - Validate màu + size chưa tồn tại
   - Generate `skuCode = {productCode}-{color}-{size}` (normalize)
   - Tạo `Sku` document:
     - `productId`, `skuCode`, `color`, `size`, `retailPrice`
     - `isActive = false`
     - `version = 1`
   - Thêm vào `Product.variants[]`
   - Tăng `product.version`
5. Trả về response → reload product

---

### 7.3. Publish sản phẩm

**Luồng**:
1. User chọn sản phẩm Draft → bấm "Đưa vào kinh doanh"
2. API: **POST** `/api/catalog/products/:productId/publish`
3. Backend: `catalogService.publishProduct()` ở `services/catalogService.js`:
   - Kiểm tra product có ít nhất 1 variant
   - Update `Product.isActive = true`, `codeLockedAt = now`
   - Update tất cả `Sku.isActive = true` (variants của product)
   - Log audit
4. Trả về response → hiển thị "Đã đưa sản phẩm vào kinh doanh"

---

### 7.4. Ngừng bán màu

**Luồng**:
1. User trong trang chi tiết sản phẩm (`FinishedGoodsProductPage.jsx`) → section "Màu sắc"
2. User bấm "Ngừng bán" cho 1 màu (hàm `setColorActive()` dòng ~355) → confirm dialog
3. User xác nhận → `submit()` với operation `SET_COLOR_ACTIVE`
   - Payload: `{ color, isActive: false }`
4. Backend: `catalogService.setColorActive()` ở `services/catalogService.js`:
   - Query tất cả `Sku` với `productId` và `color` matching
   - Update `Sku.discontinuedAt = now`
   - Tăng `sku.version`
5. Trả về response → reload product
6. **Lưu ý**: Hàng hoàn của màu đã ngừng vẫn nhập kho bình thường

---

## Tổng kết

Tài liệu này mô tả luồng chạy chi tiết của các chức năng quản lý kho trong ARAWMS, bao gồm:

1. **Cấu hình vị trí kho**: Thêm/sửa/xóa kệ, in tem vị trí, xem hàng trong kệ
2. **Kho thành phẩm**: Xem tồn kho, chi tiết sản phẩm, in barcode, cập nhật giá
3. **Xuất nhập kho**: Phê duyệt lệnh, phân công nhân viên, xử lý thiếu hàng (FIFO)
4. **Kho hàng lỗi**: Xem hàng lỗi, xuất hàng lỗi (6 bước transaction)
5. **Kiểm kê kho**: Tạo phiên, bắt đầu, tạm dừng, tiếp tục
6. **Báo cáo kho**: Tạo báo cáo, làm mới, gửi email
7. **Cấu hình sản phẩm**: Tạo sản phẩm, thêm biến thể, publish, ngừng bán màu

Mỗi chức năng đều mô tả theo format: User action → Frontend function → API call → Backend handler → Database operation → Response → UI update.

**Các chức năng phụ quan trọng**:
- **In tem vị trí**: 1 ô, nhiều ô, toàn bộ kho
- **In tem barcode sản phẩm**: từ hàng trên kệ, từ phiếu nhập
- **Xem barcode**: expand row để xem chi tiết
- **Offline-first catalog**: thay đổi sản phẩm lưu local trước, sync sau

---

*File này sẽ được cập nhật khi có thêm chức năng mới hoặc thay đổi luồng.*
