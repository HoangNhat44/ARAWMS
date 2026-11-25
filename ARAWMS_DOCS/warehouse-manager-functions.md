# LUỒNG DỮ LIỆU CÁC CHỨC NĂNG QUẢN LÝ KHO

> **Tài liệu này mô tả luồng dữ liệu từ góc độ Quản lý kho (Warehouse Manager)**
>
> - Bấm nút nào → File nào → Hàm nào → API nào → Xử lý ở đâu
> - Dữ liệu chạy qua những đâu, validate như thế nào
> - Từ FE → BE → DB → Response

---

## 1. CẤU HÌNH SẢN PHẨM (Product Configuration)

**MỤC ĐÍCH:** Tạo và quản lý sản phẩm, biến thể (màu/size), giá bán.

**FILES:**
- **FE:** `ProductConfigurationPage.jsx`
- **BE:** `productConfiguration.service.js` (line 286)

---

### A. TẠO SẢN PHẨM MỚI (CREATE)

```
[FE] User bấm "Lưu sản phẩm mới"
  ↓
[FE] createProductConfiguration() - ProductConfigurationPage.jsx line 355
  ├─ Validate: productName, category, productCode format, basePrice, variants
  └─ submitCatalogChange() → Lưu IndexedDB → syncCatalogChanges()
  ↓
[API] POST /api/products/configuration/sync
  Body: { operationType: 'CREATE', payload: {...} }
  ↓
[BE] syncCatalogOperation() - productConfiguration.service.js line 286
  ├─ parseProductCatalogInput(): Validate productName, category, productCode
  ├─ parseProductVariantInputs(): Validate color, size, retailPrice
  └─ assertProductCodeFree(): Check mã không trùng
  ↓
[DB] Transaction:
  ├─ Product.create() → Tạo product
  ├─ addProductVariants() → Tạo SKUs (buildSkuCode)
  └─ CatalogOperation.create() → Log
  ↓
[Response] { product, skus }
  ↓
[FE] Hiển thị "Đã tạo sản phẩm ABC-123 với X SKUs"
```

---

### B. CẬP NHẬT SẢN PHẨM (UPDATE)

```
[FE] User sửa thông tin → Bấm "Cập nhật"
  ↓
[FE] updateProductConfiguration() - line 380
  ↓
[API] POST /api/products/configuration/sync
  Body: { operationType: 'UPDATE', serverEntityId, baseVersion, payload }
  ↓
[BE] syncCatalogOperation() - line 286
  ├─ parseProductDetails(): Validate thay đổi
  ├─ Check baseVersion === product.version (optimistic locking)
  └─ Product.findOneAndUpdate() → version + 1
  ↓
[Response] { product }
```

**VERSION CONFLICT:** Nếu 2 người cùng sửa → Người sau nhận error.

---

### C. THÊM BIẾN THỂ (ADD_VARIANTS)

```
[FE] addProductVariant() - line 420
  ↓
[API] POST /api/products/configuration/sync
  Body: { operationType: 'ADD_VARIANTS', serverEntityId, payload: { variants } }
  ↓
[BE] syncAddVariants() - line 204
  ├─ Validate: Không trùng color/size
  └─ addProductVariants(product, variants)
  ↓
[DB] Tạo SKUs mới
  ↓
[Response] { product, skus }
```

---

### D. CẬP NHẬT GIÁ SKU (UPDATE_SKU_PRICE)

```
[FE] updateSkuPrice() - line 450
  ↓
[API] POST /api/products/configuration/sync
  Body: { operationType: 'UPDATE_SKU_PRICE', payload: { skuId, retailPrice } }
  ↓
[BE] syncUpdateSkuPrice() - line 240
  ├─ Validate: retailPrice >= 0
  └─ Sku.findOneAndUpdate()
  ↓
[Response] { sku }
```

---

### E. IMPORT TỪ EXCEL (IMPORT_PRODUCT)

```
[FE] User chọn file Excel → Bấm "Nhập dữ liệu"
  ↓
[FE] parseExcelFile() - Offline parsing
  ├─ Parse từng dòng
  ├─ Group theo productCode (nhiều dòng → 1 product)
  └─ Lưu IndexedDB: { operationType: 'IMPORT_PRODUCT', status: 'QUEUED' }
  ↓
[FE] syncCatalogChanges() → Gửi từng product
  ↓
[API] POST /api/products/configuration/sync (từng product)
  Body: { operationType: 'IMPORT_PRODUCT', payload: {...} }
  ↓
[BE] syncCatalogOperation()
  ├─ parseImportProductPayload()
  ├─ copyImportMedia() → Download media từ URL
  └─ Transaction: Product.create() + addProductVariants()
  ↓
[Response] { product, skus, rows: [5,6,7] }
  ↓
[FE] Update IndexedDB status = 'DONE'
```

**ĐẶC BIỆT:**
- Nhiều dòng Excel → 1 product
- Mỗi dòng = 1 variant
- Lưu rows để trace nguồn gốc

---

## 2. CẤU HÌNH VỊ TRÍ KHO (Warehouse Layout)

**MỤC ĐÍCH:** Thiết kế layout kho, thêm/sửa/xóa kệ hàng.

**FILES:**
- **FE:** `WarehouseLayoutPage.jsx`
- **BE:** `warehouseLayout.service.js`

---

### A. THÊM KỆ MỚI (ADD_RACK)

```
[FE] User bấm "Thêm kệ" → Điền form → Bấm "Lưu"
  ↓
[FE] addRack() - WarehouseLayoutPage.jsx line 165
  ├─ Validate: rackCode, rackName, shelfCount
  ↓
[API] POST /api/warehouse/layout/draft/rack
  Body: { rackCode, rackName, shelfCount, zoneCode }
  ↓
[BE] addRackToDraft() - warehouseLayout.service.js line 120
  ├─ Validate: rackCode format, không trùng
  ├─ Generate bins tự động
  └─ WarehouseLayoutDraft.findOneAndUpdate()
     → Push rack vào draftLayout.racks[]
  ↓
[Response] { draft }
  ↓
[FE] Hiển thị kệ mới (màu xanh = draft)
```

**LƯU Ý:** Kệ chỉ ở DRAFT, chưa active. Phải publish mới có hiệu lực.

---

### B. PUBLISH LAYOUT (DRAFT → ACTIVE)

```
[FE] publishDraft() - line 250
  ↓
[API] POST /api/warehouse/layout/publish
  ↓
[BE] publishWarehouseLayout() - line 180
  ├─ Transaction:
  │  └─ Với mỗi bin trong draft:
  │     └─ WarehouseLocation.create({
  │          locationCode, rackCode, shelfCode,
  │          layoutBin: true
  │        })
  ├─ WarehouseLayoutDraft.update({ status: 'PUBLISHED' })
  └─ activeLayoutVersion + 1
  ↓
[Response] { publishedCount }
  ↓
[FE] "Đã áp dụng layout với X vị trí mới"
```

---

### C. XÓA KỆ (REMOVE_RACK)

```
[FE] removeDraftRack() - line 342
  ↓
[API] DELETE /api/warehouse/layout/draft/rack/:rackCode
  ↓
[BE] removeRackFromDraft() - line 145
  ├─ Check: currentOccupancy = 0 (không có hàng)
  ├─ Nếu đã published:
  │  └─ WarehouseLocation.updateMany({ rackActive: false })
  └─ Nếu chỉ trong draft:
     └─ Remove khỏi draftLayout.racks[]
  ↓
[Response] { draft }
```

---

## 3. TẠO LỊCH KIỂM KÊ (Stocktake)

**MỤC ĐÍCH:** Tạo lịch kiểm kê định kỳ, phân công nhân viên.

**FILES:**
- **FE:** `StocktakePage.jsx`
- **BE:** `stocktake.service.js`

---

### A. TẠO LỊCH MỘT LẦN (ONCE)

```
[FE] create() - StocktakePage.jsx line 144
  ↓
[API] POST /api/stocktake/sessions
  Body: {
    warehouseType, scopeType, zoneCode,
    scheduledAt, startTime, endTime,
    inspectorId, approverId
  }
  ↓
[BE] createStocktake() - stocktake.service.js line 85
  ├─ Validate: scheduledAt >= now, startTime < endTime
  └─ StocktakeSession.create()
  ↓
[Notify] Gửi thông báo cho Inspector
  ↓
[Response] { session }
```

---

### B. TẠO LỊCH ĐỊNH KỲ (WEEKLY/MONTHLY)

```
[FE] create() với recurrence
  ↓
[API] POST /api/stocktake/sessions
  Body: { recurrence: 'WEEKLY', weekday: 1, startDate, endDate }
  ↓
[BE] createStocktake() → StocktakeSchedule.create()
  ↓
[CRON Job - chạy mỗi ngày 00:00]
  ├─ Tìm schedules active
  ├─ Check hôm nay match weekday
  └─ addSession() → Tạo StocktakeSession mới
  ↓
[Response] { schedule }
```

---

### C. TẠM DỪNG/TIẾP TỤC LỊCH

```
[FE] toggle() - line 84
  ↓
[API] POST /api/stocktake/schedules/:id/status
  Body: { status: 'PAUSED', version }
  ↓
[BE] pauseStocktakeSchedule() - line 171
  ├─ Check version (optimistic locking)
  └─ StocktakeSchedule.findOneAndUpdate({ status, version + 1 })
  ↓
[Response] { schedule }
```

**PAUSED:** CRON không tạo session mới, nhưng sessions đã tạo vẫn chạy.

---

## 4. BÁO CÁO THỐNG KÊ KHO (Warehouse Reports)

**MỤC ĐÍCH:** Tổng hợp dữ liệu từ 15+ collections thành báo cáo.

**FILES:**
- **FE:** `WarehouseReportPage.jsx`
- **BE:** `warehouseReport.service.js`

---

### A. TẠO BÁO CÁO (CREATE)

```
[FE] create() - WarehouseReportPage.jsx line 105
  ↓
[API] POST /api/warehouse-reports
  Body: { periodStart, periodEnd, comments }
  ↓
[BE] createWarehouseReport() - warehouseReport.service.js line 105
  ├─ parsePeriod(): Validate kỳ báo cáo
  ├─ buildWarehouseSnapshot():
  │  ├─ Query 15+ collections:
  │  │  ├─ Product, Sku, ProductUnit
  │  │  ├─ FabricRoll, MaterialStockLot
  │  │  ├─ WarehouseLocation
  │  │  ├─ StocktakeSession, StocktakeRecord
  │  │  └─ InventoryTransaction
  │  ├─ Aggregate: Tính tổng, giá trị, occupancy
  │  └─ Phát hiện vấn đề: overReserved, belowSafety, aging
  └─ ManagerReport.create({ status: 'DRAFT', content: snapshot })
  ↓
[Response] { report }
```

---

### B. GỬI BÁO CÁO (SUBMIT)

```
[FE] submit() - line 148
  ↓
[API] POST /api/warehouse-reports/:id/submit
  Body: { comments }
  ↓
[BE] submitWarehouseReport() - line 148
  ├─ Tạo seal:
  │  ├─ hash = SHA-256(content)
  │  └─ seal = { hash, sealedAt, sealedBy }
  └─ ManagerReport.update({ status: 'SUBMITTED', content.seal })
  ↓
[Response] { report }
```

**SEAL:** Đảm bảo dữ liệu immutable sau khi gửi.

---

### C. TỔNG HỢP LẠI (REFRESH)

```
[FE] refresh() - line 122
  ↓
[API] POST /api/warehouse-reports/:id/refresh
  ↓
[BE] refreshWarehouseReport() - line 122
  ├─ Check status === 'DRAFT'
  ├─ buildWarehouseSnapshot() → Data mới nhất
  └─ ManagerReport.update({ content: newSnapshot })
  ↓
[Response] { report }
```

**CHỈ DRAFT:** Chỉ refresh được nếu chưa submit.

---

## 5. NHẬP NGUYÊN PHỤ LIỆU (Raw Material Inbound)

**MỤC ĐÍCH:** Nhận nguyên phụ liệu từ NCC, kiểm chất lượng, xếp vào kho và cập nhật tồn kho.

**FILES:**
- **FE:** `SupplierInboundPage.jsx`, `DirectMaterialReceiptModal.jsx`
- **BE:** `inboundExecution.service.js`

---

### A. TẠO PHIẾU NHẬP (CREATE)

```
[FE] User bấm "Tạo phiếu nhập mới"
  ↓
  File: SupplierInboundPage.jsx
  ↓
[FE] Mở modal DirectMaterialReceiptModal
  ├─ State: blankForm(user, locations) - line 55
  └─ User điền form:
     ├─ Chọn NCC (supplierId)
     ├─ Chọn kế hoạch nhập (inboundPlanId)
     └─ Nhập rolls/lots:
        ├─ lengthMeters, widthCm, quality, locationId (fabric)
        └─ countedQty, allocations (auxiliary)
  ↓
[FE] Bấm "Lưu nháp"
  ↓
[FE] saveDraft() - DirectMaterialReceiptModal.jsx line 308
  ├─ Validate:
  │  ├─ actualQty = acceptedQty + rejectedQty + pendingQty
  │  ├─ Mỗi roll có locationId
  │  └─ clientLineId unique
  ↓
[API] POST /api/raw-material-inbound/receipts
  Body: { inboundPlanId, supplierId, receiptLines: [...] }
  ↓
[BE] Router: inboundExecution.routes.js
  ├─ Middleware: authenticate
  └─ authorize(['WAREHOUSE_MANAGER'])
  ↓
[BE] createMaterialReceiptDraft() - inboundExecution.service.js line 167
  ├─ Lấy kế hoạch: MaterialInboundPlan.findById()
  ├─ Tính remainingQty = plannedQty - actualVerifiedPassedQty
  ├─ applyDraft() - line 211:
  │  ├─ Validate plan còn remainingQty > 0
  │  ├─ acceptedQty <= remainingQty
  │  ├─ Materials isActive = true
  │  ├─ Rolls: lengthMeters > 0, widthCm > 0, có quality và locationId
  │  └─ Lots: countedQty > 0, allocations sum = countedQty
  ├─ Tính status:
  │  ├─ Có pendingQty > 0 → 'WAITING_QC'
  │  ├─ Tất cả có quality + location → 'READY_TO_CONFIRM'
  │  └─ Ngược lại → 'DRAFT'
  └─ MaterialTicket.create({ status, receiptVersion: 0 })
  ↓
[Response] { receipt: { _id, ticketCode, status, receiptVersion: 0 } }
  ↓
[FE] Hiển thị: "Đã lưu phiếu nhập nháp"
  └─ Badge status: DRAFT (xám) | WAITING_QC (vàng) | READY_TO_CONFIRM (xanh)
```

---

### B. CẬP NHẬT PHIẾU (UPDATE)

```
[FE] User chọn phiếu → Bấm "Sửa"
  ↓
  File: SupplierInboundPage.jsx
  ↓
[FE] Mở DirectMaterialReceiptModal với data có sẵn
  └─ User thay đổi: quantity, quality, locationId...
  ↓
[FE] Bấm "Cập nhật"
  ↓
[FE] saveDraft() - line 308
  ├─ Validate giống CREATE
  ↓
[API] PATCH /api/raw-material-inbound/receipts/:id
  Body: { expectedVersion: 0, ...formData }
  ↓
[BE] updateMaterialReceiptDraft() - line 286
  ├─ Lấy phiếu: MaterialTicket.findById()
  ├─ Check status in ['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM']
  ├─ Check expectedVersion === current.receiptVersion
  │  └─ Nếu khác → Throw "VERSION_CONFLICT"
  ├─ applyDraft() - line 211 (giống CREATE)
  └─ MaterialTicket.findOneAndUpdate({
       _id, receiptVersion: expectedVersion
     }, {
       $set: { receiptLines, status },
       $inc: { receiptVersion: 1 }
     })
  ↓
[Response] { receipt: { ...updated, receiptVersion: 1 } }
  ↓
[FE] Update form với receiptVersion mới
```

**VERSION CONFLICT:** Nếu 2 người cùng sửa → Người sau nhận error → Reload.

---

### C. XÁC NHẬN PHIẾU (CONFIRM)

```
[FE] Phiếu status = 'READY_TO_CONFIRM'
  └─ Hiển thị nút "Xác nhận phiếu nhập"
  ↓
[FE] User bấm "Xác nhận phiếu nhập"
  ↓
  File: DirectMaterialReceiptModal.jsx
  ↓
[FE] confirm() - line 346
  ├─ Validate:
  │  ├─ Mỗi line có actualQty > 0
  │  ├─ Rolls có quality và locationId
  │  └─ Lots có allocations với locationId
  ↓
[API] POST /api/raw-material-inbound/receipts/:id/confirm
  Body: { 
    expectedVersion: 1,
    idempotencyKey: 'uuid-xxx'
  }
  ↓
[BE] confirmMaterialReceipt() - line 663
  ├─ Lấy phiếu: MaterialTicket.findById()
  ├─ Check status === 'READY_TO_CONFIRM'
  ├─ Check expectedVersion === receiptVersion
  ├─ Check idempotencyKey chưa được dùng
  └─ Transaction: session.withTransaction(async () => {
  
      [1] TẠO BARCODE:
          ├─ FabricRoll.create([{
          │    rollBarcode: "RM-000123",
          │    rawMaterialId, supplierId,
          │    initialLengthMeters, currentLengthMeters,
          │    unitCostPerMeter, quality, locationId,
          │    fifoInboundTimestamp, status: "IN_STOCK"
          │  }], { session })
          └─ MaterialStockLot.create([{
               lotBarcode: "RM-000124",
               rawMaterialId, supplierId,
               initialQty, currentQty, unitCost,
               quality, allocations: [{locationId, quantity}],
               fifoInboundTimestamp, status: "IN_STOCK"
             }], { session })
      
      [2] CẬP NHẬT VỊ TRÍ KHO:
          └─ WarehouseLocation.findOneAndUpdate(
               { _id: locationId },
               { $inc: { currentOccupancy: quantity } },
               { session }
             )
      
      [3] LOG INVENTORY:
          └─ InventoryTransaction.create([{
               transactionType: "INBOUND_RECEIPT",
               rawMaterialId, quantity, unitCost,
               totalValue: quantity × unitCost,
               toLocationId, referenceId: receiptId,
               transactionDate: receivedAt
             }], { session })
      
      [4] CẬP NHẬT KẾ HOẠCH:
          └─ MaterialInboundPlan.findOneAndUpdate(
               { _id: planId },
               { $inc: { 
                 "expectedItems.$[elem].actualVerifiedPassedQty": acceptedQty
               }},
               { arrayFilters: [{  "elem.rawMaterialId": rawMaterialId }], session }
             )
      
      [5] KHÓA PHIẾU:
          └─ MaterialTicket.findOneAndUpdate(
               { _id: receiptId, receiptVersion, status: 'READY_TO_CONFIRM' },
               { $set: {
                 status: "COMPLETED",
                 confirmedAt: new Date(),
                 confirmedByUserId: user._id
               }, $inc: { receiptVersion: 1 } },
               { new: true, session }
             )
  })
  ↓
[Response] { 
    receipt: { status: 'COMPLETED', receiptVersion: 2 },
    barcodes: ["RM-000123", "RM-000124", ...]
  }
  ↓
[FE] Close modal
  ├─ Hiển thị: "Đã xác nhận phiếu NPL-xxx và tạo 5 tem barcode"
  ├─ Có nút "In tem vật tư"
  └─ Reload danh sách
```

**TRANSACTION (5 BƯỚC - ATOMIC):**
1. Tạo FabricRoll/MaterialStockLot + barcode
2. Cập nhật WarehouseLocation.currentOccupancy
3. Log InventoryTransaction
4. Cập nhật MaterialInboundPlan.actualVerifiedPassedQty
5. Khóa MaterialTicket → COMPLETED

**LƯU Ý:**
- 5 bước phải thành công cùng lúc
- 1 bước lỗi → Rollback toàn bộ
- idempotencyKey chống duplicate submit

---

---

## 6. XUẤT NGUYÊN PHỤ LIỆU (Material Outbound)

**MỤC ĐÍCH:** Duyệt yêu cầu xuất NPL từ kỹ thuật xưởng, phân công nhân viên kho lấy hàng.

**FILES:**
- **FE:** `MaterialOutboundPage.jsx`
- **BE:** `outboundExecution.service.js`

---

### A. DUYỆT YÊU CẦU & PHÂN CÔNG (APPROVE & ASSIGN)

**VAI TRÒ:** Quản lý kho

```
[FE] Quản lý kho xem danh sách yêu cầu từ kỹ thuật xưởng
  ↓
  File: MaterialOutboundPage.jsx
  ↓
[FE] User chọn yêu cầu → Bấm "Duyệt & phân công"
  ├─ Xem chi tiết yêu cầu:
  │  ├─ Người yêu cầu: Kỹ thuật xưởng
  │  ├─ Danh sách NPL cần xuất
  │  └─ Số lượng từng loại
  ├─ Chọn nhân viên kho (assignedStaffId)
  ├─ Chọn nguồn lấy hàng (rolls/lots + locations)
  │  └─ Với mỗi line:
  │     ├─ Tìm rolls/lots có sẵn (theo FIFO)
  │     └─ Phân bổ: rollId/lotId, quantity, locationId
  └─ Nhập ghi chú
  ↓
[FE] approveAndAssign() - line 841
  ├─ Validate:
  │  ├─ Đã chọn assignedStaffId
  │  └─ Đã phân bổ đủ sources cho mỗi line
  └─ Build allocationLines: [
       { lineId, sources: [{ rollId/lotId, quantity, locationId }] }
     ]
  ↓
[API] POST /api/material-outbound/requests/:id/approve
  Body: { 
    assignedStaffId,
    allocationLines: [
      { 
        lineId, 
        sources: [
          { rollId/lotId, quantity, locationId }
        ] 
      }
    ],
    managerNote
  }
  ↓
[BE] approveAndAssignRequest() - outboundExecution.service.js line 841
  ├─ Lấy yêu cầu: MaterialTicket.findById()
  ├─ Check status === 'PENDING_APPROVAL'
  ├─ Validate assignedStaffId:
  │  └─ User.findById() → Check role WAREHOUSE_STAFF
  ├─ Với mỗi line:
  │  ├─ Check tổng sources.quantity >= requestedQty
  │  ├─ Validate rolls/lots tồn tại:
  │  │  ├─ FabricRoll.findById() hoặc MaterialStockLot.findById()
  │  │  └─ Check status = 'IN_STOCK'
  │  ├─ Check rolls/lots có đủ số lượng:
  │  │  └─ currentLengthMeters/currentQty >= quantity
  │  └─ Check locationId khớp với roll/lot.locationId
  └─ MaterialTicket.findOneAndUpdate({
       status: 'ASSIGNED',
       assignedStaffId,
       assignedAt: new Date(),
       assignedByManagerId: user._id,
       allocationLines,
       managerNote
     })
  ↓
[Notify] Gửi thông báo cho:
  ├─ Nhân viên kho: "Nhiệm vụ lấy hàng mới: PHX-xxx"
  └─ Kỹ thuật xưởng: "Yêu cầu xuất PHX-xxx đã được duyệt"
  ↓
[Response] { ticket: updated }
  ↓
[FE] Hiển thị: "Đã duyệt và giao cho [Tên nhân viên] lấy hàng"
  └─ Phiếu chuyển status: PENDING_APPROVAL → ASSIGNED
```

**VALIDATE QUAN TRỌNG:**
- Nguồn phải theo FIFO (hàng cũ xuất trước): `fifoInboundTimestamp` tăng dần
- Tổng quantity từ sources >= requestedQty
- Mỗi roll/lot phải có đủ số lượng (không over-allocate)
- Location phải khớp với vị trí thực tế của roll/lot

---

### B. XEM DANH SÁCH YÊU CẦU (LIST REQUESTS)

```
[FE] Quản lý kho vào trang "Yêu cầu xuất NPL"
  ↓
  File: MaterialOutboundPage.jsx
  ↓
[FE] Load danh sách yêu cầu
  ↓
[API] GET /api/material-outbound/requests
  Query: { status: 'PENDING_APPROVAL' }
  ↓
[BE] listOutboundRequests() - line 407
  ├─ Query: MaterialTicket.find({
  │    ticketType: 'OUTBOUND_WAREHOUSE',
  │    status: { $in: ['PENDING_APPROVAL', 'ASSIGNED', 'IN_PICKING'] }
  │  })
  ├─ Populate: createdByUserId (kỹ thuật xưởng), assignedStaffId
  └─ Sort: createdAt desc
  ↓
[Response] { requests: [...] }
  ↓
[FE] Hiển thị danh sách:
  └─ Với mỗi request:
     ├─ Mã: PHX-001
     ├─ Người yêu cầu: Nguyễn Văn A (Kỹ thuật)
     ├─ Ngày yêu cầu: 20/11/2024
     ├─ Trạng thái: PENDING_APPROVAL (badge vàng)
     └─ Nút: "Duyệt & phân công"
```

---

### C. XEM CHI TIẾT YÊU CẦU (VIEW DETAIL)

```
[FE] Quản lý kho click vào yêu cầu
  ↓
[API] GET /api/material-outbound/requests/:id
  ↓
[BE] getOutboundRequestDetail() - line 467
  ├─ MaterialTicket.findById()
  ├─ Populate: requestLines với material details
  └─ Tìm rolls/lots có sẵn cho từng line (FIFO):
     └─ FabricRoll.find({ 
          rawMaterialId, 
          status: 'IN_STOCK',
          currentLengthMeters > 0
        }).sort({ fifoInboundTimestamp: 1 })
  ↓
[Response] { 
    ticket: {...},
    availableSources: [
      { lineId, materials: [
        { rollId, barcode, currentQty, locationId, fifoTimestamp }
      ]}
    ]
  }
  ↓
[FE] Hiển thị modal:
  ├─ Thông tin yêu cầu
  ├─ Danh sách NPL cần xuất
  └─ Nguồn có sẵn (sắp xếp theo FIFO)
```

---

### D. HỦY YÊU CẦU (CANCEL)

```
[FE] Quản lý kho bấm "Hủy yêu cầu"
  ↓
[API] POST /api/material-outbound/requests/:id/cancel
  Body: { cancelReason }
  ↓
[BE] cancelOutbound() - line 391
  ├─ Check status in ['PENDING_APPROVAL', 'ASSIGNED']
  │  └─ Chỉ hủy được nếu chưa bắt đầu lấy hàng
  └─ MaterialTicket.update({
       status: 'CANCELLED',
       cancelledAt: new Date(),
       cancelledByUserId: user._id,
       cancelReason
     })
  ↓
[Notify] Gửi thông báo cho:
  ├─ Kỹ thuật xưởng: "Yêu cầu PHX-xxx đã bị hủy"
  └─ Nhân viên kho (nếu đã assign): "Nhiệm vụ PHX-xxx đã bị hủy"
  ↓
[Response] { ticket: cancelled }
```

---

### E. XEM TRẠNG THÁI PHIẾU XUẤT (VIEW STATUS)

```
[FE] Quản lý kho xem tiến độ phiếu đã phân công
  ↓
[API] GET /api/material-outbound/outbounds
  Query: { status: ['ASSIGNED', 'IN_PICKING', 'COMPLETED'] }
  ↓
[BE] listOutbounds() - line 162
  ├─ Query với filter status
  └─ Populate assignedStaffId, confirmedByUserId
  ↓
[Response] { outbounds: [...] }
  ↓
[FE] Hiển thị dashboard:
  └─ Với mỗi phiếu:
     ├─ Mã: PHX-001
     ├─ Nhân viên: Nguyễn Văn B
     ├─ Trạng thái:
     │  ├─ ASSIGNED: "Chờ lấy hàng" (xám)
     │  ├─ IN_PICKING: "Đang lấy hàng" (xanh dương)
     │  ├─ SHORTAGE_REPORTED: "Báo thiếu hàng" (đỏ)
     │  └─ COMPLETED: "Đã hoàn tất" (xanh lá)
     └─ Nếu SHORTAGE_REPORTED:
        └─ Nút: "Xử lý thiếu hàng"
```

---

### F. XỬ LÝ THIẾU HÀNG (RESOLVE SHORTAGE)

**KHI NHÂN VIÊN KHO BÁO THIẾU**

```
[FE] Quản lý kho nhận thông báo "Báo thiếu hàng: PHX-xxx"
  ↓
[FE] Mở phiếu → Xem báo cáo thiếu:
  ├─ Line: Vải kaki 150cm
  ├─ Yêu cầu: 500m
  ├─ Thực tế tìm được: 450m
  └─ Lý do: "Cuộn RM-000123 chỉ còn 450m"
  ↓
[FE] Quản lý kho chọn hành động:
  
  OPTION 1: Phân bổ lại nguồn khác
    ├─ Bấm "Phân bổ lại nguồn"
    ├─ Chọn roll/lot khác có đủ hàng
    └─ Gọi API
       ↓
       [API] POST /api/material-outbound/requests/:id/reallocate
         Body: { 
           lineId, 
           newSources: [{ rollId, quantity, locationId }] 
         }
       ↓
       [BE] reallocateSources() - line 1435
         ├─ Validate newSources đủ số lượng
         ├─ Check rolls/lots mới có sẵn
         └─ Update allocationLines với sources mới
            └─ MaterialTicket.update({ 
                 status: 'ASSIGNED',
                 allocationLines: updated
               })
       ↓
       [Notify] "Nguồn lấy hàng thay đổi: PHX-xxx"
       ↓
       [Response] { ticket: updated }
  
  OPTION 2: Giảm số lượng xuất
    ├─ Bấm "Xác nhận giảm số lượng"
    ├─ Nhập số lượng mới: 450m
    └─ Gọi API
       ↓
       [API] POST /api/material-outbound/requests/:id/resolve-shortage
         Body: { lineId, adjustedQty: 450 }
       ↓
       [BE] resolveShortage() - line 1388
         ├─ Validate adjustedQty < originalQty
         └─ Update allocationLines:
            ├─ requestedQty = 450
            └─ Update sources để match số lượng mới
            └─ MaterialTicket.update({ 
                 status: 'ASSIGNED',
                 allocationLines: adjusted
               })
       ↓
       [Notify] "Đã xử lý báo thiếu: PHX-xxx"
       ↓
       [Response] { ticket: updated }
  ↓
[FE] Hiển thị: "Đã xử lý thiếu hàng. Nhân viên kho tiếp tục lấy hàng"
  └─ Status: SHORTAGE_REPORTED → ASSIGNED
```

---

## BẢNG TÓM TẮT 6 CHỨC NĂNG

| Chức năng | Nút | File FE | Hàm FE (line) | API | Hàm BE (line) | Đặc điểm |
|-----------|-----|---------|---------------|-----|---------------|----------|
| **1. Product Config** | "Lưu sản phẩm" | ProductConfigurationPage | createProductConfiguration (355) | POST /products/sync | syncCatalogOperation (286) | Offline-first, IndexedDB |
| **2. Warehouse Layout** | "Áp dụng layout" | WarehouseLayoutPage | publishDraft (250) | POST /layout/publish | publishWarehouseLayout (180) | Draft-and-Publish |
| **3. Stocktake** | "Tạo lịch" | StocktakePage | create (144) | POST /stocktake/sessions | createStocktake (85) | CRON auto create |
| **4. Reports** | "Tổng hợp" | WarehouseReportPage | create (105) | POST /warehouse-reports | createWarehouseReport (105) | Aggregate 15+ collections |
| **5. Material Inbound** | "Xác nhận phiếu" | DirectMaterialReceiptModal | confirm (346) | POST /receipts/:id/confirm | confirmMaterialReceipt (663) | Transaction 5 steps |
| **6. Material Outbound** | "Duyệt & phân công" | MaterialOutboundPage | approveAndAssign (841) | POST /requests/:id/approve | approveAndAssignRequest (841) | FIFO picking, Shortage handling |

---

## 7. KHO THÀNH PHẨM (Finished Goods Warehouse)

**MỤC ĐÍCH:** Quản lý tồn kho theo SKU, định giá, cấu hình ngưỡng an toàn, xem chi tiết lô hàng.

**FILES:**
- **FE:** `FinishedGoodsPage.jsx`, `FinishedGoodsProductPage.jsx`
- **BE:** `productDetail.service.js`, `productConfiguration.service.js`

---

### A. XEM TỔNG QUAN TỒN KHO (VIEW OVERVIEW)

```
[FE] Quản lý kho vào trang "Kho thành phẩm"
  ↓
  File: FinishedGoodsPage.jsx
  ↓
[FE] Load danh sách sản phẩm & tồn kho
  ↓
[API] GET /api/products
  Query: { includeStock: true }
  ↓
[BE] Aggregate data từ nhiều collections:
  ├─ Product: productName, productCode
  ├─ Sku: skuCode, color, size, retailPrice
  ├─ ProductUnit: onHandQty, reservedQty, availableQty
  └─ FinishedGoodsBatch: fifoInboundTimestamp
  ↓
[Response] { 
    products: [
      {
        _id, productCode, productName,
        skus: [
          {
            skuId, skuCode, color, size,
            retailPrice,
            onHandQty,      // Tổng tồn kho
            reservedQty,    // Đã đặt hàng (chờ đóng)
            availableQty,   // Khả dụng = onHand - reserved
            unitCogs        // Giá vốn trung bình
          }
        ]
      }
    ]
  }
  ↓
[FE] Hiển thị bảng tồn kho:
  └─ Với mỗi SKU:
     ├─ Mã: ABC-123-ĐỎ-M
     ├─ Màu/Size: Đỏ / M
     ├─ Giá bán: 500,000đ
     ├─ Tồn kho: 100 chiếc
     ├─ Đã đặt: 20 chiếc
     ├─ Khả dụng: 80 chiếc
     └─ Giá vốn: 300,000đ
```

**TÍNH TOÁN:**
- `availableQty = onHandQty - reservedQty`
- `reservedQty` = Tổng quantity trong các orders đang xử lý
- `unitCogs` = Giá vốn trung bình (weighted average)

---

### B. CẬP NHẬT GIÁ BÁN (UPDATE RETAIL PRICE)

```
[FE] User click vào SKU → Sửa giá bán → Bấm "Lưu"
  ↓
  File: FinishedGoodsPage.jsx hoặc FinishedGoodsProductPage.jsx
  ↓
[FE] updateRetailPrice()
  ├─ Validate: retailPrice >= 0
  └─ Gọi API
  ↓
[API] PATCH /api/products/:productId/skus/:skuId/price
  Body: { retailPrice: 550000 }
  ↓
[BE] File: productConfiguration.service.js
  └─ Hàm: syncUpdateSkuPrice() - line 240 (đã có ở chức năng 1)
     ├─ Validate retailPrice >= 0
     └─ Sku.findOneAndUpdate({ _id: skuId }, { retailPrice })
  ↓
[Response] { sku: updated }
  ↓
[FE] Hiển thị: "Đã cập nhật giá bán"
  └─ Reload data
```

---

### C. CẤU HÌNH NGƯỠNG AN TOÀN (SAFETY STOCK)

```
[FE] User click "Cài đặt" → Nhập ngưỡng an toàn → Bấm "Lưu"
  ↓
[FE] updateSafetyStock()
  ├─ Validate: safetyStockThreshold >= 0
  └─ Gọi API
  ↓
[API] PATCH /api/products/:productId/skus/:skuId/safety-stock
  Body: { safetyStockThreshold: 50 }
  ↓
[BE] File: productConfiguration.service.js
  └─ Sku.findOneAndUpdate(
       { _id: skuId },
       { safetyStockThreshold }
     )
  ↓
[Response] { sku: updated }
  ↓
[FE] Hiển thị: "Đã cập nhật ngưỡng an toàn"
  └─ Nếu availableQty < safetyStockThreshold:
     └─ Badge cảnh báo: "Dưới ngưỡng an toàn" (màu đỏ)
```

**MỤC ĐÍCH SAFETY STOCK:**
- Cảnh báo khi tồn kho thấp
- Tự động tạo cảnh báo cho Quản lý kho
- Hỗ trợ ra quyết định đặt hàng sản xuất

---

### D. XEM CHI TIẾT LÔ HÀNG (VIEW BATCHES)

```
[FE] User click vào sản phẩm → Xem tab "Lô hàng"
  ↓
  File: FinishedGoodsProductPage.jsx
  ↓
[API] GET /api/products/:productId/shelf-stock
  ↓
[BE] getShelfStock() - productDetail.service.js line 77
  ├─ Query: ProductUnit.aggregate([
  │    { $match: { productId } },
  │    { $lookup: { from: 'skus', ... } },
  │    { $lookup: { from: 'finishedgoodsbatches', ... } },
  │    { $unwind: '$batch' },
  │    { $group: {
  │       _id: { skuId, batchId },
  │       skuCode, color, size,
  │       batchCode,
  │       quantity: { $sum: '$quantity' },
  │       locationId,
  │       fifoInboundTimestamp,
  │       ageDays: { 
  │         $dateDiff: { 
  │           startDate: '$fifoInboundTimestamp', 
  │           endDate: '$$NOW', 
  │           unit: 'day' 
  │         } 
  │       }
  │    }}
  │  ])
  └─ Sort: fifoInboundTimestamp asc (FIFO)
  ↓
[Response] { 
    batches: [
      {
        skuCode: "ABC-123-ĐỎ-M",
        batchCode: "BATCH-001",
        quantity: 50,
        locationCode: "A01-T1-01",
        inboundDate: "2024-10-15",
        ageDays: 36
      }
    ]
  }
  ↓
[FE] Hiển thị bảng lô hàng:
  └─ Với mỗi batch:
     ├─ Mã lô: BATCH-001
     ├─ SKU: ABC-123-ĐỎ-M
     ├─ Số lượng: 50 chiếc
     ├─ Vị trí: Kệ A01-T1-01
     ├─ Ngày nhập: 15/10/2024
     ├─ Tuổi: 36 ngày
     └─ Nếu ageDays > fifoAgingThresholdDays:
        └─ Badge cảnh báo: "Hàng tồn lâu" (màu vàng)
```

**FIFO (First In First Out):**
- Lô cũ nhất xuất trước
- Sort theo `fifoInboundTimestamp` tăng dần
- Cảnh báo hàng tồn quá lâu (aging)

---

### E. XEM LỊCH SỬ NHẬP KHO (VIEW RECEIPTS)

```
[FE] User click tab "Lịch sử nhập"
  ↓
[API] GET /api/products/:productId/receipts
  Query: { page: 1, limit: 10 }
  ↓
[BE] listProductReceipts() - productDetail.service.js line 99
  ├─ Query: ProductUnit.find({ productId })
  │    .populate('inboundDocumentId')
  │    .sort({ inboundTimestamp: -1 })
  ├─ Group theo inboundDocumentId (phiếu nhập)
  └─ Tính tổng quantity, totalValue cho mỗi phiếu
  ↓
[Response] { 
    receipts: [
      {
        documentId,
        documentCode: "PNK-001",
        inboundDate: "2024-11-20",
        source: "PRODUCTION",  // Từ xưởng may
        totalQuantity: 100,
        totalValue: 30000000,
        items: [
          { skuCode, color, size, quantity, unitCogs }
        ]
      }
    ],
    pagination: { page, limit, total }
  }
  ↓
[FE] Hiển thị danh sách phiếu nhập:
  └─ Với mỗi phiếu:
     ├─ Mã: PNK-001
     ├─ Ngày: 20/11/2024
     ├─ Nguồn: Từ xưởng may
     ├─ Tổng SL: 100 chiếc
     ├─ Giá trị: 30,000,000đ
     └─ Click → Xem chi tiết items
```

---

### F. IN TEM BARCODE (PRINT LABELS)

```
[FE] User chọn SKUs → Bấm "In tem"
  ↓
[FE] Chọn số lượng tem cho mỗi SKU
  ↓
[API] POST /api/products/:productId/labels
  Body: { 
    barcodes: [
      { skuId, skuCode, quantity: 10 }
    ]
  }
  ↓
[BE] renderProductLabels() - productDetail.service.js line 172
  ├─ Với mỗi SKU:
  │  ├─ Generate barcode image (CODE_128 hoặc QR)
  │  └─ Build PDF label:
  │     ├─ Barcode image
  │     ├─ SKU code
  │     ├─ Product name
  │     ├─ Color, Size
  │     └─ Retail price
  └─ Merge tất cả labels vào 1 PDF
  ↓
[Response] { 
    pdfUrl: "https://cloudinary.com/.../labels.pdf"
  }
  ↓
[FE] Mở PDF trong tab mới → User in
```

**FORMAT TEM:**
```
┌─────────────────────┐
│ ████ ████ ████      │  ← Barcode
│ ABC-123-ĐỎ-M        │  ← SKU Code
│ Áo thun basic       │  ← Product name
│ Đỏ / M              │  ← Color, Size
│ 500,000đ            │  ← Price
└─────────────────────┘
```

---

### G. XUẤT BÁO CÁO TỒN KHO (EXPORT REPORT)

```
[FE] User bấm "Xuất Excel"
  ↓
[API] GET /api/products/export
  Query: { format: 'xlsx' }
  ↓
[BE] Export data:
  ├─ Query tất cả products + skus + stock
  ├─ Build Excel file với columns:
  │  ├─ Mã sản phẩm
  │  ├─ Tên sản phẩm
  │  ├─ SKU Code
  │  ├─ Màu
  │  ├─ Size
  │  ├─ Giá bán
  │  ├─ Tồn kho
  │  ├─ Đã đặt
  │  ├─ Khả dụng
  │  ├─ Giá vốn
  │  └─ Giá trị tồn (qty × unitCogs)
  └─ Return file buffer
  ↓
[Response] Excel file download
  ↓
[FE] Browser tự động tải file "ton-kho-thanh-pham-20241120.xlsx"
```

---

### H. TÌM KIẾM & LỌC (SEARCH & FILTER)

```
[FE] User nhập từ khóa vào search box
  ↓
[FE] Filter local data:
  ├─ Search by: productCode, productName, skuCode, color, size
  └─ Filter by:
     ├─ Trạng thái: Còn hàng, Hết hàng, Dưới ngưỡng
     ├─ Category: Áo, Quần, Phụ kiện...
     └─ Giá: < 500k, 500k-1tr, > 1tr
  ↓
[FE] Hiển thị kết quả lọc
  └─ Update danh sách hiển thị
```

**KHÔNG CẦN API:** Filter trên client-side (data đã load hết)

---

## 8. KHO HÀNG LỖI (Defect Warehouse)

**MỤC ĐÍCH:** Quản lý hàng thành phẩm bị lỗi (không đạt KCS khi trả hàng). Hàng lỗi không tính vào tồn bán.

**FILES:**
- **FE:** `DefectWarehousePage.jsx`
- **BE:** `defectWarehouse.service.js`, `defectWarehouse.controller.js`
- **SERVICE:** `productService.js` - defectUnits(), defectOutbound()

**ICON:** PackageX

---

### A. XEM DANH SÁCH HÀNG LỖI (VIEW DEFECT UNITS)

**2 TRẠNG THÁI:**
- **DEFECT_PENDING:** Chờ nhập kho lỗi (Kỹ thuật đã đánh giá lỗi, kho chưa xác nhận nhận hàng)
- **DEFECTIVE:** Đang trong kho hàng lỗi (Kho đã xác nhận nhận hàng lỗi)

```
[FE] User vào trang Kho hàng lỗi
  ↓
  File: DefectWarehousePage.jsx
  ↓
[FE] useEffect() → load()
  ↓
[API] GET /api/products/defects
  ↓
[BE] defectUnits() - defectWarehouse.controller.js line 24
  ↓
[BE] listDefectUnits() - defectWarehouse.service.js line 26
  ├─ Query: ProductUnit.find({ 
  │    inventoryStatus: { $in: ['DEFECT_PENDING', 'DEFECTIVE'] }
  │  })
  │  .populate('skuId') → productId
  │  .populate('warehouseId') → locationCode
  │  .populate('returnInspectionId') → inspectionCode
  │  .populate('returnedFromOrderId') → orderCode
  │  .sort({ inventoryStatus: 1, defectReceivedAt: 1 })
  │
  ├─ Tính tuổi hàng (daysHeld):
  │  └─ DEFECTIVE: Từ defectReceivedAt đến hiện tại
  │  └─ DEFECT_PENDING: Từ inspectedAt đến hiện tại
  │
  └─ Group summary: { pending: count, inStock: count }
  ↓
[Response] {
    summary: { pending: 15, inStock: 48 },
    units: [
      {
        barcode: "FG-ABC-00123",
        status: "DEFECTIVE",
        skuCode: "ABC-123-ĐỎ-M",
        color: "Đỏ",
        size: "M",
        productCode: "ABC-123",
        productName: "Áo thun basic",
        defectReason: "Lỗi vải phai màu",
        inspectionCode: "INS-2024-001",
        orderCode: "ORD-H123",
        locationCode: "DEFECT-A-01",
        inspectedAt: "2024-11-18T08:30:00Z",
        receivedAt: "2024-11-19T10:00:00Z",
        daysHeld: 2
      }
    ]
  }
  ↓
[FE] Hiển thị 2 tab:
  ├─ Tab "Trong kho hàng lỗi" (48 chiếc)
  │  └─ Cho phép chọn và xuất hàng
  └─ Tab "Chờ nhập kho lỗi" (15 chiếc)
     └─ Chỉ xem (phải xác nhận ở chức năng Lệnh nhập thành phẩm)
```

**LƯU Ý:**
- Hàng lỗi **không tính vào Sku.onHandQty** (không bán được)
- Status được set bởi Kỹ thuật may (DEFECT_PENDING) và Kho (DEFECTIVE)
- Hiển thị mã đơn hoàn, mã phiếu kiểm tra, lý do lỗi

---

### B. QUÉT TEM HÀNG LỖI (SCAN BARCODE)

```
[FE] User quét tem hoặc nhập barcode thủ công
  ↓
  Component: BarcodeScanner
  ↓
[FE] addScanned(barcode) - DefectWarehousePage.jsx line 44
  ├─ Validate: barcode có trong inStockBarcodes?
  │  ├─ ✅ Có → Thêm vào selected[]
  │  │        └─ Switch sang tab "Trong kho hàng lỗi"
  │  └─ ❌ Không → Hiển thị error:
  │     ├─ Nếu status = DEFECT_PENDING:
  │     │  → "Tem XXX chưa được nhập vào kho hàng lỗi"
  │     └─ Nếu không tìm thấy:
  │        → "Tem XXX không có trong kho hàng lỗi"
  └─ setSelected([...current, barcode])
  ↓
[FE] Update UI:
  ├─ Row với barcode đó được highlight (class "is-selected")
  ├─ Checkbox tự động tick
  └─ Hiển thị: "Đã chọn X chiếc"
```

**FORMAT:** CODE_128

---

### C. XUẤT HÀNG LỖI (DEFECT OUTBOUND)

**ĐIỀU KIỆN:**
- Chỉ xuất được hàng có status = **DEFECTIVE** (đã trong kho)
- Phải nhập **lý do xuất** (1-500 ký tự)
- Chọn tối thiểu 1 chiếc, tối đa 500 chiếc/lần

```
[FE] User chọn hàng (quét hoặc tích checkbox) → Nhập lý do → Bấm "Xuất X chiếc"
  ↓
[FE] takeOut() - DefectWarehousePage.jsx line 56
  ├─ Validate:
  │  ├─ selected.length > 0
  │  ├─ reason.trim() !== ''
  │  └─ window.confirm() → User xác nhận
  └─ Gọi API
  ↓
[API] POST /api/products/defects/outbound
  Body: {
    barcodes: ["FG-ABC-00123", "FG-ABC-00124", ...],
    reason: "Trả xưởng sửa"
  }
  ↓
[BE] defectOutbound() - defectWarehouse.controller.js line 25
  ↓
[BE] parseDefectOutbound() - line 12
  ├─ Validate reason:
  │  ├─ Không được rỗng
  │  └─ Tối đa 500 ký tự
  └─ Validate barcodes:
     ├─ Distinct (loại trùng)
     ├─ 1-500 chiếc
     └─ Format: /^[A-Za-z0-9_-]{3,128}$/
  ↓
[BE] takeOutDefectUnits() - defectWarehouse.service.js line 73
  ├─ START TRANSACTION
  │
  ├─ [1] Query ProductUnit.find({ barcode: { $in: barcodes } })
  │     ├─ Check tồn tại: Nếu không tìm thấy → 404 UNIT_NOT_FOUND
  │     └─ Check status = DEFECTIVE: Nếu không → 409 UNIT_NOT_IN_DEFECT_WAREHOUSE
  │
  ├─ [2] Group units theo skuId
  │
  ├─ [3] Tạo FinishedGoodsTicket:
  │     ├─ ticketCode: XHL-YYYYMMDD-{UUID6}
  │     ├─ ticketType: 'DEFECT_DISPOSAL_OUTBOUND'
  │     ├─ status: 'COMPLETED' (tự động hoàn thành)
  │     ├─ items: [{ skuId, quantity, barcodes, defectNote }]
  │     └─ createdByManagerId: user._id
  │
  ├─ [4] Tạo InventoryTransaction cho mỗi SKU:
  │     ├─ transactionType: 'DEFECT_DISPOSAL'
  │     ├─ warehouseType: 'DEFECT_QUARANTINE'
  │     ├─ quantityChange: -X (số âm)
  │     ├─ onHandBefore = onHandAfter (không ảnh hưởng tồn bán)
  │     ├─ unitCostSnapshot: 0
  │     └─ note: reason
  │
  ├─ [5] Giải phóng vị trí kho:
  │     └─ WarehouseLocation.updateOne({ _id: locationId },
  │          { $inc: { currentOccupancy: -quantity } }
  │        )
  │
  ├─ [6] Update ProductUnit:
  │     └─ Set inventoryStatus: 'DEFECT_OUT'
  │        defectOutAt: now
  │        defectOutReason: reason
  │        defectOutBy: user._id
  │        defectOutTicketId: ticket._id
  │
  └─ COMMIT TRANSACTION
  ↓
[Response] {
    ticketCode: "XHL-20241120-A3B7F2",
    quantity: 5,
    skus: [
      { skuCode: "ABC-123-ĐỎ-M", quantity: 3 },
      { skuCode: "ABC-123-XANH-L", quantity: 2 }
    ]
  }
  ↓
[FE] Hiển thị: "Đã xuất 5 chiếc hàng lỗi (phiếu XHL-20241120-A3B7F2)"
  ├─ setSelected([]) → Bỏ chọn
  ├─ setReason('') → Xóa lý do
  └─ load() → Reload danh sách
```

**TRANSACTION (6 BƯỚC - ATOMIC):**
1. Query và validate units
2. Group theo SKU
3. Tạo FinishedGoodsTicket
4. Tạo InventoryTransaction (không ảnh hưởng tồn bán)
5. Giải phóng occupancy tại vị trí kho lỗi
6. Update ProductUnit → DEFECT_OUT

**ĐẶC ĐIỂM:**
- Hàng lỗi **không tính vào onHandQty** → xuất cũng không trừ tồn
- Chỉ log transaction để audit trail
- Status flow: `DEFECT_PENDING` → `DEFECTIVE` → `DEFECT_OUT`

---

### D. TÌM KIẾM HÀNG LỖI (SEARCH)

```
[FE] User nhập từ khóa vào search box
  ↓
[FE] useMemo filter local data - DefectWarehousePage.jsx line 32
  ├─ Search by:
  │  ├─ barcode
  │  ├─ skuCode
  │  ├─ productName, productCode
  │  ├─ color
  │  ├─ defectReason
  │  └─ orderCode
  │
  └─ Filter theo tab hiện tại (DEFECT_PENDING / DEFECTIVE)
  ↓
[FE] Hiển thị kết quả lọc trong bảng
```

**KHÔNG CẦN API:** Filter trên client-side (data đã load toàn bộ)

---

### E. SUMMARY CARDS

```
[FE] Hiển thị 2 card:
  ├─ Card 1: "Trong kho hàng lỗi"
  │  ├─ Số lượng: data.summary.inStock (48 chiếc)
  │  └─ Click → Switch tab DEFECTIVE
  │
  └─ Card 2: "Chờ nhập kho lỗi"
     ├─ Số lượng: data.summary.pending (15 chiếc)
     ├─ Ghi chú: "xác nhận ở Lệnh nhập thành phẩm"
     └─ Click → Switch tab DEFECT_PENDING
```

**REALTIME:** Lắng nghe event `arawms-finished-goods-realtime` để reload khi có thay đổi

---

## BẢNG TÓM TẮT 8 CHỨC NĂNG

| Chức năng | Nút | File FE | Hàm FE | API | Hàm BE (line) | Đặc điểm |
|-----------|-----|---------|--------|-----|---------------|----------|
| **1. Product Config** | "Lưu sản phẩm" | ProductConfigurationPage | createProductConfiguration (355) | POST /products/sync | syncCatalogOperation (286) | Offline-first, IndexedDB |
| **2. Warehouse Layout** | "Áp dụng layout" | WarehouseLayoutPage | publishDraft (250) | POST /layout/publish | publishWarehouseLayout (180) | Draft-and-Publish |
| **3. Stocktake** | "Tạo lịch" | StocktakePage | create (144) | POST /stocktake/sessions | createStocktake (85) | CRON auto create |
| **4. Reports** | "Tổng hợp" | WarehouseReportPage | create (105) | POST /warehouse-reports | createWarehouseReport (105) | Aggregate 15+ collections |
| **5. Material Inbound** | "Xác nhận phiếu" | DirectMaterialReceiptModal | confirm (346) | POST /receipts/:id/confirm | confirmMaterialReceipt (663) | Transaction 5 steps |
| **6. Material Outbound** | "Duyệt & phân công" | MaterialOutboundPage | approveAndAssign (841) | POST /requests/:id/approve | approveAndAssignRequest (841) | FIFO picking, Shortage handling |
| **7. Finished Goods** | "Cập nhật giá" | FinishedGoodsPage | updateRetailPrice | PATCH /skus/:id/price | syncUpdateSkuPrice (240) | Stock by SKU, FIFO batches, Safety threshold |
| **8. Defect Warehouse** | "Xuất X chiếc" | DefectWarehousePage | takeOut (56) | POST /products/defects/outbound | takeOutDefectUnits (73) | Hàng lỗi không tính tồn, Transaction 6 steps |
