# Chức năng Owner sau khi hợp nhất hai danh sách

Người thực hiện: Nguyễn Ngọc Huy-HE171157

Ngày thực hiện: 30-10-2026

Phạm vi đã được người dùng xác nhận là **hợp nhất bảng ảnh UC-05 đến UC-20 và mục Owner trong `D:\List UC.docx`**. Có **22 chức năng cụ thể**, gồm 16 chức năng trong ảnh và 6 chức năng bổ sung từ Word. `Account Management` là nhóm cha của quản lý nhân viên, không tính thành chức năng trùng thứ 23.

Giữ mã UC-05..UC-20 cho bảng ảnh. Sáu chức năng thêm dùng mã `OWNER-EXT-01..06` để không nhầm số giữa hai tài liệu; đây là mã đối chiếu nội bộ, không phải mã tự nhận là có trong Word. Ví dụ UC-18 trong bảng mới là nhận báo cáo Manager, còn cấu hình API trong bảng cũ được đối chiếu là OWNER-EXT-02.

## Đối chiếu chức năng và source code

Ảnh mới cung cấp **Feature (level1)**. Các tên Sub Feature dưới đây dùng để tổ chức source theo nghiệp vụ của từng UC; không coi đó là tên được trích nguyên văn từ ảnh.

| UC | Chức năng | Major Feature theo bảng mới | Sub Feature trong BE | FE |
| --- | --- | --- | --- | --- |
| UC-05 | Google Login | User Management | `user-management/authentication` | Tái sử dụng `LoginPage.jsx`, `GoogleIdentityButton.jsx`, dịch vụ Google hiện có |
| UC-06 | Create Employee Account | User Management | `user-management/employee-management` | `Owner/EmployeeCreatePage.jsx`, tái sử dụng form tạo trong `EmployeesPage.jsx` |
| UC-07 | Lock Employee Account | User Management | `user-management/employee-management` | `Owner/EmployeesPage.jsx` |
| UC-08 | Unlock Employee Account | User Management | `user-management/employee-management` | `Owner/EmployeesPage.jsx` |
| UC-09 | Assign Employee Permissions | User Management | `user-management/employee-permissions` | `Owner/EmployeePermissionsPage.jsx`, form `EmployeePermissionsForm.jsx` |
| UC-10 | View System Activity Log | User Management | `user-management/system-activity` | `Owner/ActivityPage.jsx` |
| UC-11 | Trace System Activity | User Management | `user-management/system-activity` | `Owner/ActivityPage.jsx` |
| UC-12 | View Dashboard | Managerial Financial Analytics | `managerial-financial-analytics/executive-dashboard` | `Owner/FinancialPage.jsx`, chế độ `dashboard` |
| UC-13 | View BI Dashboard | Managerial Financial Analytics | `managerial-financial-analytics/financial-reports` | `Owner/FinancialPage.jsx`, chế độ `bi` |
| UC-14 | View Profit | Managerial Financial Analytics | `managerial-financial-analytics/financial-reports` | `Owner/FinancialPage.jsx`, chế độ `profit` |
| UC-15 | View Total Inventory Value Report | Raw Material Inventory | `raw-material-inventory/inventory-valuation` | `Owner/InventoryValuationPage.jsx`, nguyên liệu |
| UC-16 | View Warehouse Asset Valuation | Finished Goods Warehousing | `finished-goods-warehousing/asset-valuation` | `Owner/InventoryValuationPage.jsx`, tổng tài sản kho |
| UC-17 | View Operating Cash Flow Report | Managerial Financial Analytics | `managerial-financial-analytics/financial-reports` | `Owner/FinancialPage.jsx`, chế độ `cash` |
| UC-18 | Receive Reports from Manager | Managerial Financial Analytics | `managerial-financial-analytics/manager-reports` | `Owner/OwnerRecordsPage.jsx` và `OwnerRecordDetailPage.jsx`, chế độ `reports` |
| UC-19 | View Production Report by BOM Plan | Production Operations | `production-operations/bom-plan-report` | `Owner/OwnerRecordsPage.jsx` và `OwnerRecordDetailPage.jsx`, chế độ `production` |
| UC-20 | View New Product Sample | BOM | `bom/product-samples` | `Owner/OwnerRecordsPage.jsx` và `OwnerRecordDetailPage.jsx`, chế độ `samples` |
| OWNER-EXT-01 | Assign Employee Role | User Management | `user-management/role-assignment` | `Owner/EmployeeRoleForm.jsx` |
| OWNER-EXT-02 | Configure API | System Administration | `system-administration/system-settings` | `Owner/SystemSettingsPage.jsx`, nhóm API |
| OWNER-EXT-03 | Configure Default Fabric Leftover Threshold | System Administration | `system-administration/system-settings` | `Owner/SystemSettingsPage.jsx`, nhóm vải dư |
| OWNER-EXT-04 | Configure Inventory Safety Thresholds | System Administration | `system-administration/system-settings` | `Owner/SystemSettingsPage.jsx`, ngưỡng chung và từng mặt hàng |
| OWNER-EXT-05 | Configure Return/Exchange Policy | System Administration | `system-administration/system-settings` | `Owner/SystemSettingsPage.jsx`, chính sách đổi/trả |
| OWNER-EXT-06 | Approve Major Inventory Variance | Inventory Auditing | `inventory-auditing/stock-adjustment` | `Owner/StockAdjustmentPage.jsx` và `StockAdjustmentDetailPage.jsx` |

Quản lý tài khoản và vai trò được đặt chung Major Feature **User Management** để thống nhất với bảng ảnh mới, không tạo hai nhóm nhân viên ở User Management và System Administration. Cấu hình vẫn thuộc **System Administration / System Settings**, kiểm kê thuộc **Inventory Auditing / Stock Adjustment** theo bảng feature trước đó. Như vậy hợp nhất có 8 Major Feature, mỗi chức năng có một nơi xử lý chính.

Các trang/component JSX **riêng cho Owner** nằm trong `ARAWMS_FE/src/pages/Owner/`. Trang đăng nhập, khôi phục mật khẩu và tài khoản cá nhân vẫn là thành phần dùng chung cho mọi vai trò, được tái sử dụng. UC-05 giữ nguyên API `/api/auth/google/*`; lớp định tuyến nằm ở User Management, còn dịch vụ xác thực dùng chung giữ nguyên trong `system-administration/authentication` để tránh viết lại phần đang chạy.

Thiết kế giao diện áp dụng [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md), chuyển đầy đủ từ `UIdesign.docx`. Danh mục đường dẫn, chức năng từng màn hình và quy tắc responsive nằm trong [OWNER_UI_STRUCTURE.md](OWNER_UI_STRUCTURE.md). Tạo nhân viên, phân quyền, chi tiết báo cáo/sản xuất/mẫu và chi tiết kiểm kê có trang riêng; khóa/mở khóa và xác nhận thao tác dùng hộp thoại ngắn. Bốn nhóm cấu hình có đường dẫn riêng, vẫn thuộc cùng Major Feature/Sub Feature của BE.

## Phần đã có được giữ lại

- Google Identity Services, kiểm tra chữ ký/issuer/audience/nonce, challenge một lần, rate limit và liên kết Google.
- Mật khẩu bcrypt, JWT gắn session, xác thực trạng thái tài khoản/vai trò tại mỗi request.
- Hồ sơ cá nhân, OTP số điện thoại, đổi mật khẩu và khôi phục mật khẩu qua email.
- Các model tài khoản, danh mục, đơn hàng, kho, chứng từ dòng tiền và SystemLog hiện hành.

Sửa chú thích cũ gắn **GBR-23** cho audit log sang **UC-10/UC-11**. GBR-23 trong tài liệu là video kiểm hàng trả, không phải quy tắc nhật ký hoạt động.

## Business rule liên quan

| Rule | UC liên quan | Cách xử lý trong phạm vi Owner |
| --- | --- | --- |
| GBR-01 | UC-05 đến UC-09 và toàn bộ API Owner | Xác thực tài khoản/role đang hoạt động tại mỗi yêu cầu. Khóa/mở khóa/đổi quyền đều thu hồi session cũ. Nhân viên không mở được API Owner kể cả được gán mã quyền có tên giống chức năng quản trị. |
| GBR-02 | Luồng đăng nhập sẵn có; UC-08 | Giữ yêu cầu đặt lại mật khẩu khi sai 5 lần. Mở khóa quản trị không xóa failedLoginAttempts/passwordResetRequired. |
| GBR-05 | UC-12 | Đếm mã hàng có tồn khả dụng `onHandQty - reservedQty` nhỏ hơn ngưỡng. Chỉ hiển thị trên dashboard; không thêm API cấu hình ngưỡng hoặc viết luồng xuất kho. |
| GBR-11, GBR-12 | UC-14, UC-17 | Đọc giá trị hàng trả và giá vốn nhập lại từ quyết toán đã được duyệt. Không tính lại phụ phí lịch sử hoặc sửa nghiệp vụ hoàn tiền của Accountant. |
| GBR-13 | UC-12, UC-15, UC-16 | Hàng cách ly là nhóm tài sản riêng; không cộng vào tồn bán được. Hàng giữ chỗ vẫn là tài sản kho. |
| GBR-14 | UC-17 | Hiển thị ID chứng từ nguồn trong bảng phiếu thu/chi và đánh dấu dòng thiếu tham chiếu. Tạo/duyệt chứng từ và kiểm tra nguồn trước ghi sổ thuộc module Accountant, ngoài phạm vi này. |
| GBR-16 | UC-12 | Hiển thị số đơn có trạng thái COD đỏ hiện hành. Không tạo luồng đối soát COD cho Owner. |
| GBR-17 | UC-12, UC-13, UC-14, UC-17 | Dùng snapshot giá vốn trên dòng đơn đã đóng gói; không lấy giá vốn SKU hiện tại để tính lại đơn lịch sử. Báo cáo cảnh báo đơn thiếu snapshot. |
| GBR-05 | OWNER-EXT-04 | Ngưỡng riêng mỗi mặt hàng không âm; cảnh báo khi tồn khả dụng nhỏ hơn ngưỡng. Đánh giá lại cảnh báo ngay sau khi sửa ngưỡng. |
| GBR-06 | OWNER-EXT-03 | Ngưỡng thu hồi mặc định 2m, lớn hơn 0. Chiều dài bằng ngưỡng vẫn thu hồi với mã mới; nhỏ hơn phân loại phế liệu. |
| GBR-11, GBR-12 | OWNER-EXT-05 | Phụ phí lỗi khách cố định 10%, lỗi cửa hàng miễn phụ phí/ship. Owner bổ sung nội dung chính sách nhưng không được đổi tỷ lệ trái rule. |
| GBR-18 | OWNER-EXT-06 | Duyệt chuyển sang APPROVED_PENDING_ADJUSTMENT. Owner không tự đóng phiên hoặc ghi tồn kho thay Manager. |
| GBR-19 | OWNER-EXT-04, OWNER-EXT-06 | Cộng trị tuyệt đối chênh lệch; vượt ngưỡng số lượng hoặc giá trị, hoặc có hàng tồn lâu thì cần Owner. Kế hoạch xử lý tồn lâu bắt buộc có nội dung rõ khi duyệt. |

GBR-03/04/07/08/09/10/15/20/21/22/23 chủ yếu quy định thao tác của các vai trò khác. Không tự thêm quyền tạo phiếu kho, đóng gói, đối soát COD hay kiểm hàng trả cho Owner. Dữ liệu được xem qua báo cáo khi có bản ghi hợp lệ.

## Validation và quản lý nhân viên

- Mã nhân viên 2–30 ký tự, gồm chữ ASCII, số, gạch nối/gạch dưới; chuẩn hóa chữ hoa. Email chuẩn hóa chữ thường, tối đa 254 ký tự.
- Họ tên dùng cùng validation Unicode hiện có, 2–100 ký tự. Điện thoại không bắt buộc; nếu nhập phải có 10 số và bắt đầu bằng 0.
- Mật khẩu ít nhất 8 ký tự, tối đa 72 **byte UTF-8**, không chỉ khoảng trắng; xác nhận phải khớp. Chỉ lưu bcrypt hash và không ghi mật khẩu/hash vào audit log.
- Chỉ tạo năm vai trò nhân viên đang hoạt động. Không tạo thêm Owner, không khóa/mở khóa Owner hoặc sửa quyền Owner qua các API này.
- Chặn email/mã trùng, kể cả tài khoản đã xóa mềm; unique index xử lý yêu cầu đồng thời.
- Khóa chỉ áp dụng khi ACTIVE; mở khóa chỉ áp dụng khi LOCKED và role còn hoạt động. Lý do 5–500 ký tự bắt buộc.
- `managementVersion` và `expectedVersion` ngăn ghi đè thay đổi của quản trị viên khác. Giao dịch MongoDB gộp cập nhật nhân viên và audit log; cần replica set/Atlas.
- UC-09 sửa **quyền ngoại lệ**, không đổi vai trò nhân viên. Mảng rỗng khôi phục theo vai trò. Mỗi quyền chỉ xuất hiện một lần và `granted` phải là boolean, tối đa 100 quyền.
- OWNER-EXT-01 sửa **vai trò**: vai trò mới phải khác vai trò hiện tại và còn hoạt động. Khi đổi vai trò, bỏ quyền ngoại lệ cũ và thu hồi phiên để tránh quyền của công việc cũ đi theo công việc mới. Tài khoản đang khóa vẫn giữ khóa.
- Danh mục quyền lấy từ Role.permissions đang hoạt động, loại chức năng quản trị Owner. Hai quyền xem/tạo vận chuyển GHN có sẵn được cung cấp để áp dụng quyền vào API nghiệp vụ đang chạy.
- Role kho chưa có permissions dùng quyền GHN nền cho Warehouse Manager/Staff. Ngoại lệ `deny` luôn thắng quyền nền. Các API GHN hiện có đã được bảo vệ; endpoint tạo đơn thử chỉ Owner được dùng.
- Module nghiệp vụ nhân viên được bổ sung sau này phải dùng middleware `authorizePermission`, không chỉ kiểm tra vai trò.

## Nhật ký và truy vết

API chỉ đọc, hỗ trợ tìm từ khóa, hành động chính xác, khoảng ngày, actorId, targetId, targetCode và phân trang tối đa 100 dòng. Truy vết bắt buộc có ít nhất một khóa đối tượng/người thực hiện. Từ khóa được escape trước khi dùng regex, ID phải là ObjectId hợp lệ; không nhận object thay chuỗi hoặc trường ngoài danh sách.

Snapshot cũ được lọc khóa mật khẩu, token, session, credential, secret, OTP, Google ID trước khi trả FE. Truy vết hiển thị lịch sử **đã ghi nhận trong SystemLog**, không khôi phục được hoạt động quá khứ chưa từng ghi log.

## Cơ sở tính báo cáo

- Khoảng ngày theo giờ Việt Nam, tối đa 366 ngày, gồm trọn ngày kết thúc. Ngày không tồn tại, khoảng đảo hoặc query sai kiểu bị từ chối trước truy vấn DB.
- Ghi nhận doanh thu hàng hóa sau chiết khấu và COGS theo `warehouseFulfillment.packedAt`, trên đơn đã đóng gói/giao/hoàn, loại đơn hủy. Dùng `items[].unitCogsSnapshot`.
- Hàng trả giảm doanh thu theo giá trị hàng trên quyết toán đã duyệt, theo ngày duyệt. Chỉ đảo giá vốn phần nhập lại bán được; hàng cách ly không đảo giá vốn bán hàng như hàng tốt.
- Lợi nhuận gộp = doanh thu thuần − giá vốn thuần. Lợi nhuận vận hành = lợi nhuận gộp − OPERATIONAL_EXPENSE + SURCHARGE_REVENUE/CARRIER_DISPUTE_COMPENSATION đã ghi trên phiếu. Không coi khoản trả nợ/mua vật tư là chi phí vận hành lần hai.
- Dòng tiền = CASH_IN − CASH_OUT theo ngày chứng từ. **Lợi nhuận và dòng tiền là hai chỉ số khác nhau.** Chưa bao gồm thuế hoặc chi phí chưa ghi trong source hiện hành.
- Định giá tồn hiện tại dùng số lượng tồn × đơn giá danh mục hiện có (`unitCost`, `unitCogs`); tách thành phẩm cách ly. Đây không phải định giá FIFO từng lô hoặc ảnh chụp tồn tại ngày quá khứ. Không tự gắn nhãn FIFO khi source chưa lưu đủ giá lô.
- UC-19 hiển thị tiến độ, phiên bản BOM liên kết, định mức dự kiến (qtyPerUnit × plannedQty × (1 + wastageRate)) và vật tư tiêu hao đã ghi nhận. Thiếu BOM/tiêu hao được thể hiện là thiếu dữ liệu, không tự điền bằng 0.

## Nguồn dữ liệu cho UC 18 đến UC 20

Thêm model đọc `manager_reports`, `production_orders`, `boms`, `product_samples` theo từ điển dữ liệu đã đối chiếu. Giữ tương thích các model đang chạy; không thay cả hệ thống sang schema khác.

Owner chỉ thấy báo cáo Manager đã SUBMITTED/REVIEWED, không thấy DRAFT. Xác nhận đã xem lưu reviewedBy/reviewedAt/comment và audit log, không cho xác nhận lại. UC-19/20 chỉ đọc; không thêm quyền tạo/sửa/duyệt lệnh sản xuất, BOM hoặc mẫu sản phẩm. Chỉ trả link HTTP/HTTPS không chứa thông tin đăng nhập; không render nội dung báo cáo dưới dạng HTML.

Collection chưa có bản ghi sẽ hiển thị trạng thái trống. Không chèn dữ liệu mẫu vào DB đang dùng.

## Cấu hình vận hành và duyệt kiểm kê

OWNER-EXT-02..05 dùng `revision/expectedVersion` để tránh ghi đè cấu hình cũ. Mỗi nhóm chỉ nhận trường thuộc nhóm đó. Các số phải hữu hạn, đúng khoảng; số ngày phải là số nguyên. Ngưỡng riêng từng mặt hàng dùng `version` của model tồn kho.

Khóa API được mã hóa AES-256-GCM và không xuất hiện trong phản hồi hay snapshot audit. Máy chủ cần `SETTINGS_ENCRYPTION_KEY` ổn định tối thiểu 32 ký tự; nếu chưa đặt thì dùng `JWT_SECRET` ổn định đủ dài. Không dùng khóa ngẫu nhiên của dev để lưu bí mật. Đổi khóa mã hóa cần xử lý lại các khóa API đã lưu. Để ô khóa trống giữ khóa cũ; chọn bỏ khóa DB dùng lại khóa môi trường nếu có. Tắt GHN chặn các yêu cầu GHN tiếp theo. Cấu hình GHN mới có hiệu lực cho yêu cầu tiếp theo, không chia sẻ client đang bị đổi token giữa các yêu cầu đồng thời.

Facebook Page ID và khóa Facebook được lưu cấu hình nhưng chưa có client Messenger đang hoạt động trong source hiện tại; không coi việc lưu cấu hình là đã hoàn tất tích hợp Facebook. Tương tự, `systemPolicies.js` cung cấp quy tắc vải dư/hoàn tiền cho module kỹ thuật và Accountant dùng lại; các luồng nghiệp vụ đó không được viết thêm trong phạm vi Owner.

OWNER-EXT-06 chỉ duyệt sau khi đã kiểm đếm mọi dòng, có đơn giá hợp lệ và lý do 10–2000 ký tự. Số lượng thành phẩm phải nguyên. Nếu có hàng tồn lâu, yêu cầu kế hoạch 10–2000 ký tự. Số thừa và thiếu không bù trừ khi xác định thẩm quyền. Đơn giá ưu tiên snapshot kiểm kê; dòng cũ dùng giá master được cảnh báo rõ, không thay giá thiếu bằng 0.

Khi Owner mở báo cáo, BE trả `reportHash` cùng `approvalRevision`. Lúc duyệt đọc lại dữ liệu, kiểm tra cả hai để phát hiện báo cáo thay đổi. Chặn duyệt lại và chặn phiên có bút toán điều chỉnh bất thường trong trạng thái chưa duyệt. Ghi người duyệt, thời điểm, lý do, kế hoạch và hash cùng audit log trong một transaction. Truy vấn trong transaction chạy tuần tự.

**Giới hạn liên vai trò:** Quyết định Owner kết thúc ở APPROVED_PENDING_ADJUSTMENT. Source Manager hiện chưa có luồng ghi sổ điều chỉnh đầy đủ; luồng đó phải kiểm tra quyết định/hash, xử lý tất cả phiếu liên quan rồi mới đặt APPROVED_COMPLETED theo GBR-18. Không có API Owner tự ghi tồn kho hoặc tự đóng phiên để lấp phần Manager còn thiếu.

## API

Tất cả API `/api/owner/*` cần Bearer session đang hoạt động và role OWNER, đặt Cache-Control no-store.

| Method | URL | UC |
| --- | --- | --- |
| GET/POST | `/api/owner/employees` | UC-06 và danh sách nhân viên |
| PATCH | `/api/owner/employees/:id/lock` | UC-07 |
| PATCH | `/api/owner/employees/:id/unlock` | UC-08 |
| GET | `/api/owner/employee-permissions` | UC-09, danh mục quyền/vai trò |
| GET/PATCH | `/api/owner/employee-permissions/:id` | UC-09 |
| GET | `/api/owner/activity` | UC-10 |
| GET | `/api/owner/activity/trace` | UC-11 |
| GET | `/api/owner/dashboard` | UC-12 |
| GET | `/api/owner/financial-reports` | UC-13/14/17 |
| GET | `/api/owner/financial-reports/cash-vouchers` | UC-17 |
| GET | `/api/owner/material-valuation` | UC-15 |
| GET | `/api/owner/asset-valuation` | UC-16, bảng chi tiết theo type=materials/skus |
| GET | `/api/owner/asset-valuation/summary` | UC-16, tổng tài sản hai nhóm |
| GET | `/api/owner/manager-reports` và `/:id` | UC-18 |
| PATCH | `/api/owner/manager-reports/:id/review` | UC-18 |
| GET | `/api/owner/production-reports` và `/:id` | UC-19 |
| GET | `/api/owner/product-samples` và `/:id` | UC-20 |
| PATCH | `/api/owner/employee-roles/:id` | OWNER-EXT-01 |
| GET | `/api/owner/system-settings` | OWNER-EXT-02..05 |
| PATCH | `/api/owner/system-settings/:section` | OWNER-EXT-02..05, section=api/fabric/inventory/returns |
| GET/PATCH | `/api/owner/system-settings/inventory-items/:type` và `/:id` | OWNER-EXT-04, type=materials/skus |
| GET | `/api/owner/stock-adjustments` và `/:id` | OWNER-EXT-06 |
| POST | `/api/owner/stock-adjustments/:id/approve` | OWNER-EXT-06 |

## Kiểm tra và giới hạn xác minh

Chạy tại `ARAWMS_BE`: `npm test`. Bộ test dùng persistence giả lập và HTTP nội bộ, không sửa DB/GHN thật. Kiểm tra validation, phạm vi Owner, hiệu lực quyền ngoại lệ, đổi vai trò/thu hồi phiên, bảo toàn yêu cầu reset mật khẩu, audit không chứa mật khẩu/khóa API, mã hóa/từ chối khóa bị sửa, chặn phiên bản cũ, xác nhận báo cáo lặp và duyệt kiểm kê không tự ghi tồn kho.

Sau khi hợp nhất, bộ BE có **143 test**. Đã kiểm tra FE production build, validation FE, render phía server của 11 màn hình Owner ban đầu, cú pháp/import BE và truy vấn chỉ đọc 10 nhóm chức năng ban đầu trên MongoDB đã cấu hình. Đã kiểm tra thêm đọc cấu hình, ngưỡng nguyên liệu, ngưỡng SKU và danh sách kiểm kê. Truy vấn live tắt autoIndex/autoCreate; không ghi dữ liệu hoặc gửi đơn GHN. Danh sách kiểm kê chờ duyệt hiện trống nên chưa có báo cáo kiểm kê thật để xác minh phần chi tiết.

Chưa kiểm thử giao dịch ghi trên MongoDB thật, giao diện trình duyệt đầy đủ hoặc Google OAuth thật trong lần triển khai này. Các test service không thay thế xác minh rollback/concurrency trên replica set thử nghiệm. Dữ liệu Manager/sản xuất/mẫu sản phẩm hiện trống tại lần kiểm tra đọc; cần nghiệp vụ nguồn cung cấp dữ liệu để đánh giá nội dung báo cáo thực tế.

## Cách đọc comment trong code

Đầu file ghi người thực hiện và ngày 30-10-2026 cho phần bổ sung. Comment trước mỗi khối giải thích mục đích, dữ liệu đang kiểm tra và kết quả mong muốn bằng câu ngắn. Mã UC xác định chức năng; mã GBR chỉ gắn khi đoạn code thực sự xử lý quy tắc đó. Không gắn GBR-23 cho audit log, không gọi quyền ngoại lệ là đổi vai trò và không gọi duyệt kiểm kê là đã ghi tồn kho.
