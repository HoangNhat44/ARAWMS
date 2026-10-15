# AraWMS – Từ điển dữ liệu MongoDB

Sinh tự động từ validator và index thật trong `init.js` (31 collection + 10 view). Chạy lại: `cd tests && node gen_dictionary.js`.

**Cách đọc**
- **Bắt buộc ✔**: trường phải có khi tạo document. Với trường lồng (`a.b`, `a[].b`) là bắt buộc khi `a` có mặt.
- **Kiểu**: `number` là int/long/double/decimal; `array<object>` là mảng document nhúng, các trường con ghi dạng `tên[].trường`.
- **Tham chiếu**: trường `ObjectId` trỏ tới collection nào (không có khoá ngoại, ứng dụng tự kiểm tra).
- Mọi collection có `_id` (ObjectId, tự sinh; riêng `SETTING`/`COUNTER` trong `config` dùng `_id` là chuỗi). Các document cấp cao có thêm `createdAt`, `updatedAt` (Date, tự ghi bởi Mongoose `timestamps`) trừ khi bảng ghi khác.
- Tiền là VND (đồng). Ràng buộc từng trường (ví dụ `≥ 0`) nằm ở cột giá trị; trường có dấu như chênh lệch, giá vốn trả hàng, số lượng sổ cái thì không giới hạn dấu.

## Mục lục
1. [`users`](#users) – FT-01
2. [`notifications`](#notifications) – FT-01
3. [`config`](#config) – FT-02
4. [`jobs`](#jobs) – FT-02
5. [`partners`](#partners) – FT-03
6. [`materials`](#materials) – FT-03
7. [`skus`](#skus) – FT-03
8. [`boms`](#boms) – FT-04
9. [`product_samples`](#product_samples) – FT-04
10. [`production_orders`](#production_orders) – FT-05
11. [`waste_records`](#waste_records) – FT-06
12. [`fabric_rolls`](#fabric_rolls) – FT-07
13. [`stock_documents`](#stock_documents) – FT-07/08
14. [`stock_balances`](#stock_balances) – FT-07/08
15. [`stock_movements`](#stock_movements) – FT-07/08
16. [`defective_stock`](#defective_stock) – FT-08
17. [`inventory_counts`](#inventory_counts) – FT-08
18. [`inventory_count_items`](#inventory_count_items) – FT-08
19. [`inventory_alerts`](#inventory_alerts) – FT-08
20. [`customers`](#customers) – FT-09
21. [`chat_conversations`](#chat_conversations) – FT-09
22. [`chat_messages`](#chat_messages) – FT-09
23. [`sales_orders`](#sales_orders) – FT-10
24. [`shipments`](#shipments) – FT-10/12
25. [`return_requests`](#return_requests) – FT-11
26. [`cash_vouchers`](#cash_vouchers) – FT-12
27. [`supplier_debts`](#supplier_debts) – FT-12
28. [`cod_statements`](#cod_statements) – FT-12
29. [`cogs_entries`](#cogs_entries) – FT-12
30. [`financial_periods`](#financial_periods) – FT-12
31. [`manager_reports`](#manager_reports) – FT-12
32. [View báo cáo](#views)

---

<a id="users"></a>

## 1. `users`

**Feature:** FT-01  
Tài khoản nhân viên (UC-01..UC-09): đăng nhập, vai trò, quyền ngoại lệ, khoá tài khoản, hồ sơ Seller (nhận hội thoại), phiên đăng nhập (refresh token) nhúng ngay trong user.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `username` | string | ✔ |  |  |
| `email` | string | ✔ |  |  |
| `passwordHash` | string |  |  |  |
| `fullName` | string | ✔ |  |  |
| `phone` | string |  |  |  |
| `avatarUrl` | string |  |  |  |
| `status` | enum | ✔ | `ACTIVE` · `LOCKED` · `DISABLED` |  |
| `googleSub` | string |  |  |  |
| `roles` | array<string> | ✔ | ≥ 1 phần tử |  |
| `permissionOverrides` | array<object> |  |  |  |
| `permissionOverrides[].code` | string | ✔ |  |  |
| `permissionOverrides[].granted` | boolean | ✔ |  |  |
| `permissionOverrides[].by` | ObjectId |  |  | users |
| `permissionOverrides[].at` | Date |  |  |  |
| `mustChangePassword` | boolean |  |  |  |
| `failedLoginCount` | number |  |  |  |
| `lastLoginAt` | Date |  |  |  |
| `lock` | object |  |  |  |
| `lock.lockedAt` | Date |  |  |  |
| `lock.lockedBy` | ObjectId |  |  | users |
| `lock.reason` | string |  |  |  |
| `sellerProfile` | object |  |  |  |
| `sellerProfile.isAvailable` | boolean |  |  |  |
| `sellerProfile.maxConcurrentConversations` | number |  |  |  |
| `sellerProfile.lastAssignedAt` | Date |  |  |  |
| `sessions` | array<object> |  | ≤ 20 phần tử |  |
| `sessions[].tokenHash` | string | ✔ |  |  |
| `sessions[].loginMethod` | enum |  | `PASSWORD` · `GOOGLE` |  |
| `sessions[].ip` | string |  |  |  |
| `sessions[].userAgent` | string |  |  |  |
| `sessions[].issuedAt` | Date | ✔ |  |  |
| `sessions[].expiresAt` | Date | ✔ |  |  |
| `sessions[].revokedAt` | Date |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ username:1 }` — unique, không phân biệt hoa/thường
- `{ email:1 }` — unique, không phân biệt hoa/thường
- `{ googleSub:1 }` — unique, chỉ áp khi {googleSub:{$type:string}}
- `{ sessions.tokenHash:1 }` — unique, chỉ áp khi {sessions.tokenHash:{$type:string}}
- `{ roles:1, status:1 }`
- `{ sellerProfile.isAvailable:1, sellerProfile.lastAssignedAt:1 }`

---

<a id="notifications"></a>

## 2. `notifications`

**Feature:** FT-01  
Thông báo gửi cho từng user. Tự xoá sau 90 ngày.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `userId` | ObjectId | ✔ |  | users |
| `type` | string | ✔ |  |  |
| `title` | string | ✔ |  |  |
| `body` | string |  |  |  |
| `ref` | object |  |  |  |
| `ref.type` | string |  |  |  |
| `ref.id` | ObjectId |  |  | theo ref.type |
| `isRead` | boolean | ✔ |  |  |
| `createdAt` | Date | ✔ |  |  |

**Index:**
- `{ userId:1, isRead:1, createdAt:-1 }`
- `{ createdAt:1 }` — TTL 90 ngày

---

<a id="config"></a>

## 3. `config`

**Feature:** FT-02  
Cấu hình dùng chung, **9 loại** phân biệt bằng `kind`: SETTING, COUNTER, ROLE, UNIT, WAREHOUSE, DOC_TEMPLATE, RETURN_POLICY, INTEGRATION, FIN_CATEGORY.

Phân loại bằng trường **`kind`** (bắt buộc, validator riêng cho từng loại).

### `kind = SETTING`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `_id` | string | ✔ |  |  |
| `value` | any | ✔ |  |  |
| `group` | string | ✔ |  |  |
| `description` | string |  |  |  |
| `updatedBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `kind = COUNTER`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `_id` | string | ✔ |  |  |
| `prefix` | string | ✔ |  |  |
| `seq` | number | ✔ |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `kind = ROLE`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `name` | string | ✔ |  |  |
| `description` | string |  |  |  |
| `isSystem` | boolean |  |  |  |
| `permissions` | array<string> | ✔ |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `kind = UNIT`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `name` | string | ✔ |  |  |
| `unitType` | enum | ✔ | `LENGTH` · `WEIGHT` · `COUNT` · `AREA` · `VOLUME` |  |
| `baseUnitCode` | string |  |  |  |
| `conversionFactor` | number |  | ≥ 0 |  |
| `isActive` | boolean |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `kind = WAREHOUSE`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `name` | string | ✔ |  |  |
| `warehouseType` | enum | ✔ | `RAW_MATERIAL` · `FINISHED_GOODS` · `DEFECTIVE` · `WIP` · `RETURNS` |  |
| `address` | string |  |  |  |
| `isSellable` | boolean | ✔ |  |  |
| `isActive` | boolean | ✔ |  |  |
| `locations` | array<object> |  |  |  |
| `locations[].code` | string | ✔ |  |  |
| `locations[].name` | string |  |  |  |
| `locations[].type` | enum |  | `ZONE` · `AISLE` · `RACK` · `SHELF` · `BIN` |  |
| `locations[].parentCode` | string |  |  |  |
| `locations[].capacity` | number |  | ≥ 0 |  |
| `locations[].isActive` | boolean |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `kind = DOC_TEMPLATE`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `templateType` | enum | ✔ | `FABRIC_ROLL_LABEL` · `SKU_LABEL` · `WAYBILL_LABEL` · `SHIPPING_DOCUMENT` · `PARCEL_HANDOVER_REPORT` · `MATERIAL_RECEIPT` · `MATERIAL_ISSUE_SLIP` · `PICK_LIST` · `OTHER` |  |
| `name` | string | ✔ |  |  |
| `paperSize` | string |  |  |  |
| `fields` | array<string> |  |  |  |
| `content` | string |  |  |  |
| `isDefault` | boolean | ✔ |  |  |
| `isActive` | boolean | ✔ |  |  |
| `updatedBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `kind = RETURN_POLICY`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `name` | string | ✔ |  |  |
| `returnWindowDays` | number | ✔ |  |  |
| `allowExchange` | boolean |  |  |  |
| `allowRefund` | boolean |  |  |  |
| `defaultSurchargeRate` | number | ✔ | 0–1 |  |
| `shippingFeePayer` | enum |  | `CUSTOMER` · `SHOP` · `SHARED` |  |
| `description` | string |  |  |  |
| `surchargeRules` | array<object> |  |  |  |
| `surchargeRules[].reasonCode` | string | ✔ |  |  |
| `surchargeRules[].description` | string |  |  |  |
| `surchargeRules[].rate` | number |  | 0–1 |  |
| `surchargeRules[].fixedAmount` | number |  | ≥ 0 |  |
| `surchargeRules[].isActive` | boolean |  |  |  |
| `effectiveFrom` | Date |  |  |  |
| `effectiveTo` | Date |  |  |  |
| `isActive` | boolean | ✔ |  |  |
| `updatedBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `kind = INTEGRATION`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `provider` | enum | ✔ | `FACEBOOK_MESSENGER` · `GHN` · `GHTK` · `VIETTEL_POST` · `GOOGLE_OAUTH` · `OTHER` |  |
| `name` | string | ✔ |  |  |
| `externalId` | string |  |  |  |
| `config` | any |  |  |  |
| `secretEncrypted` | string |  |  |  |
| `status` | enum | ✔ | `ACTIVE` · `INACTIVE` · `ERROR` |  |
| `lastCheckedAt` | Date |  |  |  |
| `lastError` | string |  |  |  |
| `updatedBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `kind = FIN_CATEGORY`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `name` | string | ✔ |  |  |
| `flowType` | enum | ✔ | `INCOME` · `EXPENSE` |  |
| `parentCode` | string |  |  |  |
| `isSystem` | boolean |  |  |  |
| `isActive` | boolean | ✔ |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ kind:1, code:1 }` — unique, chỉ áp khi {code:{$type:string}}
- `{ templateType:1 }` — unique, chỉ áp khi {kind:DOC_TEMPLATE,isDefault:true}
- `{ provider:1, externalId:1 }` — unique, chỉ áp khi {externalId:{$type:string}}

---

<a id="jobs"></a>

## 4. `jobs`

**Feature:** FT-02  
Tác vụ / nhật ký file, **4 loại** phân biệt bằng `jobType`: IMPORT, EXPORT (UC-95), PRINT (UC-114/115), REPORT_EXPORT.

Phân loại bằng trường **`jobType`** (bắt buộc, validator riêng cho từng loại).

### `jobType = IMPORT`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `entityType` | enum | ✔ | `SKU` · `PRODUCT` · `MATERIAL` · `FABRIC_ROLL` · `SUPPLIER` |  |
| `fileName` | string |  |  |  |
| `fileUrl` | string |  |  |  |
| `totalRows` | number |  |  |  |
| `successRows` | number |  |  |  |
| `errorRows` | number |  |  |  |
| `errors` | any |  |  |  |
| `status` | enum | ✔ | `PENDING` · `PROCESSING` · `COMPLETED` · `COMPLETED_WITH_ERRORS` · `FAILED` |  |
| `finishedAt` | Date |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date | ✔ |  |  |

### `jobType = EXPORT`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `entityType` | enum | ✔ | `SKU` · `PRODUCT` · `MATERIAL` · `FABRIC_ROLL` · `SUPPLIER` |  |
| `fileName` | string |  |  |  |
| `fileUrl` | string |  |  |  |
| `totalRows` | number |  |  |  |
| `successRows` | number |  |  |  |
| `errorRows` | number |  |  |  |
| `errors` | any |  |  |  |
| `status` | enum | ✔ | `PENDING` · `PROCESSING` · `COMPLETED` · `COMPLETED_WITH_ERRORS` · `FAILED` |  |
| `finishedAt` | Date |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date | ✔ |  |  |

### `jobType = PRINT`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `templateId` | ObjectId |  |  | config (DOC_TEMPLATE) |
| `labelType` | string | ✔ |  |  |
| `ref` | object | ✔ |  |  |
| `ref.type` | string |  |  |  |
| `ref.id` | ObjectId |  |  | theo ref.type |
| `copies` | number | ✔ | ≥ 1 |  |
| `reason` | enum |  | `FIRST_PRINT` · `REPRINT` · `REMEASURE` |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date | ✔ |  |  |

### `jobType = REPORT_EXPORT`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `reportType` | string | ✔ |  |  |
| `periodId` | ObjectId |  |  | financial_periods |
| `params` | any |  |  |  |
| `fileFormat` | enum | ✔ | `XLSX` · `PDF` · `CSV` |  |
| `fileUrl` | string |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date | ✔ |  |  |

**Index:**
- `{ jobType:1, createdAt:-1 }`
- `{ ref.type:1, ref.id:1 }` — chỉ áp khi {ref.id:{$type:objectId}}

---

<a id="partners"></a>

## 5. `partners`

**Feature:** FT-03  
Đối tác bên ngoài, **2 loại** phân biệt bằng `partnerType`: SUPPLIER (UC-30..34) và CARRIER (UC-35..38).

Phân loại bằng trường **`partnerType`** (bắt buộc, validator riêng cho từng loại).

### `partnerType = SUPPLIER`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `name` | string | ✔ |  |  |
| `contactPerson` | string |  |  |  |
| `phone` | string |  |  |  |
| `email` | string |  |  |  |
| `address` | string |  |  |  |
| `taxCode` | string |  |  |  |
| `bank` | object |  |  |  |
| `bank.name` | string |  |  |  |
| `bank.accountNo` | string |  |  |  |
| `bank.accountName` | string |  |  |  |
| `paymentTermsDays` | number |  |  |  |
| `note` | string |  |  |  |
| `isActive` | boolean | ✔ |  |  |
| `deletedAt` | Date |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `partnerType = CARRIER`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `name` | string | ✔ |  |  |
| `contact` | object |  |  |  |
| `contact.person` | string |  |  |  |
| `contact.phone` | string |  |  |  |
| `contact.email` | string |  |  |  |
| `trackingUrlTemplate` | string |  |  |  |
| `codFeeRate` | number |  | 0–1 |  |
| `codStatementFormat` | any |  |  |  |
| `integrationId` | ObjectId |  |  | config (INTEGRATION) |
| `note` | string |  |  |  |
| `isActive` | boolean | ✔ |  |  |
| `deletedAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ partnerType:1, code:1 }` — unique
- `{ partnerType:1, name:1 }` — không phân biệt hoa/thường

---

<a id="materials"></a>

## 6. `materials`

**Feature:** FT-03  
Danh mục nguyên phụ liệu (UC-94): nhà cung cấp, lịch sử giá, định mức hao hụt, hạn mức tồn (UC-23/50/51). Vải tính tồn theo cuộn (`fabric_rolls`).

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `name` | string | ✔ |  |  |
| `type` | enum | ✔ | `FABRIC` · `ACCESSORY` · `PACKAGING` |  |
| `unitCode` | string | ✔ |  |  |
| `color` | string |  |  |  |
| `defaultSupplierId` | ObjectId |  |  | partners (SUPPLIER) |
| `suppliers` | array<object> |  |  |  |
| `suppliers[].supplierId` | ObjectId | ✔ |  | partners (SUPPLIER) |
| `suppliers[].supplierSku` | string |  |  |  |
| `suppliers[].lastPrice` | number |  | ≥ 0 |  |
| `suppliers[].leadTimeDays` | number |  |  |  |
| `suppliers[].isPreferred` | boolean |  |  |  |
| `fabric` | object |  |  |  |
| `fabric.composition` | string |  |  |  |
| `fabric.widthCm` | number |  | ≥ 0 |  |
| `fabric.weightGsm` | number |  | ≥ 0 |  |
| `isRollTracked` | boolean | ✔ |  |  |
| `limits` | object |  |  |  |
| `limits.min` | number |  | ≥ 0 |  |
| `limits.safety` | number |  | ≥ 0 |  |
| `limits.max` | number |  | ≥ 0 |  |
| `standardUnitCost` | number |  | ≥ 0 |  |
| `costHistory` | array<object> |  |  |  |
| `costHistory[].unitCost` | number | ✔ | ≥ 0 |  |
| `costHistory[].effectiveFrom` | Date | ✔ |  |  |
| `costHistory[].effectiveTo` | Date |  |  |  |
| `costHistory[].source` | enum |  | `MANUAL` · `GOODS_RECEIPT` · `SUPPLIER_QUOTE` |  |
| `costHistory[].note` | string |  |  |  |
| `costHistory[].by` | ObjectId |  |  | users |
| `wastageStandard` | object |  |  |  |
| `wastageStandard.rate` | number |  | 0–0.99 |  |
| `wastageStandard.effectiveFrom` | Date |  |  |  |
| `wastageStandard.by` | ObjectId |  |  | users |
| `wastageHistory` | array<object> |  |  |  |
| `wastageHistory[].rate` | number |  | 0–1 |  |
| `wastageHistory[].effectiveFrom` | Date |  |  |  |
| `wastageHistory[].effectiveTo` | Date |  |  |  |
| `wastageHistory[].by` | ObjectId |  |  | users |
| `barcode` | string |  |  |  |
| `imageUrl` | string |  |  |  |
| `description` | string |  |  |  |
| `isActive` | boolean | ✔ |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Quy tắc chéo trường:**
- `isRollTracked = true` chỉ hợp lệ khi `type = FABRIC`.

**Index:**
- `{ code:1 }` — unique
- `{ type:1, isActive:1 }`
- `{ barcode:1 }` — unique, chỉ áp khi {barcode:{$type:string}}
- `{ suppliers.supplierId:1 }`

---

<a id="skus"></a>

## 7. `skus`

**Feature:** FT-03  
Danh mục SKU (UC-91) kèm dữ liệu sản phẩm (UC-92): mã vạch, giá bán, hạn mức tồn. Một document = một biến thể màu/size.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `skuCode` | string | ✔ |  |  |
| `productCode` | string | ✔ |  |  |
| `productName` | string | ✔ |  |  |
| `categoryPath` | array<string> |  |  |  |
| `season` | enum |  | `SUMMER` · `WINTER` · `TET` · `SPRING_AUTUMN` · `ALL_YEAR` |  |
| `description` | string |  |  |  |
| `color` | object |  |  |  |
| `color.code` | string |  |  |  |
| `color.name` | string |  |  |  |
| `color.hex` | string |  |  |  |
| `size` | object |  |  |  |
| `size.code` | string |  |  |  |
| `size.name` | string |  |  |  |
| `size.sortOrder` | number |  |  |  |
| `sellingPrice` | number | ✔ | ≥ 0 |  |
| `standardCost` | number |  | ≥ 0 |  |
| `weightG` | number |  | ≥ 0 |  |
| `limits` | object |  |  |  |
| `limits.min` | number |  |  |  |
| `limits.safety` | number |  |  |  |
| `limits.max` | number |  |  |  |
| `barcodes` | array<string> |  |  |  |
| `primaryBarcode` | string |  |  |  |
| `imageUrl` | string |  |  |  |
| `isActive` | boolean | ✔ |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ skuCode:1 }` — unique
- `{ productCode:1, color.code:1, size.code:1 }` — unique
- `{ categoryPath:1 }`
- `{ season:1, isActive:1 }`
- `{ barcodes:1 }` — unique, chỉ áp khi {barcodes:{$type:string}}

---

<a id="boms"></a>

## 8. `boms`

**Feature:** FT-04  
BOM theo SKU, có phiên bản (UC-42, UC-47..UC-60): dòng nguyên liệu, thông số kỹ thuật, bảng size, file rập, luồng duyệt, nhật ký thay đổi. Mỗi SKU có đúng một BOM `STANDARD`.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `skuId` | ObjectId | ✔ |  | skus |
| `skuCode` | string |  |  |  |
| `bomCode` | string | ✔ |  |  |
| `versionNo` | number | ✔ | ≥ 1 |  |
| `status` | enum | ✔ | `DRAFT` · `PENDING_APPROVAL` · `APPROVED` · `REJECTED` · `STANDARD` · `ARCHIVED` |  |
| `basedOnBomId` | ObjectId |  |  | boms |
| `changeReason` | string |  |  |  |
| `techNotes` | string |  |  |  |
| `lines` | array<object> | ✔ |  |  |
| `lines[].materialId` | ObjectId | ✔ |  | materials |
| `lines[].materialCode` | string |  |  |  |
| `lines[].materialName` | string |  |  |  |
| `lines[].usagePart` | string |  |  |  |
| `lines[].qtyPerUnit` | number | ✔ | ≥ 0 |  |
| `lines[].unitCode` | string | ✔ |  |  |
| `lines[].wastageRate` | number |  | 0–0.99 |  |
| `lines[].unitCostSnapshot` | number |  | ≥ 0 |  |
| `lines[].lineCost` | number |  | ≥ 0 |  |
| `lines[].note` | string |  |  |  |
| `techSpecs` | array<object> |  |  |  |
| `techSpecs[].group` | string |  |  |  |
| `techSpecs[].key` | string | ✔ |  |  |
| `techSpecs[].value` | string | ✔ |  |  |
| `sizeSpecs` | array<object> |  |  |  |
| `sizeSpecs[].sizeCode` | string | ✔ |  |  |
| `sizeSpecs[].measurement` | string | ✔ |  |  |
| `sizeSpecs[].valueCm` | number | ✔ | ≥ 0 |  |
| `sizeSpecs[].toleranceCm` | number |  | ≥ 0 |  |
| `patternFiles` | array<object> |  |  |  |
| `patternFiles[].fileName` | string | ✔ |  |  |
| `patternFiles[].fileUrl` | string | ✔ |  |  |
| `patternFiles[].fileType` | string |  |  |  |
| `patternFiles[].sizeBytes` | number |  | ≥ 0 |  |
| `patternFiles[].versionNo` | number |  |  |  |
| `patternFiles[].status` | enum | ✔ | `ACTIVE` · `REPLACED` · `DELETED` |  |
| `patternFiles[].uploadedBy` | ObjectId |  |  | users |
| `patternFiles[].uploadedAt` | Date |  |  |  |
| `patternFiles[].deletedAt` | Date |  |  |  |
| `approvals` | array<object> |  |  |  |
| `approvals[].action` | enum | ✔ | `SUBMIT` · `APPROVE` · `REJECT` · `FINALIZE` · `ARCHIVE` |  |
| `approvals[].actorId` | ObjectId | ✔ |  | users |
| `approvals[].comment` | string |  |  |  |
| `approvals[].at` | Date | ✔ |  |  |
| `cost` | object |  |  |  |
| `cost.material` | number |  | ≥ 0 |  |
| `cost.labor` | number |  | ≥ 0 |  |
| `cost.overhead` | number |  | ≥ 0 |  |
| `cost.standard` | number |  | ≥ 0 |  |
| `changeLog` | array<object> |  | ≤ 1000 phần tử |  |
| `changeLog[].fromBomId` | ObjectId |  |  | boms |
| `changeLog[].changeType` | enum | ✔ | `ADD` · `UPDATE` · `REMOVE` |  |
| `changeLog[].target` | string |  |  |  |
| `changeLog[].field` | string |  |  |  |
| `changeLog[].oldValue` | any |  |  |  |
| `changeLog[].newValue` | any |  |  |  |
| `changeLog[].changedBy` | ObjectId |  |  | users |
| `changeLog[].changedAt` | Date | ✔ |  |  |
| `createdBy` | ObjectId |  |  | users |
| `approvedBy` | ObjectId |  |  | users |
| `approvedAt` | Date |  |  |  |
| `finalizedBy` | ObjectId |  |  | users |
| `finalizedAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ bomCode:1 }` — unique
- `{ skuId:1, versionNo:1 }` — unique
- `{ skuId:1 }` — unique, chỉ áp khi {status:STANDARD}
- `{ status:1 }`
- `{ lines.materialId:1 }`

---

<a id="product_samples"></a>

## 9. `product_samples`

**Feature:** FT-04  
Mẫu sản phẩm mới đang phát triển (UC-20).

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `name` | string | ✔ |  |  |
| `productCode` | string |  |  |  |
| `status` | enum | ✔ | `IN_DEVELOPMENT` · `SAMPLE_READY` · `UNDER_REVIEW` · `APPROVED` · `REJECTED` |  |
| `description` | string |  |  |  |
| `imageUrls` | array<string> |  |  |  |
| `estimatedCost` | number |  | ≥ 0 |  |
| `proposedPrice` | number |  | ≥ 0 |  |
| `evaluationNote` | string |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `reviewedBy` | ObjectId |  |  | users |
| `reviewedAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ code:1 }` — unique
- `{ status:1, createdAt:-1 }`

---

<a id="production_orders"></a>

## 10. `production_orders`

**Feature:** FT-05  
Lệnh sản xuất (UC-19, UC-28/29, UC-39..41): mặt hàng, nhu cầu nguyên liệu, cảnh báo thiếu, công đoạn, kế hoạch cắt, bán thành phẩm, đối chiếu định mức, giá thành và các yêu cầu cấp vật tư.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `status` | enum | ✔ | `DRAFT` · `PLANNED` · `MATERIAL_SHORTAGE` · `RELEASED` · `IN_PROGRESS` · `COMPLETED` · `CANCELLED` |  |
| `priority` | number |  | 1–5 |  |
| `season` | string |  |  |  |
| `plannedStart` | Date |  |  |  |
| `plannedEnd` | Date |  |  |  |
| `actualStart` | Date |  |  |  |
| `actualEnd` | Date |  |  |  |
| `requirements` | string |  |  |  |
| `items` | array<object> | ✔ | ≥ 1 phần tử |  |
| `items[].skuId` | ObjectId | ✔ |  | skus |
| `items[].skuCode` | string |  |  |  |
| `items[].bomId` | ObjectId | ✔ |  | boms |
| `items[].plannedQty` | number | ✔ | ≥ 1 |  |
| `items[].completedQty` | number |  | ≥ 0 |  |
| `items[].defectiveQty` | number |  | ≥ 0 |  |
| `items[].receivedQty` | number |  | ≥ 0 |  |
| `materialRequirements` | array<object> |  |  |  |
| `materialRequirements[].materialId` | ObjectId | ✔ |  | materials |
| `materialRequirements[].materialCode` | string |  |  |  |
| `materialRequirements[].unitCode` | string |  |  |  |
| `materialRequirements[].baseQty` | number |  | ≥ 0 |  |
| `materialRequirements[].wastageQty` | number |  | ≥ 0 |  |
| `materialRequirements[].requiredQty` | number | ✔ | ≥ 0 |  |
| `materialRequirements[].availableQty` | number |  | ≥ 0 |  |
| `materialRequirements[].reservedQty` | number |  | ≥ 0 |  |
| `materialRequirements[].issuedQty` | number |  | ≥ 0 |  |
| `materialRequirements[].returnedQty` | number |  | ≥ 0 |  |
| `materialRequirements[].consumedQty` | number |  | ≥ 0 |  |
| `materialRequirements[].shortageQty` | number |  | ≥ 0 |  |
| `materialRequirements[].calculatedAt` | Date |  |  |  |
| `shortageAlerts` | array<object> |  |  |  |
| `shortageAlerts[].materialId` | ObjectId | ✔ |  | materials |
| `shortageAlerts[].requiredQty` | number |  | ≥ 0 |  |
| `shortageAlerts[].availableQty` | number |  | ≥ 0 |  |
| `shortageAlerts[].shortageQty` | number | ✔ | ≥ 0 |  |
| `shortageAlerts[].status` | enum | ✔ | `OPEN` · `ESCALATED` · `APPROVED_TO_PROCEED` · `REJECTED` · `RESOLVED` |  |
| `shortageAlerts[].escalatedToOwner` | boolean |  |  |  |
| `shortageAlerts[].decidedBy` | ObjectId |  |  | users |
| `shortageAlerts[].decidedAt` | Date |  |  |  |
| `shortageAlerts[].decisionNote` | string |  |  |  |
| `shortageAlerts[].createdAt` | Date |  |  |  |
| `shortageAlerts[].resolvedAt` | Date |  |  |  |
| `stages` | array<object> |  |  |  |
| `stages[].stage` | enum | ✔ | `CUTTING` · `SEWING` · `FINISHING` · `QC` · `PACKING` |  |
| `stages[].seq` | number |  |  |  |
| `stages[].status` | enum | ✔ | `NOT_STARTED` · `IN_PROGRESS` · `DONE` · `BLOCKED` |  |
| `stages[].qtyIn` | number |  | ≥ 0 |  |
| `stages[].qtyOut` | number |  | ≥ 0 |  |
| `stages[].qtyDefect` | number |  | ≥ 0 |  |
| `stages[].startedAt` | Date |  |  |  |
| `stages[].finishedAt` | Date |  |  |  |
| `stages[].note` | string |  |  |  |
| `stages[].updatedBy` | ObjectId |  |  | users |
| `cuttingPlans` | array<object> |  |  |  |
| `cuttingPlans[].code` | string | ✔ |  |  |
| `cuttingPlans[].materialId` | ObjectId | ✔ |  | materials |
| `cuttingPlans[].patternFileName` | string |  |  |  |
| `cuttingPlans[].layers` | number |  |  |  |
| `cuttingPlans[].markerLengthM` | number |  | ≥ 0 |  |
| `cuttingPlans[].plannedFabricQty` | number |  | ≥ 0 |  |
| `cuttingPlans[].actualFabricQty` | number |  | ≥ 0 |  |
| `cuttingPlans[].status` | enum | ✔ | `PLANNED` · `CUTTING` · `DONE` · `CANCELLED` |  |
| `cuttingPlans[].items` | array<object> |  |  |  |
| `cuttingPlans[].items[].skuId` | ObjectId | ✔ |  | skus |
| `cuttingPlans[].items[].plannedPieces` | number | ✔ |  |  |
| `cuttingPlans[].items[].cutPieces` | number |  |  |  |
| `cuttingPlans[].note` | string |  |  |  |
| `semiFinished` | array<object> |  |  |  |
| `semiFinished[].skuId` | ObjectId | ✔ |  | skus |
| `semiFinished[].stage` | string | ✔ |  |  |
| `semiFinished[].qty` | number | ✔ | ≥ 0 |  |
| `semiFinished[].locationNote` | string |  |  |  |
| `semiFinished[].updatedAt` | Date |  |  |  |
| `reconciliations` | array<object> |  |  |  |
| `reconciliations[].materialId` | ObjectId | ✔ |  | materials |
| `reconciliations[].standardQty` | number |  | ≥ 0 |  |
| `reconciliations[].actualQty` | number |  | ≥ 0 |  |
| `reconciliations[].varianceQty` | number |  |  |  |
| `reconciliations[].varianceRate` | number |  |  |  |
| `reconciliations[].status` | enum | ✔ | `PENDING` · `ACCEPTED` · `INVESTIGATING` · `BOM_UPDATE_REQUIRED` |  |
| `reconciliations[].reviewedBy` | ObjectId |  |  | users |
| `reconciliations[].reviewedAt` | Date |  |  |  |
| `reconciliations[].note` | string |  |  |  |
| `cost` | object |  |  |  |
| `cost.materialCost` | number |  | ≥ 0 |  |
| `cost.wastageCost` | number |  | ≥ 0 |  |
| `cost.laborCost` | number |  | ≥ 0 |  |
| `cost.overheadCost` | number |  | ≥ 0 |  |
| `cost.totalCost` | number |  | ≥ 0 |  |
| `cost.producedQty` | number |  | ≥ 0 |  |
| `cost.unitCost` | number |  | ≥ 0 |  |
| `cost.calculatedAt` | Date |  |  |  |
| `issueRequests` | array<object> |  |  |  |
| `issueRequests[]._id` | ObjectId | ✔ |  |  |
| `issueRequests[].code` | string | ✔ |  |  |
| `issueRequests[].requestType` | enum | ✔ | `INITIAL` · `SUPPLEMENTARY` |  |
| `issueRequests[].parentRequestId` | ObjectId |  |  | production_orders.issueRequests._id |
| `issueRequests[].status` | enum | ✔ | `DRAFT` · `PENDING_APPROVAL` · `APPROVED` · `REJECTED` · `PICKING` · `ISSUED` · `CANCELLED` |  |
| `issueRequests[].reason` | string |  |  |  |
| `issueRequests[].items` | array<object> | ✔ | ≥ 1 phần tử |  |
| `issueRequests[].items[].materialId` | ObjectId | ✔ |  | materials |
| `issueRequests[].items[].materialCode` | string |  |  |  |
| `issueRequests[].items[].unitCode` | string |  |  |  |
| `issueRequests[].items[].requestedQty` | number | ✔ | ≥ 0 |  |
| `issueRequests[].items[].approvedQty` | number |  | ≥ 0 |  |
| `issueRequests[].items[].issuedQty` | number |  | ≥ 0 |  |
| `issueRequests[].items[].note` | string |  |  |  |
| `issueRequests[].requestedBy` | ObjectId |  |  | users |
| `issueRequests[].requestedAt` | Date |  |  |  |
| `issueRequests[].approvedBy` | ObjectId |  |  | users |
| `issueRequests[].approvedAt` | Date |  |  |  |
| `issueRequests[].rejectReason` | string |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `releasedBy` | ObjectId |  |  | users |
| `releasedAt` | Date |  |  |  |
| `cancelledBy` | ObjectId |  |  | users |
| `cancelReason` | string |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Quy tắc chéo trường:**
- Mỗi phần tử `issueRequests[]` loại `SUPPLEMENTARY` bắt buộc có `reason` và `parentRequestId`.
- `items` phải có ít nhất 1 phần tử.

**Index:**
- `{ code:1 }` — unique
- `{ status:1, plannedStart:1 }`
- `{ items.skuId:1 }`
- `{ materialRequirements.materialId:1 }`
- `{ shortageAlerts.status:1 }`
- `{ issueRequests.code:1 }` — unique, chỉ áp khi {issueRequests.code:{$type:string}}
- `{ issueRequests.status:1 }`

---

<a id="waste_records"></a>

## 11. `waste_records`

**Feature:** FT-06  
Ghi nhận hao hụt, **2 loại** phân biệt bằng `recordType`: CONSUMPTION (tiêu hao thực tế vs định mức, UC-43/56) và LEFTOVER (vải thừa, UC-43/120).

Phân loại bằng trường **`recordType`** (bắt buộc, validator riêng cho từng loại).

### `recordType = CONSUMPTION`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `productionOrderId` | ObjectId | ✔ |  | production_orders |
| `materialId` | ObjectId | ✔ |  | materials |
| `cuttingPlanCode` | string |  |  |  |
| `fabricRollId` | ObjectId |  |  | fabric_rolls |
| `standardQty` | number | ✔ | ≥ 0 |  |
| `actualQty` | number | ✔ | ≥ 0 |  |
| `thresholdRate` | number |  | 0–1 |  |
| `varianceQty` | number |  |  |  |
| `varianceRate` | number |  |  |  |
| `isOverThreshold` | boolean | ✔ |  |  |
| `wastageReason` | string |  |  |  |
| `recordedBy` | ObjectId |  |  | users |
| `recordedAt` | Date | ✔ |  |  |
| `note` | string |  |  |  |

### `recordType = LEFTOVER`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `productionOrderId` | ObjectId | ✔ |  | production_orders |
| `materialId` | ObjectId | ✔ |  | materials |
| `fabricRollId` | ObjectId |  |  | fabric_rolls |
| `leftoverQty` | number | ✔ | ≥ 0 |  |
| `thresholdQty` | number |  | ≥ 0 |  |
| `isOverThreshold` | boolean |  |  |  |
| `disposition` | enum | ✔ | `RETURN_TO_STOCK` · `REUSE_NEXT_ORDER` · `SCRAP` |  |
| `status` | enum | ✔ | `RECORDED` · `CONFIRMED` |  |
| `recordedBy` | ObjectId |  |  | users |
| `recordedAt` | Date | ✔ |  |  |
| `confirmedQty` | number |  | ≥ 0 |  |
| `confirmedBy` | ObjectId |  |  | users |
| `confirmedAt` | Date |  |  |  |
| `note` | string |  |  |  |

**Index:**
- `{ productionOrderId:1, recordType:1, materialId:1 }`
- `{ productionOrderId:1 }` — chỉ áp khi {isOverThreshold:true}
- `{ recordType:1, status:1, recordedAt:-1 }`

---

<a id="fabric_rolls"></a>

## 12. `fabric_rolls`

**Feature:** FT-07  
Từng cuộn vải (UC-93, UC-114, UC-120) kèm lịch sử sự kiện của cuộn (nhập, đo lại, giữ, cắt, in tem...).

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `rollCode` | string | ✔ |  |  |
| `materialId` | ObjectId | ✔ |  | materials |
| `material` | object |  |  |  |
| `material.code` | string |  |  |  |
| `material.name` | string |  |  |  |
| `material.color` | string |  |  |  |
| `supplierId` | ObjectId |  |  | partners (SUPPLIER) |
| `receiptId` | ObjectId |  |  | stock_documents (MATERIAL_RECEIPT) |
| `lotNo` | string |  |  |  |
| `dyeLot` | string |  |  |  |
| `initialLength` | number | ✔ | ≥ 0 |  |
| `currentLength` | number | ✔ | ≥ 0 |  |
| `widthCm` | number |  | ≥ 0 |  |
| `weightKg` | number |  | ≥ 0 |  |
| `unitCost` | number |  | ≥ 0 |  |
| `status` | enum | ✔ | `IN_STOCK` · `RESERVED` · `IN_PRODUCTION` · `PARTIALLY_USED` · `DEPLETED` · `SCRAPPED` |  |
| `warehouseId` | ObjectId |  |  | config (WAREHOUSE) |
| `locationCode` | string |  |  |  |
| `reservedForPoId` | ObjectId |  |  | production_orders |
| `receivedAt` | Date |  |  |  |
| `lastMeasuredAt` | Date |  |  |  |
| `note` | string |  |  |  |
| `events` | array<object> |  |  |  |
| `events[].type` | enum | ✔ | `RECEIVED` · `REMEASURED` · `RESERVED` · `UNRESERVED` · `ISSUED` · `CUT` · `LEFTOVER_RETURNED` · `MOVED` · `ADJUSTED` · `SCRAPPED` · `LABEL_PRINTED` |  |
| `events[].lengthBefore` | number |  | ≥ 0 |  |
| `events[].lengthAfter` | number |  | ≥ 0 |  |
| `events[].fromLocation` | string |  |  |  |
| `events[].toLocation` | string |  |  |  |
| `events[].ref` | object |  |  |  |
| `events[].ref.type` | string |  |  |  |
| `events[].ref.id` | ObjectId |  |  | theo ref.type |
| `events[].note` | string |  |  |  |
| `events[].by` | ObjectId |  |  | users |
| `events[].at` | Date | ✔ |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ rollCode:1 }` — unique
- `{ materialId:1, status:1 }`
- `{ warehouseId:1, locationCode:1 }`
- `{ reservedForPoId:1 }` — chỉ áp khi {status:RESERVED}

---

<a id="stock_documents"></a>

## 13. `stock_documents`

**Feature:** FT-07/08  
Chứng từ kho, **5 loại** phân biệt bằng `docType`: MATERIAL_RECEIPT (UC-106), MATERIAL_ISSUE (UC-105/107), FG_RECEIPT (UC-110/111), DEFECT_DISPOSAL (UC-113), STOCK_ADJUSTMENT (UC-98/99).

Phân loại bằng trường **`docType`** (bắt buộc, validator riêng cho từng loại).

### `docType = MATERIAL_RECEIPT`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `status` | enum | ✔ | `DRAFT` · `PENDING_APPROVAL` · `APPROVED` · `COMPLETED` · `REJECTED` · `CANCELLED` |  |
| `createdBy` | ObjectId |  |  | users |
| `approvedBy` | ObjectId |  |  | users |
| `approvedAt` | Date |  |  |  |
| `note` | string |  |  |  |
| `supplierId` | ObjectId | ✔ |  | partners (SUPPLIER) |
| `supplier` | object |  |  |  |
| `supplier.code` | string |  |  |  |
| `supplier.name` | string |  |  |  |
| `warehouseId` | ObjectId | ✔ |  | config (WAREHOUSE) |
| `receiptDate` | Date |  |  |  |
| `supplierInvoiceNo` | string |  |  |  |
| `totalAmount` | number |  | ≥ 0 |  |
| `items` | array<object> | ✔ | ≥ 1 phần tử |  |
| `items[].materialId` | ObjectId | ✔ |  | materials |
| `items[].code` | string |  |  |  |
| `items[].name` | string |  |  |  |
| `items[].unitCode` | string |  |  |  |
| `items[].quantity` | number | ✔ | ≥ 0 |  |
| `items[].unitCost` | number | ✔ | ≥ 0 |  |
| `items[].lineAmount` | number |  | ≥ 0 |  |
| `items[].lotNo` | string |  |  |  |
| `items[].rollCount` | number |  |  |  |
| `items[].locationCode` | string |  |  |  |
| `items[].rollIds` | array<ObjectId> |  |  | fabric_rolls |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `docType = MATERIAL_ISSUE`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `status` | enum | ✔ | `DRAFT` · `PENDING_APPROVAL` · `APPROVED` · `COMPLETED` · `REJECTED` · `CANCELLED` |  |
| `createdBy` | ObjectId |  |  | users |
| `approvedBy` | ObjectId |  |  | users |
| `approvedAt` | Date |  |  |  |
| `note` | string |  |  |  |
| `issueType` | enum | ✔ | `PRODUCTION` · `INTERNAL_TRANSFER` · `RETURN_TO_SUPPLIER` · `SCRAP` |  |
| `issueRequestId` | ObjectId |  |  | production_orders.issueRequests._id |
| `productionOrderId` | ObjectId |  |  | production_orders |
| `fromWarehouseId` | ObjectId | ✔ |  | config (WAREHOUSE) |
| `toWarehouseId` | ObjectId |  |  | config (WAREHOUSE) |
| `items` | array<object> | ✔ | ≥ 1 phần tử |  |
| `items[].materialId` | ObjectId | ✔ |  | materials |
| `items[].materialCode` | string |  |  |  |
| `items[].fabricRollId` | ObjectId |  |  | fabric_rolls |
| `items[].rollCode` | string |  |  |  |
| `items[].unitCode` | string |  |  |  |
| `items[].locationCode` | string |  |  |  |
| `items[].quantity` | number | ✔ | ≥ 0 |  |
| `items[].pickedQty` | number |  | ≥ 0 |  |
| `items[].unitCost` | number |  | ≥ 0 |  |
| `items[].note` | string |  |  |  |
| `pickedBy` | ObjectId |  |  | users |
| `pickedAt` | Date |  |  |  |
| `issuedAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `docType = FG_RECEIPT`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `status` | enum | ✔ | `DRAFT` · `PENDING_APPROVAL` · `APPROVED` · `COMPLETED` · `REJECTED` · `CANCELLED` |  |
| `createdBy` | ObjectId |  |  | users |
| `approvedBy` | ObjectId |  |  | users |
| `approvedAt` | Date |  |  |  |
| `note` | string |  |  |  |
| `productionOrderId` | ObjectId | ✔ |  | production_orders |
| `warehouseId` | ObjectId | ✔ |  | config (WAREHOUSE) |
| `items` | array<object> | ✔ | ≥ 1 phần tử |  |
| `items[].skuId` | ObjectId | ✔ |  | skus |
| `items[].skuCode` | string |  |  |  |
| `items[].deliveredQty` | number | ✔ | ≥ 1 |  |
| `items[].acceptedQty` | number | ✔ | ≥ 0 |  |
| `items[].defectiveQty` | number | ✔ | ≥ 0 |  |
| `items[].locationCode` | string |  |  |  |
| `items[].unitCost` | number |  | ≥ 0 |  |
| `items[].note` | string |  |  |  |
| `inspectedBy` | ObjectId |  |  | users |
| `inspectedAt` | Date |  |  |  |
| `receivedBy` | ObjectId |  |  | users |
| `receivedAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `docType = DEFECT_DISPOSAL`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `status` | enum | ✔ | `DRAFT` · `PENDING_APPROVAL` · `APPROVED` · `COMPLETED` · `REJECTED` · `CANCELLED` |  |
| `createdBy` | ObjectId |  |  | users |
| `approvedBy` | ObjectId |  |  | users |
| `approvedAt` | Date |  |  |  |
| `note` | string |  |  |  |
| `disposition` | enum | ✔ | `LIQUIDATION` · `REPAIR` · `DESTRUCTION` |  |
| `recoveryAmount` | number |  | ≥ 0 |  |
| `buyerInfo` | string |  |  |  |
| `issuedAt` | Date |  |  |  |
| `items` | array<object> | ✔ | ≥ 1 phần tử |  |
| `items[].defectiveStockId` | ObjectId | ✔ |  | defective_stock |
| `items[].skuId` | ObjectId |  |  | skus |
| `items[].quantity` | number | ✔ | ≥ 1 |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

### `docType = STOCK_ADJUSTMENT`

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `status` | enum | ✔ | `DRAFT` · `PENDING_APPROVAL` · `APPROVED` · `COMPLETED` · `REJECTED` · `CANCELLED` |  |
| `createdBy` | ObjectId |  |  | users |
| `approvedBy` | ObjectId |  |  | users |
| `approvedAt` | Date |  |  |  |
| `note` | string |  |  |  |
| `countId` | ObjectId |  |  | inventory_counts |
| `warehouseId` | ObjectId | ✔ |  | config (WAREHOUSE) |
| `reason` | string | ✔ |  |  |
| `totalValueDelta` | number |  |  |  |
| `requiresOwnerApproval` | boolean |  |  |  |
| `items` | array<object> | ✔ | ≥ 1 phần tử |  |
| `items[].itemType` | enum | ✔ | `SKU` · `MATERIAL` |  |
| `items[].itemId` | ObjectId | ✔ |  | skus hoặc materials (theo itemType) |
| `items[].itemCode` | string |  |  |  |
| `items[].fabricRollId` | ObjectId |  |  | fabric_rolls |
| `items[].locationCode` | string |  |  |  |
| `items[].deltaQty` | number | ✔ |  |  |
| `items[].unitCost` | number |  | ≥ 0 |  |
| `items[].valueDelta` | number |  |  |  |
| `items[].reason` | string |  |  |  |
| `requestedBy` | ObjectId |  |  | users |
| `rejectReason` | string |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ code:1 }` — unique
- `{ docType:1, status:1, createdAt:-1 }`
- `{ productionOrderId:1 }` — chỉ áp khi {productionOrderId:{$type:objectId}}
- `{ supplierId:1, receiptDate:-1 }` — chỉ áp khi {supplierId:{$type:objectId}}
- `{ countId:1 }` — chỉ áp khi {countId:{$type:objectId}}

---

<a id="stock_balances"></a>

## 14. `stock_balances`

**Feature:** FT-07/08  
Số dư tồn kho, một document đếm nguyên tử cho mỗi (loại hàng, hàng, kho, vị trí). `available = onHand − reserved` được lưu sẵn và cập nhật cùng lúc.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `itemType` | enum | ✔ | `SKU` · `MATERIAL` |  |
| `itemId` | ObjectId | ✔ |  | skus hoặc materials (theo itemType) |
| `itemCode` | string |  |  |  |
| `warehouseId` | ObjectId | ✔ |  | config (WAREHOUSE) |
| `locationCode` | string | ✔ |  |  |
| `onHand` | number | ✔ | ≥ 0 |  |
| `reserved` | number | ✔ | ≥ 0 |  |
| `available` | number | ✔ | ≥ 0 |  |
| `avgCost` | number | ✔ | ≥ 0 |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ itemType:1, itemId:1, warehouseId:1, locationCode:1 }` — unique
- `{ itemType:1, itemCode:1 }`
- `{ warehouseId:1, itemType:1 }`

---

<a id="stock_movements"></a>

## 15. `stock_movements`

**Feature:** FT-07/08  
Sổ cái kho bất biến (UC-44/45/46). Số lượng có dấu: dương là nhập, âm là xuất. Khoá `ref` chống ghi sổ trùng.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `type` | enum | ✔ | `MATERIAL_RECEIPT` · `MATERIAL_ISSUE` · `MATERIAL_RETURN` · `LEFTOVER_RETURN` · `PRODUCTION_OUTPUT` · `SALE_HANDOVER` · `CUSTOMER_RETURN` · `EXCHANGE_OUT` · `ADJUSTMENT_IN` · `ADJUSTMENT_OUT` · `TRANSFER_IN` · `TRANSFER_OUT` · `DEFECT_IN` · `DEFECT_OUT` · `SCRAP` |  |
| `movementDate` | Date | ✔ |  |  |
| `warehouseId` | ObjectId | ✔ |  | config (WAREHOUSE) |
| `locationCode` | string |  |  |  |
| `itemType` | enum | ✔ | `SKU` · `MATERIAL` |  |
| `itemId` | ObjectId | ✔ |  | skus hoặc materials (theo itemType) |
| `itemCode` | string |  |  |  |
| `fabricRollId` | ObjectId |  |  | fabric_rolls |
| `quantity` | number | ✔ |  |  |
| `unitCost` | number | ✔ | ≥ 0 |  |
| `totalCost` | number |  |  |  |
| `ref` | object |  |  |  |
| `ref.type` | string |  |  |  |
| `ref.id` | ObjectId |  |  | theo ref.type |
| `ref.line` | string |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `note` | string |  |  |  |

**Index:**
- `{ itemType:1, itemId:1, movementDate:-1 }`
- `{ movementDate:-1 }`
- `{ warehouseId:1, movementDate:-1 }`
- `{ ref.type:1, ref.id:1 }`
- `{ ref.type:1, ref.id:1, ref.line:1, type:1 }` — unique, chỉ áp khi {ref.line:{$type:string}}

---

<a id="defective_stock"></a>

## 16. `defective_stock`

**Feature:** FT-08  
Lô hàng lỗi đang cách ly (UC-101, UC-112).

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `skuId` | ObjectId | ✔ |  | skus |
| `skuCode` | string |  |  |  |
| `warehouseId` | ObjectId | ✔ |  | config (WAREHOUSE) |
| `locationCode` | string |  |  |  |
| `sourceType` | enum | ✔ | `PRODUCTION` · `CUSTOMER_RETURN` · `WAREHOUSE_DAMAGE` · `STOCKTAKE` |  |
| `sourceId` | ObjectId |  |  | theo sourceType |
| `quantity` | number | ✔ | ≥ 1 |  |
| `defectReason` | string | ✔ |  |  |
| `status` | enum | ✔ | `QUARANTINED` · `REPAIRING` · `REPAIRED` · `LIQUIDATED` · `DESTROYED` |  |
| `unitCost` | number |  | ≥ 0 |  |
| `receivedBy` | ObjectId |  |  | users |
| `receivedAt` | Date |  |  |  |
| `note` | string |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ skuId:1, status:1 }`
- `{ status:1, receivedAt:-1 }`

---

<a id="inventory_counts"></a>

## 17. `inventory_counts`

**Feature:** FT-08  
Đợt kiểm kê (UC-96/97). Dòng kiểm kê ở `inventory_count_items`.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `warehouseId` | ObjectId | ✔ |  | config (WAREHOUSE) |
| `target` | enum | ✔ | `RAW_MATERIAL` · `FINISHED_GOODS` |  |
| `scope` | enum | ✔ | `FULL` · `CYCLE` · `LOCATION` · `ITEM` |  |
| `scopeFilter` | any |  |  |  |
| `status` | enum | ✔ | `DRAFT` · `COUNTING` · `REVIEW` · `ADJUSTED` · `CLOSED` · `CANCELLED` |  |
| `plannedDate` | Date |  |  |  |
| `startedAt` | Date |  |  |  |
| `closedAt` | Date |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `note` | string |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ code:1 }` — unique
- `{ warehouseId:1, status:1 }`

---

<a id="inventory_count_items"></a>

## 18. `inventory_count_items`

**Feature:** FT-08  
Từng dòng kiểm kê: số hệ thống, số đếm, chênh lệch.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `countId` | ObjectId | ✔ |  | inventory_counts |
| `itemType` | enum | ✔ | `SKU` · `MATERIAL` |  |
| `itemId` | ObjectId | ✔ |  | skus hoặc materials (theo itemType) |
| `itemCode` | string |  |  |  |
| `fabricRollId` | ObjectId |  |  | fabric_rolls |
| `locationCode` | string |  |  |  |
| `systemQty` | number | ✔ |  |  |
| `countedQty` | number |  |  |  |
| `varianceQty` | number |  |  |  |
| `unitCost` | number |  | ≥ 0 |  |
| `needsRecount` | boolean |  |  |  |
| `countedBy` | ObjectId |  |  | users |
| `countedAt` | Date |  |  |  |
| `note` | string |  |  |  |

**Index:**
- `{ countId:1 }`
- `{ countId:1, varianceQty:1 }`

---

<a id="inventory_alerts"></a>

## 19. `inventory_alerts`

**Feature:** FT-08  
Cảnh báo tồn thấp (UC-100). Mỗi mặt hàng chỉ có một cảnh báo đang mở cho mỗi loại.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `itemType` | enum | ✔ | `SKU` · `MATERIAL` |  |
| `itemId` | ObjectId | ✔ |  | skus hoặc materials (theo itemType) |
| `itemCode` | string |  |  |  |
| `alertType` | enum | ✔ | `LOW_STOCK` · `BELOW_SAFETY` · `OVERSTOCK` · `OUT_OF_STOCK` |  |
| `currentQty` | number |  |  |  |
| `thresholdQty` | number |  |  |  |
| `status` | enum | ✔ | `OPEN` · `ACKNOWLEDGED` · `RESOLVED` |  |
| `isActive` | boolean | ✔ |  |  |
| `acknowledgedBy` | ObjectId |  |  | users |
| `acknowledgedAt` | Date |  |  |  |
| `resolvedAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ itemType:1, itemId:1, alertType:1 }` — unique, chỉ áp khi {isActive:true}
- `{ isActive:1, createdAt:-1 }`

---

<a id="customers"></a>

## 20. `customers`

**Feature:** FT-09  
Khách hàng (UC-62, 63, 67, 68): địa chỉ, tài khoản Messenger, ghi chú, thống kê mua hàng.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `fullName` | string | ✔ |  |  |
| `phone` | string |  |  |  |
| `email` | string |  |  |  |
| `gender` | string |  |  |  |
| `birthday` | Date |  |  |  |
| `note` | string |  |  |  |
| `addresses` | array<object> |  |  |  |
| `addresses[].recipientName` | string | ✔ |  |  |
| `addresses[].phone` | string | ✔ |  |  |
| `addresses[].province` | string |  |  |  |
| `addresses[].district` | string |  |  |  |
| `addresses[].ward` | string |  |  |  |
| `addresses[].addressLine` | string | ✔ |  |  |
| `addresses[].isDefault` | boolean |  |  |  |
| `channelAccounts` | array<object> |  |  |  |
| `channelAccounts[].integrationId` | ObjectId | ✔ |  | config (INTEGRATION) |
| `channelAccounts[].externalUserId` | string | ✔ |  |  |
| `channelAccounts[].displayName` | string |  |  |  |
| `channelAccounts[].profilePicUrl` | string |  |  |  |
| `notes` | array<object> |  |  |  |
| `notes[].note` | string | ✔ |  |  |
| `notes[].by` | ObjectId |  |  | users |
| `notes[].at` | Date | ✔ |  |  |
| `stats` | object |  |  |  |
| `stats.firstOrderAt` | Date |  |  |  |
| `stats.totalOrders` | number |  |  |  |
| `stats.totalSpent` | number |  | ≥ 0 |  |
| `isBlocked` | boolean |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ code:1 }` — unique
- `{ phone:1 }`
- `{ fullName:1 }` — không phân biệt hoa/thường
- `{ channelAccounts.integrationId:1, channelAccounts.externalUserId:1 }` — unique, chỉ áp khi {channelAccounts.externalUserId:{$type:string}}

---

<a id="chat_conversations"></a>

## 21. `chat_conversations`

**Feature:** FT-09  
Hội thoại Messenger (UC-61, 64, 65): phân công Seller, thẻ, mốc tin nhắn.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `integrationId` | ObjectId | ✔ |  | config (INTEGRATION) |
| `customerId` | ObjectId |  |  | customers |
| `externalConversationId` | string |  |  |  |
| `status` | enum | ✔ | `UNASSIGNED` · `OPEN` · `PENDING` · `RESOLVED` · `CLOSED` |  |
| `assignedSellerId` | ObjectId |  |  | users |
| `assignedAt` | Date |  |  |  |
| `lastMessageAt` | Date |  |  |  |
| `lastMessagePreview` | string |  |  |  |
| `lastCustomerMessageAt` | Date |  |  |  |
| `unreadCount` | number |  |  |  |
| `tags` | array<string> |  |  |  |
| `assignments` | array<object> |  |  |  |
| `assignments[].sellerId` | ObjectId | ✔ |  | users |
| `assignments[].assignedBy` | ObjectId |  |  | users |
| `assignments[].method` | enum | ✔ | `AUTO` · `MANUAL` · `TRANSFER` |  |
| `assignments[].assignedAt` | Date | ✔ |  |  |
| `assignments[].unassignedAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ integrationId:1, externalConversationId:1 }` — unique, chỉ áp khi {externalConversationId:{$type:string}}
- `{ assignedSellerId:1, status:1, lastMessageAt:-1 }`
- `{ customerId:1 }`
- `{ tags:1 }`

---

<a id="chat_messages"></a>

## 22. `chat_messages`

**Feature:** FT-09  
Từng tin nhắn (UC-66/67). `externalMessageId` dùng khử trùng webhook.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `conversationId` | ObjectId | ✔ |  | chat_conversations |
| `externalMessageId` | string |  |  |  |
| `direction` | enum | ✔ | `INBOUND` · `OUTBOUND` |  |
| `senderType` | enum | ✔ | `CUSTOMER` · `SELLER` · `SYSTEM` |  |
| `senderUserId` | ObjectId |  |  | users |
| `messageType` | enum | ✔ | `TEXT` · `IMAGE` · `VIDEO` · `FILE` · `STICKER` · `TEMPLATE` · `OTHER` |  |
| `content` | string |  |  |  |
| `attachments` | array<any> |  |  |  |
| `deliveryStatus` | enum |  | `QUEUED` · `SENT` · `DELIVERED` · `READ` · `FAILED` |  |
| `errorMessage` | string |  |  |  |
| `sentAt` | Date | ✔ |  |  |

**Index:**
- `{ conversationId:1, sentAt:-1 }`
- `{ externalMessageId:1 }` — unique, chỉ áp khi {externalMessageId:{$type:string}}

---

<a id="sales_orders"></a>

## 23. `sales_orders`

**Feature:** FT-10  
Đơn hàng (UC-70..73, 102, 116, 117): dòng hàng kèm giữ tồn, lịch sử trạng thái, phiếu soạn hàng, bằng chứng đóng gói. Đơn Shopee/TikTok nhập tay.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `orderCode` | string | ✔ |  |  |
| `channel` | enum | ✔ | `FACEBOOK` · `SHOPEE` · `TIKTOK_SHOP` · `OTHER` |  |
| `externalOrderNo` | string |  |  |  |
| `customerId` | ObjectId |  |  | customers |
| `customer` | object |  |  |  |
| `customer.code` | string |  |  |  |
| `customer.name` | string |  |  |  |
| `customer.phone` | string |  |  |  |
| `conversationId` | ObjectId |  |  | chat_conversations |
| `sellerId` | ObjectId |  |  | users |
| `status` | enum | ✔ | `PENDING` · `CONFIRMED` · `PICKING` · `PACKED` · `HANDED_OVER` · `DELIVERED` · `COMPLETED` · `CANCELLED` · `RETURN_IN_PROGRESS` · `RETURNED` |  |
| `paymentMethod` | enum | ✔ | `COD` · `BANK_TRANSFER` · `CASH` · `MARKETPLACE` |  |
| `paymentStatus` | enum | ✔ | `UNPAID` · `PAID` · `PARTIALLY_PAID` · `REFUNDED` |  |
| `recipient` | object | ✔ |  |  |
| `recipient.name` | string | ✔ |  |  |
| `recipient.phone` | string | ✔ |  |  |
| `recipient.province` | string |  |  |  |
| `recipient.district` | string |  |  |  |
| `recipient.ward` | string |  |  |  |
| `recipient.addressLine` | string | ✔ |  |  |
| `shipping` | object |  |  |  |
| `shipping.carrierId` | ObjectId |  |  | partners (CARRIER) |
| `shipping.carrierCode` | string |  |  |  |
| `shipping.marketplaceCarrierName` | string |  |  |  |
| `shipping.feeCustomer` | number |  | ≥ 0 |  |
| `shipping.feeActual` | number |  | ≥ 0 |  |
| `items` | array<object> | ✔ | ≥ 1 phần tử |  |
| `items[].skuId` | ObjectId | ✔ |  | skus |
| `items[].skuCode` | string |  |  |  |
| `items[].name` | string |  |  |  |
| `items[].quantity` | number | ✔ | ≥ 1 |  |
| `items[].unitPrice` | number | ✔ | ≥ 0 |  |
| `items[].discountAmount` | number |  | ≥ 0 |  |
| `items[].lineTotal` | number |  | ≥ 0 |  |
| `items[].unitCost` | number |  | ≥ 0 |  |
| `items[].returnedQty` | number |  | ≥ 0 |  |
| `items[].reservation` | object |  |  |  |
| `items[].reservation.warehouseId` | ObjectId |  |  | config (WAREHOUSE) |
| `items[].reservation.qty` | number |  | ≥ 0 |  |
| `items[].reservation.status` | enum |  | `ACTIVE` · `RELEASED` · `FULFILLED` |  |
| `items[].reservation.reservedAt` | Date |  |  |  |
| `items[].reservation.releasedAt` | Date |  |  |  |
| `items[].reservation.releaseReason` | string |  |  |  |
| `amounts` | object | ✔ |  |  |
| `amounts.subtotal` | number | ✔ | ≥ 0 |  |
| `amounts.discount` | number |  | ≥ 0 |  |
| `amounts.total` | number | ✔ | ≥ 0 |  |
| `amounts.codAmount` | number |  | ≥ 0 |  |
| `statusHistory` | array<object> |  |  |  |
| `statusHistory[].from` | string |  |  |  |
| `statusHistory[].to` | string | ✔ |  |  |
| `statusHistory[].by` | ObjectId |  |  | users |
| `statusHistory[].note` | string |  |  |  |
| `statusHistory[].at` | Date | ✔ |  |  |
| `pickList` | object |  |  |  |
| `pickList.code` | string |  |  |  |
| `pickList.status` | enum |  | `OPEN` · `CONFIRMED` · `CANCELLED` |  |
| `pickList.confirmedBy` | ObjectId |  |  | users |
| `pickList.confirmedAt` | Date |  |  |  |
| `pickList.items` | array<object> |  |  |  |
| `pickList.items[].skuId` | ObjectId | ✔ |  | skus |
| `pickList.items[].locationCode` | string |  |  |  |
| `pickList.items[].quantity` | number | ✔ |  |  |
| `pickList.items[].pickedQty` | number |  |  |  |
| `packing` | object |  |  |  |
| `packing.packedBy` | ObjectId |  |  | users |
| `packing.startedAt` | Date |  |  |  |
| `packing.finishedAt` | Date |  |  |  |
| `packing.videoUrl` | string |  |  |  |
| `packing.videoDurationS` | number |  |  |  |
| `packing.isComplete` | boolean |  |  |  |
| `packing.scans` | array<object> |  |  |  |
| `packing.scans[].skuId` | ObjectId |  |  | skus |
| `packing.scans[].barcode` | string | ✔ |  |  |
| `packing.scans[].isMatch` | boolean |  |  |  |
| `packing.scans[].scannedAt` | Date | ✔ |  |  |
| `confirmedAt` | Date |  |  |  |
| `packedAt` | Date |  |  |  |
| `handedOverAt` | Date |  |  |  |
| `deliveredAt` | Date |  |  |  |
| `completedAt` | Date |  |  |  |
| `cancelledAt` | Date |  |  |  |
| `cancelledBy` | ObjectId |  |  | users |
| `cancelReason` | string |  |  |  |
| `note` | string |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Quy tắc chéo trường:**
- Kênh `SHOPEE` hoặc `TIKTOK_SHOP` bắt buộc có `externalOrderNo`.

**Index:**
- `{ orderCode:1 }` — unique
- `{ channel:1, externalOrderNo:1 }` — unique, chỉ áp khi {externalOrderNo:{$type:string}}
- `{ status:1, createdAt:-1 }`
- `{ customerId:1, createdAt:-1 }`
- `{ sellerId:1, createdAt:-1 }`
- `{ items.skuId:1 }`

---

<a id="shipments"></a>

## 24. `shipments`

**Feature:** FT-10/12  
Kiện hàng / vận đơn (UC-103, 118) kèm lô bàn giao, cờ đỏ COD (UC-81/82) và khiếu nại hãng vận chuyển (UC-89/90).

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `orderId` | ObjectId | ✔ |  | sales_orders |
| `orderCode` | string |  |  |  |
| `carrierId` | ObjectId | ✔ |  | partners (CARRIER) |
| `carrierCode` | string |  |  |  |
| `waybillNo` | string | ✔ |  |  |
| `status` | enum | ✔ | `CREATED` · `PICKED_UP` · `IN_TRANSIT` · `DELIVERED` · `DELIVERY_FAILED` · `RETURNING` · `RETURNED` · `LOST` · `DAMAGED` |  |
| `weightG` | number |  | ≥ 0 |  |
| `shippingFee` | number |  | ≥ 0 |  |
| `codAmount` | number |  | ≥ 0 |  |
| `labelPrintedAt` | Date |  |  |  |
| `handedOverAt` | Date |  |  |  |
| `deliveredAt` | Date |  |  |  |
| `tracking` | array<object> |  |  |  |
| `tracking[].status` | string | ✔ |  |  |
| `tracking[].description` | string |  |  |  |
| `tracking[].at` | Date | ✔ |  |  |
| `tracking[].by` | ObjectId |  |  | users |
| `handover` | object |  |  |  |
| `handover.code` | string | ✔ |  |  |
| `handover.handoverDate` | Date | ✔ |  |  |
| `handover.status` | enum |  | `DRAFT` · `EXPORTED` · `SIGNED` |  |
| `handover.handedBy` | ObjectId |  |  | users |
| `handover.carrierReceiver` | string |  |  |  |
| `handover.fileUrl` | string |  |  |  |
| `handover.note` | string |  |  |  |
| `codFlags` | array<object> |  |  |  |
| `codFlags[]._id` | ObjectId | ✔ |  |  |
| `codFlags[].statementId` | ObjectId |  |  | cod_statements |
| `codFlags[].flagType` | enum | ✔ | `AMOUNT_MISMATCH` · `MISSING_IN_STATEMENT` · `NOT_COLLECTED` · `LATE_REMITTANCE` · `DUPLICATE_LINE` |  |
| `codFlags[].expectedAmount` | number |  | ≥ 0 |  |
| `codFlags[].actualAmount` | number |  | ≥ 0 |  |
| `codFlags[].diffAmount` | number |  |  |  |
| `codFlags[].status` | enum | ✔ | `OPEN` · `INVESTIGATING` · `DISPUTED` · `RESOLVED` · `WRITTEN_OFF` |  |
| `codFlags[].assignedTo` | ObjectId |  |  | users |
| `codFlags[].resolutionNote` | string |  |  |  |
| `codFlags[].createdAt` | Date |  |  |  |
| `codFlags[].resolvedAt` | Date |  |  |  |
| `disputes` | array<object> |  |  |  |
| `disputes[]._id` | ObjectId | ✔ |  |  |
| `disputes[].code` | string | ✔ |  |  |
| `disputes[].flagId` | ObjectId |  |  | shipments.codFlags._id |
| `disputes[].disputeType` | enum | ✔ | `LOST` · `DAMAGED` · `MISMATCHED_ITEM` · `COD_MISMATCH` · `DELAYED` |  |
| `disputes[].claimedAmount` | number | ✔ | ≥ 0 |  |
| `disputes[].approvedCompensation` | number |  | ≥ 0 |  |
| `disputes[].status` | enum | ✔ | `DRAFT` · `FILED` · `UNDER_REVIEW` · `ACCEPTED` · `REJECTED` · `COMPENSATED` · `CLOSED` |  |
| `disputes[].evidenceUrls` | array<string> |  |  |  |
| `disputes[].description` | string |  |  |  |
| `disputes[].compensationVoucherId` | ObjectId |  |  | cash_vouchers |
| `disputes[].updates` | array<object> |  |  |  |
| `disputes[].updates[].status` | string | ✔ |  |  |
| `disputes[].updates[].note` | string |  |  |  |
| `disputes[].updates[].by` | ObjectId |  |  | users |
| `disputes[].updates[].at` | Date | ✔ |  |  |
| `disputes[].filedBy` | ObjectId |  |  | users |
| `disputes[].filedAt` | Date |  |  |  |
| `disputes[].resolvedAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ carrierId:1, waybillNo:1 }` — unique
- `{ orderId:1 }`
- `{ status:1, createdAt:-1 }`
- `{ handover.code:1 }` — chỉ áp khi {handover.code:{$type:string}}
- `{ carrierId:1, handover.handoverDate:-1 }` — chỉ áp khi {handover.handoverDate:{$type:date}}
- `{ codFlags.status:1 }`
- `{ disputes.code:1 }` — unique, chỉ áp khi {disputes.code:{$type:string}}
- `{ disputes.status:1 }`

---

<a id="return_requests"></a>

## 25. `return_requests`

**Feature:** FT-11  
Yêu cầu đổi/trả (UC-74, 75, 87, 88, 104, 119): hàng trả, kiểm hàng, đơn đổi, quyết toán và phụ phí.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `requestType` | enum | ✔ | `RETURN` · `EXCHANGE` |  |
| `status` | enum | ✔ | `REQUESTED` · `APPROVED` · `AWAITING_GOODS` · `GOODS_RECEIVED` · `INSPECTED` · `FINANCE_REVIEW` · `FINANCE_APPROVED` · `COMPLETED` · `REJECTED` · `CANCELLED` |  |
| `originalOrderId` | ObjectId | ✔ |  | sales_orders |
| `originalOrderCode` | string |  |  |  |
| `customerId` | ObjectId |  |  | customers |
| `policyId` | ObjectId |  |  | config (RETURN_POLICY) |
| `parentRequestId` | ObjectId |  |  | return_requests |
| `reasonCode` | string | ✔ |  |  |
| `reasonText` | string |  |  |  |
| `evidenceUrls` | array<string> |  |  |  |
| `withinPolicyWindow` | boolean |  |  |  |
| `returnCarrierId` | ObjectId |  |  | partners (CARRIER) |
| `returnWaybillNo` | string |  |  |  |
| `items` | array<object> | ✔ | ≥ 1 phần tử |  |
| `items[].skuId` | ObjectId | ✔ |  | skus |
| `items[].skuCode` | string |  |  |  |
| `items[].quantity` | number | ✔ | ≥ 1 |  |
| `items[].paidUnitPrice` | number | ✔ | ≥ 0 |  |
| `items[].reasonText` | string |  |  |  |
| `inspections` | array<object> |  |  |  |
| `inspections[].inspectedBy` | ObjectId |  |  | users |
| `inspections[].startedAt` | Date | ✔ |  |  |
| `inspections[].finishedAt` | Date |  |  |  |
| `inspections[].unboxingVideoUrl` | string |  |  |  |
| `inspections[].videoDurationS` | number |  |  |  |
| `inspections[].packageCondition` | string |  |  |  |
| `inspections[].note` | string |  |  |  |
| `inspections[].items` | array<object> |  |  |  |
| `inspections[].items[].skuId` | ObjectId | ✔ |  | skus |
| `inspections[].items[].quantity` | number | ✔ | ≥ 1 |  |
| `inspections[].items[].condition` | enum | ✔ | `LIKE_NEW` · `MISSING_TAG` · `DIRTY` · `DAMAGED` · `WRONG_ITEM` · `MISSING_ITEM` |  |
| `inspections[].items[].disposition` | enum | ✔ | `RESTOCK_SELLABLE` · `QUARANTINE_DEFECTIVE` · `DESTROY` · `RETURN_TO_CUSTOMER` |  |
| `inspections[].items[].targetWarehouseId` | ObjectId |  |  | config (WAREHOUSE) |
| `inspections[].items[].surchargeReasonCode` | string |  |  |  |
| `inspections[].items[].conditionNote` | string |  |  |  |
| `inspections[].items[].evidenceUrls` | array<string> |  |  |  |
| `exchange` | object |  |  |  |
| `exchange.code` | string |  |  |  |
| `exchange.replacementOrderId` | ObjectId |  |  | sales_orders |
| `exchange.status` | enum |  | `DRAFT` · `VALIDATED` · `CONFIRMED` · `SHIPPED` · `COMPLETED` · `CANCELLED` |  |
| `exchange.items` | array<object> |  |  |  |
| `exchange.items[].originalSkuId` | ObjectId | ✔ |  | skus |
| `exchange.items[].replacementSkuId` | ObjectId | ✔ |  | skus |
| `exchange.items[].quantity` | number | ✔ | ≥ 1 |  |
| `exchange.items[].originalUnitPrice` | number |  | ≥ 0 |  |
| `exchange.items[].replacementUnitPrice` | number |  | ≥ 0 |  |
| `exchange.items[].priceDifference` | number |  |  |  |
| `exchange.items[].stockValidated` | boolean |  |  |  |
| `exchange.items[].validatedAvailableQty` | number |  | ≥ 0 |  |
| `exchange.items[].validatedAt` | Date |  |  |  |
| `exchange.items[].validationNote` | string |  |  |  |
| `financial` | object |  |  |  |
| `financial.itemsValue` | number |  | ≥ 0 |  |
| `financial.surchargeAmount` | number |  | ≥ 0 |  |
| `financial.shippingFeeDeduction` | number |  | ≥ 0 |  |
| `financial.exchangeGoodsValue` | number |  | ≥ 0 |  |
| `financial.priceDifference` | number |  |  |  |
| `financial.netSettlement` | number |  |  |  |
| `financial.status` | enum |  | `DRAFT` · `PENDING_REVIEW` · `APPROVED` · `REJECTED` · `SETTLED` |  |
| `financial.settlementMethod` | enum |  | `BANK_REFUND` · `CASH_REFUND` · `COD_OFFSET` · `CUSTOMER_PAYS` · `NONE` |  |
| `financial.settlementVoucherId` | ObjectId |  |  | cash_vouchers |
| `financial.surchargeLines` | array<object> |  |  |  |
| `financial.surchargeLines[].reasonCode` | string | ✔ |  |  |
| `financial.surchargeLines[].baseAmount` | number | ✔ | ≥ 0 |  |
| `financial.surchargeLines[].rate` | number | ✔ | 0–1 |  |
| `financial.surchargeLines[].amount` | number |  | ≥ 0 |  |
| `financial.reviewedBy` | ObjectId |  |  | users |
| `financial.reviewedAt` | Date |  |  |  |
| `financial.reviewNote` | string |  |  |  |
| `statusHistory` | array<object> |  |  |  |
| `statusHistory[].from` | string |  |  |  |
| `statusHistory[].to` | string | ✔ |  |  |
| `statusHistory[].by` | ObjectId |  |  | users |
| `statusHistory[].note` | string |  |  |  |
| `statusHistory[].at` | Date | ✔ |  |  |
| `requestedBy` | ObjectId |  |  | users |
| `approvedBy` | ObjectId |  |  | users |
| `approvedAt` | Date |  |  |  |
| `rejectReason` | string |  |  |  |
| `receivedAt` | Date |  |  |  |
| `completedAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ code:1 }` — unique
- `{ status:1, createdAt:-1 }`
- `{ originalOrderId:1, createdAt:1 }`
- `{ parentRequestId:1 }` — chỉ áp khi {parentRequestId:{$type:objectId}}
- `{ financial.status:1 }`

---

<a id="cash_vouchers"></a>

## 26. `cash_vouchers`

**Feature:** FT-12  
Phiếu thu / chi (UC-83/84). Hạng mục lấy từ `config` (FIN_CATEGORY).

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `type` | enum | ✔ | `RECEIPT` · `PAYMENT` |  |
| `categoryCode` | string | ✔ |  |  |
| `amount` | number | ✔ | ≥ 0 |  |
| `voucherDate` | Date | ✔ |  |  |
| `paymentMethod` | enum |  | `CASH` · `BANK_TRANSFER` · `E_WALLET` |  |
| `counterparty` | object |  |  |  |
| `counterparty.type` | enum |  | `CUSTOMER` · `SUPPLIER` · `CARRIER` · `EMPLOYEE` · `MARKETPLACE` · `OTHER` |  |
| `counterparty.id` | ObjectId |  |  |  |
| `counterparty.name` | string |  |  |  |
| `ref` | object |  |  |  |
| `ref.type` | string |  |  |  |
| `ref.id` | ObjectId |  |  | theo ref.type |
| `description` | string |  |  |  |
| `attachmentUrl` | string |  |  |  |
| `status` | enum | ✔ | `DRAFT` · `POSTED` · `CANCELLED` |  |
| `createdBy` | ObjectId |  |  | users |
| `approvedBy` | ObjectId |  |  | users |
| `postedAt` | Date |  |  |  |
| `cancelReason` | string |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ code:1 }` — unique
- `{ voucherDate:-1 }`
- `{ categoryCode:1, voucherDate:1 }`
- `{ ref.type:1, ref.id:1 }`

---

<a id="supplier_debts"></a>

## 27. `supplier_debts`

**Feature:** FT-12  
Công nợ nhà cung cấp kèm các phiếu chi (đặt cọc, trả góp) (UC-76/77).

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `kind` | enum |  | `RECEIPT` · `OPENING_BALANCE` · `CONTRACT_DEPOSIT` |  |
| `supplierId` | ObjectId | ✔ |  | partners (SUPPLIER) |
| `supplier` | object |  |  |  |
| `supplier.code` | string |  |  |  |
| `supplier.name` | string |  |  |  |
| `receiptId` | ObjectId |  |  | stock_documents (MATERIAL_RECEIPT) |
| `originalAmount` | number | ✔ | ≥ 0 |  |
| `paidAmount` | number | ✔ | ≥ 0 |  |
| `outstandingAmount` | number |  | ≥ 0 |  |
| `issueDate` | Date |  |  |  |
| `dueDate` | Date |  |  |  |
| `status` | enum | ✔ | `OPEN` · `PARTIALLY_PAID` · `PAID` · `CANCELLED` |  |
| `payments` | array<object> |  |  |  |
| `payments[].code` | string | ✔ |  |  |
| `payments[].slipType` | enum | ✔ | `DEPOSIT` · `INSTALLMENT` · `FULL_PAYMENT` |  |
| `payments[].installmentNo` | number |  |  |  |
| `payments[].contractRef` | string |  |  |  |
| `payments[].amount` | number | ✔ | ≥ 0 |  |
| `payments[].plannedPayDate` | Date |  |  |  |
| `payments[].paidAt` | Date |  |  |  |
| `payments[].voucherId` | ObjectId |  |  | cash_vouchers |
| `payments[].status` | enum | ✔ | `PLANNED` · `PAID` · `CANCELLED` |  |
| `payments[].note` | string |  |  |  |
| `payments[].createdBy` | ObjectId |  |  | users |
| `note` | string |  |  |  |
| `createdBy` | ObjectId |  |  | users |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ code:1 }` — unique
- `{ supplierId:1, status:1 }`
- `{ status:1, dueDate:1 }`

---

<a id="cod_statements"></a>

## 28. `cod_statements`

**Feature:** FT-12  
Sao kê COD của hãng vận chuyển (UC-85/86), dòng sao kê nhúng trong `lines[]`.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `carrierId` | ObjectId | ✔ |  | partners (CARRIER) |
| `statementNo` | string |  |  |  |
| `periodFrom` | Date |  |  |  |
| `periodTo` | Date |  |  |  |
| `fileName` | string |  |  |  |
| `fileUrl` | string |  |  |  |
| `totals` | object |  |  |  |
| `totals.lines` | number |  |  |  |
| `totals.codCollected` | number |  | ≥ 0 |  |
| `totals.fees` | number |  | ≥ 0 |  |
| `totals.netRemittance` | number |  | ≥ 0 |  |
| `reconcileStatus` | enum | ✔ | `PENDING` · `RECONCILING` · `RECONCILED` · `HAS_DISCREPANCY` |  |
| `lines` | array<object> |  | ≤ 30000 phần tử |  |
| `lines[].waybillNo` | string | ✔ |  |  |
| `lines[].shipmentId` | ObjectId |  |  | shipments |
| `lines[].orderId` | ObjectId |  |  | sales_orders |
| `lines[].statementCodAmount` | number |  | ≥ 0 |  |
| `lines[].statementShippingFee` | number |  | ≥ 0 |  |
| `lines[].statementCodFee` | number |  | ≥ 0 |  |
| `lines[].statementNet` | number |  |  |  |
| `lines[].expectedCodAmount` | number |  | ≥ 0 |  |
| `lines[].diffAmount` | number |  |  |  |
| `lines[].matchStatus` | enum | ✔ | `UNMATCHED` · `MATCHED` · `AMOUNT_MISMATCH` · `NOT_FOUND` · `DUPLICATE` |  |
| `remittanceVoucherId` | ObjectId |  |  | cash_vouchers |
| `importedBy` | ObjectId |  |  | users |
| `importedAt` | Date | ✔ |  |  |
| `reconciledAt` | Date |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ carrierId:1, statementNo:1 }` — unique, chỉ áp khi {statementNo:{$type:string}}
- `{ reconcileStatus:1, importedAt:-1 }`
- `{ lines.waybillNo:1 }`
- `{ lines.shipmentId:1 }` — chỉ áp khi {lines.shipmentId:{$type:objectId}}

---

<a id="cogs_entries"></a>

## 29. `cogs_entries`

**Feature:** FT-12  
Giá vốn thực tế từng dòng bán (UC-78). Dòng trả hàng mang số âm.

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `orderId` | ObjectId | ✔ |  | sales_orders |
| `orderCode` | string |  |  |  |
| `skuId` | ObjectId | ✔ |  | skus |
| `channel` | enum | ✔ | `FACEBOOK` · `SHOPEE` · `TIKTOK_SHOP` · `OTHER` |  |
| `entryType` | enum | ✔ | `SALE` · `RETURN` |  |
| `quantity` | number | ✔ |  |  |
| `unitCost` | number | ✔ | ≥ 0 |  |
| `cogsAmount` | number |  |  |  |
| `revenueAmount` | number |  |  |  |
| `recognizedAt` | Date | ✔ |  |  |

**Index:**
- `{ recognizedAt:1 }`
- `{ skuId:1, recognizedAt:1 }`
- `{ orderId:1 }`

---

<a id="financial_periods"></a>

## 30. `financial_periods`

**Feature:** FT-12  
Kỳ tài chính theo tháng (UC-80): kết quả kinh doanh (P&L) và bảng định giá tồn kho cuối kỳ (UC-15/16/79).

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `year` | number | ✔ | ≥ 2000 |  |
| `month` | number | ✔ | 1–12 |  |
| `status` | enum | ✔ | `OPEN` · `CLOSED` |  |
| `closedBy` | ObjectId |  |  | users |
| `closedAt` | Date |  |  |  |
| `pnl` | object |  |  |  |
| `pnl.revenue` | number |  |  |  |
| `pnl.returnsAmount` | number |  |  |  |
| `pnl.cogs` | number |  |  |  |
| `pnl.grossProfit` | number |  |  |  |
| `pnl.operatingExpenses` | number |  |  |  |
| `pnl.otherIncome` | number |  |  |  |
| `pnl.netProfit` | number |  |  |  |
| `pnl.cashOpening` | number |  |  |  |
| `pnl.cashClosing` | number |  |  |  |
| `pnl.rawMaterialValue` | number |  |  |  |
| `pnl.finishedGoodsValue` | number |  |  |  |
| `pnl.supplierPayables` | number |  |  |  |
| `pnl.detail` | any |  |  |  |
| `pnl.generatedBy` | ObjectId |  |  | users |
| `pnl.generatedAt` | Date |  |  |  |
| `valuation` | array<object> |  | ≤ 30000 phần tử |  |
| `valuation[].warehouseId` | ObjectId | ✔ |  | config (WAREHOUSE) |
| `valuation[].itemType` | enum | ✔ | `SKU` · `MATERIAL` |  |
| `valuation[].itemId` | ObjectId | ✔ |  | skus hoặc materials (theo itemType) |
| `valuation[].itemCode` | string |  |  |  |
| `valuation[].quantity` | number | ✔ |  |  |
| `valuation[].unitCost` | number | ✔ | ≥ 0 |  |
| `valuation[].totalValue` | number |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ year:1, month:1 }` — unique

---

<a id="manager_reports"></a>

## 31. `manager_reports`

**Feature:** FT-12  
Báo cáo vận hành của quản lý gửi Owner (UC-18).

| Trường | Kiểu | Bắt buộc | Giá trị / ràng buộc | Tham chiếu |
|---|---|:-:|---|---|
| `code` | string | ✔ |  |  |
| `reportType` | enum | ✔ | `DAILY_OPERATIONS` · `WEEKLY` · `MONTHLY` · `PRODUCTION` · `INVENTORY` · `SALES` · `EXCEPTION` |  |
| `title` | string | ✔ |  |  |
| `periodStart` | Date |  |  |  |
| `periodEnd` | Date |  |  |  |
| `summary` | string |  |  |  |
| `content` | any |  |  |  |
| `fileUrl` | string |  |  |  |
| `status` | enum | ✔ | `DRAFT` · `SUBMITTED` · `REVIEWED` |  |
| `submittedBy` | ObjectId |  |  | users |
| `submittedAt` | Date |  |  |  |
| `reviewedBy` | ObjectId |  |  | users |
| `reviewedAt` | Date |  |  |  |
| `ownerComment` | string |  |  |  |
| `createdAt` | Date |  |  |  |
| `updatedAt` | Date |  |  |  |

**Index:**
- `{ code:1 }` — unique
- `{ status:1, submittedAt:-1 }`

---

<a id="views"></a>

## 32. Views

View chỉ đọc, tính từ các collection trên (không lưu dữ liệu riêng). Ngày nhóm theo múi giờ `Asia/Ho_Chi_Minh`.

| View | Nguồn | UC | Ý nghĩa | Trường kết quả |
|---|---|---|---|---|
| `v_sku_available_stock` | `stock_balances` | UC-69/109 | Tồn bán được của từng SKU (chỉ kho `isSellable`). | `_id` (skuId), `skuCode`, `onHand`, `reserved`, `available` |
| `v_raw_material_inventory` | `materials` | UC-108 | Tồn nguyên phụ liệu (vải = tổng các cuộn còn tồn; phụ liệu = số dư kho). | `code`, `name`, `type`, `unitCode`, `limits`, `isActive`, `onHand`, `reserved`, `available` |
| `v_daily_stock_flow` | `stock_movements` | UC-44/45 | Nhập / xuất theo ngày, kho, loại hàng (giờ Việt Nam). | `_id{day, warehouseId, itemType}`, `inbound`, `outbound` |
| `v_daily_sales_returns` | `cogs_entries` | UC-44/46 | Bán / trả theo ngày và kênh: số lượng, doanh thu ròng, giá vốn ròng. | `_id{day, channel}`, `soldQty`, `returnedQty`, `netRevenue`, `netCogs` |
| `v_monthly_gross_profit` | `cogs_entries` | UC-14 | Lợi nhuận gộp theo tháng. | `_id` (yyyy-MM), `netRevenue`, `cogs`, `grossProfit` |
| `v_cash_flow_monthly` | `cash_vouchers` | UC-17 | Dòng tiền theo tháng, loại phiếu, hạng mục (chỉ phiếu đã ghi sổ). | `_id{month, type, category}`, `amount` |
| `v_inventory_valuation_current` | `stock_balances` | UC-15/16/79 | Giá trị tồn kho hiện tại theo nhóm tài sản và kho. | `_id{assetGroup, warehouseId}`, `quantity`, `totalValue` |
| `v_supplier_payables` | `supplier_debts` | UC-76 | Công nợ phải trả từng nhà cung cấp, kèm phần quá hạn. | `_id` (supplierId), `supplierName`, `totalOutstanding`, `overdueAmount` |
| `v_production_progress` | `production_orders` | UC-19 | Tiến độ sản xuất so với kế hoạch. | `code`, `status`, `plannedStart`, `plannedEnd`, `plannedQty`, `completedQty`, `defectiveQty`, `completionPct` |
| `v_material_vs_bom` | `production_orders` | UC-56 | Tiêu hao thực tế so với định mức BOM, theo lệnh sản xuất và nguyên liệu. | `code`, `materialId`, `standardQty`, `actualQty`, `varianceQty`, `varianceRate` |
