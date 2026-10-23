Màn hình nên giữ phong cách giao diện ARA bạn gửi: nền kem, thẻ trắng, viền be mảnh, điểm nhấn nâu đồng và tiêu đề serif. Phần nhập liệu dùng font sans-serif để dễ đọc và thao tác.

Tôi đề xuất thiết kế như sau.

1. Bố cục chung

Giữ thanh đầu trang hiện tại: logo ARA bên trái, điều hướng và tài khoản bên phải.

Phần nội dung mở rộng khoảng 1.200–1.300 px, căn giữa, gồm:

- Breadcrumb: Kho thành phẩm / Nhập từ xưởng / Cấu hình sản phẩm.
- Tiêu đề: Cấu hình sản phẩm.
- Mô tả: “Chọn mẫu và biến thể sản phẩm để tiếp tục kiểm nhận hàng từ xưởng.”
- Thanh tiến trình: ① Cấu hình sản phẩm → ② Kiểm nhận → ③ Xác nhận nhập kho.
  Không dùng khối giới thiệu lớn như trang chủ; ưu tiên không gian cho form và bảng SKU.

2. Chọn loại cấu hình

Ngay dưới tiêu đề đặt hai ô lựa chọn ngang nhau:
Tạo sản phẩm mới Sản phẩm hiện có
Mẫu sản phẩm chưa có trong danh mục Nhập thêm hàng cho mẫu đã được lưu

Ô được chọn có viền nâu đồng, nền kem nhạt và dấu chọn. Ô còn lại nền trắng, viền be.

Nếu đã nhập dữ liệu rồi chuyển loại, cần nhắc về dữ liệu chưa lưu; không tự xóa form. 3. Chế độ “Tạo sản phẩm mới”

Trên desktop, chia nội dung thành hai cột: trái khoảng 70%, phải 30%.

Cột trái — Thông tin sản phẩm

Thẻ trắng có tiêu đề Thông tin chung, chứa:
Trường Cách trình bày
Tên sản phẩm _ Ô toàn chiều rộng; ví dụ “Áo thun cổ tròn basic”
Mã sản phẩm Hiển thị “Tự động tạo khi lưu”, chỉ đọc nếu hệ thống tự sinh
Danh mục _ Dropdown tìm kiếm
Giá bán cơ bản Ô số có đơn vị ₫, chỉ hiển thị nếu quản lý kho được phép cấu hình giá
Mô tả Ô nhiều dòng, không bắt buộc

Tên trường đặt phía trên ô nhập. Dấu \* chỉ dùng cho trường bắt buộc, lỗi hiển thị ngay dưới trường tương ứng.

Cột phải — Hình ảnh sản phẩm

Thẻ Hình ảnh sản phẩm gồm:

- Khung ảnh vuông, có nút Tải ảnh lên.
- Ảnh đầu tiên làm ảnh đại diện.
- Ảnh bổ sung hiển thị dạng thumbnail.
- Có nút thay/xóa ảnh và hướng dẫn định dạng, dung lượng được phép.
  Không để khu vực ảnh chiếm quá nhiều chiều cao khiến bảng SKU bị đẩy xuống sâu.

Phía dưới — Thiết lập biến thể

Thẻ Màu sắc và kích cỡ gồm:

- Màu sắc: chọn nhiều giá trị, hiển thị bằng chip có tên màu.
- Kích cỡ: chọn nhiều size.
- Nút Tạo danh sách biến thể.
  Ví dụ chọn Trắng, Đen và M, L, XL sẽ đề xuất sáu tổ hợp. Người dùng có thể bỏ những tổ hợp không sản xuất.
  Sử dụng Màu Size Mã SKU Giá bán
  ✓ Trắng M Tự động tạo 150.000
  ✓ Trắng L Tự động tạo 150.000
  ✓ Trắng XL Tự động tạo 150.000
  ✓ Đen M Tự động tạo 150.000
  ☐ Đen L Tự động tạo 150.000
  ☐ Đen XL Tự động tạo 150.000

Phía trên bảng có thao tác Áp dụng giá cho tất cả nếu người dùng có quyền sửa giá. Phía dưới ghi “Đã chọn 4 biến thể”.

Khi thay đổi danh sách màu/size, giữ giá trị đã nhập của các tổ hợp còn tồn tại; không tạo lại bảng làm mất dữ liệu.

Cột phải — Tóm tắt cấu hình

Dưới phần ảnh, đặt thẻ nhỏ:

- Tên sản phẩm.
- Số biến thể được chọn.
- Trạng thái: Chưa lưu.
- Ghi chú: “Barcode riêng từng chiếc được tạo sau khi xác nhận số lượng đạt nhập kho.”
  Thanh thao tác cuối màn hình

Bên trái: trạng thái lưu. Bên phải:

Hủy Lưu nháp Lưu và tiếp tục kiểm nhận →

Nút chính màu nâu đồng đậm với chữ trắng đủ tương phản. Khi đang lưu, hiển thị tiến trình và chặn bấm lặp. 4. Chế độ “Sản phẩm hiện có”

Giữ vị trí lựa chọn và thanh thao tác như chế độ tạo mới để người dùng không phải học lại bố cục.

Bước đầu — Tìm sản phẩm

Hiển thị ô tìm kiếm lớn:
Tìm theo tên sản phẩm, mã sản phẩm hoặc mã SKU…

Danh sách kết quả có:

- Ảnh nhỏ.
- Tên và mã sản phẩm.
- Danh mục.
- Trạng thái sử dụng.
- Nút Chọn sản phẩm.
  Khi chưa tìm kiếm, có thể hiện danh sách sản phẩm gần đây. Khi không tìm thấy, hiển thị “Không tìm thấy sản phẩm” và nút Chuyển sang tạo sản phẩm mới.

Sau khi chọn — Thông tin nhận diện

Hiển thị một thẻ gọn:

- Ảnh sản phẩm bên trái.
- Tên, mã, danh mục ở giữa.
- Nhãn Đang sử dụng.
- Nút Chọn sản phẩm khác bên phải.
  Thông tin chung hiển thị chỉ đọc. Quyền sửa danh mục nằm ở hành động riêng Chỉnh sửa sản phẩm, tránh vô tình đổi dữ liệu khi đang nhập kho.

Bảng chọn SKU

Tiêu đề Chọn biến thể được xưởng giao, bên phải có nút + Thêm biến thể theo quyền.

Bộ lọc ngay trên bảng: tìm mã SKU, màu và size.
Chọn nhập Mã SKU Màu Size Trạng thái
✓ AT001-TR-M Trắng M Đang sử dụng
✓ AT001-TR-L Trắng L Đang sử dụng
✓ AT001-TR-XL Trắng XL Đang sử dụng
☐ AT001-DE-M Đen M Đang sử dụng

- Checkbox đầu bảng chọn tất cả SKU hợp lệ đang được lọc.
- Hiển thị rõ “Đã chọn 3 biến thể”.
- SKU ngừng sử dụng có nhãn riêng và không được chọn theo quy tắc hệ thống.
- Không cần hiển thị barcode từng chiếc trong bảng này.
  Thêm biến thể chưa có

Nút + Thêm biến thể mở panel bên phải, giữ người dùng trong màn hình hiện tại:

- Sản phẩm: chỉ đọc.
- Màu sắc.
- Kích cỡ.
- Giá bán nếu có quyền.
- Mã SKU tự sinh.
- Nút Thêm và chọn biến thể.
  Nếu tổ hợp đã tồn tại, hiển thị SKU tương ứng để chọn, không tạo bản trùng.

Cột tóm tắt bên phải

Hiển thị sản phẩm đã chọn và các biến thể sẽ kiểm nhận:

- Áo thun cổ tròn basic.
- Trắng / M.
- Trắng / L.
- Trắng / XL.
  Ghi chú: “Nhập số lượng thực nhận, đạt và trả sửa ở bước tiếp theo.”

Thanh thao tác cuối màn hình

Quay lại Sử dụng 3 SKU và tiếp tục →

Nút chính cập nhật số SKU đang chọn và chỉ bật khi lựa chọn hợp lệ. 5. Chuyển sang kiểm nhận đúng luồng của bạn

Sau khi hoàn thành một trong hai chế độ, mở bảng:
SKU Xưởng báo giao Thực nhận Đạt nhập kho Trả sửa
Áo trắng M 100 100 70 30
Áo trắng L 100 100 70 30
Áo trắng XL 100 100 70 30

Số lượng nằm ở bước này để quản lý kho phân biệt rõ việc cấu hình danh mục với kiểm nhận hàng thực tế.

Sau xác nhận, hệ thống tạo 210 vật phẩm đạt với 210 barcode riêng. 90 chiếc trả sửa được theo dõi riêng và chưa đưa vào tồn bán.

6. Cách hiển thị trên iPad và điện thoại

- Hai lựa chọn chế độ xếp dọc nếu không đủ chiều rộng.
- Cột tóm tắt chuyển xuống dưới form.
- Trường nhập dùng một cột trên điện thoại.
- Bảng SKU trên điện thoại chuyển thành từng dòng thẻ có checkbox, màu, size và mã SKU.
- Thanh thao tác cố định phía dưới, chừa khoảng trống để không che nội dung.
- Nút và checkbox có vùng chạm đủ lớn; trạng thái không chỉ biểu đạt bằng màu.
  Thiết kế này giữ được vẻ thanh lịch của ARA, đồng thời giúp quản lý kho đi theo một trình tự rõ: chọn/tạo sản phẩm → chọn SKU → kiểm số lượng → nhập hàng đạt và cấp barcode.
