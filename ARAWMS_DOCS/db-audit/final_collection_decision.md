# AraWMS – Kết luận cuối cùng về collection (bản final)

> Ngày chốt: 2026-11-25 · Nguồn: `discovered_business_flows.md`, `collection_usage_by_role.md`, đối chiếu với bản kiểm tra của người dùng (55 giữ / 10 bỏ).
> Quyết định của người dùng: **giữ toàn bộ tính năng GHN**, **bỏ dữ liệu demo**.

## Tổng quan

- Database có **68 collection** (MongoDB Atlas, 2026-11-25). `boms` đã không còn trên DB, chỉ còn model `Bom.model.js` trong code.
- **Giữ 53 – Bỏ 15** collection trên DB, cộng gỡ model `Bom` khỏi code.

## Giữ lại (53)

| Nhóm | Collection |
|---|---|
| Hệ thống & xác thực (9) | users, roles, google_auth_challenges, phone_change_challenges, notifications, system_logs, system_settings, counter_sequences, manager_reports |
| Mua sắm, hợp đồng, tài chính (7) | suppliers, supplier_contracts, material_inbound_plans, cash_flow_vouchers, cod_reconciliation_batches, cod_reconciliation_items, shipping_carriers |
| Kho NPL, KCS, cắt may (9) | raw_materials, material_categories, fabric_rolls, material_stock_lots, material_tickets, garment_lots, remnant_recovery_requests, warehouse_barcode_history, warehouse_stock_barcodes |
| Thành phẩm, sơ đồ kho, putaway (13) | products, skus, catalog_operations, finished_goods_tickets, finished_goods_batches, finished_goods_bulk_documents, product_units, warehouse_layouts, warehouse_locations, putaway_allocations, putaway_scan_events, putaway_incidents, inventory_transactions |
| Bán hàng & CSKH (5) | customers, chat_conversations, chat_messages, conversation_tags, sales_orders |
| Đóng gói, giao vận GHN, đổi/trả (7) | packing_sessions, packing_scan_events, carrier_shipments, carrier_shipment_events, carrier_handovers, return_requests, return_inspections |
| Kiểm kê (3) | stocktake_sessions, stocktake_schedules, stocktake_records |

## Bỏ (15 collection trên DB + model `Bom`)

| Nhóm | Collection | Bằng chứng | Việc dọn code |
|---|---|---|---|
| Rác chỉ có trên DB (3) | codreconciliationbatches, config, owner_daily_reviews | 0 doc, không có trong code | Không |
| Không ai dùng (2) | document_templates, product_samples | Model không được dùng / chỉ endpoint không màn hình nào gọi, `/owner/samples` đã chuyển hướng | Gỡ model, module `bom/product-samples` |
| Hết scope Owner (3) | production_orders, owner_targets, work_assignments | 0 chỗ ghi từ giao diện; FE không hiển thị `production`/`target`/`tasks` | Gỡ đọc trong `operationsReport`, `executiveDashboard`; gỡ route `/target`, `/tasks`, `/production`; gỡ `Bom`, `bom-plan-report` |
| Ghi/đếm vô ích (2) | inventory_alerts, carrier_disputes | Chỉ ghi, 0 chỗ đọc / chỉ đếm, 0 chỗ ghi | Gỡ ghi trong `systemSettings.service.js`; dashboard Kế toán đếm tranh chấp từ `cod_reconciliation_items` |
| Bảng cũ sau đợt gộp (4) | material_outbounds, order_qr_tokens, product_unit_allocations, packing_videos | 0 chỗ ghi, 0 doc; đã thay bằng `material_tickets`, `sales_orders.qr`, `product_units.packingClaim`, `packing_sessions` | Gỡ đường đọc/xóa tương thích cũ |
| Demo (1) | owner_return_trend_demo | Chỉ do script seed demo nạp | Gỡ biểu đồ demo, endpoint và script seed |

## Đối chiếu với bản kiểm tra của người dùng (55 giữ / 10 bỏ)

| Collection | Bản người dùng | Final | Lý do |
|---|---|---|---|
| packing_videos, product_unit_allocations | Giữ | Bỏ | Cùng đợt gộp với `order_qr_tokens`, `material_outbounds` (4 bảng nguồn trong `backup-warehouse-collections.mjs`); 0 chỗ ghi, 0 doc. Video ghi vào `packing_sessions` (`packingVideo.service.js:109-150`), claim vào `product_units.packingClaim` (`packingVerification.service.js:235,280`). |
| codreconciliationbatches, config, owner_daily_reviews | Không liệt kê | Bỏ | Có trên DB nhưng không có trong code. |
| owner_return_trend_demo | Không liệt kê | Bỏ | Quyết định bỏ dữ liệu demo. |
| boms | Bỏ | Chỉ gỡ model | Collection đã không còn trên DB. |

## Ngoài phạm vi bản này

Dữ liệu demo nằm lẫn trong các bảng giữ lại (`seedOwnerDemo.js`, `demoCatalog.js`, `seedCodReconciliationDemo.mjs`, nút "tạo dữ liệu mẫu" ở trang đối soát COD) cần được rà riêng.
