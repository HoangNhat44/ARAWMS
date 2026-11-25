# AraWMS – Danh sách luồng nghiệp vụ khám phá từ source code (Giai đoạn 1)

> Ngày lập: 2026-11-25 · Phạm vi: `ARAWMS_FE/src` + `ARAWMS_BE/src` (nhánh `anhdtdhe181306`)
> Trạng thái: **khám phá tĩnh** — chưa có runtime tracking. Mọi collection nhắc tới ở đây là giả thuyết, sẽ được kiểm chứng ở Giai đoạn 4.

## 0. Phương pháp và mức độ xác minh

Luồng được dựng theo chuỗi: **route FE của role → trang/component được import → hàm service FE thực sự được gọi trong trang → endpoint BE (khớp theo đúng thứ tự mount Express) → middleware phân quyền**.

Công cụ: script phân tích tĩnh (`static_page_api_map.json` đi kèm là dữ liệu thô: 90 route trang, 496 endpoint BE, 313 endpoint được FE gọi).

| Mức | Ý nghĩa |
|---|---|
| **V1** | Trang của role gọi API, BE route khớp và BE khai báo cho phép role đó (`authorizeRole`, `ownerRouter()`, `layoutPermission`, `putawayRole`…). |
| **V2** | Trang gọi API nhưng BE kiểm quyền bên trong handler/service (không khai báo ở route), hoặc đường dẫn được ghép động (`${action}`, `taskPath()`), cần runtime xác nhận. |
| **V3** | Chỉ có ở BE/hạ tầng (webhook, middleware, khởi động, script), không có màn hình gọi. |
| **NE** | Chưa đủ bằng chứng (xem mục 9). |

Quy ước Flow ID: `COM` (chung), `OWN`, `ACC`, `WHM` (Warehouse Manager), `WHS` (Warehouse Staff), `GAR` (Garment Technician), `SEL` (Seller), `SYS` (hệ thống/chạy nền). Đường dẫn API viết tắt, tất cả có tiền tố `/api`.

## 1. Role đã xác minh

Nguồn: `ARAWMS_BE/src/common/constants/enums.js:11` (`ROLES`), `User.roleCode` enum, `ARAWMS_FE/src/routes/roleHome.js`, `AppRouter.jsx` (`ProtectedRoute role=...`).

| Role code | Tên hiển thị | Trang chủ | Layout |
|---|---|---|---|
| `OWNER` | Chủ cửa hàng | `/owner/dashboard` | `pages/Owner/OwnerLayout.jsx` |
| `WAREHOUSE_MANAGER` | Quản lý kho | `/warehouse/raw-materials/inbound` | `components/warehouse/WarehouseManagerLayout.jsx` |
| `WAREHOUSE_STAFF` | Nhân viên kho | `/warehouse/putaway` | `components/warehouse/WarehouseStaffLayout.jsx` |
| `GARMENT_TECHNICIAN` | Kỹ thuật may / KCS | `/garment/dashboard` | `components/garment/GarmentLayout.jsx` |
| `SELLER` | Bán hàng & CSKH | `/seller/chat` | `components/seller/SellerLayout.jsx` |
| `ACCOUNTANT` | Kế toán | `/accountant` | `components/accountant/AccountantLayout.jsx` |

**Không tồn tại** trong source code: role "Manager" chung và role "BOM Manager". Chức năng BOM/kế hoạch sản xuất chỉ còn ở BE (`/owner/production-reports`, `/owner/product-samples`); các route FE tương ứng (`/owner/production`, `/owner/samples`) đã chuyển hướng sang trang khác (`AppRouter.jsx`).

Quyền chi tiết theo chức năng: `roles.permissions[]` (majorFeature/subFeature/allowedActions) chỉ được dùng thực tế ở `layoutPermission.js` (sơ đồ kho) — middleware này **đọc collection `roles` mỗi request**.

## 2. Luồng chung (mọi role)

| Flow ID | Role | Flow | Các bước | API | Mức |
|---|---|---|---|---|---|
| COM-01 | Tất cả | Đăng nhập / đăng xuất bằng tài khoản | Mở `/login` → nhập tài khoản, mật khẩu → hệ thống tải hồ sơ → chuyển tới trang chủ theo role → đăng xuất | `POST /auth/login`, `GET /accounts/me`, `POST /auth/logout` | V1 |
| COM-02 | Tất cả | Đăng nhập bằng Google | `/login` → "Đăng nhập Google" → lấy cấu hình → tạo challenge → gửi ID token | `GET /auth/google/config`, `POST /auth/google/challenge`, `POST /auth/google/login` | V1 |
| COM-03 | Tất cả | Quên / đặt lại mật khẩu | `/forgot-password` → nhập email/SĐT → nhận mã → `/reset-password` → đặt mật khẩu mới | `POST /auth/forgot-password`, `POST /auth/reset-password` | V1 |
| COM-04 | Tất cả | Cập nhật hồ sơ, đổi mật khẩu | `/account` (Owner: `/owner/account`) → sửa hồ sơ → lưu; đổi mật khẩu | `GET /accounts/me`, `PATCH /accounts/me`, `PATCH /accounts/me/password` | V1 |
| COM-05 | Tất cả | Đổi số điện thoại qua OTP | Hồ sơ → nhập SĐT mới → gửi OTP → nhập OTP → xác nhận | `POST /accounts/me/phone/otp`, `POST /accounts/me/phone/confirm` | V1 |
| COM-06 | Tất cả | Liên kết / hủy liên kết Google | Hồ sơ → "Liên kết Google" → challenge → xác nhận; hoặc hủy liên kết | `POST /accounts/me/google/challenge`, `POST /accounts/me/google`, `DELETE /accounts/me/google` | V1 |
| COM-07 | Tất cả (trừ không đăng nhập) | Chuông thông báo nghiệp vụ | Mở chuông trên header → xem danh sách → đánh dấu đã đọc 1 / tất cả. Nhận realtime qua socket `join_workspace` | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/mark-all-read` | V2 |

Ghi chú: `/register` chỉ chuyển hướng về `/login` ("liên hệ chủ cửa hàng để được cấp tài khoản") — **không có luồng tự đăng ký**.

## 3. OWNER – Chủ cửa hàng

| Flow ID | Flow | Các bước | API | Mức |
|---|---|---|---|---|
| OWN-01 | Xem tổng quan & BI | `/owner/dashboard` → chọn kỳ → xem doanh thu, tồn kho, kế hoạch xuất, công nợ; mục "Hoạt động kinh doanh" (đường ống đơn, tỷ lệ bom hàng, đổi trả); `/owner/bi` xem xu hướng & so sánh năm | `GET /owner/operations-report`, `GET /owner/operations-report/business-activity`, `.../trend`, `.../annual`, `.../return-trend-demo` | V1 |
| OWN-02 | Xem mua hàng & công nợ NCC | `/owner/purchases`, `/owner/payables` → lọc danh sách | `GET /owner/operations-report` | V1 |
| OWN-03 | Lập phiếu chi trả nợ nhà cung cấp | `/owner/payables` → chọn hợp đồng → nhập số tiền, hình thức (tiền mặt/chuyển khoản), nội dung → lưu | `POST /owner/operations-report/payments` (đường dẫn ghép động `action('payments')`) | V2 |
| OWN-04 | Định giá tồn kho NPL / thành phẩm | `/owner/material-valuation`, `/owner/asset-valuation` | `GET /owner/operations-report` (cùng nguồn dữ liệu, khác chế độ hiển thị) | V1 |
| OWN-05 | Xem chi tiết hợp đồng cung ứng | Từ danh sách mua hàng → `/owner/contracts/:id` → xem dòng NPL `/contracts/:id/materials/:line`, đợt nhập `/contracts/:id/plans/:planId` | `GET /owner/contracts/:id` | V1 |
| OWN-06 | Giám sát sai lệch kế hoạch nhập (KCS) | `/owner/plan-deviations` → chọn kế hoạch → xem chi tiết sai lệch, hồ sơ hợp đồng (modal) | `GET /supplier-contracts/inbound-plans`, `GET /supplier-contracts/contracts/:id`, `GET /supplier-contracts/inbound-plans/:id` | V1 |
| OWN-07 | Duyệt báo cáo định kỳ của Quản lý kho | `/owner/manager-reports` → mở báo cáo → nhập nhận xét → "Đã xem/duyệt" | `GET /owner/manager-reports`, `GET /owner/manager-reports/:id`, `PATCH /owner/manager-reports/:id/review` | V1 |
| OWN-08 | Quản lý tài khoản nhân viên | `/owner/employees` → lọc theo vai trò → tạo mới (`/employees/new`) → khóa/mở khóa/vô hiệu/kích hoạt lại (có lý do, kiểm tra phiên bản) | `GET /owner/employees`, `GET /owner/employee-permissions`, `POST /owner/employees`, `PATCH /owner/employees/:id/{lock,unlock,deactivate,reactivate}` | V2 (action động) |
| OWN-09 | Xem nhật ký hoạt động (audit log) | `/owner/activity` → lọc theo thời gian/người/hành động → bật "truy vết" | `GET /owner/activity`, `GET /owner/activity/trace` | V1 |
| OWN-10 | Xem danh mục sản phẩm | `/owner/products` | `GET /owner/products` | V1 |
| OWN-11 | Cấu hình hệ thống | `/owner/settings/{integrations,fabric,inventory,returns}` → sửa kết nối API đối tác, ngưỡng vải dư, chính sách đổi trả → lưu | `GET /owner/system-settings`, `PATCH /owner/system-settings/:section` | V1 |
| OWN-12 | Đặt mức tồn tối thiểu theo mặt hàng | `/owner/settings/inventory` → chọn NPL/SKU → sửa ngưỡng → lưu | `GET /owner/system-settings/inventory-items/:type`, `PATCH /owner/system-settings/inventory-items/:type/:id` | V1 |
| OWN-13 | Phê duyệt điều chỉnh tồn sau kiểm kê | `/owner/stock-adjustments` → mở phiên có chênh lệch vượt ngưỡng → xem chi tiết → phê duyệt | `GET /owner/stock-adjustments`, `GET /owner/stock-adjustments/:id`, `POST /owner/stock-adjustments/:id/approve` | V1 |

## 4. ACCOUNTANT – Kế toán

| Flow ID | Flow | Các bước | API | Mức |
|---|---|---|---|---|
| ACC-01 | Xem dashboard tài chính | `/accountant` → chọn kỳ → xem dòng tiền, lợi nhuận, giá vốn, COD, tranh chấp | `GET /financial/dashboard/summary` | V1 |
| ACC-02 | Quản lý hồ sơ nhà cung cấp | `/accountant/suppliers` → tìm → thêm mới → sửa | `GET/POST /supplier-contracts/suppliers`, `PUT /supplier-contracts/suppliers/:id` | V1 |
| ACC-03 | Soạn khung hợp đồng & quản lý phiên bản | `/accountant/contracts` → chọn NCC, NPL từ danh mục → tạo nháp → sửa → chuyển trạng thái (ký/hiệu lực) → sửa đổi tạo phiên bản mới → xem lịch sử phiên bản | `GET /supplier-contracts/materials-catalog`, `GET/POST /supplier-contracts/contracts`, `GET/PUT /supplier-contracts/contracts/:id`, `POST .../:id/amend`, `GET .../:id/versions`, `PATCH .../:id/status` | V1 |
| ACC-04 | Chấm dứt hợp đồng | Chi tiết hợp đồng → "Chấm dứt" → nhập lý do → xác nhận | `POST /supplier-contracts/contracts/:id/terminate` | V1 |
| ACC-05 | Lập kế hoạch nhập NPL theo đợt | `/accountant/inbound-plans` → chọn hợp đồng → tạo kế hoạch → sửa đổi (phiên bản) → xem lịch sử | `GET /supplier-contracts/inbound-plans`, `POST /supplier-contracts/inbound-plans`, `POST .../:id/amend`, `GET .../:id/versions`, `GET .../:id` | V1 |
| ACC-06 | Xử lý sai lệch từ KCS | `/accountant/contract-deviations` → xem cảnh báo → chọn phương án (phiên bản mới / chấm dứt) → xử lý; hoặc trình Owner | `GET /supplier-contracts/deviations`, `POST /supplier-contracts/deviations/:id/resolve`, `POST /supplier-contracts/inbound-plans/:id/report-to-owner` | V1 |
| ACC-07 | Công nợ phải trả NCC | `/accountant/supplier-debts` → xem tổng → mở sổ chi tiết NCC | `GET /financial/debts/suppliers`, `GET /financial/debts/suppliers/:supplierId/ledger` | V1 |
| ACC-08 | Công nợ phải thu ĐVVC (COD, phí ship) | Tab ĐVVC → cấu hình kỳ đối soát → ghi nhận nhận tiền COD → thanh toán phí vận chuyển (bù trừ) | `GET /financial/debts/carrier`, `PATCH .../carrier/config`, `POST .../carrier/settle-cod`, `POST .../carrier/settle-shipping-fee` | V1 |
| ACC-09 | Lập phiếu thu/chi | `/accountant/payment-vouchers` → chọn loại chi (danh mục) → chọn NCC/hợp đồng hoặc hoàn tiền → tạo → xác nhận → thực chi; hoặc hủy | `GET /payment-vouchers/categories`, `GET/POST /payment-vouchers`, `PATCH /:id/confirm`, `POST /:id/execute-payment`, `PATCH /:id/cancel` | V1 |
| ACC-10 | Đối soát COD với GHN | `/accountant/cod-reconciliation` → xem đơn COD → đồng bộ GHN → xem cờ đỏ → mở tranh chấp / xử lý | `GET /financial/cod-reconciliation/orders`, `POST .../sync-ghn`, `GET .../red-flags`, `POST .../disputes/:itemId` | V1 |
| ACC-11 | Định giá tồn kho thành phẩm | `/accountant/inventory-valuation` → lọc danh mục → xem tổng & danh sách | `GET /financial/inventory-valuation/{summary,products,categories}` | V2 (quyền ở module) |
| ACC-12 | Định giá tồn kho NPL | `/accountant/raw-material-valuation` | `GET /financial/raw-material-valuation/{summary,materials,metadata}` | V2 |

## 5. WAREHOUSE_MANAGER – Quản lý kho

| Flow ID | Flow | Các bước | API | Mức |
|---|---|---|---|---|
| WHM-01 | Nhập kho NPL theo yêu cầu nhập của KTV/KCS | `/warehouse/raw-materials/inbound` → danh sách yêu cầu nhập (do KTV tạo ở GAR-04/GAR-05, gồm yêu cầu theo kế hoạch và yêu cầu trực tiếp) → mở yêu cầu → lập phiếu nhận gắn với yêu cầu (lưu nháp theo `draftKey`, NPL và vị trí chỉ chọn từ danh mục có sẵn) → nhập cuộn/lô → xác nhận → in tem → chuyển cất kệ | `GET /raw-material-inbound/options`, `GET /raw-material-inbound/technician-requests`, `GET/POST /receipts`, `GET /receipts/by-draft-key/:key`, `GET/PUT /receipts/:id`, `POST /receipts/:id/confirm`, `GET /receipts/:id/labels`, `POST /receipts/:id/putaway` | V1 |
| WHM-02 | Hủy phiếu nhập NPL | Phiếu nháp → "Hủy" | `POST /raw-material-inbound/receipts/:id/cancel` | V1 |
| WHM-03 | Xử lý phiếu nhập kiểu cũ (legacy) | Mở phiếu cũ → sửa → xác nhận | `GET/PUT /raw-material-inbound/legacy-receipts/:id`, `POST .../confirm` | V1 |
| WHM-05 | Xem vị trí đặt hàng của yêu cầu nhập & báo sai lệch | Mở yêu cầu nhập của KTV → xem vị trí đặt → báo sai lệch | `GET /raw-material-inbound/technician-requests/:id/placements`, `POST .../:id/discrepancies` | V1 |
| WHM-06 | Tiếp nhận hoàn kho vải dư | Danh sách yêu cầu hoàn vải từ xưởng → xác nhận / báo sai lệch / đóng | `GET /garment-technical/remnant-recovery/return-requests`, `POST .../:id/confirm`, `POST .../:id/discrepancy`, `POST .../:id/close` | V1 |
| WHM-07 | Duyệt & phân bổ xuất NPL theo FIFO | `/warehouse/raw-materials/outbound` → mở yêu cầu từ xưởng → duyệt + giao nhân viên → xử lý thiếu hàng | `GET /raw-material-outbound/requests`, `GET .../requests/:id`, `GET /staff-users`, `POST .../:id/approve-and-assign`, `POST .../:id/resolve-shortage` | V1 |
| WHM-08 | Phiếu xuất NPL thủ công | Tab phiếu → tạo → xác nhận | `GET /raw-material-outbound/options`, `GET/POST /tickets`, `GET /tickets/:id`, `POST /tickets/:id/confirm` | V1 |
| WHM-09 | Nhập thành phẩm từ KCS (chứng từ nhập hàng loạt) | `/warehouse/technical-inbound` → danh sách yêu cầu nhập TP → tạo chứng từ nhập → theo dõi xác nhận | `GET /products/bulk/technical-requests`, `POST /products/bulk/documents`, `POST /products/bulk/confirmations/status`, `GET /products/bulk/documents/:id`, `GET /products/bulk/bin-options` | V2 |
| WHM-10 | Theo dõi tiến độ & phân bổ ô kệ | `/warehouse/inbound-progress` → chứng từ chờ phân bổ → phân bổ ô → xem barcode chứng từ | `GET /products/bulk/inbound-progress`, `GET .../documents/pending-allocation`, `POST .../documents/:id/allocations`, `GET .../documents/:id/barcodes` | V1/V2 |
| WHM-11 | Xuất thành phẩm theo chứng từ | `/warehouse/technical-outbound` → danh sách chứng từ xuất → xem chi tiết | `GET /products/bulk/outbound-documents`, `GET /products/bulk/documents/:id` | V2 |
| WHM-12 | Quản lý tồn thành phẩm theo SKU | `/warehouse/finished-goods` → mở sản phẩm → tồn theo kệ → phiếu nhập & đơn vị → in tem; xuất lẻ theo SKU cho hàng **không** quản lý theo lô (chỉ chiều xuất; hàng theo lô phải xuất bằng barcode từng chiếc). Không có thao tác nhập thẳng thành phẩm: nhập chỉ qua chứng từ theo yêu cầu của KTV (WHM-09) | `GET /products`, `GET /products/:id/detail`, `GET .../shelf-stock`, `GET .../receipts`, `GET .../receipts/:documentId/units`, `POST .../labels`, `POST /products/:id/stock` (FE chỉ gửi `direction: 'OUT'`, `FinishedGoodsPage.jsx:500`) | V1 |
| WHM-13 | Cấu hình sản phẩm & biến thể SKU (kể cả Excel, offline) | `/warehouse/products/new` hoặc `/:id/edit` → sửa thông tin, biến thể, quy cách, ảnh/video → lưu (đẩy vào hàng đợi offline → đồng bộ) → xem tồn của SKU ngừng bán | `POST /products/configuration/sync`, `GET /products/configuration/:id`, `GET .../discontinued-stock`, `PUT /products/:id/{image,video}`, `POST /products/:id/additional-image` | V1 |
| WHM-14 | Quản lý kho hàng lỗi | `/warehouse/defects` → danh sách đơn vị lỗi → xuất sửa chữa / thanh lý / tiêu hủy | `GET /products/defects`, `POST /products/defects/outbound` | V1 |
| WHM-15 | Tra cứu hành trình mã vạch | `/warehouse/barcode-tracking` → quét/nhập barcode → xem timeline | `GET /products/units/:barcode/timeline` | V1 |
| WHM-16 | Báo cáo kho định kỳ gửi Owner | `/warehouse/reports` → tạo → làm mới số liệu → lưu nháp → gửi; hoặc xóa nháp | `GET/POST /warehouse-reports`, `GET/PATCH/DELETE /warehouse-reports/:id`, `POST .../:id/refresh`, `POST .../:id/submit` | V1 |
| WHM-17 | Cấu hình sơ đồ kho (nháp → kiểm tra → công bố) | `/warehouse/layout` → mở nháp → thêm/xóa/đổi kích thước dãy kệ → lưu → kiểm tra → công bố | `GET /warehouse-layout/layout`, `POST/PATCH .../layout/draft`, `POST .../draft/racks`, `DELETE .../draft/racks/:id`, `POST .../racks/:id/resize`, `POST .../draft/validate`, `POST .../draft/publish` | V1 (layoutPermission đọc `roles`) |
| WHM-18 | In tem vị trí ô kệ | Chọn ô → xem → in tem Code128/QR → ghi nhận lượt in | `GET /warehouse-layout/bins/:id`, `GET .../label`, `.../label.png`, `.../label-qr.png`, `POST .../print-intent`, `GET /warehouse-layout/allocation-options` | V1 |
| WHM-19 | Giám sát sự cố cất kệ | Trong sơ đồ → mở dãy kệ → xem hàng trong ô → xem sự cố/vấn đề → duyệt sự cố / xử lý vấn đề | `GET /warehouse-putaway/racks/:rackId/contents`, `GET .../bins/:binId/units`, `GET .../issues`, `GET .../incidents`, `POST .../incidents/:id/review`, `POST .../issues/:allocationId/:lineId/resolve` | V2 |
| WHM-20 | Lập lịch / phiên kiểm kê | `/warehouse/stocktake` → chọn phạm vi → tạo phiên (kích hoạt khóa giao dịch & khóa đóng gói) → bật/tắt lịch định kỳ | `GET /stocktake/options`, `GET /stocktake`, `POST /stocktake`, `PATCH /stocktake/schedules/:id/status` | V1 |
| WHM-21 | Đối soát kết quả kiểm kê | `/warehouse/stocktake/:id` → xem báo cáo chênh lệch → yêu cầu đếm lại / duyệt / điều chỉnh tồn | `GET /stocktake/sessions/:id`, `POST .../recount`, `POST .../approve`, `POST .../adjust` | V1 |

## 6. WAREHOUSE_STAFF – Nhân viên kho

| Flow ID | Flow | Các bước | API | Mức |
|---|---|---|---|---|
| WHS-01 | Cất thành phẩm lên kệ (hàng loạt theo nhóm ô) | `/warehouse/putaway` → chọn chứng từ → in tem → lập kế hoạch nhóm ô → quét ô + barcode → đặt hàng loạt | `GET /warehouse-putaway/tasks`, `GET .../receipts/:receiptId/labels`, `POST .../receipts/:receiptId/bulk-plan`, `POST .../receipts/:receiptId/bulk-place` | V2 (putawayRole) |
| WHS-02 | Cất từng dòng: chọn vị trí, quét, báo thiếu/sự cố | Mở 1 dòng nhiệm vụ → quét ô → quét đơn vị → nếu thiếu: báo thiếu; nếu hỏng/sai: báo sự cố | `GET/POST /warehouse-putaway/tasks/:allocationId/:lineId[/location,/scan,/shortage,/incident]` (đường dẫn ghép bằng `taskPath()`) | V2 |
| WHS-03 | Cất NPL lên kệ | Tab NPL → nhiệm vụ → in tem phiếu → chọn vị trí → quét cuộn/lô | `GET /warehouse-putaway/material-tasks`, `GET .../material-locations`, `GET .../material-receipts/:receiptId/labels`, `POST .../material-tasks/location`, `POST .../material-tasks/scan` | V2 |
| WHS-04 | Lấy hàng & xuất NPL theo FIFO | `/warehouse/staff/outbound` → nhiệm vụ được giao → bắt đầu lấy → quét cuộn → ghi số lượng → bỏ nguồn / báo thiếu / tạm dừng → xác nhận bàn giao cho xưởng | `GET /raw-material-outbound/staff-tasks`, `POST /requests/:id/{start-picking,scan,record-quantity,remove-source,report-shortage,pause,confirm-handover}` | V1 |
| WHS-05 | Xuất thành phẩm theo chứng từ (quét) | Danh sách chứng từ xuất → quét barcode → gỡ quét sai → xác nhận xuất | `GET /products/bulk/outbound-documents`, `POST .../:id/scan`, `POST .../:id/remove-scan`, `POST .../:id/confirm` | V2 |
| WHS-06 | Tạo & in QR đơn hàng, in tem vận đơn | `/orders/qr` → danh sách đơn → tra mã đơn → cấp QR hàng loạt → xác nhận đơn → xem/đổi QR → in tem 60×95 mm (in phía trình duyệt) | `GET /order-qr/orders`, `GET .../orders/lookup`, `POST .../orders/qr/bulk`, `POST .../orders/:id/confirm`, `GET .../orders/:id/qr`, `POST .../orders/:id/qr/replace` | V1 |
| WHS-07 | Đóng gói kiểm tra 2 lớp + quay video | `/packing/qr` → quét QR đơn → mở phiên (giữ lease, heartbeat) → quét barcode từng sản phẩm (gỡ nếu sai) → quay & tải video → đồng bộ video → hoàn tất; hoặc nhả/hủy phiên | `POST /order-qr/qr/resolve`, `POST /packing/prepare`, `POST /packing/sessions/:id/{heartbeat,scan,scans/remove,video,release,cancel}`, `POST .../video/:recordingId/sync`, `GET .../video` | V1 |
| WHS-08 | Khóa đóng gói khi đến giờ kiểm kê | Trong lúc đóng gói, hệ thống kiểm tra thông báo kiểm kê → khóa màn hình | `GET /stocktake/announcements` | V1 |
| WHS-09 | Bàn giao cho đơn vị vận chuyển | `/warehouse/shipping` → danh sách đơn đã đóng gói → quét mã đơn → đơn chuyển sang "đã bàn giao" → xem danh sách đã bàn giao | `GET /shipping/handover/ready`, `POST /shipping/handover/scan`, `GET /shipping/handover/handed-over` | V1 |
| WHS-10 | Tra cứu nhanh tồn TP & hành trình barcode | `/warehouse/staff/finished-goods`, `/warehouse/staff/barcode-tracking` (chỉ xem) | `GET /products`, `GET /products/:id/detail`, `GET .../shelf-stock`, `GET .../receipts`, `GET /products/units/:barcode/timeline` | V1 |

Trang staff dùng chung component với Manager (`isStaffMode`): các API chỉ Manager được gọi (`POST /products/:id/stock`, tạo/xác nhận phiếu xuất NPL, `configuration/sync`…) **không** được tính là luồng của Staff vì BE trả 403.

## 7. GARMENT_TECHNICIAN – Kỹ thuật may / KCS

| Flow ID | Flow | Các bước | API | Mức |
|---|---|---|---|---|
| GAR-01 | Xem dashboard chất lượng | `/garment/dashboard` | `GET /garment-technical/dashboard` | V1 |
| GAR-02 | Quản lý danh mục NPL & nhóm NPL | `/garment/raw-materials` → CRUD nhóm → CRUD NPL → bật/tắt trạng thái | `GET /garment-technical/raw-materials/{meta,categories}`, `POST/PUT/DELETE .../categories[/:id]`, `GET/POST /garment-technical/raw-materials`, `PUT/DELETE .../:id`, `PATCH .../:id/toggle-status` | V1 |
| GAR-03 | Khai báo & quản lý lô hàng (mã lô), gửi yêu cầu nhập kho | `/garment/lots` → chọn tab Thành phẩm / NPL → tạo lô nháp (mã lô tự sinh hoặc nhập tay; hệ thống gắn kèm chuỗi định danh `LOT:FG:<mã>` / `LOT:RM:<mã>`) → sửa → xóa → chọn nhiều lô cùng loại → gửi yêu cầu nhập kho (tạo phiếu nhập TP / yêu cầu nhập NPL cho Quản lý kho) | `GET /garment-technical/lots/options`, `GET/POST /garment-technical/lots`, `PUT/DELETE .../:id`, `POST .../send-inbound-request` | V1 |
| GAR-04 | Kiểm định NPL đầu vào theo kế hoạch | `/garment/material-inbound-verification` → danh sách kế hoạch → đối soát → "Đạt" hoặc báo sai lệch (gửi Kế toán) | `GET /garment-technical/inbound-verification/{options,plans}`, `POST .../plans/:id/verify` | V1 |
| GAR-05 | Gửi yêu cầu nhập NPL | Cùng trang → tạo yêu cầu nhập → xem danh sách | `GET/POST /garment-technical/inbound-verification/requests` | V1 |
| GAR-06 | Kiểm định thành phẩm & yêu cầu nhập kho | `/garment/finished-goods-inspection` → chọn SKU, phân loại lỗi → tạo phiếu | `GET /garment-technical/finished-inspection/{options,tickets}`, `POST .../tickets` | V1 |
| GAR-07 | Kiểm định hàng hoàn trả | `/garment/return-inspection` → quét mã đơn hoàn → mở phiên → quay video mở kiện → quét từng đơn vị (gỡ nếu sai) → kết thúc quay → tải/đồng bộ video → chốt và yêu cầu nhập (kho bán hoặc kho lỗi); hoặc hủy phiên | `GET .../return-inspection/{recent-orders,lookup/:code}`, `POST .../sessions/open`, `POST .../sessions/:id/{scan-unit,remove-unit,finish-recording,cancel,video}`, `POST .../video/:recordingId/sync`, `POST .../finalize-and-request-inbound`, `GET /garment-technical/return-inspection` | V1 |
| GAR-08 | Thực hiện kiểm kê | `/garment/stocktake-execution` → chọn phiên → quét mã ô kệ → quét barcode/đếm → sửa số lượng → hoàn tất | `GET .../stocktake-execution/sessions[/:id]`, `POST .../sessions/:id/{verify-shelf,scan-item,complete}`, `PATCH .../records/:id` | V1 |
| GAR-09 | Gửi yêu cầu xuất NPL cho xưởng | `/garment/material-outbound-request` → chọn NPL → gửi → theo dõi | `GET/POST /garment-technical/remnant-recovery/outbound-requests` | V1 |
| GAR-10 | Ghi nhận cắt vải & hoàn vải dư | `/garment/remnant-recovery` → xem ngưỡng định mức → chọn cuộn đã cấp → ghi nhận cắt, đo vải thừa → tìm nguồn hoàn → báo nguồn không rõ → xem lịch sử → đóng yêu cầu hoàn | `GET .../remnant-recovery/{threshold,issued-rolls,return-sources,history}`, `POST .../record-cutting`, `POST .../outbound-requests/:id/source-discrepancies`, `POST .../return-requests/:id/close` | V1 |

## 8. SELLER – Bán hàng & CSKH

| Flow ID | Flow | Các bước | API | Mức |
|---|---|---|---|---|
| SEL-01 | Hội thoại đa kênh (Messenger) | `/seller/chat` → danh sách hội thoại (realtime) → mở → đọc tin → đánh dấu đã đọc → gửi tin / tệp đính kèm | `GET /conversations`, `GET /conversations/:id/messages`, `PATCH /conversations/:id/read`, `POST /conversations/:id/messages`, `POST /conversations/:id/attachments` | V1 |
| SEL-02 | Gắn nhãn hội thoại | Mở hội thoại → chọn nhãn có sẵn / tạo nhãn mới → gắn / gỡ | `GET /conversations/tags/list`, `POST /conversations/tags/create`, `POST /conversations/:id/tags`, `DELETE /conversations/:id/tags/:tag` | V1 |
| SEL-03 | Tra tồn khả dụng SKU trong khung chat | Ô tra cứu → nhập mã/tên | `GET /conversations/inventory/sku-lookup` | V1 |
| SEL-04 | Hồ sơ khách hàng (CRM) | `/seller/customers` (hoặc panel trong chat) → tìm → tạo → cập nhật, phân nhóm (tag đồng bộ sang hội thoại) → xem lịch sử tương tác & đơn mua | `GET/POST /conversations/customers`, `PUT /conversations/customers/:id`, `GET .../:customerId/interaction-history`, `GET .../:customerId/purchase-history` | V1 |
| SEL-05 | Tạo đơn từ chat: chờ xác nhận hoặc chốt ngay | Trong chat → "Tạo đơn" → chọn SKU → chọn chế độ → lưu (chốt ngay = giữ hàng, gửi thẻ đơn vào chat) | `POST /orders` | V1 |
| SEL-06 | Bán tại quầy (POS) | `/seller/orders` → POS → chọn SKU → thanh toán (trừ tồn ngay) | `POST /orders/pos-direct` | V1 |
| SEL-07 | Quản lý đơn hàng | Danh sách đơn → mở chi tiết → sửa sản phẩm / người nhận → xác nhận giữ hàng → gửi biên nhận vào chat | `GET /orders`, `PUT /orders/:id/items`, `PATCH /orders/:id/recipient`, `POST /orders/:id/confirm`, `POST /orders/:id/send-confirmation` | V1 |
| SEL-08 | Hủy đơn (có hỏi lại khách) | Chi tiết đơn → gửi câu hỏi xác nhận hủy → hủy (nhả giữ hàng) | `POST /orders/:id/send-cancel-inquiry`, `POST /orders/:id/cancel` | V1 |
| SEL-09 | Đồng bộ trạng thái vận đơn GHN | Chi tiết đơn → "Đồng bộ GHN" | `POST /orders/:id/sync-ghn` | V1 |
| SEL-10 | Nhập đơn từ sàn TMĐT (Excel) | Mở modal → chọn kênh → tải mẫu → tải file → xem trước (khớp SKU) → xử lý tạo đơn | `GET /orders/marketplace/channels`, `GET .../template`, `POST .../preview-excel`, `POST .../process-orders` | V1 |
| SEL-11 | Tạo yêu cầu đổi / trả hàng | Chi tiết đơn → "Đổi/trả" → chọn sản phẩm, nguyên nhân → tạo | `POST /returns/rma` | V1 |
| SEL-12 | Tạo đơn đổi hàng | Từ RMA đổi hàng → chọn SKU thay thế → tạo đơn đổi | `POST /returns/rma/:rmaId/create-exchange-order` | V1 |
| SEL-13 | Gửi yêu cầu hoàn tiền | Từ RMA trả hàng → nhập số tiền → gửi cho Kế toán | `POST /returns/rma/:id/refund-request` | V1 |

## 9. Luồng đặc biệt (điều kiện, ngoại lệ, đảo chiều)

| Flow ID | Role | Tình huống | Bằng chứng |
|---|---|---|---|
| SP-01 | SELLER | Tạo đơn khi tồn khả dụng không đủ → giữ hàng thất bại, hoàn tác (xóa đơn vừa tạo) | `orderManagement.service.js:277-316` (`findOneAndUpdate` có điều kiện `onHand - reserved >= qty`, `findByIdAndDelete`) |
| SP-02 | SELLER | Hủy đơn đã giữ hàng → nhả `reservedQty`, ghi giao dịch nhả giữ chỗ | `orderManagement.service.js:802-809` |
| SP-03 | SELLER | Đơn trùng khi nhập Excel sàn → bỏ qua | `marketplaceOrderImport.service.js:413` |
| SP-04 | SELLER/ACC | Trả hàng hoàn tiền: đã có RMA đang mở → chặn tạo mới | `returnMerchandiseAuthorization.service.js:110-119` |
| SP-05 | WHS | Đóng gói bị khóa khi có phiên kiểm kê | `packingStocktakeLock.js`, `GET /stocktake/announcements` |
| SP-06 | WHS | Hai trạm cùng quét 1 barcode → claim độc quyền (`product_units.packingClaim`) | `WAREHOUSE_COLLECTION_MERGE.md`, `packingVerification.service.js` |
| SP-07 | WHS | Video đóng gói/hoàn hàng tải lỗi → hàng đợi offline tự tải lại | `PackingUploadRunner`, `ReturnUploadRunner`, `localPackingVideoQueue.js` |
| SP-08 | WHS | Cất kệ thiếu hàng / sự cố → Manager duyệt | WHS-02 → WHM-19 |
| SP-09 | WHS/WHM | Lấy NPL thiếu → báo thiếu → Manager xử lý thiếu | WHS-04 → WHM-07 |
| SP-10 | WHM/OWN | Kiểm kê chênh lệch → đếm lại / điều chỉnh; vượt ngưỡng → Owner phê duyệt | WHM-21 → OWN-13 |
| SP-11 | GAR/ACC/OWN | KCS báo sai lệch kế hoạch nhập → Kế toán xử lý hoặc trình Owner | GAR-04 → ACC-06 → OWN-06 |
| SP-12 | GAR | Hàng hoàn lỗi → nhập kho lỗi thay vì kho bán | `finalizeAndRequestInbound` |
| SP-13 | GAR/WHM | Hoàn vải dư không rõ nguồn → báo sai lệch | `reportUnknownReturnSource`, `reportReturnDiscrepancy` |
| SP-14 | OWN | Khóa/vô hiệu nhân viên có kiểm tra phiên bản (`expectedVersion`) | `EmployeesPage.jsx:79` |
| SP-15 | ACC | Đối soát COD có tranh chấp → phản hồi từ GHN (có nút **giả lập**) | `simulate-feedback`, `seed-sample` (dữ liệu mẫu) |
| SP-16 | Tất cả | Phiên đăng nhập hết hạn (401) → đăng xuất tự động | `ARAWMS_FE/src/services/api.js` |

## 10. Luồng hệ thống / chạy nền (không có màn hình)

| Flow ID | Kích hoạt | Mô tả | Endpoint / vị trí | Mức |
|---|---|---|---|---|
| SYS-01 | Mọi request có token | Middleware xác thực đọc người dùng | `common/middlewares/authenticate.js` | V3 |
| SYS-02 | Request sơ đồ kho | `layoutPermission` đọc quyền chi tiết của role | `location-layout/layoutPermission.js` (đọc `roles`) | V3 |
| SYS-03 | Facebook gửi tin nhắn | Webhook nhận tin → tạo khách, hội thoại, tin nhắn; có thể tạo đơn | `GET/POST /conversations/routing/inbound-webhook` | V3 |
| SYS-04 | GHN gửi trạng thái (module cũ) | Cập nhật trạng thái đơn, trừ tồn khi lấy hàng, gửi thẻ vào chat | `POST /ghn/webhook`, `POST /carriers/ghn/webhook` | V3 |
| SYS-05 | GHN gửi trạng thái (module shipping mới) | Chống trùng bằng `eventKey`; **chỉ xử lý nếu đã có vận đơn** trong `carrier_shipments` | `POST /shipping/webhooks/ghn` | V3 |
| SYS-06 | Import module chat | Tự seed nhãn mặc định nếu chưa có | `chatInterface.controller.js:20` → `seedDefaultTags()` | V3 |
| SYS-07 | Gọi API danh mục NPL | Tự tạo nhóm NPL mặc định | `rawMaterials.service.js` → `ensureDefaultCategories()` | V3 |
| SYS-08 | `GET /notifications` của ACCOUNTANT/OWNER | Tự sinh thông báo sai lệch còn thiếu (ghi khi đọc) | `notification.service.js:148` | V3 |
| SYS-09 | Lần đầu dùng QR/đóng gói/video | Tạo index | `ensurePackingIndexes`, `ensureVideoIndexes` | V3 |
| SYS-10 | Đăng nhập WAREHOUSE_MANAGER | Hàng đợi offline đồng bộ cấu hình sản phẩm và chứng từ thành phẩm | `CatalogSyncRunner`, `FinishedGoodsSyncRunner` | V2 |
| SYS-11 | Socket.IO | Phòng realtime theo role/hội thoại — **không truy cập DB** | `config/socket.js` | V3 |
| SYS-12 | Chạy tay | Script seed/demo/migrate: `seedOwnerDemo.js`, `demoCatalog.js`, `seedOwnerReturnTrendDemo.mjs`, `backup/migrate/verify-warehouse-collections.mjs`… | `ARAWMS_BE/scripts/` | V3 |

Không phát hiện cron job, `setInterval` hay hàng đợi bất đồng bộ phía BE.

## 11. Chức năng chưa đủ bằng chứng hoặc không còn màn hình (NE)

Các endpoint BE dưới đây **tồn tại nhưng không trang FE nào gọi** (đã loại các alias trùng handler):

| Nhóm | Endpoint | Nhận xét |
|---|---|---|
| Vận đơn GHN kiểu mới | `POST /shipping/orders/:orderId/shipments`, `POST /shipping/shipments/:id/print-token`, `GET /shipping/{orders,shipments}`, `GET /shipping/ghn/{provinces,wards}` | `shippingService.createShipment` không được trang nào dùng → hiện không có luồng tạo bản ghi vận đơn. |
| Biên bản bàn giao kiểu cũ | `GET/POST /shipping/handovers`, `POST /shipping/handovers/:id/{scan,confirm}`, `DELETE .../parcels/:waybillCode` | Đã thay bằng `/shipping/handover/*` (WHS-09), luồng này chỉ cập nhật `sales_orders`. |
| BOM / sản xuất | `GET /owner/production-reports[/:id]`, `PATCH /owner/operations-report/production/:id`, `GET /owner/product-samples[/:id]` | Route FE đã chuyển hướng. |
| Owner – mục cũ | `GET /owner/dashboard` (executive), `GET /owner/financial-reports[/cash-vouchers]`, `GET /owner/operations-report/best-sellers`, `PUT .../target`, `POST/PATCH .../tasks`, `PATCH .../inbound/:id/assignment`, `PATCH /owner/employee-permissions/:id`, `PATCH /owner/employee-roles/:id` | Trang `EmployeePermissionsPage`, `EmployeeRoleForm`, `BestSellers` không được import ở đâu. |
| Owner – phê duyệt hợp đồng | — | Tài liệu `12.docx` ghi "Owner phê duyệt hoặc từ chối hợp đồng", nhưng các trang Owner chỉ gọi API **GET**; chữ "phê duyệt" chỉ là nội dung hiển thị. **Không có bằng chứng.** |
| Hoàn tiền RMA | `POST /returns/rma/:id/refund-approve`, `.../refund-reject`, `GET /returns/rma/refund-requests` | Có trong `sellerService` nhưng không trang nào gọi; Kế toán xử lý hoàn tiền qua phiếu chi (ACC-09). Cần runtime xác nhận. |
| Tạo nhanh NPL / vị trí khi nhập (đã loại WHM-04) | `POST /raw-material-inbound/materials`, `POST /raw-material-inbound/locations`, `POST /products/locations` | Code nút "Tạo nguyên phụ liệu mới" / "Thêm vị trí Khu A" còn trong `DirectMaterialReceiptModal.jsx:413-472`, nhưng chỉ hiện khi phiếu **không gắn yêu cầu nhập** (`!requestMode`) và chưa khóa. `SupplierInboundPage` chỉ mở modal theo yêu cầu (`kind: 'request'`) hoặc phiếu `INBOUND_FROM_SUPPLIER` đã có; DB hiện có 4 phiếu loại này, đều gắn yêu cầu và `COMPLETED`. Chế độ nhập trực tiếp (`kind: 'new'`/`'local'`) không còn chỗ nào mở. Nghiệp vụ: NPL do KTV tạo (GAR-02), nhập kho chỉ theo yêu cầu của KTV. `productService.createLocation` cũng không được gọi ở đâu. |
| "QR truy vết" của lô hàng | — | `qrValue` của lô chỉ là chuỗi văn bản `LOT:FG:<mã lô>` / `LOT:RM:<mã lô>` do `buildLotQrValue()` sinh (`lotManagement.service.js:47`). Chuỗi này được lưu ở `garment_lots`, được chép sang dòng của phiếu (`finished_goods_tickets.items`, `material_tickets` lines) và được hiển thị hoặc sao chép trên giao diện KTV. **Không** chỗ nào sinh ảnh QR cho lô: `garment_lots.qrImageUrl` không bao giờ được gán. Cũng **không** có luồng quét nào đọc chuỗi `LOT:`. Dòng chữ "Quản lý kho sinh tem QR theo từng lô" trên giao diện chưa có chức năng tương ứng. Truy vết thực tế dùng barcode từng chiếc (`product_units`), barcode cuộn vải/lô NPL và timeline barcode (WHM-15). |
| Nhập NPL nâng cao | `/raw-material-inbound/plans/*` (setup-legacy, close-short, cancel batch, window, items), `roll-template`, `roll-import/preview`, `delivery-matches`, `receipts/:id/attachments`, `supplier-returns[/confirm]` | Không có màn hình. |
| Khác | `POST /raw-material-outbound/requests/:id/reallocate`, `/warehouse-layout/allocations*`, `POST /warehouse-layout/bins/:id/rotate`, `POST .../layout/draft/reset`, `POST /products/configuration/{new,import,import/preview}`, `PATCH .../configuration/:id[/variants]`, `POST /orders/marketplace/:id/warehouse-approve`, `POST /packing/product-units/register`, `DELETE /conversations/tags/:tagId`, `GET /garment-technical/inbound-verification/plans/:id`, `GET .../remnant-recovery/outbound-requests/:id`, `POST .../return-inspection/{submit,inbound-ticket}` | Cấu hình sản phẩm đi qua `configuration/sync` (hàng đợi offline) nên các endpoint import/new trực tiếp có thể đã bị thay thế. |
| Dev/test | `POST /ghn/simulate-flow`, `POST /ghn/dev-switch-status`, `POST /test/flow-simulate`, `POST /ghn/webhook/register`, `GET /ghn/shops`… | Công cụ phát triển. |
| Demo trong UI | `POST /financial/cod-reconciliation/seed-sample`, `.../disputes/:itemId/simulate-feedback`, `GET /owner/operations-report/return-trend-demo` | Có nút/khối hiển thị nhưng là dữ liệu mẫu. |

### Không thể xác định từ source code

- GHN thực tế đang gửi webhook tới endpoint nào (`/api/ghn/webhook` hay `/api/shipping/webhooks/ghn`): phụ thuộc cấu hình trên trang quản trị GHN.
- Facebook Page có đang kết nối webhook hay không (phụ thuộc token trong `system_settings`/`.env`).
- Dữ liệu có thật trong `roles.permissions[]` hay để trống (nếu trống, `roleAllows` cho phép mọi thao tác).
- Người dùng có tạo đơn bằng tay qua công cụ ngoài hay không.

## 12. Phát hiện sơ bộ liên quan tới kiểm toán collection (chỉ là giả thuyết)

1. **`carrier_shipments`, `carrier_handovers`, `carrier_shipment_events`**: không còn màn hình nào tạo bản ghi (xem mục 11). Luồng bàn giao hiện tại chỉ dùng `sales_orders`. `carrier_handovers` chỉ còn được **đọc** trong timeline barcode (`barcodeTracking.service.js:108`). Kết luận cũ "giữ `carrier_shipment_events`" cần xem lại: nên chuyển sang **INVESTIGATE**.
2. **`roles`**: được đọc ở mọi request sơ đồ kho, không chỉ khi tạo nhân viên.
3. **`owner_return_trend_demo`**: endpoint GET chỉ đọc; dữ liệu do script `seedOwnerReturnTrendDemo.mjs` nạp.
4. **`notifications`**: có ghi khi đọc (SYS-08) với ACCOUNTANT/OWNER.
5. Phân tích tĩnh đếm thừa khi 2 service FE có hàm trùng tên (ví dụ `confirmHandover` của `materialOutboundService` và `shippingService`; `createMaterial` của `materialInboundService` và `garmentTechnicalService`). Phân tích tĩnh cũng không thấy được điều kiện hiển thị nút trên giao diện (ví dụ WHM-04 đã loại). Đây là lý do bắt buộc phải có runtime tracking.

## Tổng kết

| Role | Số luồng |
|---|---|
| Chung | 7 |
| OWNER | 13 |
| ACCOUNTANT | 12 |
| WAREHOUSE_MANAGER | 20 (WHM-04 đã loại, giữ nguyên số hiệu các luồng khác) |
| WAREHOUSE_STAFF | 10 |
| GARMENT_TECHNICIAN | 10 |
| SELLER | 13 |
| Đặc biệt | 16 |
| Hệ thống / chạy nền | 12 |
| **Tổng** | **113** |

### Lịch sử chỉnh sửa

- 2026-11-25: Loại **WHM-04** (tạo nhanh NPL/vị trí khi nhập) theo phản hồi của người dùng, đã xác minh lại trên code và DB. Viết lại WHM-01 thành "Nhập NPL theo yêu cầu nhập của KTV/KCS" và thu hẹp WHM-05. `POST /garment-technical/raw-materials` chỉ thuộc GAR-02.
- 2026-11-25: Sửa GAR-03. Bỏ cụm "QR truy vết": mã QR của lô chỉ là chuỗi định danh dạng văn bản, không được in thành tem và không được quét ở đâu (chi tiết ở mục 11).
- 2026-11-25: Sửa WHM-12. `POST /products/:id/stock` trên giao diện chỉ dùng để **xuất** lẻ (`direction: 'OUT'`); BE vẫn nhận `IN` nhưng không màn hình nào gửi. Thành phẩm chỉ nhập theo yêu cầu của KTV (GAR-03/GAR-06/GAR-07 → WHM-09).
