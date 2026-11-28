# ARAWMS – Project Context, Architecture & Business Map

## 1. Mục tiêu và Vai trò (Role & Objective)
Đóng vai trò là **Chuyên viên Phân tích Nghiệp vụ Cấp cao (Lead Business Analyst)** và **Kiến trúc sư Hệ thống (Solution Architect)** cho dự án **ARAWMS (Apparel Retail & Warehouse Management System – Hệ thống Quản lý Bán hàng & Kho Thời trang/May mặc Khép kín)**.

Nhiệm vụ:
- Nắm bắt toàn bộ luồng nghiệp vụ (Business Flow), thực thể (Actors), ca sử dụng (Use Cases), sơ đồ phân luồng (Activity Diagrams) và logic vận hành của dự án.
- Tự động duy trì ngữ cảnh nghiệp vụ và kỹ thuật xuyên suốt toàn bộ phiên làm việc. Mỗi khi nhận yêu cầu, đối chiếu trực tiếp với các quy tắc, bảng biểu, luồng nghiệp vụ và kiến trúc codebase dưới đây.

---

## 2. Tổng quan Hệ thống (System Overview)
ARAWMS là giải pháp ERP thu nhỏ kết hợp WMS chuyên sâu cho ngành thời trang may mặc, kiểm soát chuỗi giá trị từ:
1. Mua sắm nguyên phụ liệu (vải, cúc, chỉ...) và nhập kho theo quy chuẩn FIFO.
2. Kiểm định chất lượng đầu vào (KCS/QC), xuất vải đi sản xuất may gia công và thu hồi vải thừa/vải vụn theo định mức.
3. Tiếp nhận thành phẩm từ xưởng may, kiểm định chất lượng và nhập kho lưu trữ.
4. Bán lẻ đa kênh (Facebook/Messenger, Shopee, TikTok Shop), tra cứu tồn kho khả dụng thời gian thực.
5. Soạn hàng, đóng gói có ghi hình video chống gian lận, bàn giao đơn vị vận chuyển.
6. Xử lý đổi/trả hàng và kiểm soát tài chính (đối soát COD bưu điện/hãng vận chuyển, dòng tiền, báo cáo P&L).
7. Kiểm kê kho định kỳ có cơ chế khóa tự động xuất - nhập kho.

---

## 3. Danh sách Actor & Ma trận Phân quyền (Roles & Responsibilities)

Hệ thống gồm **7 Actor nội bộ** và **2 Thực thể ngoại vi (External Entities)**:

### 3.1. External Entities (Ngoại vi)
1. **Garment Factory (Xưởng may gia công)**: Nhận vải/phụ liệu từ kho, thực hiện cắt may và bàn giao thành phẩm về kho; tiếp nhận thành phẩm lỗi để sửa chữa (rework).
2. **Shipping Carrier (Đơn vị vận chuyển)**: Đối tác giao vận (GHTK, GHN, Viettel Post,...), nhận bưu kiện từ kho, giao cho khách, hoàn hàng nếu thất bại và gửi bảng kê COD.

### 3.2. Internal Actors (Nội bộ hệ thống)

#### A. Common User (Người dùng chung)
- `Login`: Đăng nhập hệ thống bằng tài khoản được cấp.
- `Logout`: Đăng xuất khỏi phiên làm việc.
- `View Account`: Xem thông tin tài khoản cá nhân.
- `Update Account Information`: Cập nhật thông tin hồ sơ người dùng.

#### B. Owner (Chủ sở hữu / Quản trị cấp cao – Role code: `OWNER`)
- `Google Login`: Đăng nhập bằng Google Auth.
- `Account Management`: Quản lý tài khoản toàn hệ thống.
- `<<Extend>> Create Employee Account`: Tạo mới tài khoản nhân viên.
  - `<<Extend>> Unlock Employee Account`: Mở khóa tài khoản nhân viên.
  - `<<Extend>> Lock Employee Account`: Khóa tài khoản nhân viên.
  - `<<Extend>> Assign Employee Role`: Phân quyền vai trò tài khoản.
- `Configure API`: Cấu hình API bên thứ 3 (kết nối Fanpage, Sàn TMĐT, Đối tác vận chuyển, Cổng thanh toán).
- `Configure Default Fabric Leftover Threshold`: Cài đặt ngưỡng vải dư thừa/vải vụn định mức cho phép.
- `Configure Inventory Safety Thresholds`: Cài đặt ngưỡng tồn kho an toàn để cảnh báo chạm đáy tồn.
- `Configure Return/Exchange Policy`: Cấu hình chính sách và thời hạn đổi/trả hàng.
- `Approve Major Inventory Variance`: Phê duyệt kết quả sai lệch kiểm kê kho quy mô lớn.
- `View Dashboard`: Giám sát toàn bộ KPI, doanh thu, dòng tiền, tồn kho theo thời gian thực.

#### C. Warehouse Manager (Quản lý kho – Role code: `WAREHOUSE_MANAGER`)
- `Configure FIFO Warehouse Topology`: Thiết lập sơ đồ kệ/khu vực kho theo nguyên tắc Nhập trước - Xuất trước.
- `Configure Label Printing Template`: Cấu hình biểu mẫu in mã vạch/barcode tem nhãn.
- `Configure Shipping Document Template`: Cấu hình mẫu phiếu gửi/phiếu bàn giao vận chuyển.
- `Manage Shipping Carrier`: Quản lý đối tác vận chuyển (`View`, `Add`, `Update Shipping Carrier`).
- `Manage SKU Product`: Quản lý mã phân loại sản phẩm (`View`, `Add`, `Update SKU Product`).
- `Manage Product`: Quản lý danh mục thành phẩm may mặc (`View`, `Add`, `Update Product`).
- `Manage Material`: Quản lý danh mục nguyên phụ liệu, vải (`View`, `Add`, `Update Material`).
- `Transfer Master Data Via Excel`: Import/Export dữ liệu danh mục hàng loạt qua file Excel.
- `Create Product Stock In/Out Slip`: Lập phiếu nhập/xuất kho sản phẩm thành phẩm.
- `Create Material Stock In/Out Slip`: Lập phiếu nhập/xuất kho nguyên vật liệu.
- `Send and Receive Material Shortage Notifications`: Gửi và nhận thông báo thiếu hụt nguyên vật liệu sản xuất.
- `Receive Stock Threshold Alert`: Nhận cảnh báo tự động khi tồn kho xuống dưới ngưỡng an toàn.
- `Create Defective Product Stock In/Out Slip`: Lập phiếu nhập/xuất kho hàng lỗi, hỏng.
- `Adjust Inventory`: Thực hiện điều chỉnh số liệu tồn kho sau khi kiểm kê.

#### D. Warehouse Staff (Nhân viên kho – Role code: `WAREHOUSE_STAFF`)
- `Print Material Barcode Label`: In nhãn mã vạch định danh cuộn vải/nguyên vật liệu.
- `Scan Material Barcode For Put-Away`: Quét mã barcode nguyên vật liệu để đưa vào đúng vị trí kệ lưu trữ.
- `Scan Material Pick-List For Issuing`: Quét mã phiếu lấy hàng (pick-list) để xuất kho nguyên liệu cho may mặc.
- `Print SKU Label`: In tem mã vạch thành phẩm quần áo theo từng SKU (size, màu).
- `Scan Finished Goods Barcode For Put Away`: Quét mã vạch cất thành phẩm hoàn chỉnh lên kệ.
- `Open Order Product Pick-List`: Mở danh sách nhặt hàng theo đơn bán.
- `Confirm Sales Order Pick-list`: Xác nhận hoàn thành việc nhặt đủ hàng theo đơn.
- `Scan Order Packaging With Video`: Quét mã đóng gói đơn hàng và kích hoạt quay video quá trình đóng gói làm bằng chứng đối soát.
- `Print Waybill Label`: In phiếu giao hàng/vận đơn dán ngoài bưu kiện.
- `Export Parcel Handover Report`: Xuất biên bản bàn giao danh sách bưu kiện cho tài xế/đơn vị vận chuyển.
- `View Inventory Variance Report`: Xem báo cáo chênh lệch tồn kho thực tế so với sổ sách.

#### E. Garment Technician (Kỹ thuật viên may / KCS – Role code: `GARMENT_TECHNICIAN`)
- `Record Return Inspection Process`: Ghi nhận biên bản kiểm tra chi tiết tình trạng hàng khách hoàn trả.
- `Verify Inbound Material Delivery`: Đối soát, xác nhận lô vải/nguyên vật liệu giao tới xưởng.
- `Request Fabric Remnant Return`: Tạo yêu cầu trả lại phần vải thừa/vải vụn sau khi cắt may về lại kho.
- `Inspect Finished Garment Quality`: Kiểm định chất lượng may mặc thành phẩm (đường may, kích thước, lỗi vải) trước khi duyệt nhập kho thành phẩm.

#### F. Seller (Nhân viên bán hàng / CSKH – Role code: `SELLER`)
- `Edit Customer Information`: Chỉnh sửa thông tin khách hàng.
- `Create New Customer Profile`: Tạo mới hồ sơ khách hàng.
- `View Messenger Conversations`: Xem đoạn chat tư vấn trực tiếp từ Facebook Messenger.
- `Tag Customer Chat`: Gắn thẻ phân loại khách hàng tiềm năng/khách quen.
- `Message Customer`: Nhắn tin tư vấn, phản hồi khách hàng.
- `View Customer Interaction History`: Xem toàn bộ lịch sử tư vấn, CSKH.
- `View Customer Purchase History`: Xem lịch sử các đơn hàng khách đã mua.
- `Lookup Real-time Available Stock by SKU`: Tra cứu số lượng tồn kho khả dụng thực tế của từng phân loại SKU.
- `Order Management`: Quản lý đơn hàng.
  - `<<Extend>> Create Order`: Tạo đơn bán hàng đa kênh.
  - `<<Extend>> Update Order Status`: Cập nhật trạng thái đơn (chờ duyệt, đã thanh toán...).
  - `<<Extend>> Cancel Order`: Hủy đơn hàng theo yêu cầu khách.
- `Create Merchandise Return Request`: Tạo yêu cầu trả hàng từ phản hồi khách.
- `Create Customer Exchange Order`: Tạo đơn hàng đổi kích thước/màu sắc/mẫu mã mới cho khách.

#### G. Accountant (Kế toán kho & Tài chính – Role code: `ACCOUNTANT`)
- `Manage Material Suppliers`: Quản lý nhà cung ứng vải/phụ liệu (`Add`, `Update Material Suppliers`).
- `Draft Supplier Contract Framework`: Lập khung hợp đồng mua bán với đối tác cung ứng.
- `Schedule Material Inbound Plan`: Lập kế hoạch lịch trình tiếp nhận nguyên liệu.
- `Execute Contract Deviation Resolution`: Xử lý giải quyết các sai lệch phát sinh so với hợp đồng mua sắm.
- `Manage Material Supplier Debt`: Quản lý công nợ phải trả cho nhà cung cấp.
- `Create Supplier Payment Slip`: Lập phiếu chi trả nợ nhà cung cấp.
- `View Actual Cost of Product Sold`: Tính toán và xem Giá vốn hàng bán thực tế (COGS).
- `View Total Inventory Valuation`: Xem tổng giá trị định giá tài sản tồn kho.
- `View Total Raw Material Inventory Value`: Xem tổng giá trị nguyên vật liệu thô tồn kho.
- `Export Profit Loss Report`: Xuất báo cáo tài chính Kết quả kinh doanh Lãi / Lỗ (P&L).
- `View COD Discrepancy Red Flags`: Nhận cảnh báo cờ đỏ các đơn hàng sai lệch tiền thu hộ COD.
- `View Cash Flow History`: Xem lịch sử biến động dòng tiền thu/chi.
- `Create Cash Flow Voucher`: Lập phiếu thu / phiếu chi tiền mặt và ngân hàng.
- `Execute Automated Carrier COD Reconciliation`: Thực thi đối soát tự động tiền thu hộ COD trực tiếp từ API hãng vận chuyển (GHN), tự động khớp nối dữ liệu đơn giao tiền mặt và tiền thực thu.
- `Approve Return Order Financials`: Phê duyệt hoàn tiền cho đơn hàng khách trả lại.
- `Record Return Surcharge Variance`: Ghi nhận các khoản chênh lệch phụ phí phát sinh từ việc hoàn hàng.
- `File Shipping Carrier Dispute`: Tạo biên bản khiếu nại/tranh chấp cước phí hoặc thất thoát với hãng vận chuyển.
- `Update Shipping Complaint Status`: Cập nhật tiến độ giải quyết tranh chấp với hãng vận chuyển.

---

## 4. Chi tiết 4 Luồng Nghiệp vụ Liên tục (Activity Flows)

### 4.1. Luồng 1: Mua sắm, Kiểm định nhập kho và Cắt may nguyên liệu (Fabric & Material Inbound/Outbound)
1. Kế toán (`Accountant`) tạo khung hợp đồng (`Draft Contract Template`) và lập kế hoạch mua nguyên liệu (`Record Material Procurement Plan`).
2. Chủ cửa hàng (`Owner`) phối hợp, thương thảo và chốt đơn đặt hàng với Nhà cung cấp (`Coordinate with Suppliers`).
3. Khi hàng về xưởng, Kỹ thuật may (`Garment Technician`) đối chiếu thông tin giao nhận so với kế hoạch (`check plan`):
   - Nếu sai kế hoạch: Chuyển lại cho `Owner` làm việc lại với NCC.
   - Nếu đúng kế hoạch: Quản lý kho duyệt tiến trình nhập kho vải (`Proceed with Fabric Stock-In`).
4. `Garment Technician` tiến hành kiểm tra chất lượng vải vật lý (`Perform Quality Inspection`):
- Không đạt chuẩn: Trả về cho `Owner` giải quyết sai lệch/khiếu nại nhà cung cấp.
   - Đạt chuẩn: Nhân viên kho (`Warehouse Staff`) quét mã vạch và cất nguyên liệu vào đúng vị trí kệ theo nguyên tắc FIFO (`Store Materials in Assigned Locations`).
5. Khi xưởng cần may, `Garment Technician` tạo yêu cầu xuất vải (`Fabric Issue Request`).
6. Quản lý kho duyệt xuất kho (`Proceed with Fabric Stock-Out`).
7. `Warehouse Staff` quét mã vạch xuất kho (`Scan Barcode for Stock-Out`).
8. `Garment Technician` nhận vải và thực hiện cắt vải (`Cut Fabric`).
9. Lượng vải vụn, vải thừa sau khi cắt được lập yêu cầu trả lại kho (`Return Excess Materials to Warehouse`) và `Warehouse Staff` quét mã đưa vào vị trí lưu kho nguyên liệu dư (`Store Excess Materials in Assigned Locations`).

### 4.2. Luồng 2: Nhập thành phẩm may, Bán hàng & Đóng gói xuất kho (Fulfillment & Sales)
1. Xưởng gia công (`Garment Factory`) may xong và gửi thành phẩm đến kho (`Send Product`).
2. `Garment Technician` kiểm định KCS ngoại quan và thông số sản phẩm (`Perform quality inspection`):
   - Không đạt chuẩn: Chuyển lại xưởng may để sửa chữa (`Rework Product`).
   - Đạt chuẩn: Quản lý kho duyệt phiếu nhập kho (`Proceed with Stock-In`), `Warehouse Staff` quét mã cất thành phẩm vào đúng vị trí ô kệ (`Store Products in Assigned Locations`).
3. `Seller` tiếp nhận đơn đặt hàng từ Facebook Messenger hoặc Sàn TMĐT (TikTok Shop, Shopee) -> tra cứu tồn kho SKU real-time -> tạo đơn hàng.
4. Quản lý kho duyệt phiếu xuất kho bán lẻ (`Proceed with Stock-Out`).
5. `Warehouse Staff` lấy hàng từ kệ và kiểm tra lại sản phẩm (`Perform quality inspection`):
   - Đạt chuẩn: Tiến hành **quét mã đóng gói kèm quay video (`Record the Packing Process / Scan Order Packaging With Video`)** để lưu trữ chứng cứ đối soát.
   - In vận đơn, xuất biên bản bàn giao kiện hàng cho đối tác vận chuyển (`Shipping Carrier`).
6. `Shipping Carrier` giao hàng (`Deliver Order`):
   - Giao thành công và khách ưng ý: Hoàn tất đơn hàng.

### 4.3. Luồng 3: Xử lý Đổi / Trả hàng & Hoàn tiền (Return / Exchange & Refunds)
1. **Trường hợp Giao thất bại (Boom hàng)**: `Shipping Carrier` cập nhật trạng thái giao không thành công và hoàn trả bưu kiện về kho (`Return the Order`).
2. **Trường hợp Khách yêu cầu Đổi/Trả**: `Seller` tiếp nhận liên hệ và tạo đơn đổi/trả (`Process Customer Returns and Exchanges`).
3. `Warehouse Staff` tiếp nhận kiện hàng hoàn vào kho (`Receive Returned Orders into Warehouse`).
4. `Garment Technician` kiểm định tình trạng sản phẩm trả về:
   - Sản phẩm rách/lỗi: Chuyển xưởng may để xử lý/khắc phục (`Rework Product`).
- Sản phẩm đạt chuẩn: Quản lý kho duyệt nhập kho lại (`Proceed with Stock-In`), nhân viên kho cất lại vào kệ (`Store Products in Assigned Locations`).
5. Kế toán (`Accountant`) lập chứng từ chi tiền hoàn lại cho khách hàng nếu có quyết toán trả hàng (`Create Payment Voucher for Customer Refunds`).

### 4.4. Luồng 4: Quy trình Kiểm kê Kho & Khóa giao dịch (Inventory Count & System Lock)
1. Quản lý kho (`Warehouse Manager`) phát lệnh yêu cầu kiểm kê tồn kho (`Request Inventory Count`).
2. Hệ thống ARAWMS kích hoạt cơ chế an toàn: **Lập tức KHÓA toàn bộ giao dịch xuất và nhập kho (`Lock Stock-In and Stock-Out Operations`)** để bảo toàn tính nguyên vẹn dữ liệu trong thời gian đếm kho.
3. Kỹ thuật viên/Thủ kho tiến hành đếm thực tế và lập báo cáo kiểm kê (`Inventory Count Report`).
4. `Warehouse Manager` cập nhật số liệu chênh lệch thực tế (`Adjust Inventory`) và xét duyệt theo loại hình kiểm kê:
   - **Kiểm kê tuần (`weekly inventory count`)**: Hệ thống ngay lập tức mở khóa xuất nhập kho (`Unlock Stock-In and Stock-Out Operations`) để tiếp tục hoạt động bán hàng thường nhật.
   - **Kiểm kê định kỳ/mùa (`seasonal inventory count`)**: Quản lý kho chốt số lượng chốt cuối (`Finalize Quantity`), gửi báo cáo định kỳ cho `Owner` (`Receive Periodic Inventory Count Report`) và mở khóa giao dịch xuất nhập kho. Nếu sai lệch vượt ngưỡng, `Owner` trực tiếp phê duyệt xử lý (`Approve Major Inventory Variance`).

---

## 5. Các Quy tắc Ràng buộc Kỹ thuật & Dữ liệu Cần Tuân thủ (Core System Rules)
1. **Bảo toàn dữ liệu kiểm kê**: Tuyệt đối không được phát sinh bất kỳ phiếu xuất kho (`Stock-Out`) hay nhập kho (`Stock-In`) nào khi cờ trạng thái kiểm kê đang ở chế độ `is_locked = TRUE` (hoặc kho đang trong phiên `StocktakeSession` active/locked).
2. **Chứng cứ đóng gói**: Mọi đơn hàng xuất kho đóng gói đều phải gắn với một mã URL/ID video ghi hình (`Scan Order Packaging With Video`) để giải quyết khiếu nại tráo hàng/thiếu hàng.
3. **Quản lý hạn mức vải vụn**: Khi kỹ thuật may tạo `Request Fabric Remnant Return`, hệ thống phải tự động so sánh tỷ lệ tiêu hao thực tế với `Default Fabric Leftover Threshold`. Nếu vượt ngưỡng quy định, phải gửi thông báo cảnh báo đến `Owner`.
4. **Đối soát COD tự động qua API**: Kế toán bấm thực thi đối soát tự động, hệ thống kết nối trực tiếp đến API của đơn vị vận chuyển (GHN), tự động lọc các đơn hàng thanh toán tiền mặt (COD) đã hoàn tất chu trình giao vận (Giao thành công `DELIVERED` hoặc Chuyển hoàn `RETURNED`/`CANCELLED`), đồng thời tự động loại trừ các đơn thanh toán trước (chuyển khoản) và các đơn đang trên đường giao (`HANDED_OVER_CARRIER` - chờ giao xong mới tới kỳ đối soát). Hệ thống khớp từng `waybillCode` với số tiền thực thu: nếu có sai lệch tiền thu hộ (COD Discrepancy) hoặc đơn hoàn thu 0 ₫, tự động gắn cờ đỏ `Red Flag` (`RED_FLAG_DISCREPANCY`) để hỗ trợ kế toán đối chiếu hàng hoàn kho hoặc lập tranh chấp (`Dispute`).
5. **QUY CHUẨN VALIDATION BẮT BUỘC 2 LỚP (MANDATORY DUAL-LAYER VALIDATION – ZERO TOLERANCE)**:
   - **Bất cứ khi làm gì** (tạo mới, sửa đổi, refactor bất kỳ module, API, biểu mẫu, modal, bảng dữ liệu hay quy trình nghiệp vụ nào), **BẮT BUỘC phải viết và gắn Validation toàn diện cả ở Backend (Data Integrity & Security) và Frontend (UX & Error Visualizing)**. Tuyệt đối không được bỏ qua validation hoặc làm đối phó/sơ sài.
6. **Bất biến và Cơ chế Quản lý Phiên bản Hợp đồng (Immutable Active Contracts & Versioning)**:
   - Tuyệt đối **KHÔNG** được ghi đè hay chỉnh sửa trực tiếp bất kỳ Hợp đồng cung ứng (`SupplierContract`) nào khi đã ở trạng thái `ACTIVE` (đã kích hoạt hiệu lực pháp lý và phát sinh nghĩa vụ công nợ/tiếp nhận hàng).
   - Mọi nhu cầu sửa đổi đều phải lưu thành **Phiên bản tiếp theo (`versionNumber = maxVersion + 1`)**, tự động gắn hậu tố mã hợp đồng (ví dụ: `HD-2026-003-V2`), liên kết `rootContractId` và `parentSupersededContractId`, đồng thời ghi nhận bắt buộc `amendmentReason` (Lý do điều chỉnh/Nội dung phụ lục).
   - Toàn bộ các phiên bản cũ được bảo lưu 100% trong lịch sử để kiểm toán (Audit Trail). Khi phiên bản mới được Owner phê duyệt và chuyển sang `ACTIVE`, phiên bản cũ trong cùng chuỗi sẽ tự động chuyển sang trạng thái `SUPERSEDED` (Đã được thay thế).

---

## 6. Kiến trúc Codebase: Modular Monolith

Dự án được thiết kế và triển khai theo kiến trúc **Modular Monolith** (Monolith phân tách theo từng miền nghiệp vụ độc lập - Domain Modules):

- **Workspace Root**: `d:\Code\Semester_9\ARAWMS`
- **Từ điển dữ liệu**: `DATA_DICTIONARY.md` ở thư mục gốc.
- **Database dùng chung**: MongoDB Atlas (`DB name: ARAWMS`), cấu hình qua biến `MONGODB_URI` trong `ARAWMS_BE/.env`.

### 6.1. Nguyên tắc Kiến trúc Modular Monolith (Bắt buộc tuân thủ khi code)
1. **Phân tách theo Bounded Context / Feature Module (`src/modules/<domain>/<feature>/`)**:
- Mọi tính năng mới phải đặt đúng vào phân hệ nghiệp vụ (`domain`) và sub-module (`feature`) tương ứng trong `ARAWMS_BE/src/modules/`. Không nhồi nhét logic nghiệp vụ vào `src/controllers/` hay `src/services/` ở cấp root (ngoài các adapter tích hợp bên thứ 3 dùng chung như `ghn.service.js`).
2. **Cấu trúc 4 thành phần chuẩn trong mỗi Feature Sub-module**:
   - `<feature>.routes.js`: Định nghĩa các endpoint Express Router, gắn middleware xác thực (`authenticate`), phân quyền (`authorizeRole`) và middleware kiểm tra dữ liệu đầu vào (`<feature>.validation.js`).
   - `<feature>.validation.js`: Kiểm tra và chuẩn hóa payload/params/query đầu vào trước khi vào Controller.
   - `<feature>.controller.js`: Chỉ làm nhiệm vụ HTTP layer (nhận `req`, trích xuất tham số, gọi `<feature>.service.js`, trả về JSON response chuẩn hoặc `next(error)`). Tuyệt đối không viết query DB hay logic nghiệp vụ trong Controller.
   - `<feature>.service.js`: Chứa toàn bộ Domain & Business Logic, giao dịch Database (`mongoose.startSession()` khi cần transaction), kiểm tra 4 Core System Rules (như kiểm tra khóa kho `StocktakeSession` trước khi nhập/xuất), và xuất các hàm service rõ ràng.
3. **Giao tiếp liên Module (Inter-Module Communication)**:
   - Một module **không** gọi trực tiếp vào `.controller.js` hay `.routes.js` của module khác.
   - Khi một module cần dùng nghiệp vụ của module khác (ví dụ: `order-management` cần kiểm tra tồn kho khả dụng hoặc `inbound-execution` cần kiểm tra khóa kiểm kê từ `stocktake-session`), hãy giao tiếp thông qua **Service Layer** (`*.service.js`) của module đích hoặc các helper chung trong `src/common/`.
4. **Shared Kernel (`src/common/`, `src/models/`, `src/config/`)**:
   - `src/common/`: Chỉ chứa thành phần hạ tầng dùng chung toàn hệ thống (`constants/enums.js`, `middlewares/authenticate.js`, `middlewares/authorizeRole.js`, `middlewares/errorHandler.js`, utils dùng chung).
   - `src/models/`: Chứa 32 Mongoose Models xuất tập trung qua `src/models/index.js`.
   - `src/routes/api.js`: Đóng vai trò API Gateway nội bộ, gom và mount routes của tất cả các feature modules dưới prefix `/api/...`.

### 6.2. Cấu trúc Chi tiết Backend (`ARAWMS_BE/`)
- **Tech Stack**: Node.js (ES Modules `"type": "module"`), Express.js (`^4.19.2`), Mongoose (`^8.5.1`), JWT (`jsonwebtoken`), `bcryptjs`, `axios`, `dotenv`, `morgan`, `cors`.
- **Entry Point**: `server.js` -> `src/app.js` -> `src/routes/api.js` (prefix `/api`).
- **Common (`src/common/`)**:
- `constants/enums.js`: Định nghĩa tập trung các enum: `ROLES`, `WAREHOUSE_TYPES`, `FABRIC_ROLL_STATUS`, `CONTRACT_STATUS`, `PLAN_STATUS`, `TICKET_STATUS`, `ORDER_STATUS`, `RECONCILIATION_STATUS`, `ALERT_TYPES`.
  - `middlewares/`: `authenticate.js`, `authorizeRole.js`, `errorHandler.js` (`notFoundHandler`, `globalErrorHandler`).
- **Models (`src/models/`)**:
  - Xuất tập trung 32 Mongoose Models tại `src/models/index.js` (dùng `src/models/plugins/baseSchema.plugin.js`):
    1. `CounterSequence`, `InventoryAlert`, `Role`, `User`, `SystemSetting`, `SystemLog`
    2. `WarehouseLocation`, `DocumentTemplate`, `ShippingCarrier`, `RawMaterial`, `FabricRoll`, `Product`, `Sku`, `Supplier`
    3. `SupplierContract`, `MaterialInboundPlan`, `MaterialTicket`, `RemnantRecoveryRequest`
    4. `FinishedGoodsBatch`, `FinishedGoodsTicket`, `InventoryTransaction`, `StocktakeSession`, `StocktakeRecord`
    5. `Customer`, `ChatConversation`, `ChatMessage`, `SalesOrder`, `ReturnRequest`
    6. `CashFlowVoucher`, `CodReconciliationBatch`, `CodReconciliationItem`, `CarrierDispute`
- **11 Domain Modules (`src/modules/`)**:
  1. `system-administration`: `authentication`, `account-governance`, `system-settings`
  2. `master-data`: `material-catalog`, `product-catalog`, `warehouse-topology`
  3. `supplier-contracts`: `contract-workspace`, `inbound-planning`, `deviation-resolution`
  4. `garment-technical`: `inbound-verification`, `finished-inspection`, `remnant-recovery`
  5. `raw-material-warehousing`: `inbound-execution`, `outbound-execution`, `stock-lookup`
  6. `finished-goods-warehousing`: `goods-putaway`, `defect-quarantine`
  7. `inventory-auditing`: `stocktake-session`, `variance-analysis`
  8. `conversational-commerce`: `chat-messenger`, `chat-routing`
  9. `order-fulfillment`: `order-management`, `picking-operations`, `packing-verification`
  10. `reverse-logistics`: `return-rma`, `unboxing-inspection`
  11. `financial-intelligence`: `cod-reconciliation`, `carrier-dispute`, `accounts-payable`
- **Tích hợp GHN**: `src/services/ghn.service.js`, `src/controllers/ghn.controller.js`, `src/routes/ghn.routes.js` (mount tại `/api/carriers/ghn`).

### 6.3. Frontend (`ARAWMS_FE/`)
- **Tech Stack**: React 18, Vite 5, `react-router-dom` v6, `axios`, `lucide-react`.
- Tổ chức code theo hướng modular / feature-based tương ứng với các phân hệ nghiệp vụ, tuân thủ nghiêm ngặt **AraStore UI/UX Design System** ở Mục 8 bên dưới.

---

## 7. Hướng dẫn Tương tác & Quy tắc Code (Directives & Conventions)
- **Chuẩn kiến trúc Modular Monolith**: Mọi đoạn code Backend đều phải tuân thủ phân lớp `routes -> validation -> controller -> service` nằm gọn trong đúng sub-module của `src/modules/<domain>/<feature>/`, và mount tập trung vào `src/routes/api.js`.
- **QUY CHUẨN VALIDATION BẮT BUỘC KHI LÀM BẤT KỲ TÁC VỤ NÀO (MANDATORY VALIDATION DIRECTIVE – LUÔN ÁP DỤNG)**:
  1. **Backend Validation Layer (Bảo đảm tính toàn vẹn dữ liệu & bảo mật API)**:
     - Mọi endpoint Express Router nhận payload (`req.body`), tham số URL (`req.params`), hoặc query filter (`req.query`) đều **BẮT BUỘC** phải có middleware validation trong file `<feature>.validation.js` tương ứng gắn trước controller.
     - Phải kiểm tra định dạng dữ liệu bằng Regular Expression chuẩn:
       - SĐT di động Việt Nam: `/^(0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/`
       - Mã số thuế doanh nghiệp (10 số hoặc 13 số): `/^[0-9]{10}(-[0-9]{3})?$/`
       - Email chuẩn RFC: `/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/`
       - Mã hệ thống / Code (Chữ in hoa, số, gạch nối): `/^[A-Z0-9_-]{2,50}$/`
       - MongoDB ObjectId hợp lệ: `/^[0-9a-fA-F]{24}$/`
     - Phải kiểm tra các ràng buộc logic nghiệp vụ (ví dụ: ngày hiệu lực `effectiveTo >= effectiveFrom`, số lượng `plannedQty > 0`, đơn giá `>= 0`, tỷ lệ cọc/phạt trong khoảng cho phép, đúng sai dệt may `0 - 25%`).
     - Trả về mã lỗi HTTP `400 Bad Request` kèm object `errors` chi tiết từng trường và `message` tiếng Việt rõ ràng, dễ hiểu.
  2. **Frontend Validation Layer & Error Feedback (Trải nghiệm người dùng chuẩn WMS)**:
     - Mọi biểu mẫu (Forms, Modals, Dynamic Input Tables, Datepickers): Phải có hàm validate chuyên biệt (`src/utils/*Validation.js` hoặc trực tiếp trong component) kiểm tra toàn bộ dữ liệu trước khi gửi request (`handleSubmit`).
     - **Trực quan hóa lỗi (Visual Feedback - WCAG 2.2 AA)**:
       - Trường nhập sai hoặc thiếu bắt buộc phải được kích hoạt class lỗi `.has-error` (viền đỏ nổi bật `#A62626`, background cảnh báo).
       - Ngay bên dưới input bị lỗi **PHẢI hiển thị dòng text tiếng Việt kèm icon cảnh báo đỏ**: `<span className="wms-field-error-text"><AlertCircle size={12} /> {errorText}</span>`.
       - **Real-time Error Clearing**: Lập tức xóa thông báo lỗi của trường đó ngay khi người dùng bắt đầu nhập hoặc thay đổi giá trị (`onChange`), không để thông báo lỗi cũ làm phiền người dùng.
       - Chặn hoàn toàn việc submit form nếu còn lỗi (`e.preventDefault()`), hiển thị banner thông báo lỗi tổng thể (`.wms-feedback-banner.error`) ở đầu trang/đầu modal.
3. **Quy chuẩn Xác minh Bắt buộc Sau Khi Sửa Đổi (Mandatory Verification / Smoke Check)**:
     - Sau khi chỉnh sửa Frontend: **Bắt buộc** chạy `npm --prefix ARAWMS_FE run build` để xác nhận bundle thành công 100%, không phát sinh lỗi biên dịch, JSX hay import.
     - Sau khi chỉnh sửa Backend: **Bắt buộc** chạy `node --check <file>` trên các file route/service/validation/model mới để đảm bảo không lỗi cú pháp runtime.
     - **Kiểm tra Responsive & Triệt tiêu Scroll Ngang**: Khi tạo mới hoặc sửa đổi bất kỳ màn hình nào (Bảng danh sách, Biểu mẫu, Modal, Dashboard), bắt buộc đảm bảo nội dung hiển thị vừa vặn 100% không gian hiển thị trên màn hình Laptop chuẩn (`1366x768` và `1280px`). Tuyệt đối không để phát sinh thanh cuộn ngang (horizontal scrollbar) gây cản trở thao tác của người dùng.
- **Khi viết code / thiết kế Database**: Bám sát cấu trúc các thực thể, 32 Mongoose Models trong `src/models/index.js`, Enums trong `src/common/constants/enums.js` và 5 Core System Rules. Luôn dùng đuôi `.js` khi import file nội bộ trong ES Modules.
- **Khi viết Test Cases / UAT / SRS / User Stories**: Trích xuất đúng tên Actor và tên Use Case chuẩn trong Mục 3 & Mục 4.
- **Khi phân tích lỗi hoặc đề xuất tối ưu**: Luôn xem xét tác động liên đới qua lại giữa các phòng ban (`Owner`, `Warehouse Manager`, `Warehouse Staff`, `Garment Technician`, `Seller`, `Accountant`, `Garment Factory`, `Shipping Carrier`).
- **Bảo mật**: Không bao giờ ghi đè hay commit nội dung nhạy cảm trong `ARAWMS_BE/.env`.

---

## 8. ARASTORE – UI/UX DESIGN SYSTEM & DEVELOPMENT RULES (Bắt buộc cho toàn bộ Frontend)

### 8.1. Vai trò & Triết lý Thiết kế (Design Philosophy)
- **Hệ thống nội bộ (Enterprise WMS)**: Thiết kế chuyên nghiệp, tối giản (Professional & Minimalist), ưu tiên hiệu suất vận hành, độ rõ ràng của dữ liệu, bảng biểu, số lượng tồn kho, mã SKU/Barcode và trạng thái nghiệp vụ. Không phải website thương mại điện tử B2C, tuyệt đối tránh trang trí rườm rà, hiệu ứng màu mè hay gradient không cần thiết.
- **Nhất quán & Tái sử dụng**: Tái sử dụng design tokens và components dùng chung; không viết inline styles rải rác hoặc hardcode các giá trị màu sắc/spacing tùy tiện.
- **Tiêu chuẩn**: Ant Design conventions, Nielsen's 10 Usability Heuristics, WCAG 2.2 Level AA, Responsive Web Design (Desktop, Laptop, Tablet).

### 8.2. Bảng màu Chuẩn của Dự án (High-Contrast Projector-Ready ARAWMS Brand Color Palette)
*(Đã tăng độ đậm và tương phản để hiển thị sắc nét khi trình chiếu trên máy chiếu / slide thuyết trình)*
- **Primary & Brand Accents (Deep Noir & Rich Bronze Gold)**:
- Primary / Deep Noir (`--wms-primary`): `#141210` (Nền Sidebar, nút hành động chính, tiêu đề chính)
  - Noir Hover (`--wms-primary-hover`): `#24201C`
  - Brand Accent / Rich Bronze Gold (`--wms-accent`): `#8A6A46` (Điểm nhấn điều hướng active, icon, focus border)
  - Accent Light (`--wms-accent-light`): `#D4B48C` (Chữ/nhãn nổi bật trên nền tối Sidebar)
  - Accent Hover / Deep Bronze (`--wms-accent-hover`): `#6E5233`
  - Primary Subtle Fill (`--wms-primary-subtle`): `#EFE6DA`
- **Background & Borders (Đậm nét, tách bạch rõ với Card trắng)**:
  - Application Background (`--wms-bg-app`): `#E8DFD3`
  - Subtle Surface / Header (`--wms-bg-subtle`): `#F3EDE4`
  - Card Surface (`--wms-bg-surface`): `#FFFFFF`
  - Muted Surface (`--wms-bg-muted`): `#DDD2C4`
  - Border (`--wms-border`): `#C8B9A6`
  - Strong Border (`--wms-border-strong`): `#AE9C86`
- **Typography Colors (Độ tương phản cao)**:
  - Heading / Primary Text (`--wms-text-primary`): `#141210`
  - Body Text (`--wms-text-body`): `#26221E`
  - Secondary / Muted Text (`--wms-secondary`): `#574F46`
  - Light / Placeholder Text (`--wms-text-light`): `#786E63`
- **Semantic Colors (Đậm nét để chiếu slide, luôn kèm nhãn chữ)**:
  - Success: `#1E6B47` (Nền: `#E3F5EC`, Viền: `#86CFA8`)
  - Warning: `#9A5B06` / `#B45309` (Nền: `#FEF0C7`, Viền: `#F5B95F`)
  - Error / Danger: `#A62626` (Nền: `#FCE4E4`, Viền: `#EDA1A1`)
  - Information / Accent: `#6E5233` (Nền: `#EFE6DA`, Viền: `#C8B9A6`)

### 8.3. Typography (`Inter` & Font Fallback Rules – Quy chuẩn Phông chữ Chống Lỗi)
- **Font Family Bắt buộc**: Toàn bộ giao diện hệ thống quản trị Enterprise WMS / Accountant / ERP bắt buộc sử dụng font `Inter` kết hợp hệ thống sans-serif tiêu chuẩn:
  ```css
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
  ```
- **Tuyệt đối KHÔNG áp dụng font serif (như `Cormorant Garamond`)**:
  - Không được để font serif tác động lên các thẻ tiêu đề (`h1-h6`), titles, inputs, buttons, hay table cells trong các phân hệ nghiệp vụ ERP vì gây lỗi hiển thị ký tự tiếng Việt có dấu (`ư, ơ, ê, ô, ấ, ế, ệ, ủ, ỹ`) và làm lệch bố cục hiển thị số liệu.
  - Ngôn ngữ giao diện phải sử dụng tiếng Việt chuyên ngành tài chính/kho vận chuẩn xác, loại bỏ các cụm tiếng Anh trong ngoặc đơn rườm rà (ví dụ: dùng `Quản lý Nhà cung ứng Nguyên phụ liệu`, `Thêm Nhà cung ứng`, `Lập HĐ` thay vì chêm tiếng Anh xen kẽ).
- **Kích thước chuẩn**:
  - Page Title: `24–28px` (Font weight 700)
  - Section Title: `18–20px` (Font weight 600)
  - Body Text: `14–16px` (Font weight 400)
  - Table Text: `13–14px`
- Caption / Helper Text: `12px` (Font weight 400)

### 8.4. Layout & Spacing Standards (Quy chuẩn Chống Tràn Layout & Triệt tiêu Scroll Ngang Toàn diện)
- **QUY TẮC BẮT BUỘC: HẠN CHẾ VÀ TRIỆT TIÊU SCROLL NGANG Ở CẤP TRANG (ZERO PAGE-LEVEL OVERFLOW POLICY)**:
  - Bảng biểu (Tables), biểu mẫu (Forms), thẻ (Cards), bộ lọc (Filter bars) phải vừa vặn 100% không gian hiển thị trên các màn hình làm việc phổ thông (đặc biệt là màn hình Laptop chuẩn `1366x768` và `1280px`).
  - Tuyệt đối không để phát sinh thanh cuộn ngang (horizontal scrollbar) ở cấp trình duyệt/cấp cửa sổ (window-level horizontal scroll).
- **Cấu trúc Shell & Bảo toàn Cơ chế Cố định Sidebar / Header (Preserve Sticky Navigation)**:
  - **Bảo toàn `position: sticky` cho Sidebar & Header**: Tuyệt đối **KHÔNG** đặt `overflow: hidden` hay `overflow-x: hidden` lên khung bao `.ara-accountant-shell` hoặc `.ara-acc-main-wrapper`, vì trong CSS thuộc tính overflow trên phần tử cha sẽ phá vỡ tính năng `position: sticky; top: 0` của thanh Sidebar (`.ara-acc-sidebar`) và Header, làm thanh điều hướng bị trôi/di chuyển theo khi cuộn trang.
  - **Kiểm soát chống tràn ở cấp độ thành phần con**: Vùng nội dung (`.ara-acc-content`) sử dụng `box-sizing: border-box; min-width: 0; max-width: 1440px; margin: 0 auto;`, các bảng dữ liệu rộng được bao bọc an toàn trong `.wms-table-scroll` (`overflow-x: auto; max-width: 100%;`) để triệt tiêu hoàn toàn nguy cơ tràn layout mà vẫn giữ thanh Sidebar đứng yên cố định 100vh.
- **Cấu trúc Enterprise Dashboard**:
  - `Sidebar`: Điều hướng chính (nền `#141210`, mục active `#8A6A46`, viền `#D4B48C`).
  - `Header`: Ngữ cảnh trang hiện tại (Breadcrumb/Title), thông báo, hồ sơ người dùng (nền `#F3EDE4`, viền `#C8B9A6`).
  - `Main Content`: Nội dung nghiệp vụ, bộ lọc, bảng dữ liệu, biểu mẫu (nền `#E8DFD3`, card `#FFFFFF`).
- **Thang khoảng cách (4px increments)**:
  - `4px` (rất nhỏ), `8px` (nhỏ), `12px` (gọn), `16px` (tiêu chuẩn), `24px` (giữa các khu vực), `32px` (khoảng cách lớn).

### 8.5. Tiêu chuẩn Component & Trạng thái Tồn kho (Component & Status Standards)
- **Buttons**: `Primary` (`#141210`), `Default` (viền `#AE9C86`), `Dashed`, `Danger` (`#A62626`), `Disabled`. Nhãn nút phải mô tả rõ hành động.
- **Forms & Modals (Quy chuẩn Form & Modal Chống Tràn Màn Hình)**:
  - Nhãn rõ ràng, đánh dấu trường bắt buộc (`*`), validate đầu vào đầy đủ ở cả Frontend và Backend, hiển thị thông báo lỗi trực quan (`.has-error` viền đỏ `#A62626` + `.wms-field-error-text` với icon `AlertCircle`), tự động xóa lỗi khi người dùng gõ lại, chống bấm gửi trùng lặp (`disabled={submitting}`).
- **Quy chuẩn Modal Flexbox chống tràn màn hình (Anti-Overflow Modal Standard)**: Modal chứa form bắt buộc dùng `<form className="wms-modal-dialog wide" onSubmit={...}>` trực tiếp. Header (`.wms-modal-header`) và Footer (`.wms-modal-footer`) cố định (`flex-shrink: 0`), phần thân (`.wms-modal-body`) tự động co giãn và cuộn nội dung mượt mà (`flex: 1 1 auto; overflow-y: auto; min-height: 0;`), đảm bảo các nút *Hủy bỏ* và *Lưu* luôn hiển thị rõ ràng trên mọi độ phân giải màn hình. Lưới form ưu tiên 3 cột (`.wms-form-grid-3`), các trường tên dài mở rộng 2 cột (`.wms-field-span-2`) hoặc full cột (`.wms-field-span-full`).
- **Tables (Quy chuẩn Bảng Dữ liệu Tối ưu Chống Scroll Ngang - Anti-Scroll & Contained Scroll Table Standard)**:
  - **Cuộn ngang cục bộ (Contained Scroll)**: Khi bảng có nhiều dữ liệu hoặc mở rộng, thanh cuộn ngang **CHỈ ĐƯỢC PHÉP** xuất hiện cục bộ bên trong thẻ `.wms-table-scroll` (`overflow-x: auto; width: 100%; max-width: 100%;`), đi kèm thanh cuộn mảnh thanh lịch (slim 6px scrollbar). Tuyệt đối không để vỡ tràn ra body trình duyệt.
  - **Định dạng độ rộng cột (Column Width Policy)**: Không lạm dụng `<colgroup>` phần trăm cứng nhắc (như `8%, 20%, 15%...`) vì dễ bóp méo các cột nút bấm trên màn hình nhỏ. Khuyến nghị thiết lập trực tiếp `style={{ width, minWidth }}` trên từng thẻ `<th>`.
  - **Xử lý chuỗi dài không dấu cách (Long Strings & Overflow Prevention)**: Các trường như Email, URL, mã dài bắt buộc có style `wordBreak: 'break-all'` hoặc `overflowWrap: 'anywhere'`. Địa chỉ dài gán `wordBreak: 'break-word'`.
  - **Cột Thao tác Nghiệp vụ (Action Cell Standard)**:
    - Bắt buộc thiết lập độ rộng cố định an toàn (`width: '140px', minWidth: '140px'`).
    - Bên trong thẻ bọc: `display: flex; justify-content: center; gap: 6px; flex-wrap: nowrap;` để các nút thao tác (như *Sửa*, *Lập HĐ*) không bao giờ bị rớt dòng.
    - Không đặt quá 2–3 nút bấm trải ngang; nếu có nhiều thao tác phụ, gom nhóm vào dropdown menu `•••` (`wms-action-dropdown`).
  - **Chống vỡ dòng trên mã và nhãn**: Mã đối tượng (`.wms-code-pill`), nhãn trạng thái (`.wms-status-badge`), ngày tháng và số tiền phải có `white-space: nowrap` để không bị ngắt dòng phản cảm (như `HD-` và `2026-003`).
  - **Padding bảng**: Sử dụng padding cô đọng `10px 12px`, `table-layout: auto`, tổng độ rộng bảng duy trì vừa vặn để hiển thị sắc nét trên cả laptop 1280px–1366px và màn hình lớn.
- **Inventory & Operational Status Badges (Luôn hiển thị nhãn chữ + màu chuẩn, white-space: nowrap)**:
  - `Available` / `Completed`: `#1E6B47` (nền `#E3F5EC`, viền `#86CFA8`)
- `Reserved` / `Processing`: `#6E5233` (nền `#EFE6DA`, viền `#C8B9A6`)
  - `Pending`: `#9A5B06` (nền `#FEF0C7`, viền `#F5B95F`)
  - `Rejected` / `Damaged`: `#A62626` (nền `#FCE4E4`, viền `#EDA1A1`)
  - `Out of Stock`: `#574F46` (nền `#DDD2C4`, viền `#AE9C86`)