# AraWMS Business Rules (BR.md)
> **Tài liệu Quản lý Quy tắc Nghiệp vụ Hệ thống AraWMS**  
> *Đặc tả 28 Business Rules cốt lõi (`GBR-01` đến `GBR-28`), đồng bộ với danh sách 117 Use Cases (`UC-001` – `UC-117`) và ánh xạ trực tiếp đến vị trí mã nguồn theo kiến trúc 5 tầng của dự án.*

---

## 1. Giới thiệu & Hướng dẫn sử dụng

### 1.1. Mục đích
Tài liệu này là **nguồn sự thật duy nhất (Single Source of Truth)** cho toàn bộ quy tắc nghiệp vụ trong hệ thống AraWMS. Mọi đoạn code thực thi nghiệp vụ trong Front-end và Back-end phải tham chiếu mã quy tắc tương ứng:
```javascript
// [BR: GBR-xx] <Tóm tắt logic thực thi quy tắc>
```
Định dạng này cho phép cả lập trình viên và Trợ lý AI dễ dàng kiểm tra, truy vết độ bao phủ (Traceability) và đảm bảo tính tuân thủ quy trình vận hành kho AraStore.

### 1.2. Phân loại Quy tắc (Rule Types)
1. **Constraint (Ràng buộc)**: Quy tắc bất biến, ngăn chặn các trạng thái không hợp lệ của dữ liệu hoặc luồng hoạt động (ví dụ: tài khoản vô hiệu hóa không được đăng nhập, độ dài mật khẩu, giới hạn OTP, mã SKU/RM duy nhất, khóa xuất nhập khi kiểm kê, hợp đồng ACTIVE bất biến).
2. **Action Enabler (Kích hoạt hành động)**: Quy tắc tự động kích hoạt một hành động tiếp theo khi một điều kiện được thỏa mãn (ví dụ: tự động khóa/yêu cầu đổi mật khẩu sau 5 lần nhập sai, tự động giữ chỗ kho khi xác nhận đơn, tự động cảnh báo tồn kho thấp, gắn Cờ đỏ chênh lệch COD).
3. **Computation (Công thức tính toán)**: Quy tắc định nghĩa công thức số học hoặc logic tính toán bắt buộc của hệ thống (ví dụ: tính phụ phí hoàn trả 10%, tự động đối soát chênh lệch COD qua GHN API, tính giá vốn FIFO COGS).

---

## 2. Bảng Tổng hợp Business Rules (Master Summary Table — GBR-01 đến GBR-28)

| GBR-ID | Rule Statement | Applies To | Rationale | Enforced By | Rule Type | Source of rule |
|:---:|---|---|---|---|:---:|---|
| **GBR-01** | Once a user account is deactivated, it cannot log into the system under any circumstances. | Account & Authentication Module | Ensures information security when staff members resign or have their privileges revoked. | System automatically checks the account status upon login. | `Constraint` | AraStore Store Security Policy |
| **GBR-02** | If an incorrect password is entered 5 consecutive times, will require users to change their password via email. | Login Feature | Prevents brute-force password guessing attacks. | System counts failed attempts and automatically locks the account. | `Action Enabler` | IT System Safety Regulations |
| **GBR-03** | User passwords must be at least 8 characters long (up to a maximum of 72 standard characters), and a new password cannot be the same as the current password. | Password Change & Reset Password | Ensures account passwords are strong enough and prevents users from reusing their existing password. | System checks the password length upon submission and rejects the request if the new password matches the old one. | `Constraint` | IT System Security Policy |
| **GBR-04** | Password reset links and email verification codes (OTP) are single-use only, expire after a short period (15 minutes for reset links, 5 minutes for OTP codes), and limit repeated requests or wrong attempts. | Forgot/Reset Password & Phone Verification | Protects accounts from unauthorized password resets and prevents spamming verification emails. | System expires links and codes automatically after the time limit, invalidates them once used, and limits resend frequency and wrong OTP entries to 5 attempts. | `Constraint` | Authentication Security Standard |
| **GBR-05** | Users must have a verified email address (via linking a Google account) before changing their phone number, and must confirm the new 10-digit phone number using a 6-digit verification code sent to that email. | Profile & Phone Verification | Prevents unauthorized changes to personal contact details and guarantees valid mobile numbers. | System blocks direct phone edits without email verification and requires entering the 6-digit email verification code before saving. | `Constraint` | Account Verification Policy |
| **GBR-06** | SKU codes and Raw Material (RM) codes must be unique across the entire system. | Product & Raw Material Management | Prevents duplication and confusion of goods in inventory. | System enforces uniqueness check upon code creation/modification. | `Constraint` | AraStore Warehouse Management Operations |
| **GBR-07** | Every whole fabric roll and returned remnant fabric roll entering the warehouse must have a unique barcode label linked to its physical FIFO shelf location and inbound timestamp. | Fabric Roll Management | Enables roll-level traceability and guarantees automated First-In, First-Out (FIFO) material issuance suggestions. | System mandates printing and scanning unique roll barcodes during inbound put-away before inventory is recognized. | `Constraint` | Raw & Auxiliary Material Warehouse Labeling Process |
| **GBR-08** | If the available inventory of an SKU drops below the Min Stock Threshold, the system must trigger a low stock alert. | Inventory Management & Alerts | Enables timely reordering or supplementary production to avoid supply chain disruptions. | System compares available inventory with the threshold after each stock issue transaction. | `Action Enabler` | Minimum Stock Reserve Policy |
| **GBR-09** | Leftover fabric after cutting must be measured by the Garment Technician; remnants meeting or exceeding the configured threshold (default 2.0m) trigger a remnant recovery request with a new roll barcode, while pieces below the threshold are disposed of as scrap. | Remnant Recovery | Prevents fabric scrap leakage and standardizes the re-utilization of usable leftover materials. | System validates measured remnant length against defaultFabricLeftoverThresholdMeters from SystemSetting before generating an inbound ticket. | `Constraint` | Garment Technical & Wastage Policy |
| **GBR-10** | When a sales order is confirmed in the chat interface, the system must immediately allocate and transfer the required SKU quantity from Available Inventory to Reserved Inventory. | Order Fulfillment & Stock Allocation | Eliminates race conditions and prevents overselling during concurrent seller chats. | System checks available stock and executes an atomic reservation transaction upon order confirmation. | `Action Enabler` | Conversational Commerce SOP |
| **GBR-11** | Canceled orders will automatically release reserved inventory quantities back to Available Inventory. | Order Management & Cancellation | Accurately updates available stock quantities for other customers. | System automatically adds quantities back to Available Inventory when order status changes to Cancelled. | `Action Enabler` | Order Cancellation Handling Regulation |
| **GBR-12** | Warehouse staff must perform dual-scan verification (Order Code + SKU Barcode) and attach a valid packaging video recording URL before the order can be marked as packed and stock deducted from on-hand inventory. | Order Packing & Fulfillment | Eradicates picking errors, mis-shipments, and provides immutable visual evidence against customer dispute claims. | System blocks waybill generation and on-hand stock deduction until all item barcodes match and a video link is stored. | `Constraint` | Warehouse Shipping & Quality SOP |
| **GBR-13** | Every package handed over to the carrier (GHN) must have a Waybill Label and be recorded in the Handover Report. | Carrier Handover | Serves as a basis for reconciling physical handed-over packages and resolving lost claims. | System requires scanning the Waybill code to confirm inclusion in the Handover Report. | `Constraint` | AraStore - Carrier Goods Handover Regulation |
| **GBR-14** | Customer returns caused by customer fault (missing brand tags or soiled/stained fabric) shall incur a 10% non-compliance surcharge calculated on the returned merchandise value upon financial settlement. | Return Financial Settlement | Compensates the business for reprocessing, cleaning, re-tagging, and warehouse handling expenses. | Formula: Refund Amount = Product Value * 90% - Shipping Fee (if any) | `Computation` | AraStore Return & Exchange Policy |
| **GBR-15** | Returned goods due to manufacturing defects or wrong item delivery are 100% exempt from return surcharges and incurred shipping fees. | Return & Exchange Management | Ensures customer rights when the fault lies with the store. | System calculates Refund Amount = 100% Product Value when return reason is store fault. | `Action Enabler` | Consumer Protection Policy |
| **GBR-16** | Garments flagged as defective (during finished goods KCS or return unboxing inspection) must be strictly isolated into the Defect Quarantine zone and excluded from active retail available stock. | Defect Warehouse Management | Prevents inventory pollution and ensures damaged or sub-standard garments are not dispatched to customers. | System automatically sets quarantine flags and blocks allocation of quarantined units to sales orders. | `Constraint` | Quality Control Classification Process |
| **GBR-17** | Every Cash-In and Cash-Out operational voucher must strictly reference a valid source document (Supplier Contract Code, Inbound Delivery Plan, Order Code, COD Batch Code, or RMA Code). | Operational Cash Flow Management | Ensures cash flow transparency and traceability of financial receipts and disbursements. | System enforces mandatory selection and validation of a persistent foreign reference ID before creating vouchers. | `Constraint` | Enterprise Accounting Regulations |
| **GBR-18** | When running automated COD reconciliation, the system must query live shipment details from the shipping carrier API (GHN) per waybill, match collected COD amounts against system-expected values, and highlight discrepancies line-by-line. | COD Reconciliation | Eliminates manual checking and detects courier underpayments or unauthorized shipping deductions. | The system calls GHN shipping-order/detail API, compares reported COD amounts with expected order values, and categorizes row statuses. | `Computation` | Carrier Financial Reconciliation Contract |
| **GBR-19** | Any sales order exhibiting a discrepancy between carrier-remitted COD and expected order value must be tagged with a Red Flag, preventing batch settlement until investigated or escalated to a carrier dispute. | COD Reconciliation & Claims | Protects business revenue and isolates financial leakage from shipping partner settlement errors. | System automatically flags items with non-zero variance and routes them to the Red Flag resolution queue. | `Action Enabler` | COD Loss Risk Control Process |
| **GBR-20** | Cost of Goods Sold (COGS) for each issued order must be calculated automatically based on the allocated FIFO batch unit. | Cost Accounting & Profitability | Guarantees accurate order-level gross profit margin analysis and reliable executive P&L financial reporting. | System snapshots and binds batch unit costs to sales order item records at the moment of packaging completion. | `Computation` | Fashion Inventory Costing SOP |
| **GBR-21** | A stock audit session can only be closed (Completed) after all quantity discrepancy vouchers have been processed or approved for adjustment. | Stock Audit Management | Ensures thorough resolution of inventory discrepancies before finalizing the audit ledger. | System checks the status of related adjustment vouchers before allowing audit session closure. | `Constraint` | AraStore Periodic Inventory Audit Regulation |
| **GBR-22** | Inventory count discrepancies exceeding the minor threshold and all aging stock clearance plans require mandatory review and authorization by the Store Owner. | Stocktake Audit & Approval | Prevents internal inventory fraud and maintains governance over high-value stock adjustments. | System evaluates total discrepancy quantities/values and routes approval tasks between Manager and Owner. | `Action Enabler` | Internal Audit & Authority Policy |
| **GBR-23** | The system must enforce a three-tier physical warehouse topology (Zone -> Rack -> Shelf) and prioritize the oldest available stock for cutting issuance and pick-list generation per FIFO rules. | Warehouse Topology & Stock Issuance | Prevents fabric expiration, aging, and fabric shade variations by ensuring oldest materials are consumed first. | System automatically sorts candidate batches/rolls by ascending inbound timestamp and outputs prioritized shelf locations. | `Constraint` | Standard FIFO Warehousing Policy |
| **GBR-24** | Raw materials delivered by suppliers cannot be received into active inventory until the Garment Technician physically verifies specifications and flags any delivery plan deviations. | Inbound Material Verification | Prevents accepting short deliveries, incorrect fabric widths, or defective yarn batches into production stock. | System locks inbound receipt ticket creation until the Garment Technician signs off on the inspection report. | `Constraint` | Supplier Inbound Quality SOP |
| **GBR-25** | Finished garments delivered from sewing workshops must pass physical quality control (KCS) by the Garment Technician before finished goods receipt tickets can be generated. | Finished Garment Inspection | Ensures only garments adhering to size specifications, seam standards, and proper labeling reach saleable stock. | System restricts finished goods receipt generation to quantities certified as passed in the KCS report. | `Constraint` | Apparel Quality Assurance SOP |
| **GBR-26** | Garment Technicians processing customer return parcels must scan the return order/waybill and attach an unboxing inspection video URL prior to classifying item conditions and routing inventory. | Reverse Logistics & Unboxing | Establishes indisputable visual evidence to verify customer return conditions and justify surcharge deductions or carrier claims. | System requires an uploaded video link before submitting the return inspection form. | `Constraint` | Reverse Logistics Fraud Prevention |
| **GBR-27** | During an active scheduled stocktake session, all warehouse stock-in/stock-out movements and order packing operations are automatically locked. | Stocktake & Order Packing | Guarantees inventory snapshot integrity by preventing stock changes while physical counting is underway. | System checks active stocktake windows and blocks packing or warehouse writes. | `Constraint` | Stocktake Data Integrity |
| **GBR-28** | Active Supplier Contracts are immutable; any contractual modification must be saved as a new sequential amendment version while preserving older versions as Superseded. | Supplier Contract Governance | Preserves a 100% intact legal and financial audit trail for supplier agreements and payables. | System blocks direct edits on ACTIVE contracts and creates V2, V3 records with amendmentReason. | `Constraint` | Legal & Audit Compliance Policy |

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
- **Enforced By**: System automatically checks the account status upon login.
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Store Security Policy
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.controller.js` (`login`)
  - `Service`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.service.js`, `googleAuth.service.js`
  - `Middleware`: `ARAWMS_BE/src/common/middlewares/authenticate.js`
  - `Model`: `ARAWMS_BE/src/models/User.model.js` (`status`)
  - `Front-end`: `ARAWMS_FE/src/pages/LoginPage.jsx`, `ARAWMS_FE/src/services/api.js`

---

### GBR-02: Bắt buộc đổi mật khẩu qua Email sau 5 lần nhập sai liên tiếp (Password Brute-force Lock & Reset)
- **Rule Statement**: If an incorrect password is entered 5 consecutive times, will require users to change their password via email.
- **Applies To**: Login Feature
- **Rationale**: Prevents brute-force password guessing attacks. (Phòng chống tấn công dò mật khẩu tự động).
- **Enforced By**: System counts failed attempts and automatically locks the account.
- **Rule Type**: `Action Enabler`
- **Source of rule**: IT System Safety Regulations
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.service.js`, `passwordRecovery.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/system-administration/authentication/auth.controller.js`
  - `Model`: `ARAWMS_BE/src/models/User.model.js` (`failedLoginAttempts`, `status: 'LOCKED'`, `passwordResetRequired`)
  - `Front-end`: `ARAWMS_FE/src/pages/LoginPage.jsx`

---

### GBR-03: Độ dài mật khẩu (8–72 ký tự) & Cấm dùng lại mật khẩu hiện tại (Password Policy & No Reuse)
- **Rule Statement**: User passwords must be at least 8 characters long (up to a maximum of 72 standard characters), and a new password cannot be the same as the current password.
- **Applies To**: Password Change & Reset Password
- **Rationale**: Ensures account passwords are strong enough and prevents users from reusing their existing password. (Đảm bảo độ mạnh mật khẩu và ngăn việc đặt lại trùng mật khẩu cũ).
- **Enforced By**: System checks the password length upon submission and rejects the request if the new password matches the old one.
- **Rule Type**: `Constraint`
- **Source of rule**: IT System Security Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/system-administration/account-governance/accountGovernance.service.js`, `ARAWMS_BE/src/modules/system-administration/authentication/passwordRecovery.service.js`
  - `Model`: `ARAWMS_BE/src/models/User.model.js` (`passwordHash`)
  - `Front-end`: Trang đổi mật khẩu & đặt lại mật khẩu tài khoản cá nhân

---

### GBR-04: Link đặt lại mật khẩu & mã OTP dùng 1 lần, có hạn và giới hạn lần thử (Single-Use Expiring Reset Link & OTP)
- **Rule Statement**: Password reset links and email verification codes (OTP) are single-use only, expire after a short period (15 minutes for reset links, 5 minutes for OTP codes), and limit repeated requests or wrong attempts.
- **Applies To**: Forgot/Reset Password & Phone Verification
- **Rationale**: Protects accounts from unauthorized password resets and prevents spamming verification emails. (Bảo vệ tài khoản khỏi đặt lại mật khẩu trái phép và chống spam gửi email).
- **Enforced By**: System expires links and codes automatically after the time limit, invalidates them once used, and limits resend frequency and wrong OTP entries to 5 attempts.
- **Rule Type**: `Constraint`
- **Source of rule**: Authentication Security Standard
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/system-administration/authentication/passwordRecovery.service.js`, `ARAWMS_BE/src/modules/system-administration/account-governance/phoneChange.service.js`
  - `Model`: `ARAWMS_BE/src/models/PhoneChangeChallenge.model.js`, `ARAWMS_BE/src/models/User.model.js`

---

### GBR-05: Xác minh Email (qua Google) & OTP 6 số trước khi đổi SĐT (Verified Email & OTP Phone Change)
- **Rule Statement**: Users must have a verified email address (via linking a Google account) before changing their phone number, and must confirm the new 10-digit phone number using a 6-digit verification code sent to that email.
- **Applies To**: Profile & Phone Verification
- **Rationale**: Prevents unauthorized changes to personal contact details and guarantees valid mobile numbers. (Ngăn thay đổi thông tin liên hệ trái phép và đảm bảo số điện thoại 10 chữ số hợp lệ).
- **Enforced By**: System blocks direct phone edits without email verification and requires entering the 6-digit email verification code before saving.
- **Rule Type**: `Constraint`
- **Source of rule**: Account Verification Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/system-administration/account-governance/googleLink.service.js`, `ARAWMS_BE/src/modules/system-administration/account-governance/phoneChange.service.js`
  - `Model`: `ARAWMS_BE/src/models/User.model.js` (`googleId`, `googleEmail`, `phone`), `ARAWMS_BE/src/models/PhoneChangeChallenge.model.js`

---

### GBR-06: Tính duy nhất của mã SKU và mã Nguyên vật liệu (Unique SKU & RM Codes)
- **Rule Statement**: SKU codes and Raw Material (RM) codes must be unique across the entire system.
- **Applies To**: Product & Raw Material Management
- **Rationale**: Prevents duplication and confusion of goods in inventory.
- **Enforced By**: System enforces uniqueness check upon code creation/modification.
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Warehouse Management Operations
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/warehouse-management/products/product.service.js`, `productConfiguration.service.js`, `ARAWMS_BE/src/modules/garment-technical/raw-materials/rawMaterials.service.js`, `ARAWMS_BE/src/modules/order-fulfillment/marketplace-order-import/marketplaceOrderImport.service.js`
  - `Model / DB`: `ARAWMS_BE/src/models/Sku.model.js` (`skuCode` unique), `ARAWMS_BE/src/models/RawMaterial.model.js` (`materialCode` unique)

---

### GBR-07: Tem Barcode định danh cuộn vải gắn với vị trí kệ FIFO (Fabric Roll Barcode & FIFO Shelf Location)
- **Rule Statement**: Every whole fabric roll and returned remnant fabric roll entering the warehouse must have a unique barcode label linked to its physical FIFO shelf location and inbound timestamp.
- **Applies To**: Fabric Roll Management
- **Rationale**: Enables roll-level traceability and guarantees automated First-In, First-Out (FIFO) material issuance suggestions.
- **Enforced By**: System mandates printing and scanning unique roll barcodes during inbound put-away before inventory is recognized.
- **Rule Type**: `Constraint`
- **Source of rule**: Raw & Auxiliary Material Warehouse Labeling Process
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/raw-material-warehousing/inbound-execution/inboundExecution.service.js`, `supplierReceipt.service.js`, `ARAWMS_BE/src/modules/warehouse-management/location-layout/materialPutaway.service.js`, `binLabel.service.js`
  - `Model`: `ARAWMS_BE/src/models/FabricRoll.model.js`, `ARAWMS_BE/src/models/WarehouseLocation.model.js`

---

### GBR-08: Cảnh báo tồn kho thấp khi chạm ngưỡng Min Stock (SKU Low Stock Alert)
- **Rule Statement**: If the available inventory of an SKU drops below the Min Stock Threshold, the system must trigger a low stock alert.
- **Applies To**: Inventory Management & Alerts
- **Rationale**: Enables timely reordering or supplementary production to avoid supply chain disruptions.
- **Enforced By**: System compares available inventory with the threshold after each stock issue transaction.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Minimum Stock Reserve Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/conversational-commerce/inventory-widget/inventoryWidget.service.js`, `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.service.js`, `ARAWMS_BE/src/modules/warehouse-management/products/product.service.js`
  - `Model`: `ARAWMS_BE/src/models/Sku.model.js` (`safetyStockThreshold`, `onHandQty`, `reservedQty`), `ARAWMS_BE/src/models/Notification.model.js` (`STOCK_ALERT`)

---

### GBR-09: Phân loại và thu hồi vải thừa sau cắt theo ngưỡng cấu hình (Remnant Recovery Threshold)
- **Rule Statement**: Leftover fabric after cutting must be measured by the Garment Technician; remnants meeting or exceeding the configured threshold (default 2.0m) trigger a remnant recovery request with a new roll barcode, while pieces below the threshold are disposed of as scrap.
- **Applies To**: Remnant Recovery
- **Rationale**: Prevents fabric scrap leakage and standardizes the re-utilization of usable leftover materials.
- **Enforced By**: System validates measured remnant length against `defaultFabricLeftoverThresholdMeters` from `SystemSetting` before generating an inbound ticket.
- **Rule Type**: `Constraint`
- **Source of rule**: Garment Technical & Wastage Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/garment-technical/remnant-recovery/remnantRecovery.service.js`, `remnantReturn.service.js`, `ARAWMS_BE/src/modules/system-administration/system-settings/systemSettings.service.js`
  - `Model`: `ARAWMS_BE/src/models/RemnantRecoveryRequest.model.js`, `ARAWMS_BE/src/models/SystemSetting.model.js` (`defaultFabricLeftoverThresholdMeters`), `ARAWMS_BE/src/models/FabricRoll.model.js`

---

### GBR-10: Giữ chỗ kho tức thời khi xác nhận đơn trong chat (Conversational Order Reservation)
- **Rule Statement**: When a sales order is confirmed in the chat interface, the system must immediately allocate and transfer the required SKU quantity from Available Inventory to Reserved Inventory.
- **Applies To**: Order Fulfillment & Stock Allocation
- **Rationale**: Eliminates race conditions and prevents overselling during concurrent seller chats.
- **Enforced By**: System checks available stock and executes an atomic reservation transaction upon order confirmation.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Conversational Commerce SOP
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.service.js` (`createDirectOrder`, `confirmOrderReserve`), `ARAWMS_BE/src/modules/order-fulfillment/marketplace-order-import/marketplaceOrderImport.service.js`, `ARAWMS_BE/src/modules/reverse-logistics/customer-exchange-processing/customerExchangeProcessing.service.js`
  - `Model`: `ARAWMS_BE/src/models/Sku.model.js` (`reservedQty`), `ARAWMS_BE/src/models/SalesOrder.model.js`, `ARAWMS_BE/src/models/InventoryTransaction.model.js`

---

### GBR-11: Tự động hoàn trả tồn giữ chỗ khi hủy đơn hàng (Order Cancellation Stock Release)
- **Rule Statement**: Canceled orders will automatically release reserved inventory quantities back to Available Inventory.
- **Applies To**: Order Management & Cancellation
- **Rationale**: Accurately updates available stock quantities for other customers.
- **Enforced By**: System automatically adds quantities back to Available Inventory when order status changes to Cancelled.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Order Cancellation Handling Regulation
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.routes.js` (`POST /:id/cancel`)
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.controller.js` (`cancelOrder`)
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.service.js` (`cancelOrder`)
  - `Model`: `ARAWMS_BE/src/models/Sku.model.js`, `ARAWMS_BE/src/models/SalesOrder.model.js`, `ARAWMS_BE/src/models/InventoryTransaction.model.js`

---

### GBR-12: Quét kép mã vạch và đính kèm Video đóng gói (Dual-Scan Verification & Packaging Video Recording)
- **Rule Statement**: Warehouse staff must perform dual-scan verification (Order Code + SKU Barcode) and attach a valid packaging video recording URL before the order can be marked as packed and stock deducted from on-hand inventory.
- **Applies To**: Order Packing & Fulfillment
- **Rationale**: Eradicates picking errors, mis-shipments, and provides immutable visual evidence against customer dispute claims.
- **Enforced By**: System blocks waybill generation and on-hand stock deduction until all item barcodes match and a video link is stored.
- **Rule Type**: `Constraint`
- **Source of rule**: Warehouse Shipping & Quality SOP
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/order-fulfillment/packing-verification/packingVerification.routes.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/packing-verification/packingVerification.service.js`, `packingStock.service.js`, `packingVideo.service.js`
  - `Model`: `ARAWMS_BE/src/models/PackingSession.js`, `PackingScanEvent.js`, `PackingVideo.js`, `SalesOrder.model.js`

---

### GBR-13: Mã vận đơn và Biên bản bàn giao bưu tá GHN (Carrier Waybill & Handover Report)
- **Rule Statement**: Every package handed over to the carrier (GHN) must have a Waybill Label and be recorded in the Handover Report.
- **Applies To**: Carrier Handover
- **Rationale**: Serves as a basis for reconciling physical handed-over packages and resolving lost claims.
- **Enforced By**: System requires scanning the Waybill code to confirm inclusion in the Handover Report.
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore - Carrier Goods Handover Regulation
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/shipping/shipping.service.js`, `ARAWMS_BE/src/modules/ghn/ghn.service.js`, `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.service.js`
  - `Model`: `ARAWMS_BE/src/models/SalesOrder.model.js`, `ARAWMS_BE/src/models/ShippingCarrier.model.js`

---

### GBR-14: Khấu trừ 10% phụ phí hoàn trả do lỗi khách hàng (Customer Return 10% Surcharge Calculation)
- **Rule Statement**: Customer returns caused by customer fault (missing brand tags or soiled/stained fabric) shall incur a 10% non-compliance surcharge calculated on the returned merchandise value upon financial settlement.
- **Formula**: `Refund Amount = Product Value * 90% - Shipping Fee (if any)`
- **Applies To**: Return Financial Settlement
- **Rationale**: Compensates the business for reprocessing, cleaning, re-tagging, and warehouse handling expenses.
- **Enforced By**: Formula: `Refund Amount = Product Value * 90% - Shipping Fee (if any)`
- **Rule Type**: `Computation`
- **Source of rule**: AraStore Return & Exchange Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.service.js`, `returnMerchandiseAuthorization.rules.js`
  - `Model`: `ARAWMS_BE/src/models/ReturnRequest.model.js`

---

### GBR-15: Miễn 100% phụ phí và phí ship khi lỗi do nhà sản xuất hoặc giao sai (Store Fault Free Return)
- **Rule Statement**: Returned goods due to manufacturing defects or wrong item delivery are 100% exempt from return surcharges and incurred shipping fees.
- **Formula**: `Refund Amount = 100% Product Value`
- **Applies To**: Return & Exchange Management
- **Rationale**: Ensures customer rights when the fault lies with the store.
- **Enforced By**: System calculates `Refund Amount = 100% Product Value` when return reason is store fault.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Consumer Protection Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.service.js`, `returnMerchandiseAuthorization.rules.js`
  - `Model`: `ARAWMS_BE/src/models/ReturnRequest.model.js`

---

### GBR-16: Cô lập hàng lỗi vào Kho cách ly (Defect Quarantine Zone Isolation)
- **Rule Statement**: Garments flagged as defective (during finished goods KCS or return unboxing inspection) must be strictly isolated into the Defect Quarantine zone and excluded from active retail available stock.
- **Applies To**: Defect Warehouse Management
- **Rationale**: Prevents inventory pollution and ensures damaged or sub-standard garments are not dispatched to customers.
- **Enforced By**: System automatically sets quarantine flags and blocks allocation of quarantined units to sales orders.
- **Rule Type**: `Constraint`
- **Source of rule**: Quality Control Classification Process
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/finished-goods-warehousing/defect-quarantine/defectQuarantine.service.js`, `ARAWMS_BE/src/modules/warehouse-management/products/defectWarehouse.service.js`, `ARAWMS_BE/src/modules/garment-technical/return-inspection/returnInspection.service.js`
  - `Model`: `ARAWMS_BE/src/models/ProductUnit.js`, `ARAWMS_BE/src/models/Sku.model.js`, `ARAWMS_BE/src/models/WarehouseLocation.model.js`

---

### GBR-17: Bắt buộc chứng từ gốc cho phiếu Thu / Chi (Mandatory Source Document for Cash Vouchers)
- **Rule Statement**: Every Cash-In and Cash-Out operational voucher must strictly reference a valid source document (Supplier Contract Code, Inbound Delivery Plan, Order Code, COD Batch Code, or RMA Code).
- **Applies To**: Operational Cash Flow Management
- **Rationale**: Ensures cash flow transparency and traceability of financial receipts and disbursements.
- **Enforced By**: System enforces mandatory selection and validation of a persistent foreign reference ID before creating vouchers.
- **Rule Type**: `Constraint`
- **Source of rule**: Enterprise Accounting Regulations
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/accounts-payable/accountsPayable.service.js`, `ARAWMS_BE/src/modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.service.js` (`submitRefundRequest`, `approveRefundRequest`)
  - `Model`: `ARAWMS_BE/src/models/CashFlowVoucher.model.js`

---

### GBR-18: Đối soát COD tự động qua GHN API từng mã vận đơn (Live GHN API Automated COD Reconciliation)
- **Rule Statement**: When running automated COD reconciliation, the system must query live shipment details from the shipping carrier API (GHN) per waybill, match collected COD amounts against system-expected values, and highlight discrepancies line-by-line.
- **Applies To**: COD Reconciliation
- **Rationale**: Eliminates manual checking and detects courier underpayments or unauthorized shipping deductions.
- **Enforced By**: The system calls GHN `shipping-order/detail` API, compares reported COD amounts with expected order values, and categorizes row statuses.
- **Rule Type**: `Computation`
- **Source of rule**: Carrier Financial Reconciliation Contract
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/cod-reconciliation/codReconciliation.service.js`, `ARAWMS_BE/src/modules/ghn/ghn.service.js`
  - `Model`: `ARAWMS_BE/src/models/CodReconciliationBatch.model.js`, `ARAWMS_BE/src/models/CodReconciliationItem.model.js`

---

### GBR-19: Gắn Cờ đỏ ngăn quyết toán khi có chênh lệch tiền COD (Red Flag Isolation for COD Discrepancies)
- **Rule Statement**: Any sales order exhibiting a discrepancy between carrier-remitted COD and expected order value must be tagged with a Red Flag, preventing batch settlement until investigated or escalated to a carrier dispute.
- **Applies To**: COD Reconciliation & Claims
- **Rationale**: Protects business revenue and isolates financial leakage from shipping partner settlement errors.
- **Enforced By**: System automatically flags items with non-zero variance and routes them to the Red Flag resolution queue.
- **Rule Type**: `Action Enabler`
- **Source of rule**: COD Loss Risk Control Process
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/carrier-dispute/carrierDispute.service.js`, `codReconciliation.service.js`
  - `Model`: `ARAWMS_BE/src/models/CodReconciliationItem.model.js` (`isRedFlag`)

---

### GBR-20: Tự động tính giá vốn hàng bán theo lô FIFO (FIFO Batch Unit Cost of Goods Sold - COGS)
- **Rule Statement**: Cost of Goods Sold (COGS) for each issued order must be calculated automatically based on the allocated FIFO batch unit.
- **Applies To**: Cost Accounting & Profitability
- **Rationale**: Guarantees accurate order-level gross profit margin analysis and reliable executive P&L financial reporting.
- **Enforced By**: System snapshots and binds batch unit costs to sales order item records at the moment of packaging completion.
- **Rule Type**: `Computation`
- **Source of rule**: Fashion Inventory Costing SOP
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/packing-verification/packingStock.service.js`, `ARAWMS_BE/src/modules/managerial-financial-analytics/financial-reports/financialReports.service.js`
  - `Model`: `ARAWMS_BE/src/models/SalesOrder.model.js`, `ARAWMS_BE/src/models/InventoryTransaction.model.js`

---

### GBR-21: Điều kiện đóng phiên kiểm kê kho (Stock Audit Session Completion Condition)
- **Rule Statement**: A stock audit session can only be closed (Completed) after all quantity discrepancy vouchers have been processed or approved for adjustment.
- **Applies To**: Stock Audit Management
- **Rationale**: Ensures thorough resolution of inventory discrepancies before finalizing the audit ledger.
- **Enforced By**: System checks the status of related adjustment vouchers before allowing audit session closure.
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Periodic Inventory Audit Regulation
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/inventory-auditing/stocktake-session/stocktakeSession.service.js`, `stocktakeAdjustment.service.js`, `stocktakeReview.service.js`
  - `Model`: `ARAWMS_BE/src/models/StocktakeSession.model.js`, `ARAWMS_BE/src/models/StocktakeRecord.model.js`

---

### GBR-22: Phê duyệt của Chủ cửa hàng cho chênh lệch kiểm kê lớn và xả hàng tồn lâu (Owner Approval for High-Value Variance & Aging Stock)
- **Rule Statement**: Inventory count discrepancies exceeding the minor threshold and all aging stock clearance plans require mandatory review and authorization by the Store Owner.
- **Applies To**: Stocktake Audit & Approval
- **Rationale**: Prevents internal inventory fraud and maintains governance over high-value stock adjustments.
- **Enforced By**: System evaluates total discrepancy quantities/values and routes approval tasks between Manager and Owner.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Internal Audit & Authority Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/inventory-auditing/variance-analysis/varianceAnalysis.service.js`, `ARAWMS_BE/src/modules/inventory-auditing/stock-adjustment/stockAdjustment.service.js`
  - `Model`: `ARAWMS_BE/src/models/StocktakeSession.model.js`, `ARAWMS_BE/src/models/StocktakeRecord.model.js`

---

### GBR-23: Cấu trúc kho 3 cấp (Zone -> Rack -> Shelf) và xuất kho FIFO (Three-Tier Warehouse Topology & FIFO Stock Issuance)
- **Rule Statement**: The system must enforce a three-tier physical warehouse topology (Zone -> Rack -> Shelf) and prioritize the oldest available stock for cutting issuance and pick-list generation per FIFO rules.
- **Applies To**: Warehouse Topology & Stock Issuance
- **Rationale**: Prevents fabric expiration, aging, and fabric shade variations by ensuring oldest materials are consumed first.
- **Enforced By**: System automatically sorts candidate batches/rolls by ascending inbound timestamp and outputs prioritized shelf locations.
- **Rule Type**: `Constraint`
- **Source of rule**: Standard FIFO Warehousing Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/warehouse-management/location-layout/layout.service.js`, `allocation.service.js`, `ARAWMS_BE/src/modules/raw-material-warehousing/outbound-execution/outboundExecution.service.js`
  - `Model`: `ARAWMS_BE/src/models/WarehouseLayout.model.js`, `ARAWMS_BE/src/models/WarehouseLocation.model.js`, `ARAWMS_BE/src/models/FabricRoll.model.js`

---

### GBR-24: Kỹ thuật may kiểm phẩm nguyên vật liệu trước khi nhập kho (Garment Technician Inbound Material Verification)
- **Rule Statement**: Raw materials delivered by suppliers cannot be received into active inventory until the Garment Technician physically verifies specifications and flags any delivery plan deviations.
- **Applies To**: Inbound Material Verification
- **Rationale**: Prevents accepting short deliveries, incorrect fabric widths, or defective yarn batches into production stock.
- **Enforced By**: System locks inbound receipt ticket creation until the Garment Technician signs off on the inspection report.
- **Rule Type**: `Constraint`
- **Source of rule**: Supplier Inbound Quality SOP
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/garment-technical/inbound-verification/inboundVerification.service.js`, `ARAWMS_BE/src/modules/raw-material-warehousing/inbound-execution/technicianInboundRequest.service.js`
  - `Model`: `ARAWMS_BE/src/models/MaterialTicket.model.js`, `ARAWMS_BE/src/models/MaterialInboundPlan.model.js`

---

### GBR-25: Nghiệm thu KCS thành phẩm may mặc trước khi nhập kho thành phẩm (Finished Garment KCS Inspection Sign-Off)
- **Rule Statement**: Finished garments delivered from sewing workshops must pass physical quality control (KCS) by the Garment Technician before finished goods receipt tickets can be generated.
- **Applies To**: Finished Garment Inspection
- **Rationale**: Ensures only garments adhering to size specifications, seam standards, and proper labeling reach saleable stock.
- **Enforced By**: System restricts finished goods receipt generation to quantities certified as passed in the KCS report.
- **Rule Type**: `Constraint`
- **Source of rule**: Apparel Quality Assurance SOP
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/garment-technical/finished-inspection/finishedInspection.service.js`, `ARAWMS_BE/src/modules/garment-technical/lot-management/lotManagement.service.js`
  - `Model`: `ARAWMS_BE/src/models/FinishedGoodsTicket.model.js`, `ARAWMS_BE/src/models/GarmentLot.model.js`

---

### GBR-26: Kỹ thuật may quét vận đơn & đính kèm Video khui kiện hoàn (Garment Technician Unboxing Scan & Video Evidence)
- **Rule Statement**: Garment Technicians processing customer return parcels must scan the return order/waybill and attach an unboxing inspection video URL prior to classifying item conditions and routing inventory.
- **Applies To**: Reverse Logistics & Unboxing
- **Rationale**: Establishes indisputable visual evidence to verify customer return conditions and justify surcharge deductions or carrier claims.
- **Enforced By**: System requires an uploaded video link before submitting the return inspection form.
- **Rule Type**: `Constraint`
- **Source of rule**: Reverse Logistics Fraud Prevention
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/garment-technical/return-inspection/returnInspection.service.js`, `returnInspectionVideo.service.js`, `ARAWMS_BE/src/modules/reverse-logistics/unboxing-inspection/unboxingInspection.service.js`
  - `Model`: `ARAWMS_BE/src/models/ReturnInspection.model.js`, `ARAWMS_BE/src/models/ReturnRequest.model.js`

---

### GBR-27: Tự động khóa Xuất/Nhập kho và Đóng hàng khi đang kiểm kê (Active Stocktake Warehouse & Packing Lock)
- **Rule Statement**: During an active scheduled stocktake session, all warehouse stock-in/stock-out movements and order packing operations are automatically locked.
- **Applies To**: Stocktake & Order Packing
- **Rationale**: Guarantees inventory snapshot integrity by preventing stock changes while physical counting is underway. (Đảm bảo tính toàn vẹn số liệu tồn kho, ngăn biến động xuất nhập trong lúc đang đếm vật lý).
- **Enforced By**: System checks active stocktake windows and blocks packing or warehouse writes.
- **Rule Type**: `Constraint`
- **Source of rule**: Stocktake Data Integrity
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/inventory-auditing/stocktake-session/stocktakeSession.service.js`, `ARAWMS_BE/src/modules/order-fulfillment/packing-verification/packingStocktakeLock.js`, `ARAWMS_BE/src/modules/warehouse-management/products/warehouseInboundProgress.service.js`
  - `Model`: `ARAWMS_BE/src/models/StocktakeSession.model.js`, `ARAWMS_BE/src/models/WarehouseLocation.model.js` (`isFrozenForStocktake`)

---

### GBR-28: Bất biến Hợp đồng Nhà cung cấp đang hiệu lực & Phiên bản tu chỉnh (Immutable Active Supplier Contracts & Versioning)
- **Rule Statement**: Active Supplier Contracts are immutable; any contractual modification must be saved as a new sequential amendment version while preserving older versions as Superseded.
- **Applies To**: Supplier Contract Governance
- **Rationale**: Preserves a 100% intact legal and financial audit trail for supplier agreements and payables. (Bảo toàn 100% vết pháp lý và công nợ đối với các thỏa thuận nhà cung cấp).
- **Enforced By**: System blocks direct edits on `ACTIVE` contracts and creates `V2`, `V3` records with `amendmentReason`.
- **Rule Type**: `Constraint`
- **Source of rule**: Legal & Audit Compliance Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/supplier-contracts/contract-workspace/contractWorkspace.service.js`, `ARAWMS_BE/src/modules/supplier-contracts/inbound-planning/inboundPlanning.service.js`
  - `Model`: `ARAWMS_BE/src/models/SupplierContract.model.js` (`versionNumber`, `status: 'SUPERSEDED'`, `amendmentReason`)

---

## 4. Hướng dẫn Dành cho AI Assistant & Developer

1. **Tuân thủ Traceability**: Khi viết mã nguồn ở bất kỳ tệp nào thuộc 5 tầng (Front-end, Route, Validation, Controller, Service, Model), lập trình viên và Trợ lý AI **bắt buộc mở `BR.md` này để đối chiếu mã `GBR-ID` tương ứng (`GBR-01` – `GBR-28`)**.
2. **Cú pháp Chú thích Chuẩn**: Luôn gắn comment theo định dạng:
   ```javascript
   // [BR: GBR-xx] <nội dung tóm tắt quy tắc>
   ```
   ngay tại dòng lệnh rẽ nhánh, kiểm tra điều kiện hoặc tính toán.
3. **Đồng bộ hóa 2 chiều**: Khi nhận yêu cầu chỉnh sửa hoặc bổ sung quy tắc nghiệp vụ, phải cập nhật đồng bộ ở cả 2 nơi:
   - File tài liệu nghiệp vụ [BR.md](./BR.md)
   - Đoạn code và chú thích `@businessRule` / `// [BR: GBR-xx]` trong source code.
