# Cấu trúc màn hình Owner theo thiết kế AraStore

Thiết kế tham chiếu: [UI Design System](UI_DESIGN_SYSTEM.md), chuyển đầy đủ từ `UIdesign.docx` do người dùng cung cấp. Phạm vi chức năng giữ theo [bảng hợp nhất Owner](OWNER_USE_CASES.md): 22 chức năng cụ thể và nhóm cha Account Management.

## Khung làm việc chung

Sử dụng Ant Design, Inter được đóng gói trong ứng dụng và các màu Deep Noir, Rich Bronze Gold, Warm Stone trong tài liệu. Không tải Google Fonts từ bên ngoài. Header, sidebar, bảng, form, thông báo, hộp thoại và trạng thái dùng cùng token trong `ARAWMS_FE/src/theme/wmsTheme.js`.

Desktop có sidebar cố định có thể thu gọn, header với breadcrumb, báo cáo quản lý chưa xem và menu tài khoản. Tablet/điện thoại mở điều hướng bằng Drawer. Khu vực Owner không xếp thêm navbar công khai lên trên header nội bộ.

Nút/thành phần tương tác chính có chiều cao 44px. Tiêu đề trang 24–28px, mục 18–20px, nội dung 14–16px, bảng 13–14px, chú thích 12px. Nội dung không dùng gradient, phông serif trang trí hoặc nhãn tự nhận đã sẵn sàng production.

## Phân chia trang và tính năng

| Trang | URL | Chức năng trong trang |
| --- | --- | --- |
| Tổng quan | `/owner/dashboard` | Chỉ số kinh doanh theo kỳ, tình trạng vận hành và tài sản kho hiện tại, liên kết báo cáo liên quan |
| Phân tích kinh doanh | `/owner/bi` | Khoảng ngày, doanh thu theo ngày, giá vốn, biên lợi nhuận và dữ liệu đối chiếu |
| Lợi nhuận | `/owner/profit` | Doanh thu, giảm trừ hoàn hàng, giá vốn, chi phí vận hành và lợi nhuận |
| Dòng tiền | `/owner/cash-flow` | Thu/chi theo kỳ, hạng mục và bảng phiếu có chứng từ nguồn |
| Nhân viên | `/owner/employees` | Tìm kiếm, lọc trạng thái/vai trò, phân trang; mở khóa, khóa, gán vai trò qua hộp thoại ngắn |
| Tạo nhân viên | `/owner/employees/new` | Form thông tin, mật khẩu/xác nhận, vai trò, lỗi validation và kết quả tạo |
| Phân quyền nhân viên | `/owner/employees/:employeeId/permissions` | Quyền theo vai trò, cấp/thu hồi riêng, lý do, quyền có hiệu lực; không dùng modal chứa danh mục dài |
| Nhật ký và truy vết | `/owner/activity` | Bộ lọc thời gian, hành động, đối tượng/người thực hiện; xem snapshot đã che khóa bảo mật |
| Giá trị tồn nguyên liệu | `/owner/material-valuation` | Tìm mã/tên, số lượng, giữ chỗ, đơn vị, đơn giá và tổng giá trị |
| Tài sản kho | `/owner/asset-valuation` | Tổng toàn kho và bảng theo nhóm nguyên liệu/thành phẩm; hàng cách ly tách riêng |
| Báo cáo từ Manager | `/owner/manager-reports` | Tìm kiếm, lọc đã gửi/đã xem và phân trang |
| Chi tiết báo cáo | `/owner/manager-reports/:id` | Người gửi, kỳ, nội dung, tệp đính kèm, ghi chú và xác nhận đã xem |
| Sản xuất theo BOM | `/owner/production` | Tìm/lọc lệnh, số kế hoạch, hoàn thành và tỷ lệ tiến độ |
| Chi tiết sản xuất | `/owner/production/:id` | Phiên bản BOM liên kết, định mức, vật tư đã cấp/hoàn/tiêu hao và tiến độ công đoạn |
| Mẫu sản phẩm | `/owner/samples` | Tìm/lọc mã mẫu, tên, trạng thái và giá dự kiến |
| Chi tiết mẫu | `/owner/samples/:id` | Mô tả, ảnh, chi phí, giá đề xuất và ghi chú đánh giá đã có; không thêm quyền phê duyệt mẫu |
| Tích hợp API | `/owner/settings/integrations` | GHN, Shop ID, Facebook Page ID, nhập khóa mới, trạng thái đã có khóa; không hiện khóa đã lưu |
| Ngưỡng vải dư | `/owner/settings/fabric` | Ngưỡng thu hồi theo mét và giải thích trường hợp bằng/dưới ngưỡng |
| Ngưỡng tồn | `/owner/settings/inventory` | Ngưỡng chung và bảng ngưỡng an toàn/tồn lâu từng mặt hàng; chỉnh sửa ngắn qua modal |
| Chính sách đổi trả | `/owner/settings/returns` | Quy định phụ phí 10%, lỗi cửa hàng miễn phí, nội dung chính sách bổ sung |
| Duyệt kiểm kê | `/owner/stock-adjustments` | Lọc phiên chờ duyệt/đã duyệt chờ điều chỉnh/hoàn tất và phân trang |
| Chi tiết kiểm kê | `/owner/stock-adjustments/:id` | Tồn hệ thống và thực đếm cạnh nhau, chênh lệch được nhấn mạnh, lý do, kế hoạch tồn lâu, xác nhận quyết định qua modal |
| Tài khoản và bảo mật | `/owner/account` | Hồ sơ, OTP điện thoại, đổi mật khẩu, liên kết/hủy liên kết Google bằng các luồng đã có |

`/owner/settings` chuyển đến trang tích hợp; `/account` của Owner chuyển vào khung tài khoản Owner. Các vai trò khác tiếp tục dùng trang tài khoản chung. Đường dẫn sai có trang 404 và nút về trang chủ phù hợp.

## Quy tắc responsive

- Từ 992px: sidebar desktop; có nút thu gọn từ 248px xuống 80px.
- Từ 768px đến dưới 992px: điều hướng Drawer, nội dung dùng bề rộng màn hình, các chỉ số chuyển về hai cột khi cần.
- Dưới 768px: form nhiều cột chuyển một cột; các hành động chính nằm dưới tiêu đề, khoảng đệm giảm hợp lý.
- Dưới 576px: bảng danh sách chuyển thành thẻ có nhãn cho từng giá trị; so sánh tồn hệ thống/thực đếm vẫn giữ đủ hai dữ liệu. Bộ lọc và nút áp dụng xuống từng hàng.
- 320–359px: các thẻ chỉ số chuyển một cột, không ép số tiền lớn vào cột hẹp.
- Bảng desktop có vùng cuộn ngang riêng khi nhiều cột; không kéo tràn toàn bộ trang. Thẻ mobile giữ tất cả thao tác liên quan, không ẩn chức năng quan trọng chỉ để vừa màn hình.

## Component và quyền truy cập

`WmsControls.jsx` chuyển các form hiện có sang Ant Design, giữ `name`, `value`, `onChange`, validation HTML và payload nghiệp vụ. Select/ngày vẫn trả giá trị theo hợp đồng cũ; ngày hiển thị `DD/MM/YYYY` và gửi ISO `YYYY-MM-DD` cho API. Trường bắt buộc có dấu rõ; lỗi gắn với trường qua tên/ID truy cập được.

`OwnerUI.jsx` dùng Table/Card, Pagination, Modal, Alert, Skeleton, Tag và Statistic. Trạng thái có nhãn chữ và biểu tượng, không chỉ có màu. Số được căn phải, dùng cùng định dạng tiền/số/ngày. Trạng thái lỗi mạng khác trạng thái không có dữ liệu; lỗi luôn có nút thử lại.

Các bộ lọc, kỳ và trang được lưu trong query string. Trang chi tiết giữ đường dẫn danh sách trước đó để quay lại không mất bộ lọc. Những thao tác dài không nhồi vào modal. Khóa/mở khóa, gán vai trò, sửa ngưỡng và xác nhận phê duyệt dùng hộp thoại phù hợp với độ dài thao tác.

Không thay logic, API, validation BE, phân quyền Owner, quy định phụ phí, cách tính lợi nhuận hoặc luồng duyệt kiểm kê để làm giao diện gọn hơn. Owner duyệt kiểm kê vẫn chuyển sang chờ điều chỉnh; không tự ghi tồn kho hoặc đóng phiên.

## Kiểm thử

Chạy `npm run test:ui` trong `ARAWMS_FE`. Kiểm thử headless dùng Chrome, một máy chủ Vite cục bộ không proxy BE và API giả lập. Mọi request API được chặn, không dùng phiên người dùng thật, không ghi MongoDB hoặc gửi đơn GHN. Kiểm tra bề rộng desktop/laptop/tablet/mobile/reflow, keyboard, form, trạng thái và các quy tắc accessibility tự động.

Các kiểm tra tự động hỗ trợ đánh giá theo WCAG 2.2 AA; không thay thế đánh giá bằng trình đọc màn hình, thiết bị thật và kiểm tra Google OAuth thật. Ảnh chụp kiểm thử nằm trong `ARAWMS_FE/test-results/`, không đưa vào source được commit.

### Kết quả xác minh ngày 01-11-2026

- `npm run build`: thành công. Vite còn cảnh báo chunk dùng chung lớn hơn 500 kB; các trang Owner đã tải theo route, cần đo hiệu năng mạng/thiết bị thực trước khi đặt ngân sách production.
- `npm run test:ui`: **22/22 test qua** trong Chrome headless.
- 23 màn hình Owner × 5 bề rộng 320/390/768/1280/1440px: không phát hiện lỗi JavaScript hoặc tràn ngang toàn trang.
- 23 màn hình Owner × desktop/mobile: không có vi phạm từ các quy tắc axe WCAG 2.2 AA được chạy. Các trang tài khoản dùng chung, khôi phục mật khẩu, đăng nhập và 404 cũng qua kiểm tra tự động đã cấu hình.
- Đã kiểm tra tạo nhân viên, lệch xác nhận mật khẩu, khóa tài khoản, đổi vai trò, cấp quyền, giữ phiên bản dữ liệu khi gửi, lưu API không điền sẵn khóa, ngưỡng từng mặt hàng, xác nhận đã xem báo cáo và xác nhận lần cuối trước khi duyệt kiểm kê.
- Điều hướng Drawer bằng bàn phím, giữ bộ lọc khi quay lại danh sách, chặn vai trò khác Owner, trạng thái rỗng/lỗi mạng/thử lại: qua.
- Đã xem ảnh desktop/mobile của tổng quan, nhân viên, ngưỡng tồn và chi tiết kiểm kê để đối chiếu bố cục, chữ, màu và cách trình bày dữ liệu. Ảnh dùng dữ liệu giả lập của bộ kiểm thử.

### Đối chiếu nguồn dữ liệu MongoDB

Giao diện chạy bình thường gọi `ownerService` → Axios `/api/owner/*` → route/service BE → model Mongoose. Dữ liệu giả lập chỉ được nạp bởi Playwright trong `tests/ui/fixtures.js`, không được import vào ứng dụng.

Ngày 01-11-2026 đã kết nối MongoDB bằng cấu hình môi trường hiện có và gọi 15 nhóm dịch vụ chỉ đọc. Tắt `autoIndex`/`autoCreate`; theo dõi lệnh MongoDB chỉ thấy `find` và `aggregate`, không ghi dữ liệu. Cả 15 nhóm trả kết quả thành công: 8 nhân viên, 5 vai trò/16 quyền trong danh mục, 376 nhật ký, 2 nguyên liệu và 45 SKU; dashboard, báo cáo tài chính, cấu hình và ngưỡng cũng đọc được. Phiếu thu/chi trong kỳ, báo cáo Manager, lệnh sản xuất, mẫu sản phẩm và danh sách kiểm kê hiện không có bản ghi phù hợp, nên màn hình tương ứng hiển thị trạng thái rỗng.

Đây là xác minh dịch vụ trên MongoDB thật và đối chiếu đường gọi FE/BE; không thay thế kiểm thử toàn bộ luồng bằng phiên đăng nhập thật trên trình duyệt. Bộ 143 kiểm thử BE cũng đã chạy lại và qua sau khi cập nhật tên người thực hiện trong comment.
