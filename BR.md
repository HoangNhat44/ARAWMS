# AraWMS Business Rules (BR.md)
> **Tài liệu Quản lý Quy tắc Nghiệp vụ Hệ thống AraWMS**  
> *Đặc tả 23 Business Rules cốt lõi (GBR-01 đến GBR-23), ánh xạ trực tiếp đến vị trí mã nguồn theo kiến trúc 5 tầng của dự án.*

---

## 1. Giới thiệu & Hướng dẫn sử dụng

### 1.1. Mục đích
Tài liệu này là **nguồn sự thật duy nhất (Single Source of Truth)** cho toàn bộ quy tắc nghiệp vụ trong hệ thống AraWMS. Mọi đoạn code thực thi nghiệp vụ trong Front-end và Back-end phải tham chiếu mã quy tắc tương ứng:
```javascript
// [BR: GBR-xx] <Tóm tắt logic thực thi quy tắc>
```
Định dạng này cho phép cả lập trình viên và Trợ lý AI dễ dàng kiểm tra, truy vết độ bao phủ (Traceability) và đảm bảo tính tuân thủ quy trình vận hành kho AraStore.

### 1.2. Phân loại Quy tắc (Rule Types)
1. **Constraint (Ràng buộc)**: Quy tắc bất biến, ngăn chặn các trạng thái không hợp lệ của dữ liệu hoặc luồng hoạt động (ví dụ: tài khoản vô hiệu hóa không được đăng nhập, mã SKU/RM duy nhất, kiểm tra KCS trước khi sinh phiếu nhập).
2. **Action Enabler (Kích hoạt hành động)**: Quy tắc tự động kích hoạt một hành động tiếp theo khi một điều kiện được thỏa mãn (ví dụ: tự động khóa/yêu cầu đổi mật khẩu sau 5 lần nhập sai, tự động giữ chỗ kho khi xác nhận đơn, tự động cảnh báo tồn kho thấp).
3. **Computation (Công thức tính toán)**: Quy tắc định nghĩa công thức số học hoặc logic tính toán bắt buộc của hệ thống (ví dụ: tính phụ phí hoàn trả 10%, tự động đối soát chênh lệch COD, tính giá vốn FIFO COGS).

---

## 2. Bảng Tổng hợp Business Rules (Master Summary Table)

| GBR-ID | Rule Statement | Applies To | Rationale | Enforced By | Rule Type | Source of rule |
|:---:|---|---|---|---|:---:|---|
| **GBR-01** | Once a user account is deactivated, it cannot log into the system under any circumstances. | Account & Authentication Module | Ensures information security when staff members resign or have their privileges revoked. | System automatically checks the account status upon login. | `Constraint` | AraStore Store Security Policy |
| **GBR-02** | If an incorrect password is entered 5 consecutive times, will require users to change their password via email. | Login Feature | Prevents brute-force password guessing attacks. | System counts failed attempts and automatically locks the account. | `Action Enabler` | IT System Safety Regulations |
| **GBR-03** | SKU codes and Raw Material (RM) codes must be unique across the entire system. | Product & Raw Material Management | Prevents duplication and confusion of goods in inventory. | System enforces uniqueness check upon code creation/modification. | `Constraint` | AraStore Warehouse Management Operations |
| **GBR-04** | Every whole fabric roll and returned remnant fabric roll entering the warehouse must have a unique barcode label linked to its physical FIFO shelf location and inbound timestamp. | Fabric Roll Management | Enables roll-level traceability and guarantees automated First-In, First-Out (FIFO) material issuance suggestions. | System mandates printing and scanning unique roll barcodes during inbound put-away before inventory is recognized. | `Constraint` | Raw & Auxiliary Material Warehouse Labeling Process |
| **GBR-05** | If the available inventory of an SKU drops below the Min Stock Threshold, the system must trigger a low stock alert. | Inventory Management & Alerts | Enables timely reordering or supplementary production to avoid supply chain disruptions. | System compares available inventory with the threshold after each stock issue transaction. | `Action Enabler` | Minimum Stock Reserve Policy |
| **GBR-06** | Leftover fabric after cutting must be measured by the Garment Technician; remnants measuring >= 2.0m must trigger a remnant recovery request with a new roll barcode, while pieces < 2.0m must be disposed of as scrap. | Remnant Recovery | Prevents bought-outright fabric scrap leakage and standardizes the re-utilization of usable leftover materials. | System validates measured remnant length against the configurable threshold (default 2.0m) before generating an inbound remnant ticket. | `Constraint` | Garment Technical & Wastage Policy |
| **GBR-07** | When a sales order is confirmed in the chat interface, the system must immediately allocate and transfer the required SKU quantity from Available Inventory to Reserved Inventory. | Order Fulfillment & Stock Allocation | Eliminates race conditions and prevents overselling during concurrent seller chats. | System checks available stock and executes an atomic reservation transaction upon order confirmation. | `Action Enabler` | Conversational Commerce SOP |
| **GBR-08** | Canceled orders will automatically release reserved inventory quantities back to Available Inventory. | Order Management & Cancellation | Accurately updates available stock quantities for other customers. | System automatically adds quantities back to Available Inventory when order status changes to Cancelled. | `Action Enabler` | Order Cancellation Handling Regulation |
| **GBR-09** | Warehouse staff must perform dual-scan verification (Order Code + SKU Barcode) and attach a valid packaging video recording URL before the order can be marked as packed and stock deducted from on-hand inventory. | Order Packing & Fulfillment | Eradicates picking errors, mis-shipments, and provides immutable visual evidence against customer dispute claims. | System blocks waybill generation and on-hand stock deduction until all item barcodes match and a video link is stored. | `Constraint` | Warehouse Shipping & Quality SOP |
| **GBR-10** | Every package handed over to the carrier (GHN) must have a Waybill Label and be recorded in the Handover Report. | Carrier Handover | Serves as a basis for reconciling physical handed-over packages and resolving lost claims. | System requires scanning the Waybill code to confirm inclusion in the Handover Report. | `Constraint` | AraStore - Carrier Goods Handover Regulation |
| **GBR-11** | Customer returns caused by customer fault (missing brand tags or soiled/stained fabric) shall incur a 10% non-compliance surcharge calculated on the returned merchandise value upon financial settlement. | Return Financial Settlement | Compensates the business for reprocessing, cleaning, re-tagging, and warehouse handling expenses. | Formula: Refund Amount = Product Value * 90% - Shipping Fee (if any) | `Computation` | AraStore Return & Exchange Policy |
| **GBR-12** | Returned goods due to manufacturing defects or wrong item delivery are 100% exempt from return surcharges and incurred shipping fees. | Return & Exchange Management | Ensures customer rights when the fault lies with the store. | System calculates Refund Amount = 100% Product Value when return reason is store fault. | `Action Enabler` | Consumer Protection Policy |
| **GBR-13** | Garments flagged as defective (during finished goods KCS or return unboxing inspection) must be strictly isolated into the Defect Quarantine zone and excluded from active retail available stock. | Defect Warehouse Management | Prevents inventory pollution and ensures damaged or sub-standard garments are not dispatched to customers. | System automatically sets quarantine flags and blocks allocation of quarantined units to sales orders. | `Constraint` | Quality Control Classification Process |
| **GBR-14** | Every Cash-In and Cash-Out operational voucher must strictly reference a valid source document (Supplier Contract Code, Inbound Delivery Plan, Order Code, COD Batch Code, or RMA Code). | Operational Cash Flow Management | Ensures cash flow transparency and traceability of financial receipts and disbursements. | System enforces mandatory selection and validation of a persistent foreign reference ID before creating vouchers. | `Constraint` | Enterprise Accounting Regulations |
| **GBR-15** | When importing a courier COD statement spreadsheet, the system must automatically match each waybill record against system-expected COD amounts and highlight discrepancies line-by-line. | COD Reconciliation | Eliminates manual checking of large statements and detects courier underpayments or unauthorized shipping deductions. | System parses uploaded files, compares statement amounts with expected order values, and categorizes row statuses. | `Computation` | Delivery Partner Financial Reconciliation Contract |
| **GBR-16** | Any sales order exhibiting a discrepancy between carrier-remitted COD and expected order value must be tagged with a Red Flag, preventing batch settlement until investigated or escalated to a carrier dispute. | COD Reconciliation & Claims | Protects business revenue and isolates financial leakage from shipping partner settlement errors. | System automatically flags items with non-zero variance and routes them to the Red Flag resolution queue. | `Action Enabler` | COD Loss Risk Control Process |
| **GBR-17** | Cost of Goods Sold (COGS) for each issued order must be calculated automatically based on the allocated FIFO batch unit. | Cost Accounting & Profitability | Guarantees accurate order-level gross profit margin analysis and reliable executive P&L financial reporting. | System snapshots and binds batch unit costs to sales order item records at the moment of packaging completion. | `Computation` | Fashion Inventory Costing SOP |
| **GBR-18** | A stock audit session can only be closed (Completed) after all quantity discrepancy vouchers have been processed or approved for adjustment. | Stock Audit Management | Ensures thorough resolution of inventory discrepancies before finalizing the audit ledger. | System checks the status of related adjustment vouchers before allowing audit session closure. | `Constraint` | AraStore Periodic Inventory Audit Regulation |
| **GBR-19** | Inventory count discrepancies exceeding the minor threshold and all aging stock clearance plans require mandatory review and authorization by the Store Owner. | Stocktake Audit & Approval | Prevents internal inventory fraud and maintains governance over high-value stock adjustments. | System evaluates total discrepancy quantities/values and routes approval tasks between Manager and Owner. | `Action Enabler` | Internal Audit & Authority Policy |
| **GBR-20** | The system must enforce a three-tier physical warehouse topology (Zone -> Rack -> Shelf) and prioritize the oldest available stock for cutting issuance and pick-list generation per FIFO rules. | Warehouse Topology & Stock Issuance | Prevents fabric expiration, aging, and fabric shade variations by ensuring oldest materials are consumed first. | System automatically sorts candidate batches/rolls by ascending inbound timestamp and outputs prioritized shelf locations. | `Constraint` | Standard FIFO Warehousing Policy |
| **GBR-21** | Raw materials delivered by suppliers cannot be received into active inventory until the Garment Technician physically verifies specifications and flags any delivery plan deviations. | Inbound Material Verification | Prevents accepting short deliveries, incorrect fabric widths, or defective yarn batches into production stock. | System locks inbound receipt ticket creation until the Garment Technician signs off on the inspection report. | `Constraint` | Supplier Inbound Quality SOP |
| **GBR-22** | Finished garments delivered from sewing workshops must pass physical quality control (KCS) by the Garment Technician before finished goods receipt tickets can be generated. | Finished Garment Inspection | Ensures only garments adhering to size specifications, seam standards, and proper labeling reach saleable stock. | System restricts finished goods receipt generation to quantities certified as passed in the KCS report. | `Constraint` | Apparel Quality Assurance SOP |
| **GBR-23** | Warehouse staff processing customer return parcels must scan the return waybill and attach an unboxing inspection video URL prior to classifying item conditions and routing inventory. | Reverse Logistics & Unboxing | Establishes indisputable visual evidence to verify customer return conditions and justify surcharge deductions or carrier claims. | System requires an uploaded video link as a mandatory field before submitting the unboxing inspection form. | `Constraint` | Reverse Logistics Fraud Prevention |

---

## 3. Đặc tả Chi tiết từng Business Rule & Ánh xạ Mã nguồn

```
                               KIẾN TRÚC ÁP DỤNG TRUY VẾT
+---------------------------------------------------------------------------------------+
|  [Front-end]   --> ARAWMS_FE/src/pages / components / services / hooks                |
|  [Route]       --> ARAWMS_BE/src/modules/.../*.routes.js                              |
|  [Validation]  --> ARAWMS_BE/src/modules/.../*.validation.js                          |
|  [Controller]  --> ARAWMS_BE/src/modules/.../*.controller.js                          |
|  [Service]     --> ARAWMS_BE/src/modules/.../*.service.js                             |
|  [Model / DB]  --> ARAWMS_BE/src/models/*.model.js & MongoDB Indexes                  |
+---------------------------------------------------------------------------------------+
```

---

### GBR-01: Chặn đăng nhập tài khoản đã vô hiệu hóa (Deactivated Account Login Block)
- **Rule Statement**: Once a user account is deactivated, it cannot log into the system under any circumstances.
- **Applies To**: Account & Authentication Module
- **Rationale**: Ensures information security when staff members resign or have their privileges revoked. (Đảm bảo an toàn thông tin khi nhân sự nghỉ việc hoặc bị thu hồi quyền truy cập).
- **Enforced By**: System automatically checks the account status upon login. (Hệ thống tự động kiểm tra trạng thái hoạt động của tài khoản ngay khi thực hiện đăng nhập).
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Store Security Policy
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.controller.js` (`login`)
  - `Service`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.service.js` (kiểm tra `user.status === 'ACTIVE'` và `!user.isDeactivated`)
  - `Middleware`: `ARAWMS_BE/src/common/middlewares/authenticate.js` (xác minh tài khoản còn hiệu lực khi decode JWT token)
  - `Model`: `ARAWMS_BE/src/models/User.model.js` (trường `status`, `isDeactivated`)
  - `Front-end`: `ARAWMS_FE/src/pages/LoginPage.jsx`, `ARAWMS_FE/src/services/api.js` (bắt 401/403 xóa phiên và hiển thị thông báo lỗi)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-01] Ngăn chặn đăng nhập đối với tài khoản đã bị vô hiệu hóa hoặc thu hồi quyền
  if (user.status !== 'ACTIVE' || user.isDeactivated) {
    throw Object.assign(new Error('Tài khoản đã bị ngừng kích hoạt. Vui lòng liên hệ Quản trị viên.'), {
      statusCode: 403,
      code: 'ACCOUNT_DEACTIVATED',
    });
  }
  ```

---

### GBR-02: Bắt buộc đổi mật khẩu qua Email sau 5 lần nhập sai liên tiếp (Password Brute-force Lock & Reset)
- **Rule Statement**: If an incorrect password is entered 5 consecutive times, will require users to change their password via email.
- **Applies To**: Login Feature
- **Rationale**: Prevents brute-force password guessing attacks. (Phòng chống tấn công dò mật khẩu tự động).
- **Enforced By**: System counts failed attempts and automatically locks the account. (Hệ thống đếm số lần đăng nhập thất bại liên tiếp và tự động khóa tài khoản, kích hoạt luồng đổi mật khẩu qua email).
- **Rule Type**: `Action Enabler`
- **Source of rule**: IT System Safety Regulations
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.service.js` (`failedLoginAttempts`, kiểm tra và khóa tài khoản), `passwordRecovery.service.js` (gửi mail khôi phục)
  - `Controller`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.controller.js`
  - `Model`: `ARAWMS_BE/src/models/User.model.js` (trường `failedLoginAttempts: Number`, `status: 'LOCKED'`, `requiresPasswordReset: Boolean`)
  - `Front-end`: `ARAWMS_FE/src/pages/LoginPage.jsx` (hiển thị thông báo tài khoản bị khóa và hướng dẫn kiểm tra email đặt lại mật khẩu)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-02] Tự động khóa tài khoản và yêu cầu đổi mật khẩu qua email sau 5 lần nhập sai liên tiếp
  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  if (user.failedLoginAttempts >= 5) {
    user.status = 'LOCKED';
    user.requiresPasswordReset = true;
    await user.save();
    await sendPasswordResetEmail(user);
    throw Object.assign(new Error('Tài khoản đã bị khóa do nhập sai mật khẩu 5 lần. Vui lòng kiểm tra email để đặt lại mật khẩu.'), {
      statusCode: 423,
      code: 'ACCOUNT_LOCKED_PASSWORD_RESET_REQUIRED',
    });
  }
  await user.save();
  ```

---

### GBR-03: Tính duy nhất của mã SKU và mã Nguyên vật liệu (Unique SKU & RM Codes)
- **Rule Statement**: SKU codes and Raw Material (RM) codes must be unique across the entire system.
- **Applies To**: Product & Raw Material Management
- **Rationale**: Prevents duplication and confusion of goods in inventory. (Chống trùng lặp và nhầm lẫn hàng hóa, nguyên vật liệu trong quản lý xuất/nhập/tồn kho).
- **Enforced By**: System enforces uniqueness check upon code creation/modification. (Hệ thống bắt buộc kiểm tra tính duy nhất khi tạo mới hoặc cập nhật mã).
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Warehouse Management Operations
- **Vị trí Code áp dụng**:
  - `Validation`: `ARAWMS_BE/src/modules/master-data/product-catalog/product.validation.js`, `rawMaterial.validation.js`
  - `Service`: `ARAWMS_BE/src/modules/master-data/product-catalog/product.service.js`, `rawMaterial.service.js`
  - `Model / DB`: `ARAWMS_BE/src/models/Sku.model.js` (`skuCode: { type: String, unique: true, uppercase: true }`), `RawMaterial.model.js` (`materialCode: { type: String, unique: true, uppercase: true }`)
  - `Front-end`: `ARAWMS_FE/src/pages/ProductConfigurationPage.jsx`, `MaterialConfigurationModal.jsx` (kiểm tra trùng mã real-time)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-03] Bắt buộc SKU Code và RM Code là duy nhất trên toàn hệ thống
  const existingSku = await Sku.findOne({ skuCode: code.trim().toUpperCase() });
  if (existingSku && (!currentId || existingSku._id.toString() !== currentId.toString())) {
    throw Object.assign(new Error(`[BR: GBR-03] Mã SKU "${code}" đã tồn tại trên toàn hệ thống.`), {
      statusCode: 409,
      code: 'DUPLICATE_SKU_CODE',
    });
  }
  ```

---

### GBR-04: Tem Barcode định danh cuộn vải gắn với vị trí kệ FIFO (Fabric Roll Barcode & FIFO Shelf Location)
- **Rule Statement**: Every whole fabric roll and returned remnant fabric roll entering the warehouse must have a unique barcode label linked to its physical FIFO shelf location and inbound timestamp.
- **Applies To**: Fabric Roll Management
- **Rationale**: Enables roll-level traceability and guarantees automated First-In, First-Out (FIFO) material issuance suggestions. (Đảm bảo truy vết chi tiết từng cây vải và đề xuất xuất kho theo nguyên tắc FIFO tự động).
- **Enforced By**: System mandates printing and scanning unique roll barcodes during inbound put-away before inventory is recognized. (Hệ thống bắt buộc in và quét tem mã vạch cuộn vải khi cất hàng lên kệ trước khi ghi nhận tồn kho khả dụng).
- **Rule Type**: `Constraint`
- **Source of rule**: Raw & Auxiliary Material Warehouse Labeling Process
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/raw-material-warehousing/inbound-execution/inboundExecution.service.js`, `supplierReceipt.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/raw-material-warehousing/inbound-execution/inboundExecution.controller.js`
  - `Model`: `ARAWMS_BE/src/models/FabricRoll.model.js` (các trường `rollCode`, `barcode`, `locationId`, `inboundDate`, `fifoPriorityScore`), `WarehouseLocation.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/SupplierInboundPage.jsx`, `WarehousePutawayPage.jsx` (giao diện in tem barcode và quét gán vị trí kệ)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-04] Bắt buộc định danh cuộn vải bằng barcode duy nhất gắn với vị trí kệ và timestamp nhập kho FIFO
  const fabricRoll = await FabricRoll.create({
    rollCode,
    barcode: `ROLL-${rollCode}-${materialCode}`,
    materialId,
    locationId: shelfLocation._id,
    inboundDate: new Date(),
    actualLengthMeters,
    status: 'ACTIVE_AVAILABLE',
  });
  ```

---

### GBR-05: Cảnh báo tồn kho thấp khi chạm ngưỡng Min Stock (SKU Low Stock Alert)
- **Rule Statement**: If the available inventory of an SKU drops below the Min Stock Threshold, the system must trigger a low stock alert.
- **Applies To**: Inventory Management & Alerts
- **Rationale**: Enables timely reordering or supplementary production to avoid supply chain disruptions. (Chủ động đặt mua nguyên phụ liệu hoặc may bù hàng hóa kịp thời, tránh đứt gãy chuỗi bán lẻ).
- **Enforced By**: System compares available inventory with the threshold after each stock issue transaction. (Hệ thống tự động so sánh tồn kho khả dụng với ngưỡng tồn tối thiểu sau mỗi giao dịch xuất kho hoặc giữ chỗ).
- **Rule Type**: `Action Enabler`
- **Source of rule**: Minimum Stock Reserve Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/warehouse-management/products/product.service.js`, `inventoryTransaction.service.js` (trigger alert sau transaction)
  - `Model`: `ARAWMS_BE/src/models/InventoryAlert.model.js`, `Sku.model.js` (`minStockThreshold`, `onHandQty`, `reservedQty`)
  - `Front-end`: `ARAWMS_FE/src/pages/seller/SellerInventoryPage.jsx`, `ARAWMS_FE/src/components/common/HeaderNotifications.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-05] Tự động kích hoạt cảnh báo tồn kho thấp khi tồn khả dụng < ngưỡng Min Stock Threshold
  const availableQty = sku.onHandQty - (sku.reservedQty || 0);
  if (availableQty < sku.minStockThreshold) {
    await InventoryAlert.create({
      skuId: sku._id,
      skuCode: sku.skuCode,
      currentAvailableQty: availableQty,
      minStockThreshold: sku.minStockThreshold,
      alertType: 'LOW_STOCK',
      createdAt: new Date(),
    });
  }
  ```

---

### GBR-06: Phân loại và thu hồi vải thừa sau may (Remnant Recovery Threshold >= 2.0m)
- **Rule Statement**: Leftover fabric after cutting must be measured by the Garment Technician; remnants measuring >= 2.0m must trigger a remnant recovery request with a new roll barcode, while pieces < 2.0m must be disposed of as scrap.
- **Applies To**: Remnant Recovery
- **Rationale**: Prevents bought-outright fabric scrap leakage and standardizes the re-utilization of usable leftover materials. (Ngăn thất thoát vải mua đứt và quy chuẩn hóa việc tái tận dụng vải vụn có thể dùng lại).
- **Enforced By**: System validates measured remnant length against the configurable threshold (default 2.0m) before generating an inbound remnant ticket. (Hệ thống kiểm tra chiều dài mét đo thực tế so với ngưỡng chuẩn 2.0m trước khi cho phép tạo phiếu thu hồi cuộn vải vụn).
- **Rule Type**: `Constraint`
- **Source of rule**: Garment Technical & Wastage Policy
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/garment-technical/remnant-recovery/remnantRecovery.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/garment-technical/remnant-recovery/remnantRecovery.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/garment-technical/remnant-recovery/remnantRecovery.service.js`
  - `Validation`: `ARAWMS_BE/src/modules/garment-technical/remnant-recovery/remnantRecovery.validation.js`
  - `Model`: `ARAWMS_BE/src/models/RemnantRecoveryRequest.model.js`, `FabricRoll.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/garment-technical/RemnantRecoveryPage.jsx` (modal nhập độ dài vải thừa và chọn phân loại phế liệu/thu hồi)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-06] Kiểm tra độ dài vải thừa sau cắt: >= 2.0m tạo phiếu thu hồi cuộn mới, < 2.0m hủy thành phế liệu
  const REMNANT_MIN_THRESHOLD = 2.0; // Mét
  if (measuredLengthMeters >= REMNANT_MIN_THRESHOLD) {
    await RemnantRecoveryRequest.create({
      materialCode,
      measuredLengthMeters,
      status: 'PENDING_ROLL_LABELING',
      action: 'REMNANT_INBOUND',
    });
  } else {
    await registerScrapDisposal({ materialCode, scrapLengthMeters: measuredLengthMeters, reason: 'BELOW_THRESHOLD' });
  }
  ```

---

### GBR-07: Giữ chỗ kho tức thời khi xác nhận đơn trong chat (Conversational Order Reservation)
- **Rule Statement**: When a sales order is confirmed in the chat interface, the system must immediately allocate and transfer the required SKU quantity from Available Inventory to Reserved Inventory.
- **Applies To**: Order Fulfillment & Stock Allocation
- **Rationale**: Eliminates race conditions and prevents overselling during concurrent seller chats. (Tránh xung đột tranh chấp hàng và ngăn bán vượt quá tồn kho khi nhiều tư vấn viên chat cùng lúc).
- **Enforced By**: System checks available stock and executes an atomic reservation transaction upon order confirmation. (Hệ thống kiểm tra tồn khả dụng và thực thi transaction khóa tồn giữ chỗ nguyên tử ngay khi chốt đơn).
- **Rule Type**: `Action Enabler`
- **Source of rule**: Conversational Commerce SOP
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/conversational-commerce/chat-interface/chatOrder.routes.js`, `orderManagement.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.service.js` (`confirmOrderAndReserve`)
  - `Model`: `ARAWMS_BE/src/models/Sku.model.js` (`reservedQty`), `SalesOrder.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/seller/SellerChatPage.jsx`, `ARAWMS_FE/src/components/seller/CustomerProfilePanel.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-07] Khóa chuyển tồn khả dụng sang tồn giữ chỗ (+reservedQty) nguyên tử ngay khi xác nhận đơn trong chat
  const sku = await Sku.findOneAndUpdate(
    { _id: item.skuId, $expr: { $gte: [{ $subtract: ['$onHandQty', '$reservedQty'] }, item.orderedQty] } },
    { $inc: { reservedQty: item.orderedQty } },
    { session, new: true }
  );
  if (!sku) {
    throw new Error(`[BR: GBR-07] SKU ${item.skuCode} không đủ tồn khả dụng để giữ chỗ đơn hàng.`);
  }
  ```

---

### GBR-08: Tự động hoàn trả tồn giữ chỗ khi hủy đơn hàng (Order Cancellation Stock Release)
- **Rule Statement**: Canceled orders will automatically release reserved inventory quantities back to Available Inventory.
- **Applies To**: Order Management & Cancellation
- **Rationale**: Accurately updates available stock quantities for other customers. (Cập nhật tồn khả dụng chính xác để phục vụ khách mua hàng khác ngay sau khi hủy đơn).
- **Enforced By**: System automatically adds quantities back to Available Inventory when order status changes to Cancelled. (Hệ thống tự động trừ tồn giữ chỗ khi trạng thái đơn hàng đổi sang `CANCELLED`).
- **Rule Type**: `Action Enabler`
- **Source of rule**: Order Cancellation Handling Regulation
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.routes.js` (`POST /:id/cancel`)
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.service.js` (`cancelOrder`)
  - `Model`: `ARAWMS_BE/src/models/Sku.model.js`, `SalesOrder.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/seller/SellerOrdersPage.jsx`, `ARAWMS_FE/src/pages/order-fulfillment/OrderDetailPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-08] Tự động giải phóng tồn giữ chỗ (-reservedQty) khi đơn hàng chuyển trạng thái CANCELLED
  for (const item of order.items) {
    await Sku.findByIdAndUpdate(item.skuId, { $inc: { reservedQty: -item.orderedQty } }, { session });
  }
  order.orderStatus = 'CANCELLED';
  await order.save({ session });
  ```

---

### GBR-09: Quét kép mã vạch và đính kèm Video đóng gói (Dual-Scan Verification & Packaging Video Recording)
- **Rule Statement**: Warehouse staff must perform dual-scan verification (Order Code + SKU Barcode) and attach a valid packaging video recording URL before the order can be marked as packed and stock deducted from on-hand inventory.
- **Applies To**: Order Packing & Fulfillment
- **Rationale**: Eradicates picking errors, mis-shipments, and provides immutable visual evidence against customer dispute claims. (Triệt tiêu sai sót nhặt nhầm hàng và cung cấp bằng chứng hình ảnh chống khiếu nại lừa đảo).
- **Enforced By**: System blocks waybill generation and on-hand stock deduction until all item barcodes match and a video link is stored. (Hệ thống khóa tạo vận đơn và cấm trừ tồn thực tế cho đến khi khớp toàn bộ barcode và đã lưu URL video đóng gói hợp lệ).
- **Rule Type**: `Constraint`
- **Source of rule**: Warehouse Shipping & Quality SOP
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/order-fulfillment/packing-verification/packingVerification.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/packing-verification/packingVerification.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/packing-verification/packingVerification.service.js`, `packingStock.service.js`, `packingVideo.service.js`
  - `Model`: `ARAWMS_BE/src/models/PackingSession.js`, `PackingScanEvent.js`, `PackingVideo.js`, `SalesOrder.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/WarehousePackingPage.jsx`, `ARAWMS_FE/src/services/packingSessionService.js`, `packingVideoUploadManager.js`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-09] Bắt buộc hoàn tất quét kép (Mã đơn + SKU Barcode) và đính kèm URL video đóng gói
  if (!session.isDualScanVerified || !session.packagingVideoUrl) {
    throw Object.assign(new Error('[BR: GBR-09] Phải hoàn thành quét kép và có video đóng gói trước khi hoàn tất đóng gói.'), {
      statusCode: 400,
      code: 'PACKING_VERIFICATION_INCOMPLETE',
    });
  }
  await packingStockService.deductOnHandStockForPackedOrder(orderId, session);
  ```

---

### GBR-10: Mã vận đơn và Biên bản bàn giao bưu tá GHN (Carrier Waybill & Handover Report)
- **Rule Statement**: Every package handed over to the carrier (GHN) must have a Waybill Label and be recorded in the Handover Report.
- **Applies To**: Carrier Handover
- **Rationale**: Serves as a basis for reconciling physical handed-over packages and resolving lost claims. (Căn cứ pháp lý đối soát số lượng bưu kiện thực bàn giao và giải quyết khiếu nại hàng thất lạc).
- **Enforced By**: System requires scanning the Waybill code to confirm inclusion in the Handover Report. (Hệ thống bắt buộc quét mã vận đơn để xác nhận đưa kiện hàng vào Biên bản bàn giao bưu tá).
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore - Carrier Goods Handover Regulation
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/carrierHandover.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/carrierHandover.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/carrierHandover.service.js`
  - `Model`: `ARAWMS_BE/src/models/SalesOrder.model.js`, `ShippingCarrier.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/order-fulfillment/CarrierHandoverScanPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-10] Bắt buộc kiện hàng bàn giao GHN phải có mã vận đơn và được quét vào Biên bản bàn giao
  if (!order.waybillCode || !handoverReportId) {
    throw new Error('[BR: GBR-10] Kiện hàng chưa có mã vận đơn (Waybill) hoặc thiếu mã Biên bản bàn giao.');
  }
  await HandoverReport.findByIdAndUpdate(handoverReportId, { $addToSet: { packageWaybills: order.waybillCode } });
  ```

---

### GBR-11: Khấu trừ 10% phụ phí hoàn trả do lỗi khách hàng (Customer Return 10% Surcharge Calculation)
- **Rule Statement**: Customer returns caused by customer fault (missing brand tags or soiled/stained fabric) shall incur a 10% non-compliance surcharge calculated on the returned merchandise value upon financial settlement.
- **Formula**: `Refund Amount = Product Value * 90% - Shipping Fee (if any)`
- **Applies To**: Return Financial Settlement
- **Rationale**: Compensates the business for reprocessing, cleaning, re-tagging, and warehouse handling expenses. (Bù đắp chi phí tẩy rửa, gắn lại tag mác và xử lý lưu kho của cửa hàng).
- **Enforced By**: Formula: `Refund Amount = Product Value * 90% - Shipping Fee (if any)`
- **Rule Type**: `Computation`
- **Source of rule**: AraStore Return & Exchange Policy
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.service.js`
  - `Model`: `ARAWMS_BE/src/models/ReturnRequest.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/reverse-logistics/ReturnSettlementModal.jsx`, `CustomerExchangePage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  /*
   * [BR: GBR-11] Tính tiền hoàn trả cho khách khi lỗi thuộc về khách hàng (mất tag, dơ bẩn, chọn nhầm size):
   * Refund Amount = Product Value * 90% - Shipping Fee (if any)
   */
  const surchargeRate = 0.10; // Phụ phí 10%
  const refundAmount = Math.max(0, (returnedProductValue * (1 - surchargeRate)) - (shippingFee || 0));
  ```

---

### GBR-12: Miễn 100% phụ phí và phí ship khi lỗi do nhà sản xuất hoặc giao sai (Store Fault Free Return)
- **Rule Statement**: Returned goods due to manufacturing defects or wrong item delivery are 100% exempt from return surcharges and incurred shipping fees.
- **Formula**: `Refund Amount = 100% Product Value`
- **Applies To**: Return & Exchange Management
- **Rationale**: Ensures customer rights when the fault lies with the store. (Bảo vệ quyền lợi tối đa của khách hàng khi sai sót do khâu sản xuất hoặc đóng gói nhầm).
- **Enforced By**: System calculates `Refund Amount = 100% Product Value` when return reason is store fault. (Hệ thống tự động tính hoàn trả 100% giá trị sản phẩm và miễn toàn bộ phí vận chuyển).
- **Rule Type**: `Action Enabler`
- **Source of rule**: Consumer Protection Policy
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.service.js`
  - `Model`: `ARAWMS_BE/src/models/ReturnRequest.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/reverse-logistics/ReturnSettlementModal.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-12] Miễn 100% phụ phí hoàn trả và cước vận chuyển khi nguyên nhân là lỗi cửa hàng (lỗi vải, giao sai SKU)
  if (['MANUFACTURING_DEFECT', 'WRONG_ITEM_DELIVERED'].includes(returnReason)) {
    refundAmount = returnedProductValue; // Hoàn tiền 100% giá trị hàng hóa
    customerIncurredShipping = 0;
  }
  ```

---

### GBR-13: Cô lập hàng lỗi vào Kho cách ly (Defect Quarantine Zone Isolation)
- **Rule Statement**: Garments flagged as defective (during finished goods KCS or return unboxing inspection) must be strictly isolated into the Defect Quarantine zone and excluded from active retail available stock.
- **Applies To**: Defect Warehouse Management
- **Rationale**: Prevents inventory pollution and ensures damaged or sub-standard garments are not dispatched to customers. (Ngăn ô nhiễm dữ liệu tồn kho thương phẩm và chặn giao hàng lỗi cho khách).
- **Enforced By**: System automatically sets quarantine flags and blocks allocation of quarantined units to sales orders. (Hệ thống tự động đánh dấu cách ly và chặn phân bổ hàng trong khu cách ly vào đơn bán lẻ).
- **Rule Type**: `Constraint`
- **Source of rule**: Quality Control Classification Process
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/finished-goods-warehousing/defect-quarantine/defectQuarantine.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/finished-goods-warehousing/defect-quarantine/defectQuarantine.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/finished-goods-warehousing/defect-quarantine/defectQuarantine.service.js`
  - `Model`: `ARAWMS_BE/src/models/FinishedGoodsBatch.model.js`, `WarehouseLocation.model.js` (`zoneType: 'DEFECT_QUARANTINE'`)
  - `Front-end`: `ARAWMS_FE/src/pages/FinishedGoodsPage.jsx`, `DefectQuarantinePage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-13] Tự động chuyển hàng lỗi KCS/hoàn trả vào khu vực DEFECT_QUARANTINE, không cộng vào tồn khả dụng
  if (item.isDefective || item.kcsStatus === 'FAILED') {
    item.stockStatus = 'DEFECT_QUARANTINE';
    item.locationId = defectQuarantineZoneLocationId;
    await transferToQuarantineZone(item);
  }
  ```

---

### GBR-14: Bắt buộc chứng từ gốc cho phiếu Thu / Chi (Mandatory Source Document for Cash Vouchers)
- **Rule Statement**: Every Cash-In and Cash-Out operational voucher must strictly reference a valid source document (Supplier Contract Code, Inbound Delivery Plan, Order Code, COD Batch Code, or RMA Code).
- **Applies To**: Operational Cash Flow Management
- **Rationale**: Ensures cash flow transparency and traceability of financial receipts and disbursements. (Đảm bảo minh bạch dòng tiền và khả năng kiểm toán nguồn gốc mọi giao dịch thu chi).
- **Enforced By**: System enforces mandatory selection and validation of a persistent foreign reference ID before creating vouchers. (Hệ thống bắt buộc chọn và xác thực ID chứng từ gốc hợp lệ trước khi cho phép tạo phiếu Thu/Chi).
- **Rule Type**: `Constraint`
- **Source of rule**: Enterprise Accounting Regulations
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/financial-intelligence/accounts-payable/accountsPayable.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/financial-intelligence/accounts-payable/accountsPayable.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/accounts-payable/accountsPayable.service.js`
  - `Model`: `ARAWMS_BE/src/models/CashFlowVoucher.model.js` (`sourceDocumentType`, `sourceDocumentCode`)
  - `Front-end`: `ARAWMS_FE/src/pages/financial-intelligence/CashFlowVoucherPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-14] Bắt buộc liên kết phiếu Thu/Chi với một chứng từ nghiệp vụ gốc hợp lệ
  const VALID_SOURCE_TYPES = ['SUPPLIER_CONTRACT', 'INBOUND_PLAN', 'SALES_ORDER', 'COD_BATCH', 'RMA_TICKET'];
  if (!VALID_SOURCE_TYPES.includes(voucher.sourceDocumentType) || !voucher.sourceDocumentCode) {
    throw new Error('[BR: GBR-14] Phiếu Thu/Chi phải có mã chứng từ gốc (Hợp đồng, Kế hoạch nhập, Đơn hàng, COD, RMA).');
  }
  ```

---

### GBR-15: Tự động đối soát bảng kê COD từng dòng (Line-by-Line Courier COD Statement Reconciliation)
- **Rule Statement**: When importing a courier COD statement spreadsheet, the system must automatically match each waybill record against system-expected COD amounts and highlight discrepancies line-by-line.
- **Applies To**: COD Reconciliation
- **Rationale**: Eliminates manual checking of large statements and detects courier underpayments or unauthorized shipping deductions. (Triệt tiêu thao tác rà soát bảng kê thủ công và phát hiện thất thoát/chiết khấu sai tiền thu hộ).
- **Enforced By**: System parses uploaded files, compares statement amounts with expected order values, and categorizes row statuses. (Hệ thống phân tích file Excel bảng kê, so sánh tiền thu hộ thực nhận với tiền COD dự kiến theo từng mã vận đơn).
- **Rule Type**: `Computation`
- **Source of rule**: Delivery Partner Financial Reconciliation Contract
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/financial-intelligence/cod-reconciliation/codReconciliation.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/financial-intelligence/cod-reconciliation/codReconciliation.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/cod-reconciliation/codReconciliation.service.js`
  - `Model`: `ARAWMS_BE/src/models/CodReconciliationBatch.model.js`, `CodReconciliationItem.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/financial-intelligence/CodReconciliationPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-15] Tự động đối soát bảng kê COD bưu tá với tiền COD kỳ vọng của hệ thống theo từng vận đơn
  const discrepancy = row.remittedCodAmount - expectedOrderCodAmount;
  const matchStatus = discrepancy === 0 ? 'MATCHED' : 'DISCREPANCY';
  await CodReconciliationItem.create({
    batchId,
    waybillCode: row.waybillCode,
    remittedAmount: row.remittedCodAmount,
    expectedAmount: expectedOrderCodAmount,
    discrepancy,
    matchStatus,
  });
  ```

---

### GBR-16: Gắn Cờ đỏ ngăn quyết toán khi có chênh lệch tiền COD (Red Flag Isolation for COD Discrepancies)
- **Rule Statement**: Any sales order exhibiting a discrepancy between carrier-remitted COD and expected order value must be tagged with a Red Flag, preventing batch settlement until investigated or escalated to a carrier dispute.
- **Applies To**: COD Reconciliation & Claims
- **Rationale**: Protects business revenue and isolates financial leakage from shipping partner settlement errors. (Bảo vệ doanh thu và cô lập rủi ro thất thoát tài chính từ các lỗi quyết toán của đối tác giao hàng).
- **Enforced By**: System automatically flags items with non-zero variance and routes them to the Red Flag resolution queue. (Hệ thống tự động gắn nhãn Red Flag và chặn tất toán đối soát lô nếu có bất kỳ dòng nào bị lệch).
- **Rule Type**: `Action Enabler`
- **Source of rule**: COD Loss Risk Control Process
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/financial-intelligence/carrier-dispute/carrierDispute.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/financial-intelligence/carrier-dispute/carrierDispute.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/carrier-dispute/carrierDispute.service.js`, `codReconciliation.service.js`
  - `Model`: `ARAWMS_BE/src/models/CarrierDispute.model.js`, `CodReconciliationItem.model.js` (`isRedFlag: true`)
  - `Front-end`: `ARAWMS_FE/src/pages/financial-intelligence/CodDiscrepancyClaimPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-16] Tự động gắn cờ đỏ (Red Flag) cho đơn có sai lệch COD và chặn quyết toán lô
  if (discrepancy !== 0) {
    item.isRedFlag = true;
    item.resolutionStatus = 'PENDING_CARRIER_DISPUTE';
    await item.save();
    await blockBatchSettlement(batchId, 'Chứa đơn hàng có chênh lệch COD gắn Cờ đỏ.');
  }
  ```

---

### GBR-17: Tự động tính giá vốn hàng bán theo lô FIFO (FIFO Batch Unit Cost of Goods Sold - COGS)
- **Rule Statement**: Cost of Goods Sold (COGS) for each issued order must be calculated automatically based on the allocated FIFO batch unit.
- **Applies To**: Cost Accounting & Profitability
- **Rationale**: Guarantees accurate order-level gross profit margin analysis and reliable executive P&L financial reporting. (Đảm bảo phân tích tỷ suất lợi nhuận gộp chính xác trên từng đơn và báo cáo P&L đáng tin cậy).
- **Enforced By**: System snapshots and binds batch unit costs to sales order item records at the moment of packaging completion. (Hệ thống snapshot và gán giá vốn của lô FIFO tương ứng vào chi tiết đơn hàng tại thời điểm đóng gói hoàn tất).
- **Rule Type**: `Computation`
- **Source of rule**: Fashion Inventory Costing SOP
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/packing-verification/packingStock.service.js`, `inventoryTransaction.service.js`
  - `Model`: `ARAWMS_BE/src/models/SalesOrder.model.js` (`items.unitCogsSnapshot`, `totalCogsAmount`), `InventoryTransaction.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/financial-intelligence/ProfitAnalysisPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-17] Snapshot giá vốn hàng bán COGS theo đơn vị lô FIFO khi xuất gói hàng
  const unitCogs = allocatedFifoBatch.unitCost;
  orderItem.unitCogsSnapshot = unitCogs;
  orderItem.totalCogs = unitCogs * orderItem.packedQty;
  ```

---

### GBR-18: Điều kiện đóng phiên kiểm kê kho (Stock Audit Session Completion Condition)
- **Rule Statement**: A stock audit session can only be closed (Completed) after all quantity discrepancy vouchers have been processed or approved for adjustment.
- **Applies To**: Stock Audit Management
- **Rationale**: Ensures thorough resolution of inventory discrepancies before finalizing the audit ledger. (Đảm bảo giải quyết triệt để mọi chênh lệch số lượng trước khi đóng sổ kiểm kê kho).
- **Enforced By**: System checks the status of related adjustment vouchers before allowing audit session closure. (Hệ thống kiểm tra trạng thái toàn bộ phiếu điều chỉnh chênh lệch trước khi cho phép đóng phiên).
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Periodic Inventory Audit Regulation
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/inventory-auditing/stocktake-session/stocktakeSession.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/inventory-auditing/stocktake-session/stocktakeSession.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/inventory-auditing/stocktake-session/stocktakeSession.service.js`
  - `Model`: `ARAWMS_BE/src/models/StocktakeSession.model.js`, `StocktakeRecord.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/inventory-auditing/StocktakeSessionDetailPage.jsx` (khóa nút Đóng phiên kiểm kê khi còn phiếu chờ xử lý)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-18] Chỉ cho phép đóng phiên kiểm kê kho khi 100% bản ghi chênh lệch đã được phê duyệt điều chỉnh
  const unresolvedVariances = await StocktakeRecord.countDocuments({
    sessionId,
    hasVariance: true,
    adjustmentStatus: { $ne: 'RESOLVED' },
  });
  if (unresolvedVariances > 0) {
    throw new Error(`[BR: GBR-18] Còn ${unresolvedVariances} bản ghi chênh lệch chưa được duyệt điều chỉnh. Không thể đóng phiên.`);
  }
  session.status = 'COMPLETED';
  ```

---

### GBR-19: Phê duyệt của Chủ cửa hàng cho chênh lệch kiểm kê lớn và xả hàng tồn lâu (Owner Approval for High-Value Variance & Aging Stock)
- **Rule Statement**: Inventory count discrepancies exceeding the minor threshold and all aging stock clearance plans require mandatory review and authorization by the Store Owner.
- **Applies To**: Stocktake Audit & Approval
- **Rationale**: Prevents internal inventory fraud and maintains governance over high-value stock adjustments. (Ngăn ngừa gian lận tồn kho nội bộ và bảo đảm quyền kiểm soát tài chính của Chủ cửa hàng).
- **Enforced By**: System evaluates total discrepancy quantities/values and routes approval tasks between Manager and Owner. (Hệ thống tính tổng giá trị chênh lệch và tự động điều hướng duyệt lên Store Owner khi vượt ngưỡng quy định).
- **Rule Type**: `Action Enabler`
- **Source of rule**: Internal Audit & Authority Policy
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/inventory-auditing/variance-analysis/varianceAnalysis.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/inventory-auditing/variance-analysis/varianceAnalysis.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/inventory-auditing/variance-analysis/varianceAnalysis.service.js`
  - `Model`: `ARAWMS_BE/src/models/StocktakeRecord.model.js` (`approvalRequiredBy: 'STORE_OWNER'`)
  - `Front-end`: `ARAWMS_FE/src/pages/inventory-auditing/VarianceApprovalPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-19] Bắt buộc Chủ cửa hàng (Store Owner) duyệt các chênh lệch kiểm kê vượt ngưỡng hoặc kế hoạch xả hàng cũ
  const HIGH_VARIANCE_THRESHOLD = 5000000; // 5.000.000 VNĐ
  if (Math.abs(varianceValue) > HIGH_VARIANCE_THRESHOLD || isAgingStockClearance) {
    if (user.role !== 'STORE_OWNER') {
      throw new Error('[BR: GBR-19] Chênh lệch vượt ngưỡng định mức hoặc xả hàng tồn lâu bắt buộc do Store Owner phê duyệt.');
    }
  }
  ```

---

### GBR-20: Cấu trúc kho 3 cấp (Zone -> Rack -> Shelf) và xuất kho FIFO (Three-Tier Warehouse Topology & FIFO Stock Issuance)
- **Rule Statement**: The system must enforce a three-tier physical warehouse topology (Zone -> Rack -> Shelf) and prioritize the oldest available stock for cutting issuance and pick-list generation per FIFO rules.
- **Applies To**: Warehouse Topology & Stock Issuance
- **Rationale**: Prevents fabric expiration, aging, and fabric shade variations by ensuring oldest materials are consumed first. (Ngăn vải ố mục, lão hóa và lệch màu cây vải bằng việc ưu tiên tiêu hao cuộn vải có ngày nhập kho lâu nhất).
- **Enforced By**: System automatically sorts candidate batches/rolls by ascending inbound timestamp and outputs prioritized shelf locations. (Hệ thống tự động sắp xếp cuộn/lô hàng theo thời gian nhập kho tăng dần và chỉ định vị trí kệ lấy hàng ưu tiên).
- **Rule Type**: `Constraint`
- **Source of rule**: Standard FIFO Warehousing Policy
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/warehouse-management/location-layout/layout.routes.js`
  - `Service`: `ARAWMS_BE/src/modules/warehouse-management/location-layout/layout.service.js`, `allocation.service.js`
  - `Model`: `ARAWMS_BE/src/models/WarehouseLayout.model.js`, `WarehouseLocation.model.js` (`zoneCode`, `rackCode`, `shelfCode`), `FabricRoll.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/WarehouseLayoutPage.jsx`, `ARAWMS_FE/src/components/WarehouseRackContents.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-20] Tuân thủ cấu trúc Zone -> Rack -> Shelf và ưu tiên xuất lô cũ nhất theo nguyên tắc FIFO
  const candidateRolls = await FabricRoll.find({
    materialId,
    status: 'ACTIVE_AVAILABLE',
  })
  .sort({ inboundDate: 1 }) // Cũ nhất lên đầu (FIFO)
  .populate('locationId', 'zoneCode rackCode shelfCode');
  ```

---

### GBR-21: Kỹ thuật may kiểm phẩm nguyên vật liệu trước khi nhập kho (Garment Technician Inbound Material Verification)
- **Rule Statement**: Raw materials delivered by suppliers cannot be received into active inventory until the Garment Technician physically verifies specifications and flags any delivery plan deviations.
- **Applies To**: Inbound Material Verification
- **Rationale**: Prevents accepting short deliveries, incorrect fabric widths, or defective yarn batches into production stock. (Chặn việc nhập kho vải thiếu hụt mét, sai khổ vải hoặc lỗi sợi dệt vào kho sản xuất).
- **Enforced By**: System locks inbound receipt ticket creation until the Garment Technician signs off on the inspection report. (Hệ thống khóa tạo phiếu nhập kho khả dụng cho đến khi Kỹ thuật may ký duyệt biên bản kiểm phẩm).
- **Rule Type**: `Constraint`
- **Source of rule**: Supplier Inbound Quality SOP
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/garment-technical/inbound-verification/inboundVerification.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/garment-technical/inbound-verification/inboundVerification.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/garment-technical/inbound-verification/inboundVerification.service.js`
  - `Model`: `ARAWMS_BE/src/models/MaterialTicket.model.js`, `MaterialInboundPlan.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/SupplierInboundPage.jsx`, `MaterialVerificationModal.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-21] Khóa sinh phiếu nhập nguyên vật liệu cho đến khi Kỹ thuật may nghiệm thu đạt thông số
  if (!inspectionReport || inspectionReport.verificationStatus !== 'PASSED_BY_TECHNICIAN') {
    throw new Error('[BR: GBR-21] Nguyên vật liệu phải được Kỹ thuật may kiểm phẩm đạt yêu cầu trước khi tạo phiếu nhập kho.');
  }
  ```

---

### GBR-22: Nghiệm thu KCS thành phẩm may mặc trước khi nhập kho thành phẩm (Finished Garment KCS Inspection Sign-Off)
- **Rule Statement**: Finished garments delivered from sewing workshops must pass physical quality control (KCS) by the Garment Technician before finished goods receipt tickets can be generated.
- **Applies To**: Finished Garment Inspection
- **Rationale**: Ensures only garments adhering to size specifications, seam standards, and proper labeling reach saleable stock. (Đảm bảo chỉ các sản phẩm đúng chuẩn kích thước may, đường may chắc chắn và đủ tem nhãn mới vào kho bán lẻ).
- **Enforced By**: System restricts finished goods receipt generation to quantities certified as passed in the KCS report. (Hệ thống chỉ cho phép tạo phiếu nhập kho thành phẩm đúng bằng số lượng đạt tiêu chuẩn trong biên bản KCS).
- **Rule Type**: `Constraint`
- **Source of rule**: Apparel Quality Assurance SOP
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/garment-technical/finished-inspection/finishedInspection.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/garment-technical/finished-inspection/finishedInspection.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/garment-technical/finished-inspection/finishedInspection.service.js`
  - `Model`: `ARAWMS_BE/src/models/FinishedGoodsTicket.model.js`, `FinishedGoodsBatch.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/FinishedGoodsPage.jsx`, `KcsInspectionModal.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-22] Chỉ cho phép nhập kho số lượng thành phẩm may mặc đã được KCS chứng nhận đạt chuẩn
  if (receiptQuantity > kcsReport.certifiedPassedQuantity) {
    throw new Error('[BR: GBR-22] Số lượng nhập kho không được vượt quá số lượng thành phẩm đạt chuẩn KCS.');
  }
  ```

---

### GBR-23: Quét mã vận đơn trả hàng và đính kèm Video khui kiện hoàn (Reverse Logistics Unboxing Scan & Video Evidence)
- **Rule Statement**: Warehouse staff processing customer return parcels must scan the return waybill and attach an unboxing inspection video URL prior to classifying item conditions and routing inventory.
- **Applies To**: Reverse Logistics & Unboxing
- **Rationale**: Establishes indisputable visual evidence to verify customer return conditions and justify surcharge deductions or carrier claims. (Tạo chứng cứ video không thể chối cãi để xác định hiện trạng hàng hoàn, phục vụ trừ phí hoặc khiếu nại đơn vị vận chuyển).
- **Enforced By**: System requires an uploaded video link as a mandatory field before submitting the unboxing inspection form. (Hệ thống bắt buộc nhập URL video khui kiện hoàn trước khi gửi biểu mẫu phân loại tình trạng hàng trả).
- **Rule Type**: `Constraint`
- **Source of rule**: Reverse Logistics Fraud Prevention
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/reverse-logistics/unboxing-inspection/unboxingInspection.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/reverse-logistics/unboxing-inspection/unboxingInspection.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/reverse-logistics/unboxing-inspection/unboxingInspection.service.js`
  - `Model`: `ARAWMS_BE/src/models/ReturnRequest.model.js` (`unboxingVideoUrl`, `returnWaybillCode`, `inspectionStatus`)
  - `Front-end`: `ARAWMS_FE/src/pages/reverse-logistics/UnboxingInspectionPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-23] Bắt buộc quét mã vận đơn trả hàng và lưu URL video khui kiện trước khi phân loại hàng hoàn
  if (!inspectionData.returnWaybillCode || !inspectionData.unboxingVideoUrl) {
    throw Object.assign(new Error('[BR: GBR-23] Bắt buộc quét mã vận đơn và đính kèm Video khui kiện hoàn.'), {
      statusCode: 400,
      code: 'UNBOXING_VIDEO_REQUIRED',
    });
  }
  ```

---

## 4. Hướng dẫn Dành cho AI Assistant & Developer

1. **Tuân thủ Traceability**: Khi viết mã nguồn ở bất kỳ tệp nào thuộc 5 tầng (Front-end, Route, Validation, Controller, Service, Model), lập trình viên và Trợ lý AI **bắt buộc mở `BR.md` này để đối chiếu mã `GBR-ID` tương ứng**.
2. **Cú pháp Chú thích Chuẩn**: Luôn gắn comment theo định dạng:
   ```javascript
   // [BR: GBR-xx] <nội dung tóm tắt quy tắc>
   ```
   ngay tại dòng lệnh rẽ nhánh, kiểm tra điều kiện hoặc tính toán.
3. **Đồng bộ hóa 2 chiều**: Khi nhận yêu cầu chỉnh sửa hoặc bổ sung quy tắc nghiệp vụ, phải cập nhật đồng bộ ở cả 2 nơi:
   - File tài liệu nghiệp vụ [BR.md](./BR.md)
   - Đoạn code và chú thích `@businessRule` / `// [BR: GBR-xx]` trong source code.
