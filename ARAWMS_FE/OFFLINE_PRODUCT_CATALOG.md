# Sản phẩm và SKU khi mất mạng

## Cách sử dụng

Đăng nhập bằng tài khoản có quyền quản lý kho, mở **Cấu hình sản phẩm**. Form tự lưu bản nháp trên thiết bị sau khi ngừng nhập một lúc. Khi mở lại, chọn tiếp tục hoặc bỏ bản nháp. Bấm **Lưu** mới tạo thao tác đồng bộ. Nếu API chưa liên lạc được, thông báo **Đã lưu trên thiết bị — sẽ đồng bộ khi kết nối trở lại** chỉ xuất hiện sau khi IndexedDB ghi xong.

Mục **Xem dữ liệu chờ đồng bộ** hiển thị các thao tác và lỗi. Sản phẩm tạo offline cũng xuất hiện ở **Kho thành phẩm → Sản phẩm trên thiết bị**, nhưng không có nút nhập/xuất kho hoặc chốt đơn. Khi có kết nối, ứng dụng gửi lần lượt và giữ nguyên mã thao tác khi gửi lại. Mở lại ứng dụng hoặc bấm **Thử lại** để tiếp tục. Dữ liệu cục bộ chỉ hiển thị cho tài khoản đã tạo nó trên cùng trình duyệt.

Khi server trả xung đột, dữ liệu cục bộ được giữ ở trạng thái **Cần kiểm tra**. Chọn **Xem xung đột** để đối chiếu, dùng dữ liệu hiện tại hoặc mở form chỉnh lại. Không có cơ chế tự ghi đè thay đổi của người khác.

Màu, size và giá của SKU đã tải có thể sửa trong form sản phẩm. Mã SKU và barcode đã cấp không đổi. Nếu SKU đã có tồn kho, server từ chối đổi màu hoặc size để tránh đổi nhận diện của hàng vật lý; người dùng vẫn có thể sửa giá.

Import Excel dùng đúng cột của `product_variation.xlsx`. Bước **Kiểm tra file** chạy trên thiết bị; các nhóm sản phẩm hợp lệ được gửi lần lượt, mỗi nhóm có ID ổn định theo file và mã sản phẩm. Dòng lỗi được hiển thị theo số dòng. Trùng với dữ liệu toàn hệ thống được server kiểm tra khi đồng bộ. URL ảnh/video hợp lệ trong file được sao chép vào Cloudinary khi có kết nối. Số lượng tồn kho và barcode từng chiếc chỉ được tạo trong luồng kiểm nhận, không được tạo khi cấu hình.

## Cấu trúc database

- Collection mới `catalog_operations` giữ `ownerUserId`, `operationId`, hash nội dung và kết quả đã commit. Index duy nhất `(ownerUserId, operationId)` ngăn gửi lại tạo bản ghi thứ hai.
- Collection `products` có thêm trường `version` cho đối chiếu bản sửa và `mediaOperations` để nhận lại kết quả upload cùng tệp. Index duy nhất `sampleCode` (khi khác rỗng) chặn hai thiết bị dùng cùng mã mẫu. Tài liệu cũ chưa có `version` được xử lý như phiên bản 0. Nếu dữ liệu hiện có trùng `sampleCode`, cần giải quyết trùng trước khi chạy lệnh tạo index.
- Không thêm trường vào `skus`; model này đã có `version`. Các endpoint sửa giá hiện tăng phiên bản để phát hiện xung đột.
- Không cần backfill dữ liệu cũ. Trước khi phát hành, chạy `npm.cmd run migrate:catalog-offline-index` trong `ARAWMS_BE` để kiểm tra mã mẫu trùng và tạo hai index; đặc biệt bắt buộc ở môi trường tắt `autoIndex`.

## Cách thử

1. Đăng nhập, tải một sản phẩm có sẵn và mở form cấu hình. Trong DevTools, chọn Network → Offline.
2. Tạo sản phẩm mới, chọn ảnh, bấm Lưu. Kiểm tra thông báo lưu trên thiết bị và nhãn Chờ đồng bộ ở Kho thành phẩm.
3. Tạo thêm sản phẩm, tải lại trang, khôi phục bản nháp; kiểm tra hàng chờ của tài khoản vẫn còn.
4. Bật mạng; chờ hoặc bấm Thử lại. Kiểm tra chỉ có một sản phẩm và đúng các SKU trên server. Thử tắt mạng ngay sau khi gửi để kiểm tra gửi lại cùng ID.
5. Từ tab khác sửa cùng sản phẩm trước khi đồng bộ bản sửa offline; kiểm tra trạng thái Cần kiểm tra và không bị ghi đè.
6. Thử import file có dòng hợp lệ, dòng trùng và dòng sai; kiểm tra lỗi theo dòng và trạng thái từng nhóm trong panel.
7. Thử đăng xuất khi còn hàng chờ; xác nhận cảnh báo và đăng nhập tài khoản khác để kiểm tra hàng chờ không hiển thị.

Ứng dụng chưa cài service worker cho việc mở lại toàn bộ giao diện khi server tĩnh cũng không truy cập được. Các tuyến kho khác trong bản hiện tại vẫn dùng danh tính thử nghiệm; chỉ API đồng bộ catalog và upload tệp của hàng đợi này bắt buộc token đăng nhập. Cần kiểm chứng thêm bằng trình duyệt thật, camera/thiết bị liên quan và MongoDB môi trường triển khai.
