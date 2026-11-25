# AraWMS – Collection theo luồng nghiệp vụ và theo role

> Ngày lập: 2026-11-25 · Dựa trên `discovered_business_flows.md` (113 luồng, đã chỉnh sửa theo phản hồi).
> Phương pháp: phân tích tĩnh cấp hàm, từ endpoint của từng luồng tới model/collection, kèm loại thao tác. Đã đối chiếu tay các trường hợp nghi vấn và đếm toàn bộ chỗ ghi/đọc trong `ARAWMS_BE/src` + `ARAWMS_BE/scripts`.
> **Chưa có runtime tracking**: kết quả này cần được Giai đoạn 4 xác nhận lại.
> Dữ liệu thô: `tools/trace_final.json` (endpoint của từng role và ma trận collection × role × thao tác).

## 1. Tổng số collection trong database

**68 collection** (đọc trực tiếp từ MongoDB Atlas ngày 2026-11-25). `boms` không còn trong DB (trước đó là 69).

## 2. Collection có thể bỏ (18)

### 2.1. Xóa ngay, không cần sửa code (5)

| Collection | Số doc | Bằng chứng |
|---|---|---|
| `codreconciliationbatches` | 0 | Không có model, không có code nào nhắc tới. Bản trùng tên cũ của `cod_reconciliation_batches`. |
| `config` | 0 | Không có trong code. |
| `owner_daily_reviews` | 0 | Không có trong code. |
| `document_templates` | 1 | Model `DocumentTemplate` chỉ được export ở `models/index.js`, không chỗ nào dùng. |
| `product_samples` | 0 | Chỉ được endpoint `/owner/product-samples` đọc; FE đã chuyển hướng `/owner/samples`. Collection rỗng nên xóa không ảnh hưởng (endpoint trả rỗng). Nên gỡ module `bom/product-samples` sau. |

### 2.2. Hết scope, chỉ còn được đọc mà không hiển thị (3) — xóa kèm dọn code

| Collection | Số doc | Bằng chứng |
|---|---|---|
| `production_orders` | 0 | Không có chỗ nào ghi (0 writer). Được đọc ở `operations-report` và `executive-dashboard` nhưng FE không hiển thị phần `production`; `/owner/production` đã chuyển hướng. |
| `owner_targets` | 0 | Chỉ ghi qua `PUT /owner/operations-report/target` (không màn hình nào gọi) và `scripts/seedOwnerDemo.js`. Được đọc trong `operations-report` nhưng FE không hiển thị `target`. |
| `work_assignments` | 0 | Chỉ ghi qua `POST/PATCH /owner/operations-report/tasks` (không màn hình nào gọi) và seed demo. FE không hiển thị `tasks`; `/owner/tasks` đã chuyển hướng. |

### 2.3. Có ghi/đếm nhưng không ai dùng kết quả (2) — xóa kèm gỡ 1 chỗ gọi

| Collection | Thao tác thực tế | Bằng chứng |
|---|---|---|
| `inventory_alerts` | WRITE ONLY (`updateOne`, `updateMany`) | Chỉ `systemSettings.service.js:91,98` ghi khi Owner sửa ngưỡng tồn (OWN-12). 0 chỗ đọc trong toàn bộ BE. |
| `carrier_disputes` | READ ONLY (`countDocuments`) | Chỉ `accountantDashboard.service.js:473` đếm; 0 chỗ ghi trong toàn bộ BE → luôn bằng 0. Tranh chấp COD thực tế nằm trong `cod_reconciliation_items`. |

### 2.4. Bảng cũ sau đợt gộp collection (4) — xóa kèm gỡ đường đọc cũ

| Collection | Thay bằng | Thao tác còn lại | Bằng chứng |
|---|---|---|---|
| `material_outbounds` | `material_tickets` | đọc + `updateMany` gỡ dòng | 0 chỗ tạo mới; 0 doc. |
| `order_qr_tokens` | `sales_orders.qr` | chỉ đọc (fallback) | 0 chỗ ghi; 0 doc. |
| `product_unit_allocations` | `product_units.packingClaim` | đọc + xóa | 0 chỗ tạo mới; 0 doc. |
| `packing_videos` | `packing_sessions` | đọc + xóa | 0 chỗ tạo mới; 0 doc. |

### 2.5. Module vận đơn GHN kiểu mới không có luồng tạo dữ liệu (3) — cần bạn xác nhận bỏ hẳn module

| Collection | Bằng chứng |
|---|---|
| `carrier_shipments` | Chỉ được tạo qua `POST /shipping/orders/:orderId/shipments`, không màn hình nào gọi. Webhook `/shipping/webhooks/ghn` chỉ đọc bản ghi có sẵn. 0 doc. |
| `carrier_shipment_events` | Chỉ webhook `/shipping/webhooks/ghn` ghi, và chỉ khi đã có `carrier_shipments`. 0 doc. |
| `carrier_handovers` | Chỉ ghi qua `/shipping/handovers*` (không màn hình nào gọi; bàn giao hiện dùng `/shipping/handover/*`, chỉ cập nhật `sales_orders`). Còn được **đọc** trong timeline barcode (`barcodeTracking.service.js:108`). 0 doc. |

Đồng bộ trạng thái GHN hiện tại đi qua module `ghn` cũ (`POST /orders/:id/sync-ghn`, webhook `/api/ghn/webhook`) và lưu thẳng vào `sales_orders`.

### 2.6. Dữ liệu demo (1) — tùy quyết định

| Collection | Bằng chứng |
|---|---|
| `owner_return_trend_demo` | Biểu đồ minh họa trong trang Hoạt động kinh doanh của Owner đọc bảng này; dữ liệu chỉ do `scripts/seedOwnerReturnTrendDemo.mjs` nạp. Nếu bỏ biểu đồ demo thì xóa. |

## 3. Collection còn lại: 50

### 3.1. Dùng chung (đăng nhập, tài khoản, thông báo, nhật ký)

`users`, `google_auth_challenges`, `phone_change_challenges`, `notifications`, `system_logs`. Riêng `material_inbound_plans` được đọc khi Kế toán/Owner mở chuông thông báo (tự sinh thông báo sai lệch còn thiếu).

### 3.2. Theo role

| Role | Số | Collection |
|---|---|---|
| OWNER | 23 | cash_flow_vouchers, customers, fabric_rolls, finished_goods_tickets, inventory_transactions, manager_reports, material_inbound_plans, material_tickets, product_units, products, raw_materials, return_inspections, return_requests, roles, sales_orders, skus, stocktake_records, stocktake_sessions, supplier_contracts, suppliers, system_logs, system_settings, users |
| ACCOUNTANT | 16 | cash_flow_vouchers, cod_reconciliation_batches, cod_reconciliation_items, counter_sequences, material_inbound_plans, notifications, product_units, products, raw_materials, return_requests, sales_orders, shipping_carriers, skus, supplier_contracts, suppliers, users |
| WAREHOUSE_MANAGER | 36 | catalog_operations, counter_sequences, fabric_rolls, finished_goods_batches, finished_goods_bulk_documents, finished_goods_tickets, inventory_transactions, manager_reports, material_inbound_plans, material_stock_lots, material_tickets, notifications, product_units, products, putaway_allocations, putaway_incidents, putaway_scan_events, raw_materials, remnant_recovery_requests, return_inspections, return_requests, roles, sales_orders, skus, stocktake_records, stocktake_schedules, stocktake_sessions, supplier_contracts, suppliers, system_logs, system_settings, users, warehouse_barcode_history, warehouse_layouts, warehouse_locations, warehouse_stock_barcodes |
| WAREHOUSE_STAFF | 31 | chat_conversations, chat_messages, fabric_rolls, finished_goods_batches, finished_goods_bulk_documents, finished_goods_tickets, inventory_transactions, material_inbound_plans, material_stock_lots, material_tickets, notifications, packing_scan_events, packing_sessions, product_units, products, putaway_allocations, putaway_incidents, putaway_scan_events, raw_materials, remnant_recovery_requests, return_inspections, sales_orders, skus, stocktake_sessions, supplier_contracts, suppliers, system_logs, users, warehouse_layouts, warehouse_locations, warehouse_stock_barcodes |
| GARMENT_TECHNICIAN | 24 | counter_sequences, fabric_rolls, finished_goods_tickets, garment_lots, material_categories, material_inbound_plans, material_stock_lots, material_tickets, notifications, product_units, raw_materials, remnant_recovery_requests, return_inspections, return_requests, sales_orders, skus, stocktake_records, stocktake_sessions, supplier_contracts, suppliers, system_logs, system_settings, users, warehouse_locations |
| SELLER | 11 | chat_conversations, chat_messages, conversation_tags, counter_sequences, customers, inventory_transactions, products, return_requests, sales_orders, skus, system_logs |
| Hệ thống (webhook Facebook, webhook GHN cũ) | 9 | chat_conversations, chat_messages, counter_sequences, customers, inventory_transactions, sales_orders, skus, system_logs, users |

Mỗi collection trong 50 bảng đều thuộc ít nhất một role. Không có bảng nào "giữ mà không ai dùng".

### 3.3. Ghi chú về các bảng chỉ đọc / chỉ ghi còn giữ

| Collection | Loại | Lý do giữ |
|---|---|---|
| `roles` | READ ONLY trong ứng dụng | Dữ liệu danh mục vai trò (6 doc, nạp bằng seed). Được đọc khi tạo nhân viên và **mỗi request sơ đồ kho** (`layoutPermission.js`). |
| `counter_sequences` | đọc-tăng-ghi nguyên tử | Sinh mã ORD/POS/CUST/TX/phiếu. |
| `catalog_operations` | ghi + đọc chống trùng | Chống xử lý trùng khi đồng bộ cấu hình sản phẩm offline. |
| `warehouse_barcode_history` | ghi + `exists` | Chặn tái sử dụng barcode cũ khi sinh barcode NPL mới (`rawMaterialBarcode.js:21`). |
| `material_stock_lots`, `stocktake_schedules`, `putaway_incidents`, `return_inspections`, `return_requests`, `google_auth_challenges`, `phone_change_challenges` | 0 doc nhưng có luồng ghi | Rỗng vì chưa phát sinh nghiệp vụ, không phải vì thừa. |

## 4. Các phần còn phụ thuộc cấu hình bên ngoài (không xác định được từ code)

- GHN đang gửi webhook tới `/api/ghn/webhook` (module cũ) hay `/api/shipping/webhooks/ghn` (module mới). Nếu là module mới: vẫn không xử lý được vì không có `carrier_shipments` (xem 2.5).
- Facebook Page có đang kết nối webhook `/api/conversations/routing/inbound-webhook` hay không.
