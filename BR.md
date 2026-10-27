# AraWMS Business Rules (BR.md)
> **Tài liệu Quản lý Quy tắc Nghiệp vụ Hệ thống AraWMS**  
> *Đặc tả 24 Business Rules cốt lõi (GBR-01 đến GBR-24), ánh xạ trực tiếp đến vị trí mã nguồn theo kiến trúc 5 tầng của dự án.*

---

## 1. Giới thiệu & Hướng dẫn sử dụng

### 1.1. Mục đích
Tài liệu này là **nguồn sự thật duy nhất (Single Source of Truth)** cho toàn bộ quy tắc nghiệp vụ trong hệ thống AraWMS. Mọi đoạn code thực thi nghiệp vụ trong Front-end và Back-end phải tham chiếu mã quy tắc tương ứng:
```javascript
// [BR: GBR-xx] <Tóm tắt logic thực thi quy tắc>
```
Định dạng này cho phép cả lập trình viên và Trợ lý AI dễ dàng kiểm tra, truy vết độ bao phủ (Traceability) và đảm bảo tính tuân thủ quy trình vận hành kho AraStore.

### 1.2. Phân loại Quy tắc (Rule Types)
1. **Constraint (Ràng buộc)**: Quy tắc bất biến, ngăn chặn các trạng thái không hợp lệ của dữ liệu hoặc luồng hoạt động (ví dụ: cấm sửa mã SKU, cấm người dùng vô hiệu hóa đăng nhập).
2. **Action Enabler (Kích hoạt hành động)**: Quy tắc tự động kích hoạt một hành động tiếp theo khi một điều kiện được thỏa mãn (ví dụ: tự động khóa tài khoản sau 5 lần nhập sai, tự động giữ chỗ kho khi tạo đơn).
3. **Computation (Công thức tính toán)**: Quy tắc định nghĩa công thức số học hoặc logic tính toán bắt buộc của hệ thống (ví dụ: tính nhu cầu nguyên liệu theo định mức BOM, tính tiền hoàn trả).

---

## 2. Bảng Tổng hợp Business Rules (Master Summary Table)

| Mã BR | Tên / Nội dung Quy tắc (Rule Statement) | Phạm vi (Applies To) | Phân loại | Vị trí Code áp dụng chính (Layers & Files) |
|:---:|---|---|:---:|---|
| **GBR-01** | Tài khoản đã vô hiệu hóa không được phép đăng nhập dưới mọi hình thức | Account & Authentication | Constraint | `Service`, `Middleware`, `FE` (Auth Module) |
| **GBR-02** | Nhập sai mật khẩu 5 lần liên tiếp sẽ tự động khóa tài khoản trong 30 phút | Login Feature | Action Enabler | `Service`, `Model`, `FE` (Auth Module) |
| **GBR-03** | Mã SKU và mã Nguyên vật liệu (RM) phải là duy nhất trên toàn hệ thống | Master Data Management | Constraint | `Validation`, `Service`, `Model/DB Index` |
| **GBR-04** | Chỉ BOM ở trạng thái "Approved" mới được dùng để khởi tạo Lệnh sản xuất | BOM & Production | Constraint | `Validation`, `Service`, `FE` (Dropdown filter) |
| **GBR-05** | Khi cập nhật BOM, giữ nguyên mã BOM Code và chỉ tăng phiên bản Version Code | BOM Management | Computation | `Service`, `Validation`, `FE` (Revision modal) |
| **GBR-06** | Tự động tính nhu cầu xuất vải theo định mức BOM và số lượng sản phẩm dự kiến | Raw Material Warehousing | Computation | `Service`, `Validation`, `FE` (Issue order) |
| **GBR-07** | Mỗi cuộn vải nhập kho phải dán tem định danh duy nhất (Roll ID, Fabric Code, Mét) | Fabric Roll Management | Constraint | `Service`, `Controller`, `FE` (Label printing) |
| **GBR-08** | Cảnh báo tồn kho thấp khi tồn khả dụng của SKU giảm xuống dưới ngưỡng Min Stock | Inventory & Alerts | Action Enabler | `Service`, `Model`, `FE` (Header notifications) |
| **GBR-09** | Vải thừa sau sản xuất khi nhập lại kho phải đo lại chiều dài thực tế | WIP Fabric Warehousing | Constraint | `Validation`, `Service`, `FE` (WIP return modal) |
| **GBR-10** | Tạo đơn bán lẻ thành công phải tự động chuyển SKU từ tồn khả dụng sang tồn giữ chỗ | Direct Order Management | Action Enabler | `Service`, `Validation`, `FE` (Order creation) |
| **GBR-11** | Hủy đơn hàng sẽ tự động hoàn trả số lượng tồn giữ chỗ về tồn khả dụng | Order Cancellation | Action Enabler | `Service`, `Route`, `FE` (Order detail) |
| **GBR-12** | Chỉ đơn hàng ở trạng thái Pending/Confirmed mới được tạo Pick-list và đóng gói | Shipping & Packing | Constraint | `Validation`, `Service`, `FE` (Pick-list action) |
| **GBR-13** | Mọi kiện hàng giao bưu tá GHN phải có mã vận đơn và ghi vào Biên bản bàn giao | Carrier Handover | Constraint | `Validation`, `Service`, `FE` (Barcode scan) |
| **GBR-14** | Đổi/trả do lỗi khách hàng (chọn nhầm size, đổi ý) chịu phí 10% giá trị sản phẩm | Return & Exchange | Computation | `Service`, `Validation`, `FE` (Return modal) |
| **GBR-15** | Đổi/trả do lỗi sản xuất hoặc giao sai mẫu được miễn 100% phí hoàn trả và vận chuyển | Return & Exchange | Action Enabler | `Service`, `FE` (Return calculation) |
| **GBR-16** | Hàng trả về hư hỏng nặng không thể tái chế phải chuyển vào Kho hàng lỗi | Defective Warehouse | Constraint | `Service`, `Model`, `FE` (QC classification) |
| **GBR-17** | Toàn bộ phiếu Thu/Chi phải liên kết với Mã đơn hàng hoặc Mã phiếu Nhập/Xuất kho | Operational Financials | Constraint | `Validation`, `Service`, `FE` (Cash voucher) |
| **GBR-18** | Nhập bảng kê COD từ GHN phải tự động đối soát tiền nhận với tiền COD dự kiến | COD Reconciliation | Computation | `Service`, `Controller`, `FE` (Excel import) |
| **GBR-19** | Đơn hàng có chênh lệch tiền COD sẽ tự động bị gắn Cờ đỏ (Red Flag) khiếu nại | COD Reconciliation | Action Enabler | `Service`, `Model`, `FE` (Flag indicator) |
| **GBR-20** | Giá vốn hàng bán (COGS) được tính tự động theo phương pháp Bình quân gia quyền | COGS & Profit Reporting | Computation | `Service`, `Model`, `FE` (P&L report) |
| **GBR-21** | Phiên kiểm kê kho chỉ được đóng (Completed) sau khi xử lý xong các phiếu chênh lệch | Stock Audit Management | Constraint | `Validation`, `Service`, `FE` (Audit closure) |
| **GBR-22** | Chỉ Store Owner mới có quyền phê duyệt phiếu điều chỉnh kho chênh lệch > 5 triệu VNĐ | Inventory Audit | Action Enabler | `Middleware`, `Service`, `Validation`, `FE` |
| **GBR-23** | Ghi SystemLog kiểm toán vết Thêm/Sửa/Xóa dữ liệu trọng yếu kèm User ID và Timestamp | System-wide Audit Log | Constraint | `Middleware`, `Service`, `Model`, `FE` |
| **GBR-24** | Webhook thanh toán (VnPay/SePay) phải xác thực chữ ký HMAC trước khi cập nhật đơn | Payment API Integration | Constraint | `Middleware`, `Service`, `Validation`, `Route` |

---

## 3. Đặc tả Chi tiết từng Business Rule & Ánh xạ Mã nguồn

```
                              KIẾN TRÚC ÁP DỤNG TRUY VẾT
+---------------------------------------------------------------------------------------+
|  [Front-end]   --> ARAWMS_FE/src/pages / components / hooks                           |
|  [Route]       --> ARAWMS_BE/src/modules/.../*.routes.js                              |
|  [Validation]  --> ARAWMS_BE/src/modules/.../*.validation.js                          |
|  [Controller]  --> ARAWMS_BE/src/modules/.../*.controller.js                          |
|  [Service]     --> ARAWMS_BE/src/modules/.../*.service.js                             |
|  [Model / DB]  --> ARAWMS_BE/src/models/*.model.js & MongoDB Indexes                  |
+---------------------------------------------------------------------------------------+
```

---

### GBR-01: Chặn đăng nhập tài khoản đã vô hiệu hóa
- **Rule Statement**: Once a user account is deactivated, it cannot log into the system under any circumstances.
- **Applies To**: Account & Authentication Module (`FT-01`)
- **Rationale**: Đảm bảo an toàn thông tin khi nhân sự thôi việc hoặc bị thu hồi quyền truy cập.
- **Enforced By**: Hệ thống tự động kiểm tra trạng thái hoạt động của tài khoản ngay khi thực hiện đăng nhập.
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Store Security Policy
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/system-administration/auth/auth.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/system-administration/auth/auth.controller.js` (`login`)
  - `Service`: `ARAWMS_BE/src/modules/system-administration/auth/auth.service.js` (kiểm tra `user.status === 'ACTIVE'` và `!user.isDeactivated`)
  - `Middleware`: `ARAWMS_BE/src/common/middlewares/authenticate.js` (xác minh tài khoản còn hiệu lực khi decode token JWT)
  - `Model`: `ARAWMS_BE/src/models/User.model.js` (trường `status`, `isDeactivated`)
  - `Front-end`: `ARAWMS_FE/src/pages/auth/LoginPage.jsx` (bắt thông báo lỗi tài khoản bị vô hiệu hóa)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-01] Ngăn chặn đăng nhập đối với tài khoản đã bị vô hiệu hóa hoặc bị khóa
  if (user.status !== 'ACTIVE' || user.isDeactivated) {
    throw new Error('Tài khoản đã bị ngừng kích hoạt. Vui lòng liên hệ Quản trị viên.');
  }
  ```

---

### GBR-02: Tự động khóa tài khoản khi nhập sai mật khẩu 5 lần
- **Rule Statement**: If an incorrect password is entered 5 consecutive times, the account will be automatically locked for 30 minutes.
- **Applies To**: Login Feature (`FT-01`)
- **Rationale**: Phòng chống tấn công dò mật khẩu tự động (Brute-force attack).
- **Enforced By**: Hệ thống tự động đếm số lần đăng nhập thất bại liên tiếp và khóa tài khoản khi vượt ngưỡng.
- **Rule Type**: `Action Enabler`
- **Source of rule**: IT System Safety Regulations
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/system-administration/auth/auth.service.js` (`failedLoginAttempts`, kiểm tra `lockedUntil`)
  - `Controller`: `ARAWMS_BE/src/modules/system-administration/auth/auth.controller.js`
  - `Model`: `ARAWMS_BE/src/models/User.model.js` (trường `failedLoginAttempts: Number`, `lockedUntil: Date`)
  - `Front-end`: `ARAWMS_FE/src/pages/auth/LoginPage.jsx` (hiển thị số lần nhập sai còn lại và đồng hồ đếm ngược khóa)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-02] Tự động khóa tài khoản 30 phút nếu nhập sai mật khẩu 5 lần liên tiếp
  if (user.failedLoginAttempts >= 5) {
    user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    throw new Error('Tài khoản đã bị tạm khóa 30 phút do nhập sai mật khẩu 5 lần.');
  }
  ```

---

### GBR-03: Tính duy nhất của mã SKU và mã Nguyên vật liệu
- **Rule Statement**: SKU codes and Raw Material (RM) codes must be unique across the entire system.
- **Applies To**: Product & Raw Material Management (`FT-03`)
- **Rationale**: Chống trùng lặp và nhầm lẫn hàng hóa, nguyên vật liệu trong quản lý xuất/nhập/tồn kho.
- **Enforced By**: Hệ thống kiểm tra tính duy nhất khi tạo mới hoặc cập nhật mã.
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Warehouse Management Operations
- **Vị trí Code áp dụng**:
  - `Validation`: `ARAWMS_BE/src/modules/master-data/sku/sku.validation.js`, `material.validation.js`
  - `Service`: `ARAWMS_BE/src/modules/master-data/sku/sku.service.js`, `material.service.js`
  - `Model / DB`: `ARAWMS_BE/src/models/Sku.model.js` (`skuCode: { type: String, unique: true }`), `Material.model.js` (`materialCode: { type: String, unique: true }`)
  - `Front-end`: `ARAWMS_FE/src/pages/master-data/SkuFormModal.jsx`, `MaterialFormModal.jsx` (kiểm tra trùng mã real-time)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-03] Bắt buộc SKU Code là duy nhất trên toàn hệ thống
  const existingSku = await Sku.findOne({ skuCode: code.toUpperCase() });
  if (existingSku && existingSku._id.toString() !== currentId) {
    throw new Error(`[BR: GBR-03] Mã SKU "${code}" đã tồn tại trên hệ thống.`);
  }
  ```

---

### GBR-04: Điều kiện trạng thái BOM để lập Lệnh sản xuất
- **Rule Statement**: Only Bills of Materials (BOM) in "Approved" status can be used to initiate Production Orders.
- **Applies To**: BOM & Production Management (`FT-04`, `FT-05`)
- **Rationale**: Đảm bảo quá trình may mặc tuân thủ tiêu chuẩn kỹ thuật và định mức vải đã qua phê duyệt chính thức.
- **Enforced By**: Hệ thống chặn chọn các bản BOM chưa được phê duyệt khi lập Lệnh sản xuất.
- **Rule Type**: `Constraint`
- **Source of rule**: Garment Workshop Technical Process
- **Vị trí Code áp dụng**:
  - `Validation`: `ARAWMS_BE/src/modules/garment-technical/production-order/productionOrder.validation.js`
  - `Service`: `ARAWMS_BE/src/modules/garment-technical/production-order/productionOrder.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/garment-technical/production-order/productionOrder.controller.js`
  - `Front-end`: `ARAWMS_FE/src/pages/garment-technical/ProductionOrderCreatePage.jsx` (lọc API danh sách BOM chỉ lấy `status = 'APPROVED'`)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-04] Chỉ cho phép dùng BOM ở trạng thái APPROVED để tạo lệnh sản xuất
  if (bom.status !== 'APPROVED') {
    throw new Error('[BR: GBR-04] BOM kỹ thuật chưa được phê duyệt, không thể lập Lệnh sản xuất.');
  }
  ```

---

### GBR-05: Quy tắc cập nhật phiên bản BOM
- **Rule Statement**: When revising a Bill of Materials (BOM) version, the BOM code must remain unchanged, and only the version number (Version Code) should be updated.
- **Applies To**: BOM Management (`FT-04`)
- **Rationale**: Giữ nguyên vẹn lịch sử biến động kỹ thuật của mẫu thiết kế theo thời gian.
- **Enforced By**: Hệ thống tự động tăng số hiệu phiên bản khi ghi nhận chỉnh sửa BOM.
- **Rule Type**: `Computation`
- **Source of rule**: Design Version Management Regulation
- **Vị trí Code áp dụng**:
  - `Validation`: `ARAWMS_BE/src/modules/garment-technical/bom/bom.validation.js` (không cho phép sửa `bomCode`)
  - `Service`: `ARAWMS_BE/src/modules/garment-technical/bom/bom.service.js` (`createBomRevision` - giữ nguyên `bomCode`, tăng `versionCode` từ `v1.0` -> `v1.1` hoặc `v2.0`)
  - `Model`: `ARAWMS_BE/src/models/Bom.model.js` (chỉ mục kết hợp `{ bomCode: 1, versionCode: 1 }`)
  - `Front-end`: `ARAWMS_FE/src/pages/garment-technical/BomRevisionModal.jsx` (khóa ô nhập `bomCode`)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-05] Giữ nguyên bomCode và tự động tăng số hiệu phiên bản (Version Code)
  const nextVersionNumber = currentBom.versionNumber + 1;
  const newVersionCode = `v${nextVersionNumber}.0`;
  ```

---

### GBR-06: Công thức tính toán nhu cầu xuất vải sản xuất
- **Rule Statement**: When creating a raw material export order for production, the system must automatically calculate material requirements based on the BOM quota and the target production quantity.
- **Formula**: `Demand = Unit Quota * Product Quantity * (1 + Allowable Scrap Rate)`
- **Applies To**: Raw material warehouse management (`FT-05`, `FT-07`)
- **Rationale**: Tự động hóa tính toán định mức, ngăn ngừa sai sót do thao tác thủ công.
- **Enforced By**: Công thức hệ thống tự động điền số lượng vải yêu cầu xuất kho.
- **Rule Type**: `Computation`
- **Source of rule**: Garment Material Management Formula
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/raw-material-warehousing/material-issue/materialIssue.service.js`
  - `Validation`: `ARAWMS_BE/src/modules/raw-material-warehousing/material-issue/materialIssue.validation.js`
  - `Controller`: `ARAWMS_BE/src/modules/raw-material-warehousing/material-issue/materialIssue.controller.js`
  - `Front-end`: `ARAWMS_FE/src/pages/raw-material-warehousing/MaterialIssueCreatePage.jsx` (hiển thị bảng chiết tính nhu cầu vải)
- **Mã chú thích mẫu**:
  ```javascript
  /*
   * [BR: GBR-06] Công thức tính định mức nhu cầu xuất vải sản xuất:
   * Demand = Unit Quota * Product Quantity * (1 + Allowable Scrap Rate)
   */
  const demandMeters = unitQuota * productQuantity * (1 + allowableScrapRate);
  ```

---

### GBR-07: Định danh duy nhất từng cuộn vải khi nhập kho
- **Rule Statement**: Each fabric roll upon warehouse entry must be labeled with a unique identification tag containing the Roll ID, Fabric Code, and actual meter length.
- **Applies To**: Fabric Roll Management (`FT-07`)
- **Rationale**: Quản lý chi tiết nguyên vật liệu theo từng cây vải riêng biệt (Roll-based tracking).
- **Enforced By**: Hệ thống bắt buộc in tem Barcode/QR khi xác nhận phiếu nhập kho vải.
- **Rule Type**: `Constraint`
- **Source of rule**: Raw & Auxiliary Material Warehouse Labeling Process
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/raw-material-warehousing/fabric-roll/fabricRoll.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/raw-material-warehousing/fabric-roll/fabricRoll.controller.js` (`generateRollLabels`)
  - `Model`: `ARAWMS_BE/src/models/FabricRoll.model.js` (trường `rollCode`, `fabricCode`, `actualLengthMeters`)
  - `Front-end`: `ARAWMS_FE/src/pages/raw-material-warehousing/FabricReceiptPage.jsx` (kích hoạt in tem Barcode/QR)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-07] Tạo mã định danh cuộn vải duy nhất và cấu hình dữ liệu in tem Barcode/QR
  const rollCode = await CounterSequence.getNextSequence('FABRIC_ROLL', 'ROL', 6);
  const barcodePayload = `${rollCode}|${fabricCode}|${actualLengthMeters}M`;
  ```

---

### GBR-08: Kích hoạt cảnh báo khi tồn kho khả dụng dưới ngưỡng an toàn
- **Rule Statement**: If the available inventory of an SKU drops below the Min Stock Threshold, the system must trigger a low stock alert.
- **Applies To**: Inventory Management & Alerts (`FT-08`)
- **Rationale**: Giúp quản lý chủ động đặt hàng hoặc lên kế hoạch may bù, chống đứt gãy chuỗi cung ứng.
- **Enforced By**: Hệ thống tự động so sánh tồn kho khả dụng với ngưỡng an toàn sau mỗi giao dịch xuất kho.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Minimum Stock Reserve Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/finished-goods-warehousing/inventory-alert/inventoryAlert.service.js`, `inventoryTransaction.service.js` (trigger hook sau xuất kho)
  - `Model`: `ARAWMS_BE/src/models/InventoryAlert.model.js`, `Sku.model.js` (`minStockThreshold`)
  - `Front-end`: `ARAWMS_FE/src/components/layout/HeaderNotifications.jsx`, `InventoryAlertBadge.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-08] Kiểm tra ngưỡng tồn kho tối thiểu sau mỗi giao dịch xuất kho
  const availableQty = sku.onHandQty - sku.reservedQty;
  if (availableQty < sku.minStockThreshold) {
    await triggerLowStockAlert(sku, availableQty);
  }
  ```

---

### GBR-09: Bắt buộc đo lại chiều dài vải thừa hồi kho sau sản xuất
- **Rule Statement**: Residual fabric remaining after production, upon returning to the warehouse, must have its actual meters re-measured and updated in the system.
- **Applies To**: Work-In-Progress (WIP) Fabric Warehouse Entry (`FT-06`, `FT-07`)
- **Rationale**: Đảm bảo số liệu tồn kho nguyên liệu dở dang phản ánh chính xác thực tế tại phân xưởng.
- **Enforced By**: Hệ thống bắt buộc nhập chiều dài mét thực tế khi tạo phiếu nhập hồi kho vải thừa.
- **Rule Type**: `Constraint`
- **Source of rule**: Material Consumption Control Process
- **Vị trí Code áp dụng**:
  - `Validation`: `ARAWMS_BE/src/modules/raw-material-warehousing/fabric-return/fabricReturn.validation.js` (bắt buộc `actualMeters > 0`)
  - `Service`: `ARAWMS_BE/src/modules/raw-material-warehousing/fabric-return/fabricReturn.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/raw-material-warehousing/fabric-return/fabricReturn.controller.js`
  - `Front-end`: `ARAWMS_FE/src/pages/raw-material-warehousing/WipFabricReturnModal.jsx` (trường nhập bắt buộc độ dài)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-09] Bắt buộc nhập chiều dài mét thực tế khi hồi kho vải thừa sau may
  if (!item.actualReturnedMeters || Number(item.actualReturnedMeters) <= 0) {
    return res.status(400).json({ success: false, message: '[BR: GBR-09] Chiều dài mét vải hồi kho phải > 0' });
  }
  ```

---

### GBR-10: Tự động chuyển tồn khả dụng sang giữ chỗ khi tạo đơn
- **Rule Statement**: When a retail order is successfully created, the system must automatically transfer the corresponding SKU quantity from Available Inventory to Reserved Inventory.
- **Applies To**: Direct Order Management (`FT-10`)
- **Rationale**: Chống bán vượt quá số lượng hàng có sẵn trong kho (Overselling).
- **Enforced By**: Tự động trừ Tồn khả dụng và tăng Tồn giữ chỗ ngay khi đơn hàng tạo/xác nhận thành công.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Messenger Order Reservation Operations
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.routes.js`
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.service.js` (`confirmOrderReserve`)
  - `Validation`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.validation.js`
  - `Model`: `ARAWMS_BE/src/models/Sku.model.js` (`reservedQty`), `InventoryTransaction.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/order-fulfillment/OrderCreatePage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-10] Tự động tăng tồn giữ chỗ (+reservedQty) ngay khi xác nhận đơn hàng
  await Sku.findByIdAndUpdate(item.skuId, { $inc: { reservedQty: item.orderedQty } });
  ```

---

### GBR-11: Tự động giải phóng tồn giữ chỗ khi đơn hàng bị hủy
- **Rule Statement**: Canceled orders will automatically release reserved inventory quantities back to Available Inventory.
- **Applies To**: Order Management & Cancellation (`FT-10`)
- **Rationale**: Cập nhật lại số lượng hàng có sẵn chính xác để phục vụ các khách hàng khác.
- **Enforced By**: Hệ thống tự động trừ tồn giữ chỗ khi trạng thái đơn hàng chuyển sang `CANCELLED`.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Order Cancellation Handling Regulation
- **Vị trí Code áp dụng**:
  - `Route`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.routes.js` (`POST /:id/cancel`)
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.controller.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/order-management/orderManagement.service.js` (`cancelOrder`)
  - `Front-end`: `ARAWMS_FE/src/pages/order-fulfillment/OrderDetailPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-11] Giải phóng tồn giữ chỗ (-reservedQty) khi đơn hàng bị hủy
  await Sku.findByIdAndUpdate(item.skuId, { $inc: { reservedQty: -item.orderedQty } });
  ```

---

### GBR-12: Điều kiện trạng thái đơn để tạo Pick-list và đóng gói
- **Rule Statement**: Only orders in Pending/Confirmed status are allowed to generate pick-lists and packing processes.
- **Applies To**: Shipping & Packing Management (`FT-10`)
- **Rationale**: Đảm bảo không nhặt hàng hay đóng gói nhầm cho đơn đã hủy hoặc đơn đã hoàn thành.
- **Enforced By**: Hệ thống chặn tạo danh sách nhặt hàng nếu đơn có trạng thái không hợp lệ.
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Single Order Shipping Process
- **Vị trí Code áp dụng**:
  - `Validation`: `ARAWMS_BE/src/modules/order-fulfillment/picking-operations/picking.validation.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/picking-operations/picking.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/picking-operations/picking.controller.js`
  - `Front-end`: `ARAWMS_FE/src/pages/order-fulfillment/PickingListPage.jsx` (vô hiệu nút in pick-list)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-12] Chỉ đơn hàng ở trạng thái PENDING hoặc CONFIRMED_RESERVED mới được tạo Pick-list
  const validStatuses = ['PENDING', 'CONFIRMED_RESERVED'];
  if (!validStatuses.includes(order.status)) {
    throw new Error(`[BR: GBR-12] Đơn hàng ở trạng thái ${order.status} không được phép tạo phiếu nhặt hàng.`);
  }
  ```

---

### GBR-13: Quy chuẩn bàn giao bưu kiện cho đơn vị vận chuyển (GHN)
- **Rule Statement**: Every package handed over to the carrier (GHN) must have a Waybill Label and be recorded in the Handover Report.
- **Applies To**: Carrier Handover (`FT-10`, `FT-12`)
- **Rationale**: Căn cứ pháp lý đối soát số lượng bưu kiện thực bàn giao và giải quyết khiếu nại thất lạc hàng hóa.
- **Enforced By**: Hệ thống bắt buộc quét mã vận đơn (Waybill barcode) để xác nhận vào Biên bản bàn giao.
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore - Carrier Goods Handover Regulation
- **Vị trí Code áp dụng**:
  - `Validation`: `ARAWMS_BE/src/modules/order-fulfillment/carrier-handover/carrierHandover.validation.js`
  - `Service`: `ARAWMS_BE/src/modules/order-fulfillment/carrier-handover/carrierHandover.service.js`, `ghn.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/order-fulfillment/carrier-handover/carrierHandover.controller.js`
  - `Front-end`: `ARAWMS_FE/src/pages/order-fulfillment/CarrierHandoverScanPage.jsx` (giao diện quét mã vạch bàn giao)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-13] Bắt buộc quét mã vận đơn hợp lệ để ghi nhận vào Biên bản bàn giao bưu tá
  if (!trackingCode || !handoverReportId) {
    throw new Error('[BR: GBR-13] Thiếu mã vận đơn (Waybill) hoặc mã Biên bản bàn giao.');
  }
  ```

---

### GBR-14: Tính phí hoàn trả do lý do chủ quan từ khách hàng
- **Rule Statement**: Returns/exchanges due to customer reasons (wrong size, change of mind) will incur a 10% surcharge on the product value according to regulations.
- **Formula**: `Refund Amount = Product Value * 90% - Shipping Fee (if any)`
- **Applies To**: Return & Exchange Management (`FT-11`)
- **Rationale**: Bù đắp chi phí đóng gói, kiểm phẩm và xử lý lưu kho của cửa hàng.
- **Enforced By**: Công thức hệ thống tự động tính số tiền hoàn trả cho khách.
- **Rule Type**: `Computation`
- **Source of rule**: AraStore Return & Exchange Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/reverse-logistics/return-request/returnRequest.service.js`
  - `Validation`: `ARAWMS_BE/src/modules/reverse-logistics/return-request/returnRequest.validation.js`
  - `Controller`: `ARAWMS_BE/src/modules/reverse-logistics/return-request/returnRequest.controller.js`
  - `Front-end`: `ARAWMS_FE/src/pages/reverse-logistics/ReturnRequestModal.jsx` (hiển thị bảng chiết tính tiền hoàn trả)
- **Mã chú thích mẫu**:
  ```javascript
  /*
   * [BR: GBR-14] Hoàn tiền do lỗi chủ quan của khách:
   * Refund Amount = Product Value * 0.90 - Shipping Fee
   */
  const refundAmount = (productValue * 0.9) - (shippingFee || 0);
  ```

---

### GBR-15: Miễn phí hoàn trả khi lỗi do phía cửa hàng
- **Rule Statement**: Returned goods due to manufacturing defects or wrong item delivery are 100% exempt from return surcharges and incurred shipping fees.
- **Formula**: `Refund Amount = 100% Product Value`
- **Applies To**: Return & Exchange Management (`FT-11`)
- **Rationale**: Đảm bảo quyền lợi chính đáng của khách hàng khi sai sót thuộc về nhà sản xuất hoặc khâu nhặt hàng.
- **Enforced By**: Hệ thống tự động tính hoàn tiền 100% khi nguyên nhân trả hàng là lỗi cửa hàng.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Consumer Protection Policy
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/reverse-logistics/return-request/returnRequest.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/reverse-logistics/return-request/returnRequest.controller.js`
  - `Front-end`: `ARAWMS_FE/src/pages/reverse-logistics/ReturnRequestModal.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-15] Miễn phí 100% phụ phí khi lỗi thuộc về nhà sản xuất hoặc giao sai mẫu
  if (['STORE_DEFECT', 'WRONG_ITEM'].includes(returnReason)) {
    refundAmount = productValue; // 100% giá trị sản phẩm
  }
  ```

---

### GBR-16: Phân loại và cô lập hàng hoàn trả hư hỏng nặng
- **Rule Statement**: Severely damaged returned products that cannot be recycled or repaired must be marked with "Irreparable" status and transferred to the Defective Product Warehouse.
- **Applies To**: Defective Warehouse Management (`FT-08`, `FT-11`)
- **Rationale**: Cô lập hàng lỗi hỏng, tuyệt đối ngăn chặn việc nhập nhầm vào kho hàng thương mại đang bán.
- **Enforced By**: Hệ thống khóa không cho phép cộng tồn khả dụng đối với sản phẩm đánh dấu `Irreparable`.
- **Rule Type**: `Constraint`
- **Source of rule**: Quality Control Classification Process
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/reverse-logistics/return-inspection/returnInspection.service.js`
  - `Model`: `ARAWMS_BE/src/models/DefectiveStock.model.js`
  - `Controller`: `ARAWMS_BE/src/modules/reverse-logistics/return-inspection/returnInspection.controller.js`
  - `Front-end`: `ARAWMS_FE/src/pages/reverse-logistics/ReturnInspectionModal.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-16] Hàng hỏng nặng (IRREPARABLE) phải chuyển vào kho hàng lỗi, không cộng tồn thương mại
  if (qcResult.status === 'IRREPARABLE') {
    await transferToDefectiveStock(item, qcResult);
  }
  ```

---

### GBR-17: Ràng buộc chứng từ gốc cho toàn bộ phiếu Thu / Chi
- **Rule Statement**: All Cash-In/Cash-Out financial transactions must be linked to their corresponding Order Code or Warehouse Receipt/Issue Code.
- **Applies To**: Operational Financial Management (`FT-12`)
- **Rationale**: Đảm bảo tính minh bạch dòng tiền, dễ dàng truy vết nguồn gốc thu chi khi đối soát sổ sách kế toán.
- **Enforced By**: Hệ thống bắt buộc chọn Mã tham chiếu (Reference Code) khi lập phiếu Thu/Chi.
- **Rule Type**: `Constraint`
- **Source of rule**: Enterprise Accounting Regulations
- **Vị trí Code áp dụng**:
  - `Validation`: `ARAWMS_BE/src/modules/financial-intelligence/cash-voucher/cashVoucher.validation.js`
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/cash-voucher/cashVoucher.service.js`
  - `Model`: `ARAWMS_BE/src/models/CashVoucher.model.js` (`referenceCode`, `referenceType`)
  - `Front-end`: `ARAWMS_FE/src/pages/financial-intelligence/CashVoucherCreateModal.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-17] Bắt buộc liên kết phiếu Thu/Chi với mã chứng từ đơn hàng hoặc phiếu kho
  if (!referenceCode || !referenceType) {
    return res.status(400).json({ success: false, message: '[BR: GBR-17] Phiếu Thu/Chi phải có mã chứng từ liên kết.' });
  }
  ```

---

### GBR-18: Tự động đối soát bảng kê thu hộ COD từ đơn vị vận chuyển
- **Rule Statement**: When importing the COD payment statement from the carrier, the system must automatically reconcile received COD amounts with expected COD amounts per order.
- **Applies To**: COD Reconciliation (`FT-12`)
- **Rationale**: Phát hiện sớm các khoản chênh lệch tiền thu hộ từ đối tác giao vận GHN.
- **Enforced By**: Hệ thống tự động so sánh số tiền trong bảng kê với tiền COD kỳ vọng trên đơn hàng.
- **Rule Type**: `Computation`
- **Source of rule**: Delivery Partner Financial Reconciliation Contract
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/cod-reconciliation/codReconciliation.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/financial-intelligence/cod-reconciliation/codReconciliation.controller.js`
  - `Model`: `ARAWMS_BE/src/models/CodStatement.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/financial-intelligence/CodReconciliationUploadPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-18] Tự động tính chênh lệch tiền COD thực nhận đối soát với kỳ vọng của đơn
  const discrepancy = statementCodAmount - order.financialSummary.expectedCodAmount;
  ```

---

### GBR-19: Tự động gắn Cờ đỏ khi phát hiện sai lệch tiền COD
- **Rule Statement**: Orders with COD discrepancies will automatically be flagged with a Red Flag and trigger a check/claim request.
- **Applies To**: COD Reconciliation & Claims (`FT-12`)
- **Rationale**: Cảnh báo tức thì cho bộ phận Kế toán xử lý bất thường tài chính và lập khiếu nại đối tác.
- **Enforced By**: Hệ thống tự động đánh dấu cờ đỏ khi số tiền chênh lệch `discrepancy !== 0`.
- **Rule Type**: `Action Enabler`
- **Source of rule**: COD Loss Risk Control Process
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/cod-reconciliation/codReconciliation.service.js`
  - `Model`: `ARAWMS_BE/src/models/SalesOrder.model.js` (`codReconciliationStatus = 'DISCREPANCY'`), `CodStatement.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/financial-intelligence/CodDiscrepancyListPage.jsx` (hiển thị biểu tượng Cờ đỏ)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-19] Tự động gắn cờ đỏ khi phát hiện đơn hàng có sai lệch COD
  if (Math.abs(discrepancy) > 0) {
    order.codReconciliationStatus = 'DISCREPANCY';
    await createCarrierClaimTicket(order, discrepancy);
  }
  ```

---

### GBR-20: Tự động tính giá vốn hàng bán (COGS)
- **Rule Statement**: Cost of Goods Sold (COGS) for each issued order must be calculated automatically based on the Weighted Average Cost method per entry batch or Actual BOM Cost.
- **Applies To**: COGS & P&L Profit Reporting (`FT-12`)
- **Rationale**: Xác định chính xác lợi nhuận gộp thực tế của từng sản phẩm và từng đơn hàng.
- **Enforced By**: Hệ thống tự động ghi nhận bút toán COGS khi đơn hàng chuyển sang trạng thái hoàn tất (`COMPLETED`).
- **Rule Type**: `Computation`
- **Source of rule**: Product Cost Accounting Standards
- **Vị trí Code áp dụng**:
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/cogs/cogs.service.js`, `orderManagement.service.js`
  - `Model`: `ARAWMS_BE/src/models/CogsEntry.model.js`, `SalesOrder.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/financial-intelligence/ProfitAndLossReportPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-20] Tự động ghi nhận giá vốn hàng bán COGS khi đơn hàng hoàn thành
  const totalCogs = order.items.reduce((sum, item) => sum + (item.unitCogsSnapshot * item.orderedQty), 0);
  await recordCogsEntry(order, totalCogs);
  ```

---

### GBR-21: Điều kiện kết thúc phiên kiểm kê kho
- **Rule Statement**: A stock audit session can only be closed (Completed) after all quantity discrepancy vouchers have been processed or approved for adjustment.
- **Applies To**: Stock Audit Management (`FT-08`)
- **Rationale**: Đảm bảo toàn bộ chênh lệch tồn kho được giải trình và xử lý dứt điểm trước khi chốt số liệu sổ cái.
- **Enforced By**: Hệ thống kiểm tra trạng thái các phiếu điều chỉnh liên quan trước khi cho phép đóng phiên.
- **Rule Type**: `Constraint`
- **Source of rule**: AraStore Periodic Inventory Audit Regulation
- **Vị trí Code áp dụng**:
  - `Validation`: `ARAWMS_BE/src/modules/inventory-auditing/inventory-count/inventoryCount.validation.js`
  - `Service`: `ARAWMS_BE/src/modules/inventory-auditing/inventory-count/inventoryCount.service.js`
  - `Controller`: `ARAWMS_BE/src/modules/inventory-auditing/inventory-count/inventoryCount.controller.js`
  - `Front-end`: `ARAWMS_FE/src/pages/inventory-auditing/AuditSessionDetailPage.jsx` (khóa nút Đóng phiên kiểm kê)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-21] Chỉ được đóng phiên kiểm kê khi toàn bộ chênh lệch đã được xử lý/duyệt
  const pendingAdjustments = await InventoryAdjustment.countDocuments({
    auditSessionId: session._id,
    status: 'PENDING_APPROVAL',
  });
  if (pendingAdjustments > 0) {
    throw new Error('[BR: GBR-21] Còn phiếu điều chỉnh chênh lệch chưa duyệt. Không thể đóng phiên kiểm kê.');
  }
  ```

---

### GBR-22: Hạn mức phê duyệt phiếu điều chỉnh kho > 5.000.000 VNĐ
- **Rule Statement**: Only the Store Owner has the authority to approve Inventory Adjustment vouchers with a total discrepancy value exceeding 5,000,000 VND.
- **Applies To**: Inventory Audit & Adjustment Management (`FT-08`)
- **Rationale**: Kiểm soát rủi ro gian lận và thất thoát tài sản có giá trị lớn trong quá trình vận hành kho.
- **Enforced By**: Hệ thống tự động phân luồng phê duyệt dựa trên tổng giá trị chênh lệch > 5.000.000 VNĐ.
- **Rule Type**: `Action Enabler`
- **Source of rule**: Financial Approval Limit Policy
- **Vị trí Code áp dụng**:
  - `Route / Middleware`: `ARAWMS_BE/src/modules/inventory-auditing/inventory-adjustment/inventoryAdjustment.routes.js`
  - `Validation`: `ARAWMS_BE/src/modules/inventory-auditing/inventory-adjustment/inventoryAdjustment.validation.js`
  - `Service`: `ARAWMS_BE/src/modules/inventory-auditing/inventory-adjustment/inventoryAdjustment.service.js`
  - `Front-end`: `ARAWMS_FE/src/pages/inventory-auditing/AdjustmentApprovalModal.jsx` (thông báo hạn mức phê duyệt)
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-22] Phiếu điều chỉnh chênh lệch > 5.000.000 VNĐ bắt buộc phải do Store Owner phê duyệt
  const APPROVAL_THRESHOLD = 5000000;
  if (Math.abs(adjustment.totalDiscrepancyAmount) > APPROVAL_THRESHOLD && user.role !== 'OWNER') {
    throw new Error('[BR: GBR-22] Phiếu điều chỉnh vượt quá 5.000.000 VNĐ chỉ có Chủ cửa hàng (OWNER) được duyệt.');
  }
  ```

---

### GBR-23: Ghi nhận nhật ký kiểm toán (Audit Log) cho dữ liệu trọng yếu
- **Rule Statement**: All add, edit, and delete operations on critical data (User, Order, Inventory, Financials) must be logged in the Audit Log with timestamps and the executor's ID.
- **Applies To**: System-wide (`FT-01` đến `FT-12`)
- **Rationale**: Phục vụ công tác truy vết sự cố, đảm bảo trách nhiệm giải trình và kiểm toán hệ thống.
- **Enforced By**: Hệ thống tự động ghi nhật ký tại tầng Middleware hoặc Service layer.
- **Rule Type**: `Constraint`
- **Source of rule**: Information Security Compliance Standards
- **Vị trí Code áp dụng**:
  - `Middleware`: `ARAWMS_BE/src/common/middlewares/auditLogger.middleware.js`
  - `Service`: Tích hợp hàm `recordSystemLog()` trong toàn bộ các Services thuộc `src/modules/...`
  - `Model`: `ARAWMS_BE/src/models/SystemLog.model.js`
  - `Front-end`: `ARAWMS_FE/src/pages/system-administration/AuditLogsPage.jsx`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-23] Bắt buộc ghi SystemLog kiểm toán cho thao tác thay đổi dữ liệu trọng yếu
  await recordSystemLog({
    actor: user,
    majorFeature: 'Order Fulfillment',
    subFeature: 'Order Management',
    action: 'CANCEL_ORDER',
    targetCollection: 'SalesOrder',
    targetId: order._id,
    targetCode: order.orderCode,
    beforeSnapshot,
    afterSnapshot: order.toObject(),
    req,
  });
  ```

---

### GBR-24: Xác thực chữ ký số HMAC cho Webhook thanh toán trực tuyến
- **Rule Statement**: When integrating payment webhooks (VnPay/SePay), the system must validate the data signature (HMAC Signature) before updating transaction statuses.
- **Applies To**: Payment Gateway Integration (API)
- **Rationale**: Ngăn chặn kẻ xấu giả mạo thông báo thanh toán thành công để chiếm đoạt hàng hóa.
- **Enforced By**: Hệ thống kiểm tra chuỗi băm HMAC với Secret Key trước khi xử lý Payload.
- **Rule Type**: `Constraint`
- **Source of rule**: Secure Payment Gateway Integration Standards
- **Vị trí Code áp dụng**:
  - `Middleware / Route`: `ARAWMS_BE/src/modules/financial-intelligence/payment-webhook/paymentWebhook.routes.js`
  - `Validation`: `ARAWMS_BE/src/modules/financial-intelligence/payment-webhook/paymentWebhook.validation.js`
  - `Service`: `ARAWMS_BE/src/modules/financial-intelligence/payment-webhook/paymentWebhook.service.js` (tính toán HMAC SHA-512 và xác minh dữ liệu)
  - `Controller`: `ARAWMS_BE/src/modules/financial-intelligence/payment-webhook/paymentWebhook.controller.js`
- **Mã chú thích mẫu**:
  ```javascript
  // [BR: GBR-24] Xác thực chữ ký số HMAC của webhook thanh toán trước khi xử lý
  const isValidSignature = verifyHmacSignature(req.body, req.headers['x-signature'], SECRET_KEY);
  if (!isValidSignature) {
    return res.status(401).json({ success: false, message: '[BR: GBR-24] Chữ ký số HMAC không hợp lệ.' });
  }
  ```

---

## 4. Hướng dẫn Dành cho AI Assistant & Developer

1. Khi viết code ở bất kỳ file nào thuộc 5 tầng (Front-end, Route, Validation, Controller, Service), **hãy mở `BR.md` này để đối chiếu mã `GBR-ID`**.
2. Luôn gắn chú thích `// [BR: GBR-xx] <nội dung tóm tắt>` ngay tại dòng lệnh thực thi quy tắc.
3. Khi người dùng yêu cầu chỉnh sửa một quy tắc nghiệp vụ, lập trình viên/AI phải cập nhật đồng bộ ở cả 2 nơi:
   - File tài liệu `BR.md`
   - Đoạn code và comment tương ứng trong source code.
