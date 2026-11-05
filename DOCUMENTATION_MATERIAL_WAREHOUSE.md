# TÀI LIỆU HỆ THỐNG QUẢN LÝ KHO NGUYÊN PHỤ LIỆU

## MỤC LỤC
1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Chức năng Nhập kho Nguyên Phụ Liệu](#2-chức-năng-nhập-kho-nguyên-phụ-liệu)
3. [Chức năng Xuất kho Nguyên Phụ Liệu](#3-chức-năng-xuất-kho-nguyên-phụ-liệu)
4. [Models (Database Schema)](#4-models-database-schema)
5. [Backend API Structure](#5-backend-api-structure)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Workflow](#7-workflow)

---

## 1. TỔNG QUAN HỆ THỐNG

Hệ thống quản lý kho nguyên phụ liệu (Raw Material Warehousing) là module quan trọng trong ARAWMS, quản lý việc nhập và xuất nguyên phụ liệu từ nhà cung cấp đến các bộ phận sử dụng.

### 1.1 Mục đích
- **Nhập kho**: Tiếp nhận nguyên phụ liệu từ nhà cung cấp, kiểm tra chất lượng, phân bổ vị trí lưu kho
- **Xuất kho**: Bàn giao nguyên phụ liệu cho các bộ phận sử dụng (xưởng cắt, xưởng may), theo dõi nguồn FIFO

### 1.2 Công nghệ sử dụng
- **Backend**: Node.js, Express, MongoDB, Mongoose
- **Frontend**: React, React Router
- **Authentication**: Mock user (Test environment)
- **Storage**: Cloudinary (attachments)
- **Barcode**: Tạo và quét mã vạch cho cây vải và lô phụ liệu

---

## 2. CHỨC NĂNG NHẬP KHO NGUYÊN PHỤ LIỆU

### 2.1 Tổng quan
Module nhập kho cho phép quản lý kế hoạch giao hàng, tiếp nhận thực tế từ nhà cung cấp, kiểm tra chất lượng, và xác nhận nhập kho với phân bổ vị trí.

### 2.2 Backend Structure

#### 2.2.1 Routes (`inboundExecution.routes.js`)

**Đường dẫn**: `src/modules/raw-material-warehousing/inbound-execution/inboundExecution.routes.js`

**Các endpoint chính**:

```javascript
// Lấy dữ liệu form
GET /options                           // Lấy suppliers, materials, locations
GET /roll-template                     // Download Excel template cho fabric rolls
POST /roll-import/preview              // Preview import Excel

// Quản lý vị trí và nguyên liệu
POST /locations                        // Tạo vị trí kho mới
POST /materials                        // Tạo nguyên phụ liệu mới

// Quản lý kế hoạch giao hàng (Delivery Plan)
GET /plans                             // Danh sách kế hoạch
POST /plans                            // Tạo kế hoạch mới
GET /plans/:id                         // Chi tiết kế hoạch
POST /plans/:id/setup-legacy           // Thiết lập kế hoạch cũ
POST /plans/:id/batches/:batchId/close-short   // Đóng thiếu đợt giao
POST /plans/:id/batches/:batchId/cancel        // Hủy đợt giao
PUT /plans/:id/batches/:batchId/window         // Điều chỉnh lịch giao
PUT /plans/:id/batches/:batchId/items          // Điều chỉnh mặt hàng

// Quản lý phiếu nhập (Receipt)
GET /receipts                          // Danh sách phiếu nhập
POST /receipts                         // Tạo phiếu nhập mới
GET /receipts/:id                      // Chi tiết phiếu nhập
GET /receipts/by-draft-key/:key        // Lấy phiếu theo draft key
PUT /receipts/:id                      // Cập nhật phiếu nhập
POST /receipts/:id/attachments         // Upload chứng từ đính kèm
POST /receipts/:id/confirm             // Xác nhận nhập kho
POST /receipts/:id/cancel              // Hủy phiếu nhập
GET /receipts/:id/labels               // Lấy danh sách tem barcode
POST /receipts/:id/barcodes/sync       // Tạo ảnh barcode
POST /receipts/:id/putaway             // Xác nhận cất hàng
POST /receipts/:id/supplier-returns    // Yêu cầu trả NCC
POST /receipts/:id/supplier-returns/confirm  // Xác nhận trả NCC
GET /delivery-matches                  // Tìm phiếu giao trùng
```

#### 2.2.2 Controller (`inboundExecution.controller.js`)

**Đường dẫn**: `src/modules/raw-material-warehousing/inbound-execution/inboundExecution.controller.js`

**Các hàm controller**:

```javascript
// Form options
export const options                    // Lấy suppliers, materials, locations

// Location & Material
export const createLocation             // Tạo vị trí kho mới
export const createMaterial             // Tạo nguyên phụ liệu mới

// Delivery Plans
export const plans                      // Danh sách kế hoạch giao hàng
export const planDetails                // Chi tiết kế hoạch
export const createPlan                 // Tạo kế hoạch mới
export const setupLegacyPlan            // Thiết lập đợt giao cho kế hoạch cũ
export const closeBatch                 // Đóng thiếu đợt giao
export const cancelBatch                // Hủy đợt giao
export const reviseBatch                // Cập nhật lịch giao
export const reviseBatchItems           // Điều chỉnh mặt hàng

// Receipts
export const receipts                   // Danh sách phiếu nhập
export const receiptDetails             // Chi tiết phiếu nhập
export const receiptByDraftKey          // Lấy phiếu theo draft key
export const deliveryMatches            // Chứng từ giao trùng
export const createReceipt              // Tạo phiếu nhập
export const updateReceipt              // Cập nhật phiếu nhập
export const confirmReceipt             // Xác nhận nhập kho
export const cancelReceipt              // Hủy phiếu nhập
export const uploadReceiptAttachment    // Upload chứng từ
export const receiptLabels              // Lấy tem barcode
export const syncReceiptBarcodes        // Tạo ảnh barcode
export const putaway                    // Xác nhận cất hàng
export const requestSupplierReturn      // Yêu cầu trả NCC
export const confirmSupplierReturn      // Xác nhận trả NCC

// Excel Import
export const rollTemplate               // Download template
export const previewRolls               // Preview import
```

**Cơ chế xử lý**:
- Wrap các service function với `handle()` để xử lý error thống nhất
- Trả về response chuẩn với `sendSuccess()` và `sendError()`
- Kiểm tra validation và business error

#### 2.2.3 Service (`inboundExecution.service.js`)

**Đường dẫn**: `src/modules/raw-material-warehousing/inbound-execution/inboundExecution.service.js`

**Các hàm service chính**:

```javascript
// Form Options
getReceiptOptions(user)
  - Lấy danh sách suppliers active
  - Lấy danh sách locations (RAW_MATERIAL, DEFECT_QUARANTINE)
  - Filter theo warehouse permissions của user

createReceiptLocation(input, user)
  - Tạo vị trí kho mới (shelf/bin)
  - Validate locationCode, zoneCode, rackCode, shelfCode
  - Set capacityUnit và maxCapacity
  - Auto assign location cho user

// Plan Management
getEligibleInboundPlans(supplierId)
  - Lấy plans có status: SCHEDULED, IN_INSPECTION, VERIFIED_MATCHED, DEVIATION_REPORTED
  - Lọc plans còn lượng cần nhận (remainingQty > 0)

getInboundPlanDetails(planId, includeDeleted)
  - Lấy chi tiết plan với contract info
  - Calculate remainingQty cho từng material
  - Populate material details (code, name, unit, color, etc.)

// Receipt Management
listMaterialReceipts(user)
  - Lấy 50 receipts gần nhất (type: INBOUND_FROM_PLAN)
  - Filter theo warehouse permissions
  - Sort by createdAt desc

getMaterialReceipt(receiptId, user)
  - Lấy chi tiết receipt và plan liên quan
  - Check user permissions

createMaterialReceiptDraft(input, user)
  - Validate plan eligible và materials active
  - Generate unique ticketCode: NPL-{UUID}
  - Apply draft data với applyDraft()
  - Auto determine status: DRAFT, WAITING_QC, READY_TO_CONFIRM

updateMaterialReceiptDraft(receiptId, input, user)
  - Check version conflict (optimistic locking)
  - Validate status editable
  - Recalculate status based on inspection data

cancelMaterialReceipt(receiptId, input, user)
  - Chỉ cancel được status: DRAFT, WAITING_QC, READY_TO_CONFIRM
  - Giữ lại record cho audit

// Confirmation & Inventory
confirmMaterialReceipt(receiptId, input, user)
  - Transaction-based confirmation
  - Create FabricRoll or MaterialStockLot records
  - Update inventory: onHandQty, pendingPutawayQty
  - Update location capacity (if usesPlannedLocationReservation)
  - Create InventoryTransaction logs
  - Update plan's actualVerifiedPassedQty
  - Generate confirmation key (idempotent)

// Putaway
getMaterialReceiptLabels(receiptId, user)
  - Lấy barcodes từ FabricRoll và MaterialStockLot
  - Populate material và location info
  - Trigger barcode image generation nếu thiếu

confirmMaterialPutaway(receiptId, input, user)
  - Scan barcode và location barcode
  - Validate quantity và location capacity
  - Update roll/lot status: IN_STOCK
  - Update location currentOccupancy
  - Idempotent với putawayEvents key

// Supplier Return
requestMaterialSupplierReturn(receiptId, input, user)
  - Create supplier return request
  - Link to object barcode
  - Status: WAITING_RETURN

confirmMaterialSupplierReturn(receiptId, input, user)
  - Update return status: RETURNED
  - Record handover info
```

**Business Rules**:
- **FIFO Tracking**: Mỗi roll/lot có `fifoInboundTimestamp`
- **Quality Control**: 3 trạng thái - ACCEPTED, REJECTED, PENDING
- **Location Capacity**: Validate trước khi allocate
- **Version Control**: Optimistic locking với `receiptVersion`
- **Idempotency**: Dùng `confirmationKey`, `draftKey`, `putawayKey`

#### 2.2.4 Additional Services

**`supplierReceipt.service.js`**: Xử lý receipt CRUD và validation
**`deliveryPlan.service.js`**: Quản lý delivery plans và batches
**`fabricRollExcelImport.js`**: Import/export Excel cho fabric rolls

### 2.3 Frontend Structure

#### 2.3.1 Page Component (`SupplierInboundPage.jsx`)

**Đường dẫn**: `src/pages/SupplierInboundPage.jsx`

**Chức năng chính**:

```javascript
// State Management
- options: { suppliers, materials, locations }
- form: Receipt form data
- receipt: Server receipt data
- selectedPlan: Current delivery plan
- labels: Barcode labels
- view: 'list' | 'editor' | 'legacy-editor'

// Key Functions
startReceipt(plan, batch)
  - Mở form nhập cho delivery batch
  - Load local draft nếu có
  - Initialize form với plan data

openReceipt(id)
  - Load existing receipt từ server
  - Populate form data
  - Load barcode labels nếu COMPLETED

saveDraft()
  - Save receipt lên server
  - Handle offline: lưu localStorage
  - Auto setup legacy plan nếu cần

confirmReceipt()
  - Validate form complete
  - Call confirm API
  - Trigger barcode generation

// Material Line Management
changeLine(index, patch)
  - Update receipt line data
  - Auto calculate totals từ rolls/lots
  - Recalculate inspection status

// Roll/Lot Management (for FABRIC)
addRoll(lineIndex)
  - Add new roll row
  - Generate clientLineId

updateRoll(lineIndex, rollIndex, patch)
  - Update roll data
  - Auto calculate line totals

removeRoll(lineIndex, rollIndex)
  - Remove roll
  - Recalculate totals

// Location Allocation
allocateLot(lineIndex, lotIndex, locationId, quantity)
  - Assign location cho accessory lot
  - Validate capacity

// Putaway Confirmation
confirmPutaway(barcode, locationBarcode, quantity)
  - Scan barcode để cất hàng
  - Update putaway status
  - Idempotent operation

// Label Printing
printLabels(selectedLabels)
  - Filter selected barcodes
  - Trigger print dialog
```

**UI Components**:
- **Delivery Plan List**: Hiển thị danh sách plans và batches
- **Receipt Form**: Form nhập liệu với validation
- **Roll/Lot Entry**: Dynamic rows cho fabric rolls hoặc accessory lots
- **Location Picker**: Dropdown chọn vị trí với capacity info
- **Quality Inspector**: ACCEPTED/REJECTED/PENDING selection
- **Barcode Labels**: Print view với QR codes
- **Putaway Scanner**: Barcode scanning interface

#### 2.3.2 Components

**`MaterialDeliveryPlanList.jsx`**:
- Display delivery plans và batches
- Show remaining quantities
- Actions: Start receipt, view history

**`DirectMaterialReceiptModal.jsx`**:
- Form nhập không qua plan (direct receipt)
- Used for remnant recovery

#### 2.3.3 Service (`materialInboundService.js`)

```javascript
export const materialInboundService = {
  options: () => api.get('/raw-material-inbound/options'),
  
  // Plans
  plans: (params) => api.get('/raw-material-inbound/plans', { params }),
  plan: (id) => api.get(`/raw-material-inbound/plans/${id}`),
  createPlan: (data) => api.post('/raw-material-inbound/plans', data),
  setupLegacyPlan: (id, data) => api.post(`/raw-material-inbound/plans/${id}/setup-legacy`, data),
  
  // Receipts
  receipts: (params) => api.get('/raw-material-inbound/receipts', { params }),
  receipt: (id) => api.get(`/raw-material-inbound/receipts/${id}`),
  receiptByDraftKey: (key) => api.get(`/raw-material-inbound/receipts/by-draft-key/${key}`),
  create: (data) => api.post('/raw-material-inbound/receipts', data),
  update: (id, data) => api.put(`/raw-material-inbound/receipts/${id}`, data),
  confirm: (id, data) => api.post(`/raw-material-inbound/receipts/${id}/confirm`, data),
  cancel: (id, data) => api.post(`/raw-material-inbound/receipts/${id}/cancel`, data),
  
  // Labels & Putaway
  labels: (id) => api.get(`/raw-material-inbound/receipts/${id}/labels`),
  syncBarcodes: (id) => api.post(`/raw-material-inbound/receipts/${id}/barcodes/sync`),
  putaway: (id, data) => api.post(`/raw-material-inbound/receipts/${id}/putaway`, data),
  
  // Locations & Materials
  createLocation: (data) => api.post('/raw-material-inbound/locations', data),
  createMaterial: (data) => api.post('/raw-material-inbound/materials', data),
};
```

---

## 3. CHỨC NĂNG XUẤT KHO NGUYÊN PHỤ LIỆU

### 3.1 Tổng quan
Module xuất kho quản lý việc bàn giao nguyên phụ liệu cho các bộ phận sử dụng, theo dõi nguồn FIFO, và ghi giảm tồn kho.

### 3.2 Backend Structure

#### 3.2.1 Routes (`outboundExecution.routes.js`)

**Đường dẫn**: `src/modules/raw-material-warehousing/outbound-execution/outboundExecution.routes.js`

**Các endpoint**:

```javascript
GET /options                    // Lấy warehouses, locations, materials, sources
GET /tickets                    // Danh sách phiếu xuất
POST /tickets                   // Tạo phiếu xuất mới
GET /tickets/:id                // Chi tiết phiếu xuất
PUT /tickets/:id                // Cập nhật phiếu xuất
POST /tickets/:id/check         // Kiểm tra nguồn lấy hàng
POST /tickets/:id/confirm       // Xác nhận xuất kho
POST /tickets/:id/cancel        // Hủy phiếu xuất
```

**Authentication**: Mock user với roles: OWNER, ADMIN

#### 3.2.2 Controller (`outboundExecution.controller.js`)

**Đường dẫn**: `src/modules/raw-material-warehousing/outbound-execution/outboundExecution.controller.js`

**Các hàm controller**:

```javascript
export const options            // Nguồn xuất khả dụng
export const list               // Danh sách phiếu xuất
export const detail             // Chi tiết phiếu xuất (populate user info)
export const create             // Lưu bản nháp mới
export const update             // Cập nhật bản nháp
export const check              // Kiểm tra nguồn lấy
export const confirm            // Xác nhận xuất kho
export const cancel             // Hủy bản nháp
```

**Error Handling**:
- ValidationError/CastError → 400
- Duplicate key (11000) → 409
- Business errors với custom status codes

#### 3.2.3 Service (`outboundExecution.service.js`)

**Đường dẫn**: `src/modules/raw-material-warehousing/outbound-execution/outboundExecution.service.js`

**Các hàm service**:

```javascript
getOutboundOptions(user)
  - Lấy materials active
  - Lấy locations: RAW_MATERIAL, status ACTIVE/FULL
  - Lấy fabric rolls: status IN_STOCK, currentLengthMeters > 0
  - Lấy material lots: status IN_STOCK, quality ACCEPTED, currentQty > 0
  - Calculate available = onHandQty - reservedQty - pendingPutawayQty
  - Sort sources by FIFO (fifoInboundTimestamp)

listOutbounds(query, user)
  - Filter: warehouseCode, status, department, date range, search
  - Limit 200 records
  - Filter theo warehouse permissions
  - Sort by createdAt desc

getOutbound(ticketId, user)
  - Load ticket by ID
  - Validate user has access to warehouse

saveOutbound(ticketId, input, user)
  - Create or update draft
  - Validate warehouse, issueDate, department, recipient, purpose
  - Validate materials available và active
  - Validate sources belong to material và location
  - Preserve checked sources nếu quantity không đổi
  - Auto assign ticketCode: XNL-{timestamp}-{UUID}
  - Version control với optimistic locking

checkOutboundSource(ticketId, input, user)
  - Scan barcode để check physical source
  - Validate source trong selection
  - Verify source availability
  - Mark source as checked với checkedQuantity
  - Increment version

verifySource(source, line, warehouseCode, user, session)
  - Validate location available và not frozen
  - Validate roll/lot có đủ quantity
  - Check status: IN_STOCK
  - Verify allocations (for lots)

confirmOutbound(ticketId, input, user)
  - Transaction-based confirmation
  - Verify tất cả sources đã checked
  - Deduct from FabricRoll.currentLengthMeters hoặc MaterialStockLot.currentQty
  - Update location currentOccupancy
  - Deduct from RawMaterial.onHandQty
  - Create InventoryTransaction logs
  - Update status: COMPLETED
  - Idempotent với confirmationKey

cancelOutbound(ticketId, user)
  - Chỉ cancel được DRAFT
  - Update status: CANCELLED
  - Không ảnh hưởng stock
```

**Business Rules**:
- **FIFO Priority**: Sources được sort theo fifoInboundTimestamp
- **Source Verification**: Phải check physical barcode trước khi confirm
- **Atomic Deduction**: Dùng MongoDB transaction
- **Version Control**: Prevent concurrent updates
- **Idempotency**: Confirmation key để prevent duplicate

### 3.3 Frontend Structure

#### 3.3.1 Page Component (`MaterialOutboundPage.jsx`)

**Đường dẫn**: `src/pages/MaterialOutboundPage.jsx`

**State Management**:

```javascript
// Core State
options: { warehouses, locations, materials, sources }
tickets: []                      // List of outbound tickets
filters: { search, from, to, department, status }
ticket: null                     // Current ticket (server data)
form: null                       // Draft form data

// Source Selection
sourceLine: number               // Index of line being edited
sourceDraft: []                  // Temporary source selection
sourceSearch: string
sourceLocation: string

// Barcode Scanning
barcode: string                  // Scanned barcode
scanLocationId: string           // Location for ambiguous lot
checkedQuantity: string          // Verified quantity
cameraRef: Camera                // ZXing camera instance

// UI State
reviewed: boolean                // User reviewed checkbox
confirmOpen: boolean             // Confirmation dialog
busy: boolean
message: string
error: string
hasLocalDraft: boolean           // Local storage indicator
```

**Key Functions**:

```javascript
openNew()
  - Initialize blank form
  - Set default warehouse

openTicket(item)
  - Load ticket từ server
  - Populate form data

updateLine(index, patch)
  - Update material line
  - Clear checked status nếu quantity thay đổi

addMaterial(material)
  - Add material line to form
  - Initialize với quantity rỗng, sources []

// Source Selection
openSource(index)
  - Mở modal chọn cây/lô
  - Load current selections vào sourceDraft

assignSource(source, value)
  - Thêm/update source với quantity
  - Maintain sort order

applyFifo()
  - Auto select sources theo FIFO
  - Fill đến khi đủ requested quantity

saveSources()
  - Validate total = requested
  - Validate quantity <= available
  - Validate quantity precision (METER/KG: 3 decimals)
  - Apply to form
  - Preserve checked status nếu unchanged

// Draft Management
saveDraft(close)
  - Save to server
  - Handle offline: save to localStorage
  - Refresh ticket list
  - Auto close if requested

// Barcode Verification
verifyBarcode(value)
  - Validate ticket is saved draft
  - Validate no pending changes
  - Find matching source(s)
  - Handle ambiguous: require locationId
  - Call check API
  - Update form với checked info

startCamera()
  - Initialize ZXing BrowserMultiFormatReader
  - Start video stream
  - Auto decode barcode

// Confirmation
confirmIssue()
  - Validate complete form
  - Generate/retrieve confirmationKey
  - Call confirm API
  - Update ticket status: COMPLETED
  - Refresh list

cancelDraft()
  - Confirm with user
  - Call cancel API
  - Close form

closeForm()
  - Stop camera
  - Warn if unsaved changes
  - Reset state

printTicket()
  - Trigger window.print()
```

**UI Components**:

1. **List View**:
   - Filters: search, date range, department, status
   - Table: ticketCode, issueDate, department, recipient, materials, status
   - Actions: Open ticket

2. **Editor Modal**:
   - **Header**: Ticket info, status badge, close button
   - **Handover Info**: Warehouse, date, department, recipient, purpose
   - **Material List**:
     - Search và add materials
     - Table: material, unit, available, quantity, sources
     - Source selection button
   - **Barcode Verification**:
     - Camera toggle
     - Barcode input
     - Location picker (for ambiguous lots)
     - Quantity input
     - Check button
     - Table: checked sources
   - **Summary**: Total counts, checked status
   - **Footer**: Save, cancel, confirm buttons
   - **Reviewed checkbox**: Required for confirmation

3. **Source Selection Modal**:
   - Material info và requested quantity
   - Search barcode
   - Filter location
   - FIFO auto-select button
   - Table: barcode, date, location, available, quantity input
   - Summary: selected/requested
   - Save/cancel buttons

4. **Confirmation Dialog**:
   - Summary: warehouse, date, department, recipient
   - Purpose
   - Totals by unit
   - Warning message
   - Back/Confirm buttons

**Offline Support**:
- Save draft to localStorage khi network error
- Show indicator nếu có local draft
- "Mở nháp trên thiết bị" button

**Validation**:
- Required fields: department, recipient, purpose
- Quantity precision: METER/KG (3 decimals), others (integer)
- Sources total = requested quantity
- All sources checked before confirm

#### 3.3.2 Service (`materialOutboundService.js`)

**Đường dẫn**: `src/services/materialOutboundService.js`

```javascript
export const materialOutboundService = {
  options: () => api.get('/raw-material-outbound/options'),
  list: (params) => api.get('/raw-material-outbound/tickets', { params }),
  detail: (id) => api.get(`/raw-material-outbound/tickets/${id}`),
  create: (values) => api.post('/raw-material-outbound/tickets', values),
  update: (id, values) => api.put(`/raw-material-outbound/tickets/${id}`, values),
  check: (id, values) => api.post(`/raw-material-outbound/tickets/${id}/check`, values),
  confirm: (id, values) => api.post(`/raw-material-outbound/tickets/${id}/confirm`, values),
  cancel: (id) => api.post(`/raw-material-outbound/tickets/${id}/cancel`),
};
```

---

## 4. MODELS (DATABASE SCHEMA)

### 4.1 MaterialInboundPlan

**Đường dẫn**: `src/models/MaterialInboundPlan.model.js`

**Mục đích**: Lưu kế hoạch nhập hàng từ nhà cung cấp theo hợp đồng

**Schema**:

```javascript
{
  planCode: String (unique, indexed)           // Mã kế hoạch
  contractId: ObjectId → SupplierContract      // Hợp đồng mua
  supplierId: ObjectId → Supplier (required, indexed)
  warehouseLocationId: ObjectId → WarehouseLocation (indexed)
  scheduledDeliveryDate: Date (indexed)        // Ngày giao dự kiến
  
  deliveryBatches: [{                          // Các đợt giao hàng
    batchCode: String (required)
    expectedStart: Date (required)
    expectedEnd: Date (required)
    status: 'OPEN' | 'CLOSED_SHORT' | 'CANCELLED'
    items: [{
      rawMaterialId: ObjectId → RawMaterial (required)
      plannedQty: Number (required, min: 0)
      acceptedQty: Number (default: 0)
      rejectedQty: Number (default: 0)
    }]
    closedReason: String
    closedAt: Date
    closedByUserId: ObjectId → User
  }]
  
  deliveryVersion: Number (default: 0)         // Version control
  deliveryHistory: [{                          // Audit log
    batchId: ObjectId
    changeType: 'WINDOW' | 'ITEMS' | 'LEGACY_SETUP'
    oldStart, oldEnd, newStart, newEnd: Date
    reason: String
    changedByUserId: ObjectId → User
    changedAt: Date
    version: Number
    oldItems, newItems: [{ rawMaterialId, plannedQty }]
  }]
  
  deliveryNote: String
  status: PLAN_STATUS (indexed)                // SCHEDULED, IN_INSPECTION, ...
  createdByAccountantId: ObjectId → User (required)
  
  expectedItems: [{                            // Tổng kế hoạch
    rawMaterialId: ObjectId → RawMaterial (required)
    plannedQty: Number (required)
    actualVerifiedPassedQty: Number (default: 0)
    actualDefectiveOrShortQty: Number (default: 0)
  }]
  
  technicianVerification: {                    // Kiểm tra kỹ thuật
    verifiedByTechId: ObjectId → User
    verifiedAt: Date
    isMatchedWithPlan: Boolean
    deviationSummary: String
    evidenceImages: [String]
  }
  
  deviationResolution: {                       // Xử lý sai lệch
    ownerDecision: 'NONE' | 'PENALIZE_AND_NEW_CONTRACT' | 
                   'ACCEPT_PARTIAL_AND_REPLAN' | 'REJECT_ENTIRE_BATCH'
    decidedByOwnerId: ObjectId → User
    decidedAt: Date
    executedByAccountantId: ObjectId → User
    replacementContractId: ObjectId → SupplierContract
    replacementPlanId: ObjectId → MaterialInboundPlan
  }
  
  createdAt, updatedAt: Date (auto)
  isDeleted: Boolean (default: false)
}
```

**Indexes**:
- planCode (unique)
- contractId, supplierId, warehouseLocationId, scheduledDeliveryDate, status

**Business Logic**:
- Một plan có nhiều deliveryBatches
- Batch có thể OPEN, CLOSED_SHORT (thiếu hàng), CANCELLED
- Track history của batch changes
- Owner quyết định xử lý sai lệch

### 4.2 MaterialTicket

**Đường dẫn**: `src/models/MaterialTicket.model.js`

**Mục đích**: Phiếu nhập/xuất nguyên phụ liệu với inspection và putaway tracking

**Schema**:

```javascript
{
  ticketCode: String (unique, indexed, required)   // Mã phiếu
  ticketType: String (required, indexed)           // Loại phiếu
    // 'INBOUND_FROM_PLAN' | 'INBOUND_FROM_SUPPLIER' | 
    // 'INBOUND_FROM_REMNANT' | 'OUTBOUND_FOR_CUTTING' | 
    // 'OUTBOUND_SUPPLEMENTARY'
  
  // Inbound References
  inboundPlanId: ObjectId → MaterialInboundPlan (indexed)
  deliveryBatchId: ObjectId (indexed)
  receiptSource: 'PLAN' | 'DIRECT'
  purchaseSourceName: String
  purchasedByName: String
  deliveryTimeliness: {
    label: 'EARLY' | 'ON_TIME' | 'LATE'
    daysDifference: Number
    expectedStart: Date
    expectedEnd: Date
  }
  replacementForTicketId: ObjectId → MaterialTicket
  remnantRequestId: ObjectId → RemnantRecoveryRequest
  parentOutboundTicketId: ObjectId → MaterialTicket
  
  // Status & Users
  status: TICKET_STATUS (indexed, default: 'WAITING_SCAN')
    // 'DRAFT' | 'WAITING_QC' | 'READY_TO_CONFIRM' | 
    // 'COMPLETED' | 'CANCELLED'
  createdByManagerId: ObjectId → User (required)
  
  // Supplier Info (for INBOUND)
  supplierId: ObjectId → Supplier (indexed)
  contractId: ObjectId → SupplierContract
  supplierDeliveryCode: String (trimmed)
  receivedAt: Date
  handoverName: String
  receivingLocationId: ObjectId → WarehouseLocation
  receiptNote: String
  receiptAttachments: [{
    fileName: String
    mimeType: String
    url: String
    publicId: String
    uploadedByUserId: ObjectId → User
    uploadedAt: Date
  }]
  
  // Receipt Lines (for INBOUND)
  receiptLines: [{
    clientLineId: String
    rawMaterialId: ObjectId → RawMaterial (required)
    deliveryBatchItemId: ObjectId
    unitCost: Number (min: 0)
    zeroCostReason: String
    supplierDeclaredQty: Number
    actualQty: Number (default: 0)
    acceptedQty: Number (default: 0)
    rejectedQty: Number (default: 0)
    pendingQty: Number (default: 0)
    defectReason: String
    qualityInspectionRef: String
    inspectedByUserId: ObjectId → User
    inspectedAt: Date
    inspectionConclusion: String
    inspectionNote: String
    
    // Fabric Rolls
    rolls: [{
      clientLineId: String (required)
      supplierRollCode: String
      lotCode: String
      widthCm: Number
      lengthMeters: Number
      weightKg: Number
      quality: 'ACCEPTED' | 'REJECTED'
      defectReason: String
      locationId: ObjectId → WarehouseLocation
    }]
    
    // Accessory Lots
    lots: [{
      clientLineId: String (required)
      supplierLotCode: String
      packageUnit: String
      packageCount: Number
      unitsPerPackage: Number
      countedQty: Number
      quality: 'ACCEPTED' | 'REJECTED'
      defectReason: String
      allocations: [{
        locationId: ObjectId → WarehouseLocation
        quantity: Number
      }]
    }]
  }]
  
  // Version Control
  receiptVersion: Number (default: 0)
  draftKey: String (unique, sparse)
  draftFingerprint: String
  confirmationKey: String (unique, sparse)
  confirmationFingerprint: String
  usesPlannedLocationReservation: Boolean (default: false)
  confirmedAt: Date
  confirmedByUserId: ObjectId → User
  
  // Putaway Tracking
  putawayEvents: [{
    key: String                                // Idempotency key
    barcode: String
    locationBarcode: String
    locationId: ObjectId → WarehouseLocation
    quantity: Number
    at: Date
  }]
  
  // Supplier Returns
  supplierReturns: [{
    objectBarcode: String (required)
    rawMaterialId: ObjectId → RawMaterial (required)
    quantity: Number (required)
    defectReason: String (required)
    status: 'WAITING_RETURN' | 'RETURNED'
    requestedByUserId: ObjectId → User
    requestedAt: Date
    handedOverByUserId: ObjectId → User
    handoverName: String
    returnedAt: Date
  }]
  
  // Outbound Items (for OUTBOUND)
  items: [{
    rawMaterialId: ObjectId → RawMaterial (required)
    fabricRollId: ObjectId → FabricRoll
    rollBarcode: String (required)
    designatedFifoLocationId: ObjectId → WarehouseLocation (required)
    expectedQty: Number (required)
    scannedQty: Number (default: 0)
    isScannedCompleted: Boolean (default: false)
    scannedByStaffId: ObjectId → User
    scannedAt: Date
  }]
  
  createdAt, updatedAt: Date (auto)
  isDeleted: Boolean (default: false)
}
```

**Indexes**:
- ticketCode (unique)
- ticketType, inboundPlanId, deliveryBatchId, status, supplierId
- Compound: (supplierId, supplierDeliveryCode, ticketType) - unique sparse
- draftKey, confirmationKey (unique sparse)

**Business Logic**:
- **INBOUND**: Inspection → Rolls/Lots → Confirmation → Putaway
- **OUTBOUND**: Draft → Source Selection → Confirmation
- Version control để prevent concurrent edits
- Idempotency keys: draftKey, confirmationKey, putawayEvents.key

### 4.3 MaterialOutbound

**Đường dẫn**: `src/models/MaterialOutbound.model.js`

**Mục đích**: Phiếu xuất nguyên phụ liệu với source tracking

**Schema**:

```javascript
{
  ticketCode: String (unique, required)        // Mã phiếu: XNL-{timestamp}-{UUID}
  warehouseCode: String (required, indexed)    // Kho xuất
  issueDate: Date (required)                   // Ngày xuất
  department: String                           // Bộ phận nhận
  recipient: String                            // Người nhận
  purpose: String                              // Mục đích sử dụng
  
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED' (indexed, default: 'DRAFT')
  
  lines: [{                                    // Danh sách nguyên phụ liệu
    rawMaterialId: ObjectId → RawMaterial (required)
    materialCode: String
    materialName: String
    color: String
    unit: String
    quantity: Number (required, min: 0)
    
    sources: [{                                // Nguồn lấy hàng
      kind: 'ROLL' | 'LOT' (required)
      objectId: ObjectId (required)            // → FabricRoll or MaterialStockLot
      barcode: String (required)
      locationId: ObjectId → WarehouseLocation (required)
      locationCode: String
      inboundTicketId: ObjectId → MaterialTicket
      quantity: Number (required, min: 0)
      checkedByUserId: ObjectId → User         // Người kiểm tra thực lấy
      checkedAt: Date
      checkedQuantity: Number                  // Số lượng đã kiểm tra
    }]
  }]
  
  // Version Control
  version: Number (default: 0)
  
  // Users
  createdByUserId: ObjectId → User (required)
  updatedByUserId: ObjectId → User
  confirmedByUserId: ObjectId → User
  confirmedAt: Date
  cancelledByUserId: ObjectId → User
  cancelledAt: Date
  
  // Idempotency
  confirmationKey: String (unique, sparse)
  
  createdAt, updatedAt: Date (auto)
  isDeleted: Boolean (default: false)
}
```

**Indexes**:
- ticketCode (unique)
- warehouseCode, status
- confirmationKey (unique sparse)

**Business Logic**:
- Lines chứa materials và sources
- Sources phải được checked (scan barcode) trước khi confirm
- Confirmation là atomic: all or nothing
- Version control để prevent concurrent edits

### 4.4 MaterialStockLot

**Đường dẫn**: `src/models/MaterialStockLot.model.js`

**Mục đích**: Lô phụ liệu (accessories, trims) không phải vải

**Schema**:

```javascript
{
  lotBarcode: String (unique, indexed, required)   // Mã lô: ML-{UUID}
  barcodeImageUrl: String                          // Cloudinary URL
  barcodeImagePublicId: String
  
  rawMaterialId: ObjectId → RawMaterial (required, indexed)
  supplierId: ObjectId → Supplier
  inboundTicketId: ObjectId → MaterialTicket (required, indexed)
  clientLineId: String (required)                  // From receipt line
  supplierLotCode: String
  
  // Package Info
  packageUnit: String                              // Đơn vị đóng gói: hộp, bao, cuộn
  packageCount: Number                             // Số bao gói
  unitsPerPackage: Number                          // Quy cách: số chiếc/cuộn per package
  
  // Quantity
  initialQty: Number (required, min: 0)            // Số lượng ban đầu
  currentQty: Number (required, min: 0)            // Số lượng hiện tại
  unitCost: Number (min: 0)
  
  // Quality
  quality: 'ACCEPTED' | 'REJECTED' (required)
  status: 'PENDING_PUTAWAY' | 'IN_STOCK' | 'QUARANTINED' | 'RETURNED_TO_SUPPLIER' (required)
  defectReason: String
  
  // FIFO
  fifoInboundTimestamp: Date (required, indexed)
  
  // Allocations (multiple locations allowed)
  allocations: [{
    locationId: ObjectId → WarehouseLocation (required)
    quantity: Number (required, min: 0)
    putawayQty: Number (default: 0, min: 0)
  }]
  
  createdAt, updatedAt: Date (auto)
  isDeleted: Boolean (default: false)
}
```

**Indexes**:
- lotBarcode (unique)
- rawMaterialId, inboundTicketId, fifoInboundTimestamp
- Compound: (inboundTicketId, clientLineId) - unique

**Business Logic**:
- Một lot có thể phân bổ nhiều locations
- Track putawayQty cho từng location
- currentQty giảm khi xuất kho
- FIFO based on fifoInboundTimestamp

### 4.5 FabricRoll

**Đường dẫn**: Referenced in service, schema tương tự

**Mục đích**: Cây vải (fabric rolls)

**Schema** (tương tự):

```javascript
{
  rollBarcode: String (unique, indexed, required)  // Mã cây: FR-{UUID}
  barcodeImageUrl: String
  barcodeImagePublicId: String
  
  rawMaterialId: ObjectId → RawMaterial (required, indexed)
  supplierId: ObjectId → Supplier
  inboundTicketId: ObjectId → MaterialTicket (required, indexed)
  clientLineId: String (required)
  supplierRollCode: String
  supplierLotCode: String
  
  // Dimensions
  measuredWidthCm: Number
  initialLengthMeters: Number (required)
  currentLengthMeters: Number (required)
  weightKg: Number
  
  // Quality & Location
  quality: 'ACCEPTED' | 'REJECTED'
  status: 'QC_PASSED' | 'IN_STOCK' | 'DEPLETED' | 
          'DEFECTIVE' | 'RETURNED_TO_SUPPLIER' (required)
  defectReason: String
  locationId: ObjectId → WarehouseLocation (required)
  
  // FIFO
  fifoInboundTimestamp: Date (required, indexed)
  putawayConfirmedAt: Date
  
  unitCost: Number (min: 0)
  
  createdAt, updatedAt: Date (auto)
  isDeleted: Boolean (default: false)
}
```

**Business Logic**:
- Một roll chỉ ở một location
- currentLengthMeters giảm khi xuất (cutting)
- Status DEPLETED khi currentLengthMeters = 0

### 4.6 InventoryTransaction

**Đường dẫn**: `src/models/InventoryTransaction.model.js`

**Mục đích**: Log mọi giao dịch nhập/xuất kho

**Schema**:

```javascript
{
  transactionCode: String (unique, indexed)        // Mã giao dịch
  warehouseType: 'RAW_MATERIAL' | 'FINISHED_GOODS' | 'DEFECT_QUARANTINE'
  itemType: 'FABRIC_ROLL' | 'RAW_MATERIAL' | 'PRODUCT'
  
  rawMaterialId: ObjectId → RawMaterial
  fabricRollId: ObjectId → FabricRoll
  productId: ObjectId → Product
  locationId: ObjectId → WarehouseLocation
  
  transactionType: String (indexed)
    // 'INBOUND_RECEIPT' | 'INBOUND_PUTAWAY' | 
    // 'OUTBOUND_ISSUE_CUTTING' | 'OUTBOUND_SHIPPING' | ...
  
  referenceModel: String                           // 'MaterialTicket', 'MaterialOutbound', ...
  referenceId: ObjectId
  
  quantityChange: Number (required)                // Positive (nhập) or negative (xuất)
  onHandBefore: Number (required)
  onHandAfter: Number (required)
  
  performedByUserId: ObjectId → User (required)
  note: String
  
  createdAt: Date (auto, indexed)
  isDeleted: Boolean (default: false)
}
```

**Business Logic**:
- Immutable audit log
- Track quantity changes với before/after snapshots
- Link to source documents

---

## 5. BACKEND API STRUCTURE

### 5.1 Module Organization

```
src/modules/raw-material-warehousing/
├── inbound-execution/
│   ├── inboundExecution.routes.js       # Express routes
│   ├── inboundExecution.controller.js   # Request handlers
│   ├── inboundExecution.service.js      # Business logic
│   ├── supplierReceipt.service.js       # Receipt CRUD
│   ├── deliveryPlan.service.js          # Plan management
│   └── fabricRollExcelImport.js         # Excel import/export
└── outbound-execution/
    ├── outboundExecution.routes.js      # Express routes
    ├── outboundExecution.controller.js  # Request handlers
    └── outboundExecution.service.js     # Business logic
```

### 5.2 API Conventions

**Response Format**:

```javascript
// Success
{
  success: true,
  message: "Thông báo thành công",
  data: { ... }
}

// Error
{
  success: false,
  message: "Thông báo lỗi",
  error: {
    code: "ERROR_CODE",
    ...details
  }
}
```

**Error Codes**:

```javascript
// Validation
INVALID_RECEIPT_DATA
INVALID_QUANTITY
INVALID_LOCATION
INVALID_MATERIAL
LINES_MISMATCH

// Business Logic
PLAN_NOT_ELIGIBLE
PLAN_EXCEEDED
MATERIAL_UNAVAILABLE
SOURCE_UNAVAILABLE
LOCATION_UNAVAILABLE
INSPECTION_TOTAL_MISMATCH
INCOMPLETE_SOURCES

// Concurrency
VERSION_CONFLICT
DRAFT_KEY_REUSED
DUPLICATE_CONFIRMATION

// Permissions
FORBIDDEN
RECEIPT_FORBIDDEN
LOCATION_FORBIDDEN

// State
RECEIPT_LOCKED
RECEIPT_NOT_CONFIRMED
SOURCE_ALREADY_CHECKED
TICKET_LOCKED
```

### 5.3 Transaction Handling

**Inbound Confirmation**:

```javascript
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    // 1. Create FabricRoll or MaterialStockLot documents
    // 2. Update RawMaterial.onHandQty, pendingPutawayQty
    // 3. Update WarehouseLocation capacity (if planned)
    // 4. Create InventoryTransaction logs
    // 5. Update MaterialInboundPlan.actualVerifiedPassedQty
    // 6. Update MaterialTicket status, confirmationKey
  });
} finally {
  await session.endSession();
}
```

**Outbound Confirmation**:

```javascript
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    // 1. Verify all sources
    // 2. Deduct FabricRoll.currentLengthMeters or MaterialStockLot.currentQty
    // 3. Update WarehouseLocation.currentOccupancy
    // 4. Deduct RawMaterial.onHandQty
    // 5. Create InventoryTransaction logs
    // 6. Update MaterialOutbound status, confirmationKey
  });
} finally {
  await session.endSession();
}
```

### 5.4 Idempotency Patterns

**Confirmation Key**:
- Client generates UUID
- Server stores in confirmationKey field
- Duplicate request returns existing result

**Draft Key**:
- UUID stored in draftKey
- Allows recovery of unsaved draft
- Unique constraint prevents duplicates

**Putaway Key**:
- Per-operation UUID in putawayEvents
- Allows retry without double-counting

---

## 6. FRONTEND ARCHITECTURE

### 6.1 Component Hierarchy

```
MaterialOutboundPage
├── Filters & Search
├── Ticket List
│   └── Ticket Row
├── Editor Modal
│   ├── Handover Info Form
│   ├── Material List
│   │   └── Material Row
│   ├── Source Selection Modal
│   │   └── Source Row (with quantity input)
│   ├── Barcode Scanner
│   │   ├── Video (camera)
│   │   └── Manual Input
│   ├── Checked Sources Table
│   └── Summary & Actions
└── Confirmation Dialog

SupplierInboundPage
├── MaterialDeliveryPlanList
│   ├── Plan Card
│   └── Batch Row
├── Receipt Editor Modal
│   ├── Receipt Info Form
│   ├── Receipt Lines
│   │   ├── Line Summary
│   │   ├── Roll Rows (for FABRIC)
│   │   │   └── LocationPicker
│   │   └── Lot Rows (for others)
│   │       └── Allocation Inputs
│   ├── Attachment Upload
│   ├── Summary
│   └── Actions
├── Label Printing View
│   └── Barcode Grid (with print selection)
└── Putaway Scanner
    ├── Barcode Input
    └── Location Scanner

DirectMaterialReceiptModal (for direct receipts)
```

### 6.2 State Management Pattern

**Local State** (useState):
- Form data
- UI state (modals, loading, errors)
- Temporary selections

**Server State**:
- Options (suppliers, materials, locations, sources)
- Ticket/Receipt lists
- Current ticket/receipt details

**Offline State** (localStorage):
- Unsaved drafts
- Cached options
- Operation keys (confirmation, putaway)

**State Sync**:
```javascript
// Form signature để detect changes
const signature = JSON.stringify(form);
const hasChanges = signature !== savedSignature;

// Version checking
if (input.version !== ticket.version) {
  throw error('Dữ liệu đã thay đổi, vui lòng tải lại');
}
```

### 6.3 Offline Handling

**Save Draft Offline**:

```javascript
try {
  await api.create(form);
} catch (error) {
  if (!error.status) {  // Network error
    localStorage.setItem(draftKey, JSON.stringify({
      form,
      ticket,
      confirmationKey,
      timestamp: Date.now()
    }));
    setNotice('Đã lưu trên thiết bị. Cần mạng để xác nhận.');
  }
}
```

**Restore Draft**:

```javascript
const local = JSON.parse(localStorage.getItem(draftKey));
if (local) {
  setForm(local.form);
  setTicket(local.ticket);
  confirmationKey.current = local.confirmationKey;
  setNotice('Mở nháp từ thiết bị. Hãy lưu lại khi có mạng.');
}
```

**Cache Options**:

```javascript
try {
  const options = await api.options();
  localStorage.setItem(cacheKey, JSON.stringify(options));
} catch (error) {
  const cached = JSON.parse(localStorage.getItem(cacheKey));
  if (cached) {
    setOptions(cached);
    setNotice('Dùng danh mục đã lưu. Cần mạng để xác nhận nhập kho.');
  }
}
```

### 6.4 Form Validation

**Client-side Rules**:

```javascript
// Required fields
const valid = form.department.trim() && 
              form.recipient.trim() && 
              form.purpose.trim();

// Quantity precision
const validQuantity = (value, unit) => {
  const scale = ['METER', 'KG'].includes(unit) ? 1000 : 1;
  return Number.isFinite(value) && 
         value > 0 && 
         Math.abs(value * scale - Math.round(value * scale)) < 0.000001;
};

// Sources total match
const totalMatch = Math.abs(
  sum(line.sources) - Number(line.quantity)
) < 0.0001;

// All sources checked
const allChecked = form.lines.every(line => 
  line.sources.every(source => source.checkedAt)
);
```

**Server-side Validation**:
- Same rules enforced
- Database constraints
- Concurrent update detection

---

## 7. WORKFLOW

### 7.1 Inbound Workflow

```
1. CREATE DELIVERY PLAN (Accountant)
   ↓
   MaterialInboundPlan.create()
   └─ deliveryBatches[].status = 'OPEN'

2. START RECEIPT (Warehouse Manager)
   ↓
   MaterialTicket.create()
   └─ status = 'DRAFT'
   └─ inboundPlanId, deliveryBatchId
   └─ receiptLines = plan.expectedItems

3. INSPECT & ALLOCATE (Technician)
   ↓
   MaterialTicket.update()
   └─ receiptLines[].rolls/lots (dimensions, quality, locationId)
   └─ status = 'WAITING_QC' or 'READY_TO_CONFIRM'

4. CONFIRM RECEIPT (Manager)
   ↓
   MaterialTicket.confirm() [Transaction]
   ├─ Create FabricRoll or MaterialStockLot (status: QC_PASSED/PENDING_PUTAWAY)
   ├─ RawMaterial.onHandQty += acceptedQty
   ├─ RawMaterial.pendingPutawayQty += acceptedQty
   ├─ WarehouseLocation capacity planning (if enabled)
   ├─ InventoryTransaction.create (type: INBOUND_RECEIPT)
   ├─ MaterialInboundPlan.actualVerifiedPassedQty += acceptedQty
   └─ MaterialTicket.status = 'COMPLETED'

5. PRINT LABELS
   ↓
   Generate barcodes: FR-{UUID} or ML-{UUID}
   └─ Upload to Cloudinary
   └─ Print QR codes with material info

6. PUTAWAY (Warehouse Staff)
   ↓
   MaterialTicket.putaway() [Idempotent]
   ├─ Scan object barcode (FR-xxx or ML-xxx)
   ├─ Scan location barcode (LOC-xxx)
   ├─ FabricRoll.status = 'IN_STOCK'
   ├─ MaterialStockLot.allocations[].putawayQty += quantity
   ├─ WarehouseLocation.currentOccupancy += quantity
   ├─ RawMaterial.pendingPutawayQty -= quantity
   └─ MaterialTicket.putawayEvents.push()

7. (OPTIONAL) SUPPLIER RETURN
   ↓
   MaterialTicket.requestSupplierReturn()
   └─ supplierReturns[].status = 'WAITING_RETURN'
   ↓
   MaterialTicket.confirmSupplierReturn()
   ├─ FabricRoll.status = 'RETURNED_TO_SUPPLIER'
   ├─ MaterialStockLot.status = 'RETURNED_TO_SUPPLIER'
   ├─ RawMaterial.onHandQty -= quantity
   └─ supplierReturns[].status = 'RETURNED'
```

### 7.2 Outbound Workflow

```
1. CREATE DRAFT (Warehouse Manager)
   ↓
   MaterialOutbound.create()
   └─ status = 'DRAFT'
   └─ ticketCode = 'XNL-{timestamp}-{UUID}'
   └─ lines[].rawMaterialId, quantity

2. SELECT SOURCES (Staff)
   ↓
   MaterialOutbound.update()
   └─ lines[].sources[] (from available FIFO)
       ├─ FabricRoll: currentLengthMeters > 0, status = 'IN_STOCK'
       └─ MaterialStockLot: currentQty > 0, status = 'IN_STOCK', quality = 'ACCEPTED'

3. VERIFY SOURCES (Staff)
   ↓
   MaterialOutbound.check() [per barcode]
   ├─ Scan physical barcode
   ├─ Verify location và quantity
   └─ source.checkedAt = now

4. CONFIRM ISSUE (Manager)
   ↓
   MaterialOutbound.confirm() [Transaction]
   ├─ Verify all sources checked
   ├─ FabricRoll.currentLengthMeters -= quantity
   ├─ FabricRoll.status = 'DEPLETED' (if currentLengthMeters = 0)
   ├─ MaterialStockLot.currentQty -= quantity
   ├─ MaterialStockLot.allocations[].putawayQty -= quantity
   ├─ WarehouseLocation.currentOccupancy -= quantity
   ├─ RawMaterial.onHandQty -= quantity
   ├─ InventoryTransaction.create (type: OUTBOUND_ISSUE_CUTTING)
   └─ MaterialOutbound.status = 'COMPLETED'

5. PRINT ISSUE TICKET
   ↓
   Display ticket info
   └─ Warehouse, date, department, recipient
   └─ Materials, sources, quantities
   └─ Signature lines
```

### 7.3 Error Recovery

**Network Failure During Draft Save**:
```
1. Catch network error (!error.status)
2. Save form to localStorage
3. Show notice: "Đã lưu trên thiết bị"
4. User clicks "Mở nháp trên thiết bị" button
5. Restore form and retry save when online
```

**Version Conflict**:
```
1. Server detects version mismatch
2. Return error: VERSION_CONFLICT
3. Client shows: "Dữ liệu đã thay đổi, hãy tải lại"
4. User reloads and merges changes
```

**Duplicate Confirmation**:
```
1. Client sends confirmationKey
2. Server finds existing confirmation with same key
3. Return existing result (idempotent)
4. Client updates to COMPLETED state
```

**Barcode Already Checked**:
```
1. Server detects source.checkedAt exists
2. Return error: SOURCE_ALREADY_CHECKED
3. Client shows: "Nguồn này đã được kiểm tra"
4. User continues with other barcodes
```

---

## SUMMARY

### Key Features

**Nhập kho**:
- ✅ Kế hoạch giao hàng theo hợp đồng
- ✅ Inspection với ACCEPTED/REJECTED/PENDING
- ✅ Fabric rolls với dimensions (width, length)
- ✅ Accessory lots với package info và multi-location allocation
- ✅ Location capacity planning
- ✅ Barcode generation và printing
- ✅ Putaway confirmation với barcode scanning
- ✅ Supplier return handling
- ✅ Offline draft support

**Xuất kho**:
- ✅ Source selection theo FIFO
- ✅ Physical barcode verification
- ✅ Multi-source per material
- ✅ Atomic transaction deduction
- ✅ Department/recipient tracking
- ✅ Version control để prevent concurrent edits
- ✅ Offline draft support

### Technical Highlights

- **Transaction Safety**: MongoDB transactions cho atomic operations
- **Idempotency**: Confirmation keys, putaway keys
- **Optimistic Locking**: Version fields
- **Offline Support**: localStorage caching
- **FIFO Compliance**: fifoInboundTimestamp tracking
- **Audit Trail**: InventoryTransaction logs
- **Barcode Integration**: QR code generation và scanning
- **Responsive UI**: React với real-time validation

---

**Tác giả**: Duy Anh  
**Ngày tạo**: 2026-10-26  
**Cập nhật lần cuối**: 2026-11-05
