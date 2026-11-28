# ARAWMS - Luồng Chạy Các Chức Năng Nhân Viên Kho

**Mục đích**: Tài liệu này giúp hiểu rõ luồng chạy dữ liệu của từng chức năng dành cho **Nhân viên kho (Warehouse Staff)**.

**Format**: Mô tả đơn giản theo flow: User bấm nút → Hàm nào → Xử lý gì → Backend handler → Response

---

## 1. XẾP HÀNG VÀO KỆ (Putaway)

### 1.1. Xem danh sách hàng chờ xếp (Task List)

**Luồng**:
1. User vào trang "Xếp hàng" (`WarehousePutawayPage.jsx`)
2. Component mount → gọi `loadTasks()` ở dòng ~59
3. `loadTasks()` gọi API: **GET** `/api/warehouse/putaway/tasks` (service: `warehousePutawayService.js`)
4. Backend: `putaway.controller.js` dòng ~54 export `tasks` handler → gọi `listPutawayTasks()` ở `putawayExecution.service.js`:
   - Query `PutawayAllocation` với `status = 'CONFIRMED'`
   - Query `WarehouseLocation` để lấy thông tin vị trí
   - Query `Sku` và `Product` để lấy thông tin sản phẩm
   - Tính `remainingQuantity = allocatedQuantity - placedQuantity - shortageQuantity`
   - Chỉ trả về tasks có `remainingQuantity > 0`
5. Trả về: `{ tasks: [{ allocationId, lineId, receiptCode, productName, skuCode, color, size, locationCode, allocatedQuantity, placedQuantity, remainingQuantity }] }`
6. Frontend hiển thị danh sách task:
   - Mỗi dòng: Phiếu nhập | SKU | Sản phẩm | Màu/Size | Vị trí | Đã xếp/Cần xếp
   - Có search bar và filter theo phiếu nhập, trạng thái
   - User bấm vào 1 task → mở panel xếp hàng

---

### 1.2. Xếp hàng thành phẩm từng chiếc (Single Unit Putaway)

**Luồng**:
1. User chọn 1 task từ danh sách → gọi `openTask(selected)` ở `WarehousePutawayPage.jsx` dòng ~78
2. `openTask()`:
   - Stop camera (nếu đang bật)
   - Reset state: `verifiedLocation = ''`, `scanLog = []`
   - Gọi API: **GET** `/api/warehouse/putaway/allocations/:allocationId/lines/:lineId/task`
3. Backend: `putaway.controller.js` dòng ~56 export `task` handler → gọi `getPutawayTask()` ở `putawayExecution.service.js`:
   - Query `PutawayAllocation` với `allocationId` và tìm line theo `lineId`
   - Populate thông tin SKU, Product, Location
   - Trả về: `{ task: { allocationId, lineId, skuCode, productName, locationCode, allocatedQuantity, placedQuantity, remainingQuantity, ... } }`
4. Frontend hiển thị panel xếp hàng:
   - Thông tin: SKU | Sản phẩm | Vị trí cần xếp | Đã xếp/Cần xếp
   - Bật camera để quét barcode (hoặc nhập tay)
   - **Bước 1**: Quét mã QR vị trí kệ
5. User quét mã QR ô kệ → `submitLocation(barcode)` ở dòng ~115:
   - Gọi API: **POST** `/api/warehouse/putaway/allocations/:allocationId/lines/:lineId/location` với `{ barcode }`
   - Backend: `putaway.controller.js` dòng ~57 export `verifyLocation` handler → gọi `verifyPutawayLocation()` ở `putawayExecution.service.js`:
     - Query `WarehouseLocation` với `barcode`
     - Kiểm tra `locationId` khớp với `targetLocationId` trong line
     - Nếu sai → throw error `WRONG_LOCATION`
     - Nếu đúng → trả về `{ location: { barcode, locationCode } }`
   - Frontend set `verifiedLocation = barcode` → hiển thị "Đúng ô. Quét từng sản phẩm khi đặt vào ô."
6. **Bước 2**: Quét barcode sản phẩm
7. User quét barcode sản phẩm → `submitProduct(barcode)` ở dòng ~91:
   - Tạo `requestId = crypto.randomUUID()` (để retry nếu mất kết nối)
   - Gọi API: **POST** `/api/warehouse/putaway/allocations/:allocationId/lines/:lineId/scan` với `{ productBarcode, locationBarcode, requestId }`
   - Backend: `putaway.controller.js` dòng ~58 export `scanUnit` handler → gọi `scanPutawayUnit()` ở `putawayExecution.service.js`:
     - Validate `requestId` (idempotent: nếu đã xử lý requestId này rồi → trả về kết quả cũ)
     - Query `ProductUnit` với `barcode`
     - Kiểm tra:
       - Unit phải có `skuId` khớp với line
       - Unit chưa được xếp (`placedAt = null`)
       - Unit chưa trong status PACKED, SHIPPED...
       - Số lượng đã xếp < allocatedQuantity
     - Nếu sai → throw error `WRONG_SKU`, `UNIT_ALREADY_PLACED`, `TASK_COMPLETE`...
     - Nếu đúng:
       - Update `ProductUnit`:
         - `warehouseId = targetLocationId`
         - `layoutBin = true`
         - `placedAt = now`
         - `placedByUserId = userId`
       - Update `WarehouseLocation.currentOccupancy += 1`
       - Update `PutawayAllocation.lines[i].placedQuantity += 1`
       - Log transaction: `SystemLog.create()`
       - Trả về: `{ result: { task: { ...task, placedQuantity: placedQuantity + 1, remainingQuantity: remainingQuantity - 1 } } }`
   - Frontend:
     - Update task state với số lượng mới
     - Thêm barcode vào `scanLog` (hiển thị danh sách đã quét)
     - Hiển thị notice: "Đã xếp — {placedQuantity}/{allocatedQuantity}"
     - Nếu `remainingQuantity = 0` → stop camera, task hoàn thành
8. Lặp lại bước 7 cho đến khi xếp đủ số lượng

**Xử lý lỗi**:
- Nếu API trả về error `WRONG_LOCATION` → reset `verifiedLocation = ''`, yêu cầu quét lại mã vị trí
- Nếu API trả về error `WRONG_SKU` → hiển thị "Sai sản phẩm. Cần {skuCode}."
- Nếu mất kết nối (status >= 500) → lưu `pendingRetry = { productBarcode, locationBarcode, requestId }`, yêu cầu user thử lại

---

### 1.3. Xếp hàng loạt (Bulk Putaway)

**Luồng**:
1. User trong danh sách tasks → tìm task theo `receiptCode`
2. User bấm nút "In tem" → gọi API để lấy danh sách barcode của phiếu nhập
3. API: **GET** `/api/warehouse/putaway/receipts/:receiptId/labels`
4. Backend: `putaway.controller.js` dòng ~55 export `receiptLabels` handler → gọi `getReceiptLabels()`:
   - Query `ProductUnit` với `receiptId` và `inventoryStatus NOT IN ['PACKED', 'SHIPPED', ...]`
   - Filter chỉ lấy units chưa xếp (`placedAt = null`)
   - Trả về: `{ labels: [{ barcode, skuCode, productName, color, size }] }`
5. Frontend hiển thị modal:
   - Danh sách barcode với checkbox
   - User chọn barcode muốn in
   - Bấm "In tem" → mở tab mới, in danh sách barcode
6. User nhận tem đã in → chọn tem để xếp hàng loạt
7. User bấm "Xếp hàng loạt" → gọi `openBulk(receipt, barcodes, locationCode)` ở `WarehousePutawayPage.jsx` dòng ~133
8. `openBulk()`:
   - Gọi API: **POST** `/api/warehouse/putaway/receipts/:receiptId/bulk-plan` với `{ barcodes: [...], locationCode: 'B-R01-T1-O1' }`
   - Backend: `putaway.controller.js` dòng ~56 export `bulkPlan` handler → gọi `bulkPutawayPlan()` ở `putawayExecution.service.js`:
     - Query `ProductUnit` với danh sách barcode
     - Query `PutawayAllocation` để tìm target location cho từng unit
     - Group units theo `targetLocationId`
     - Kiểm tra từng group:
       - Nếu không có allocation → `blockedReason = 'ALLOCATION_MISSING'`
       - Nếu ô đã đầy → `blockedReason = 'LOCATION_FULL'`
       - Nếu SKU không được phép vào ô này → `blockedReason = 'SKU_NOT_ALLOWED'`
     - Trả về: `{ groups: [{ locationId, locationCode, barcodes: [...], blockedReason: null | 'ALLOCATION_MISSING' | 'LOCATION_FULL' | ... }] }`
   - Frontend hiển thị bulk panel:
     - Danh sách groups: Mỗi group là 1 ô kệ với số lượng barcode
     - Groups bị block hiển thị lý do (màu đỏ, không cho quét)
     - Groups OK hiển thị "Sẵn sàng" (màu xanh)
9. User chọn 1 group (ô kệ) → bật camera quét mã QR ô kệ
10. User quét mã QR ô kệ → `submitBulkLocation(locationBarcode)` ở `WarehousePutawayPage.jsx` dòng ~148:
    - Kiểm tra `locationBarcode` khớp với group đang chọn
    - Nếu đúng → gọi API: **POST** `/api/warehouse/putaway/receipts/:receiptId/bulk-place` với `{ barcodes: [...], locationBarcode }`
    - Backend: `putaway.controller.js` dòng ~56 export `bulkPlace` handler → gọi `bulkPlaceUnits()` ở `putawayExecution.service.js`:
      - Validate `locationBarcode` khớp với `targetLocationId` của allocations
      - **Transaction atomicity**: Tất cả units phải xếp thành công hoặc không xếp cái nào
      - Với mỗi barcode:
        - Query `ProductUnit`
        - Kiểm tra unit hợp lệ (chưa xếp, đúng SKU, còn slot...)
        - Update `ProductUnit`: `warehouseId`, `layoutBin = true`, `placedAt`, `placedByUserId`
        - Update `PutawayAllocation.lines[i].placedQuantity += 1`
      - Update `WarehouseLocation.currentOccupancy += số lượng units`
      - Log bulk transaction: `SystemLog.create()` với array barcode
      - Trả về: `{ result: { placed: số lượng đã xếp, tasks: [...updated tasks] } }`
    - Frontend:
      - Mark group là "Đã xếp" (màu xanh đậm, disable)
      - Reload task list
      - Hiển thị notice: "Đã xếp {placed} chiếc vào {locationCode}"
11. Lặp lại bước 9-10 cho các groups khác
12. User bấm "Đóng" → đóng bulk panel, reload task list

**Giới hạn**:
- Mỗi lần bulk tối đa 200 chiếc (constant `BULK_CHUNK` ở `WarehousePutawayPage.jsx` dòng ~18)
- Nếu user chọn > 200 tem → tự động chia thành nhiều batch

---

### 1.4. Báo thiếu hàng (Report Shortage)

**Luồng**:
1. User đang xếp hàng → phát hiện thiếu hàng (không đủ số lượng thực tế)
2. User bấm nút "Báo thiếu" trong panel xếp hàng
3. Hiển thị modal nhập lý do thiếu hàng:
   - Lý do: `DAMAGED` (hàng hỏng), `LOST` (mất hàng), `COUNT_ERROR` (lỗi đếm)...
4. User nhập lý do → bấm "Xác nhận báo thiếu"
5. Gọi API: **POST** `/api/warehouse/putaway/allocations/:allocationId/lines/:lineId/shortage` với `{ reason }`
6. Backend: `putaway.controller.js` dòng ~59 export `reportShortage` handler → gọi `reportPutawayShortage()` ở `putawayExecution.service.js`:
   - Update `PutawayAllocation.lines[i]`:
     - `shortageStatus = 'REPORTED'`
     - `shortageReason = reason`
     - `shortageReportedAt = now`
     - `shortageReportedByUserId = userId`
   - Tạo notification cho warehouse manager
   - Log transaction
   - Trả về: `{ task: { ...task, shortageStatus: 'REPORTED' } }`
7. Frontend:
   - Hiển thị "Đã báo thiếu hàng cho quản lý"
   - Task chuyển sang trạng thái "Chờ quản lý xử lý"
   - User không thể quét thêm cho đến khi manager xử lý

---

### 1.5. Báo sự cố (Report Incident)

**Luồng**:
1. User đang xếp hàng → gặp sự cố (barcode không đọc được, hàng sai vị trí...)
2. User bấm nút "Báo sự cố"
3. Hiển thị modal:
   - Nhập barcode gặp sự cố (nếu có)
   - Nhập mô tả sự cố
4. User nhập thông tin → bấm "Gửi báo cáo"
5. Gọi API: **POST** `/api/warehouse/putaway/allocations/:allocationId/lines/:lineId/incident` với `{ barcode, description }`
6. Backend: `putaway.controller.js` dòng ~60 export `reportIncident` handler → gọi `reportPutawayIncident()` ở `putawayExecution.service.js`:
   - Tạo `PutawayIncident` document:
     - `allocationId`, `lineId`
     - `barcode` (nếu có)
     - `description`
     - `reportedByUserId`, `reportedAt`
     - `status = 'PENDING'`
   - Tạo notification cho warehouse manager
   - Log transaction
   - Trả về: `{ incident: { id, description, status: 'PENDING' } }`
7. Frontend hiển thị "Đã gửi báo cáo sự cố. Quản lý sẽ kiểm tra."
8. User có thể tiếp tục xếp hàng (không block task)

---

## 2. XẾP HÀNG NGUYÊN PHỤ LIỆU (Material Putaway)

### 2.1. Xem danh sách nguyên phụ liệu chờ xếp

**Luồng**:
1. User vào tab "Nguyên phụ liệu" trong trang xếp hàng
2. Render component `<MaterialPutawayPanel />` ở `components/warehouse/MaterialPutawayPanel.jsx`
3. Component mount → gọi API: **GET** `/api/warehouse/putaway/materials/tasks`
4. Backend: `putaway.controller.js` dòng ~39 export `materialTasks` handler → gọi `listMaterialPutawayTasks()` ở `materialPutaway.service.js`:
   - Query `FabricRoll` với:
     - `status = 'QC_PASSED'` và `inboundTicketId != null` (chờ xếp lần đầu)
     - HOẶC `pendingReturnQty > 0` và `pendingReturnReceiptId != null` (hàng hoàn chờ xếp)
   - Query `MaterialStockLot` với `status = 'PENDING_PUTAWAY'` và `quality = 'ACCEPTED'`
   - Query `MaterialTicket` để lấy thông tin phiếu nhập
   - Query `WarehouseLocation` để lấy thông tin vị trí đã được allocate
   - Query `RawMaterial` để lấy thông tin vật tư
   - Trả về: `{ tasks: [{ type: 'ROLL' | 'LOT', barcode, materialCode, materialName, ticketCode, targetLocationCode, quantity, unit }] }`
5. Frontend hiển thị danh sách:
   - Mỗi dòng: Loại | Barcode | Vật tư | Phiếu nhập | Vị trí | Số lượng
   - **ROLL**: Cuộn vải với `initialLengthMeters` hoặc `pendingReturnQty`
   - **LOT**: Lô phụ liệu với `allocations[].putawayQty`

---

### 2.2. Xếp cuộn vải (Roll Putaway)

**Luồng**:
1. User chọn 1 task loại ROLL
2. User bật camera quét barcode
3. **Bước 1**: Quét QR vị trí kệ
4. User quét mã QR ô kệ → gọi API: **POST** `/api/warehouse/putaway/materials/location/verify` với `{ barcode, taskType: 'ROLL', taskBarcode: rollBarcode }`
5. Backend: `putaway.controller.js` dòng ~41 export `verifyMaterialLocation` handler → gọi `verifyMaterialPutawayLocation()` ở `materialPutaway.service.js`:
   - Query `WarehouseLocation` với `barcode`
   - Kiểm tra:
     - Location phải là `warehouseType = 'RAW_MATERIAL'`
     - Location phải `status = 'ACTIVE'`
     - Location phải có đủ sức chứa (`currentOccupancy < maxCapacity`)
   - Nếu roll có target location được allocate → check `locationId` khớp
   - Trả về: `{ location: { locationId, locationCode, barcode } }`
6. Frontend set `verifiedLocation = locationCode` → hiển thị "Đúng ô. Quét barcode cuộn vải."
7. **Bước 2**: Quét barcode cuộn vải
8. User quét barcode cuộn → gọi API: **POST** `/api/warehouse/putaway/materials/scan` với `{ rollBarcode, locationBarcode }`
9. Backend: `putaway.controller.js` dòng ~42 export `scanMaterial` handler → gọi `scanMaterialPutawayTask()` ở `materialPutaway.service.js`:
   - Query `FabricRoll` với `barcode`
   - Kiểm tra:
     - Roll phải `status = 'QC_PASSED'` hoặc có `pendingReturnQty > 0`
     - Roll chưa xếp (`locationId = null` hoặc xếp cho return)
   - Query `MaterialTicket` để lấy thông tin phiếu nhập
   - Nếu là xếp lần đầu (inbound):
     - Update `FabricRoll`:
       - `locationId = targetLocationId`
       - `placedAt = now`
       - `placedByUserId = userId`
       - `status = 'ON_SHELF'`
     - Update `WarehouseLocation.currentOccupancy += initialLengthMeters` (tính theo đơn vị capacity)
     - Gọi `confirmMaterialPutaway()` → update `MaterialTicket` nếu tất cả items đã xếp xong
   - Nếu là xếp hàng hoàn (return):
     - Update `FabricRoll`:
       - `locationId = targetLocationId`
       - `currentLengthMeters += pendingReturnQty`
       - `pendingReturnQty = 0`
       - `pendingReturnReceiptId = null`
       - `status = 'ON_SHELF'`
     - Update `WarehouseLocation.currentOccupancy += pendingReturnQty`
   - Log transaction
   - Trả về: `{ result: { success: true, roll: { barcode, locationCode, status: 'ON_SHELF' } } }`
10. Frontend:
    - Hiển thị "Đã xếp cuộn {barcode} vào {locationCode}"
    - Remove task khỏi danh sách
    - Reset state, sẵn sàng quét task tiếp theo

---

### 2.3. Xếp lô phụ liệu (Lot Putaway)

**Luồng tương tự Roll, với điểm khác**:
1. Query `MaterialStockLot` thay vì `FabricRoll`
2. Lô phụ liệu có nhiều allocations (1 lô có thể xếp vào nhiều ô)
3. User phải xếp đúng số lượng theo từng allocation
4. Update `MaterialStockLot.allocations[i]`:
   - `putawayCompletedAt = now`
   - `putawayCompletedByUserId = userId`
5. Update `WarehouseLocation.currentOccupancy += putawayQty` (theo đơn vị: KG, MÉT, CÁI...)
6. Khi tất cả allocations của lô đã xếp → update `MaterialStockLot.status = 'AVAILABLE'`

---

## 3. SOẠN HÀNG XUẤT KHO (Material Outbound - Staff)

### 3.1. Xem danh sách lệnh xuất được phân công

**Luồng**:
1. User vào trang "Xuất nguyên phụ liệu" với `isStaffMode=true` (`MaterialOutboundPage.jsx` với prop `isStaffMode`)
2. Component mount → gọi API: **GET** `/api/warehouse/outbound/requests?assignedToMe=true`
3. Backend: `outbound.controller.js` → query `MaterialOutboundRequest` với:
   - `assignedUserId = userId`
   - `status IN ['APPROVED', 'PICKING', 'SHORTAGE_REPORTED']`
4. Trả về danh sách lệnh xuất:
   - Mỗi lệnh: Mã lệnh | Xưởng may yêu cầu | Vật tư | Số lượng | Trạng thái
5. Frontend hiển thị danh sách, chỉ hiển thị lệnh được phân công cho user

---

### 3.2. Soạn hàng theo FIFO allocation

**Luồng**:
1. User chọn 1 lệnh xuất → xem chi tiết
2. Hiển thị danh sách vật tư với FIFO allocation:
   - Vật tư 1: Lô A (vị trí X) - 10kg, Lô B (vị trí Y) - 5kg
   - Vật tư 2: Lô C (vị trí Z) - 20 cái
3. User đi đến vị trí X → lấy 10kg từ Lô A
4. User quét barcode lô hoặc vị trí → xác nhận đã lấy
5. API: **POST** `/api/warehouse/outbound/requests/:requestId/pick` với `{ lotId, locationId, pickedQty }`
6. Backend: `outbound.service.js` → `pickMaterialLot()`:
   - Validate lô và vị trí đúng với FIFO allocation
   - Update `MaterialStockLot`:
     - `currentQty -= pickedQty`
     - `reservedQty += pickedQty` (giữ chỗ cho đến khi confirm xuất)
   - Update `MaterialOutboundRequest.items[i].pickedQty += pickedQty`
   - Log transaction
7. Frontend cập nhật số lượng đã soạn
8. Lặp lại cho các lô tiếp theo theo thứ tự FIFO
9. Khi soạn đủ → user bấm "Hoàn thành soạn hàng"
10. API: **POST** `/api/warehouse/outbound/requests/:requestId/complete-picking`
11. Backend:
    - Update `status = 'READY_FOR_SHIPMENT'`
    - Tạo notification cho xưởng may
12. Frontend hiển thị "Đã hoàn thành soạn hàng"

---

### 3.3. Báo thiếu hàng khi soạn

**Luồng**:
1. User đang soạn hàng → phát hiện lô không đủ số lượng (tồn thực tế < allocation)
2. User bấm "Báo thiếu hàng"
3. Nhập:
   - Lô thiếu
   - Số lượng thực tế soạn được
   - Lý do thiếu (đếm sai, hàng hỏng, mất hàng...)
4. Gọi API: **POST** `/api/warehouse/outbound/requests/:requestId/report-shortage` với `{ lotId, actualQty, reason }`
5. Backend:
   - Update `MaterialOutboundRequest`:
     - `status = 'SHORTAGE_REPORTED'`
     - `shortageDetails = [{ lotId, expectedQty, actualQty, reason }]`
   - Tạo notification cho warehouse manager
6. Frontend hiển thị "Đã báo thiếu hàng. Chờ quản lý xử lý."
7. Manager sẽ quyết định: xuất thiếu, chờ nhập thêm, hoặc hủy lệnh

---

## 4. ĐÓNG HÀNG (Packing)

### 4.1. Quét QR đơn hàng

**Luồng**:
1. User vào trang đóng hàng (`WarehousePackingPage.jsx`)
2. User nhập hoặc quét QR đơn hàng vào ô input
3. User bấm "Bắt đầu đóng" → gọi `startPacking()` ở `WarehousePackingPage.jsx`
4. Gọi API: **POST** `/api/packing/sessions/start` với `{ orderQr, stationId }`
5. Backend: `packingSession.controller.js` → `startSession()` ở `packingSession.service.js`:
   - Parse QR để lấy `orderId`
   - Query `Order` với `orderId`
   - Kiểm tra:
     - Order phải `status = 'CONFIRMED_RESERVED'` hoặc `'PICKING'`
     - Order chưa được đóng (`packedAt = null`)
     - Order không bị lock bởi station khác
   - Query `OrderAllocation` để lấy danh sách SKU và số lượng
   - Tạo `PackingSession`:
     - `orderId`, `stationId`
     - `startedAt = now`
     - `startedByUserId = userId`
     - `items = [{ skuId, skuCode, quantity, scanned: 0 }]`
     - `status = 'IN_PROGRESS'`
     - `leaseExpiresAt = now + 15 phút` (lock order cho station này)
   - Update `Order.status = 'PACKING'` và `Order.lockByStationId = stationId`
   - Trả về: `{ session: { sessionId, orderId, orderCode, items: [...], totalQty } }`
6. Frontend hiển thị:
   - Thông tin đơn: Mã đơn | Khách hàng | Địa chỉ | Tổng tiền
   - Danh sách sản phẩm: SKU | Màu/Size | Số lượng | Đã quét
   - Bật camera để quét barcode sản phẩm

---

### 4.2. Quét barcode sản phẩm

**Luồng**:
1. User quét barcode sản phẩm bằng camera hoặc nhập tay
2. Camera detect barcode → gọi handler `submitScan(barcode)` ở `WarehousePackingPage.jsx`
3. Gọi API: **POST** `/api/packing/sessions/:sessionId/scan` với `{ barcode }`
4. Backend: `packingSession.controller.js` → `scanUnit()` ở `packingSession.service.js`:
   - Query `PackingSession` với `sessionId`
   - Kiểm tra:
     - Session phải `status = 'IN_PROGRESS'`
     - `leaseExpiresAt > now` (chưa hết hạn)
     - Barcode chưa được quét trong session này
   - Query `ProductUnit` với `barcode`
   - Kiểm tra:
     - Unit phải có `skuId` trong danh sách items của đơn
     - Unit phải `inventoryStatus = 'RESERVED'` và `reservedForOrderId = orderId`
     - Unit phải `layoutBin = true` (đã xếp trên kệ)
     - Item chưa đủ số lượng (`scanned < quantity`)
   - Nếu sai → throw error:
     - `ITEM_NOT_IN_ORDER`: SKU không có trong đơn
     - `QTY_EXCEEDED`: Đã đủ số lượng SKU này
     - `UNIT_NOT_RESERVED`: Unit chưa được reserve cho đơn
     - `BARCODE_ALREADY_SCANNED`: Đã quét barcode này rồi
   - Nếu đúng:
     - Update `PackingSession.items[i].scanned += 1`
     - Add barcode vào `PackingSession.scannedBarcodes[]`
     - Update `PackingSession.leaseExpiresAt = now + 15 phút` (renew lease)
     - Trả về: `{ session: { ...session, items: [...updated items] } }`
5. Frontend:
   - Cập nhật số lượng đã quét cho item
   - Hiển thị notice: "Đã quét {skuCode} — {scanned}/{quantity}"
   - Thêm barcode vào log hiển thị (danh sách đã quét)
   - Nếu item đủ số lượng → đánh dấu xanh ✓
6. Lặp lại cho đến khi quét đủ tất cả sản phẩm

---

### 4.3. Quay video xác nhận đóng hàng

**Luồng**:
1. User quét đủ tất cả sản phẩm → frontend hiển thị nút "Quay video xác nhận"
2. User bấm "Quay video" → yêu cầu quyền truy cập camera
3. `navigator.mediaDevices.getUserMedia({ video: true, audio: false })` → bật camera
4. Hiển thị camera preview (video element)
5. User bấm "Bắt đầu quay" → `startRecording()`
6. `MediaRecorder` bắt đầu record:
   - `recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })`
   - `recorder.start()`
   - Hiển thị timer đếm thời gian quay
7. User đặt sản phẩm vào hộp, dán tem, đóng gói
8. User bấm "Dừng quay" → `stopRecording()`
9. `recorder.stop()` → trigger `ondataavailable`:
   - Tạo `Blob` từ recorded chunks
   - Tạo `recordingId = createRandomPackingId('rec')`
   - Lưu video vào OPFS (Origin Private File System) qua `savePendingVideo()` ở `localPackingVideoQueue.js`:
     - `navigator.storage.getDirectory()` → lấy OPFS root
     - `fileHandle.createWritable()` → ghi Blob vào file
     - Save metadata: `{ recordingId, orderId, orderCode, fileSize, createdAt, status: 'QUEUED' }`
10. Gọi API: **POST** `/api/packing/sessions/:sessionId/complete` với `{ recordingId }`
11. Backend: `packingSession.controller.js` → `completeSession()` ở `packingSession.service.js`:
    - Kiểm tra tất cả items đã quét đủ
    - Update `PackingSession.status = 'COMPLETED'`, `completedAt = now`
    - Update tất cả `ProductUnit` trong session:
      - `inventoryStatus = 'PACKED'`
      - `packedAt = now`
      - `packedByUserId = userId`
      - `packingSessionId = sessionId`
    - Update `Order.status = 'PACKED'`, `packedAt = now`, release lock
    - Giảm `WarehouseLocation.currentOccupancy` cho các ô đã lấy hàng
    - Tạo `PackingRecording` document:
      - `recordingId`, `sessionId`, `orderId`
      - `status = 'PENDING_UPLOAD'`
      - `recordedAt = now`
    - Log transaction
    - Trả về: `{ session: { ...session, status: 'COMPLETED' } }`
12. Frontend:
    - Hiển thị "Đã hoàn thành đóng hàng"
    - Background: `packingVideoUploadManager` tự động upload video:
      - Gọi API: **POST** `/api/packing/recordings/:recordingId/upload-url`
      - Backend trả về Cloudinary upload URL
      - Upload video lên Cloudinary
      - Gọi API: **POST** `/api/packing/recordings/:recordingId/confirm` với `{ cloudinaryPublicId, url }`
      - Backend update `PackingRecording.videoUrl`, `status = 'UPLOADED'`
    - Xóa video khỏi OPFS sau khi upload thành công

---

### 4.4. Xử lý upload offline

**Luồng khi mất mạng**:
1. User quay video xong → lưu vào OPFS thành công
2. API `/complete` gọi thành công → đơn được mark là PACKED
3. Upload video fail (mất mạng) → `packingVideoUploadManager` retry:
   - Status: `QUEUED` → `UPLOADING` → `FAILED` → retry sau 30s
   - Retry tối đa 10 lần với exponential backoff
   - Hiển thị trong `VideoUploadStatusPanel` ở `WarehousePackingPage.jsx` dòng ~70
4. Video vẫn được giữ trong OPFS, metadata lưu trong IndexedDB
5. Khi có mạng lại → tự động retry upload
6. Nếu retry vẫn fail (Cloudinary auth error...) → `autoRetry = false`:
   - Hiển thị "Cần hỗ trợ" trong status panel
   - User báo quản lý
   - Manager có thể retry thủ công hoặc kiểm tra backend config

---

## 5. IN TEM ĐƠN HÀNG (Order QR Labels)

### 5.1. Xem danh sách đơn hàng

**Luồng**:
1. User vào trang "In tem đơn hàng" (`OrderQrPage.jsx`)
2. Component mount → gọi API: **GET** `/api/packing/orders?status=CONFIRMED_RESERVED,PACKED`
3. Backend: `orderQr.controller.js` → query `Order` với:
   - `status IN ['CONFIRMED_RESERVED', 'PACKED', 'HANDED_OVER_CARRIER']`
   - Chỉ lấy đơn đã được allocate và chốt
4. Trả về danh sách đơn:
   - Mã đơn | Khách hàng | Địa chỉ | Tổng tiền | Trạng thái | QR
5. Frontend hiển thị danh sách với search và filter theo trạng thái

---

### 5.2. In tem 1 đơn

**Luồng**:
1. User chọn 1 đơn → bấm nút "In tem"
2. Gọi `printLabel(order)` ở `OrderQrPage.jsx`
3. Gọi API: **GET** `/api/packing/orders/:orderId/qr`
4. Backend: `orderQr.controller.js` → `getOrderQr()`:
   - Query `Order` với `orderId`
   - Nếu chưa có QR → generate QR code:
     - Tạo QR data: `{ orderId, orderCode, timestamp }`
     - Dùng `qrcode` library generate image
     - Upload lên Cloudinary (optional)
     - Lưu URL vào `Order.qrCodeUrl`
   - Trả về: `{ order: { orderCode, qrCodeUrl, ... }, qrImage: base64 }`
5. Frontend:
   - Render `<OrderLabel card={{ order, image: qrImage }} />` component ở dòng ~74
   - OrderLabel component tạo HTML printable:
     - Thông tin bên gửi (sender): Tên | SĐT | Địa chỉ
     - Thông tin bên nhận (recipient): Tên | SĐT | Địa chỉ
     - Barcode vận đơn (CODE_128)
     - QR code đơn hàng
     - Mã đơn, thời gian, số tiền thu
     - Ghi chú khách hàng
     - Bảng sản phẩm
     - Chữ ký người nhận
   - Inject HTML vào new tab
   - Gọi `window.print()`
6. User in tem ra giấy decal 60mm × 95mm

---

### 5.3. In tem nhiều đơn

**Luồng**:
1. User chọn nhiều đơn bằng checkbox
2. Bấm "In tem đã chọn"
3. Loop qua mỗi đơn:
   - Gọi API `/api/packing/orders/:orderId/qr` để lấy QR
   - Add vào danh sách labels
4. Render tất cả labels vào 1 tab
5. Layout: 2 tem/trang (hàng dọc)
6. `window.print()` → in tất cả tem

---

## 6. VẬN CHUYỂN (Shipping)

### 6.1. Xem danh sách đơn sẵn sàng giao

**Luồng**:
1. User vào trang "Vận chuyển" (`ShippingPage.jsx`)
2. Component mount → gọi API: **GET** `/api/shipping/orders?status=PACKED`
3. Backend: query `Order` với `status = 'PACKED'`
4. Trả về danh sách đơn đã đóng gói, chờ bàn giao vận chuyển
5. Frontend hiển thị table: Mã đơn | Khách hàng | Địa chỉ | Nhà vận chuyển | Trạng thái

---

### 6.2. Bàn giao đơn cho nhà vận chuyển

**Luồng**:
1. User chọn đơn → bấm "Bàn giao"
2. Scan mã vận đơn (waybill) của nhà vận chuyển (GHN, GHTK...)
3. Gọi API: **POST** `/api/shipping/orders/:orderId/handover` với `{ waybillCode, carrierCode }`
4. Backend: `shipping.controller.js` → `handoverOrder()`:
   - Update `Order`:
     - `status = 'HANDED_OVER_CARRIER'`
     - `shipping.waybillCode = waybillCode`
     - `shipping.handedOverAt = now`
     - `shipping.handedOverByUserId = userId`
   - Gọi carrier API (GHN, GHTK) để confirm handover (optional)
   - Log transaction
5. Frontend hiển thị "Đã bàn giao đơn {orderCode} cho {carrierName}"

---

## 7. TRA CỨU BARCODE (Barcode Tracking)

### 7.1. Tra cứu barcode sản phẩm

**Luồng**:
1. User vào trang "Tra cứu barcode" với `isStaffMode=true` (`BarcodeTrackingPage.jsx`)
2. User nhập hoặc quét barcode vào ô search
3. Gọi API: **GET** `/api/warehouse/barcode-tracking/:barcode`
4. Backend: `barcodeTracking.controller.js` → `trackBarcode()`:
   - Query `ProductUnit` với `barcode`
   - Populate `Sku`, `Product`, `WarehouseLocation`
   - Query lịch sử:
     - `SystemLog` với `targetCollection = 'ProductUnit'` và `targetId = unitId`
     - Lấy các events: PUTAWAY, PICKED, PACKED, SHIPPED...
   - Trả về: `{ unit: { barcode, skuCode, productName, inventoryStatus, locationCode, ... }, history: [...] }`
5. Frontend hiển thị:
   - **Thông tin sản phẩm**: SKU | Tên | Màu | Size | Giá
   - **Trạng thái hiện tại**: AVAILABLE (trên kệ) | RESERVED (giữ cho đơn) | PACKED | SHIPPED...
   - **Vị trí hiện tại**: Kho | Khu | Kệ | Tầng | Ô
   - **Lịch sử di chuyển**:
     - Ngày giờ | Hành động | Người thực hiện | Chi tiết
     - VD: "10/12/2024 14:30 | Xếp lên kệ B-R01-T1-O5 | Nguyễn Văn A"

---

### 7.2. Tra cứu barcode nguyên phụ liệu

**Luồng tương tự**, query:
- `FabricRoll` với `rollBarcode` cho vải
- `MaterialStockLot` với `lotBarcode` cho phụ liệu
- Hiển thị: Mã vật tư | Tên | Lô | Số lượng | Vị trí | Trạng thái | Lịch sử

---

## 8. XEM THÀNH PHẨM (Finished Goods - Staff Mode)

### 8.1. Xem danh sách thành phẩm (Read-only)

**Luồng**:
1. User vào trang "Kho thành phẩm" với `isStaffMode=true`
2. Luồng giống Manager (section 2.1 trong file `warehouse-manager-feature-flows.md`)
3. **Khác biệt**: Staff chỉ **xem**, không có quyền:
   - Chỉnh sửa giá
   - Cập nhật safety stock
   - Thêm/sửa sản phẩm
4. Có thể:
   - Xem chi tiết sản phẩm
   - Xem hàng trên kệ
   - **In barcode** (chức năng quan trọng cho staff)
   - Tra cứu phiếu nhập

---

### 8.2. In barcode sản phẩm (Staff)

**Luồng giống Manager** (section 2.3 trong file `warehouse-manager-feature-flows.md`):
1. Vào chi tiết sản phẩm → section "Hàng đang trên kệ"
2. Expand 1 dòng SKU → hiển thị danh sách barcode
3. Chọn barcode → bấm "In tem đã chọn"
4. API: **POST** `/api/products/:productId/labels`
5. Frontend: `printProductLabels()` → in tem barcode

**Use case**: Staff cần in thêm tem khi tem bị rách, mờ, hoặc cần dán lại

---

## Tổng kết

Tài liệu này mô tả luồng chạy chi tiết các chức năng **Nhân viên kho** trong ARAWMS:

### 1. **Xếp hàng vào kệ** (8 chức năng):
   - 1.1. Xem danh sách hàng chờ xếp
   - 1.2. Xếp hàng thành phẩm từng chiếc (2-step: quét ô → quét sản phẩm)
   - 1.3. Xếp hàng loạt (bulk: quét nhiều tem cùng lúc)
   - 1.4. Báo thiếu hàng
   - 1.5. Báo sự cố

### 2. **Xếp hàng nguyên phụ liệu** (3 chức năng):
   - 2.1. Xem danh sách nguyên phụ liệu chờ xếp
   - 2.2. Xếp cuộn vải (Roll)
   - 2.3. Xếp lô phụ liệu (Lot)

### 3. **Soạn hàng xuất kho** (3 chức năng):
   - 3.1. Xem danh sách lệnh xuất được phân công
   - 3.2. Soạn hàng theo FIFO
   - 3.3. Báo thiếu hàng

### 4. **Đóng hàng** (4 chức năng):
   - 4.1. Quét QR đơn hàng
   - 4.2. Quét barcode sản phẩm
   - 4.3. Quay video xác nhận
   - 4.4. Xử lý upload offline (auto-retry)

### 5. **In tem đơn hàng** (3 chức năng):
   - 5.1. Xem danh sách đơn hàng
   - 5.2. In tem 1 đơn (60mm × 95mm với QR)
   - 5.3. In tem nhiều đơn

### 6. **Vận chuyển** (2 chức năng):
   - 6.1. Xem đơn sẵn sàng giao
   - 6.2. Bàn giao cho nhà vận chuyển

### 7. **Tra cứu barcode** (2 chức năng):
   - 7.1. Tra cứu sản phẩm
   - 7.2. Tra cứu nguyên phụ liệu

### 8. **Xem thành phẩm** (2 chức năng):
   - 8.1. Xem danh sách (read-only)
   - 8.2. In barcode

---

**Đặc điểm chung của Staff workflow**:
- **Scan-heavy**: Nhiều chức năng dùng camera quét barcode/QR
- **Task-based**: Nhận task từ manager, thực hiện theo hướng dẫn
- **Real-time validation**: Mỗi lần quét đều gọi API validate ngay
- **Offline-capable**: Đóng hàng + upload video hỗ trợ offline
- **Idempotent**: Dùng `requestId` để retry an toàn khi mất mạng
- **Audit trail**: Mọi hành động đều được log với `actorId`, `timestamp`

---

*File này sẽ được cập nhật khi có thêm chức năng mới hoặc thay đổi luồng.*
