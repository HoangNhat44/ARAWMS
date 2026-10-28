Tôi đề xuất rút gọn thành một màn hình nhập hàng, chia ba phần và dùng một nút “Xác nhận nhập kho”. Người dùng nhập dữ liệu ngay trên phiếu, chỉ mở chi tiết khi cần.

Luồng chính:

Chọn nhà cung cấp → thêm nguyên phụ liệu và số lượng → kiểm tra, chọn vị trí → xác nhận nhập → in tem.

Luồng này không sử dụng kế hoạch nhập hay hợp đồng.

1. Thông tin giao hàng — nhập ngắn gọn

Phần đầu phiếu chỉ giữ các trường cần thiết:
Trường Cách hoạt động
Nhà cung cấp Tìm và chọn từ danh mục
Ngày nhận Mặc định hôm nay
Kho nhận Tự chọn nếu người dùng chỉ có một kho
Mã chứng từ NCC Không bắt buộc
Ghi chú, ảnh chứng từ Thu gọn, mở khi cần

Mã phiếu tự sinh. Người nhận lấy từ tài khoản đăng nhập. Không bắt người dùng nhập lại các thông tin hệ thống đã biết.

2. Thêm nguyên phụ liệu — một bảng chính

Người dùng tìm theo mã hoặc tên rồi chọn nguyên phụ liệu. Hệ thống tự điền quy cách và đơn vị.
Nguyên phụ liệu Thực nhận Không đạt Đạt nhập kho Vị trí Chi tiết
Vải cotton trắng · m 590 20 570 Chọn vị trí 4 cây
Chỉ trắng · cuộn 100 5 95 B-01-T1-O01 Mở
Cúc trắng · chiếc 3.000 0 3.000 B-02-T1-O01 Mở

Để giảm thao tác:

- Người dùng nhập thực nhận và không đạt.
- Hệ thống tự tính đạt = thực nhận − không đạt.
- Khi chọn “đã kiểm tra, toàn bộ đạt”, đặt số không đạt bằng 0.
- Nếu chưa kiểm tra xong, cho lưu nháp, chưa xác nhận nhập chính thức.
- Khi có số không đạt, mới mở trường lý do lỗi và hướng xử lý.
- “Số NCC báo giao” và chênh lệch nằm trong phần chi tiết tùy chọn, không bắt nhập nếu không có chứng từ.
  Không nên để nhiều ô tổng số đều cho sửa độc lập vì dễ tạo số liệu mâu thuẫn.

3. Vải có chi tiết từng cây; phụ liệu chỉ mở thêm khi cần

Đây là điểm cần tách để form đơn giản nhưng dữ liệu vẫn đúng.

Đối với vải

Bấm “Nhập danh sách cây”, mở panel bên cạnh:
Cây Chiều dài thực tế Kết quả Vị trí
01 200 m Đạt A-01-T1-O01
02 190 m Đạt A-01-T1-O02
03 180 m Đạt A-02-T1-O01
04 20 m Không đạt Khu chờ xử lý

Màu, khổ tiêu chuẩn và tên nguyên liệu tự lấy từ dòng đã chọn. Mã cây NCC, lô nhuộm, cân nặng hoặc ghi chú mở khi cần hoặc bắt buộc theo quy cách vật tư.

Sau khi có chi tiết cây, bảng chính lấy tổng từ các cây và khóa sửa trực tiếp các số tổng. Người dùng chỉ nhập một nơi.

Có nút “Thêm cây giống dòng trên” để không nhập lại thông tin chung. Import Excel có thể bổ sung sau nếu thực tế cần.

Đối với phụ liệu

Mặc định chỉ cần số lượng và vị trí. Phần chi tiết cho phép nhập:

- Mã lô nếu có.
- Quy cách đóng gói nếu cần quy đổi.
- Chia số lượng vào nhiều ô.
  Ví dụ: 30 túi × 100 chiếc = 3.000 chiếc. Nếu đã nhập số thực kiểm, không tự ghi đè bằng số quy đổi trên bao bì.

Phụ liệu quản lý theo lô hoặc bao gói phù hợp; không mặc định sinh barcode cho từng chiếc cúc.

4. Chọn vị trí bằng danh sách, không cần bản đồ

Ngay tại dòng hoặc chi tiết cây/lô:

1. Bấm “Chọn vị trí”.
2. Hệ thống hiển thị các ô phù hợp trong kho đang nhận.
3. Chọn kệ, tầng và ô.
4. Có thể “Áp dụng vị trí cho các dòng đã chọn” khi hợp lệ.
   Danh sách nên hiển thị:
   Vị trí Trạng thái Thông tin hỗ trợ
   A-01-T1-O01 Hoạt động Dành cho cây vải
   A-02-T1-O01 Hoạt động Dành cho phụ liệu

Chỉ kiểm tra sức chứa khi ô đã được cấu hình bằng đơn vị phù hợp. Không dùng sức chứa “chiếc thành phẩm” để so với mét vải hoặc kg nguyên liệu.

Nên cho lựa chọn “Chưa chọn vị trí” để người dùng vẫn nhập hàng được. Phần này được ghi là chờ cất, chưa sẵn sàng xuất sử dụng.

Vị trí đã chọn trên phiếu là vị trí dự kiến. Nếu hệ thống có chức năng quét xác nhận cất hàng, chỉ cập nhật vị trí thực tế khi bước đó thành công. MVP chưa có quét thì cần hành động “Xác nhận đã cất” theo quyền, thay vì tự coi đã cất ngay khi chọn ô.

5. Xác nhận nhập — một lần, kết quả rõ

Cuối màn hình có:

Lưu nháp Xác nhận nhập kho

Trước khi xác nhận, hiển thị bản tóm tắt ngắn theo từng đơn vị:

- Vải: 590 m thực nhận, 570 m đạt, 20 m không đạt.
- Chỉ: 100 cuộn thực nhận, 95 đạt, 5 không đạt.
- Các phần chưa chọn vị trí hoặc chưa cất.
  Không cộng mét, cuộn và chiếc thành một tổng.

Khi xác nhận, backend:

1. Kiểm tra quyền, trạng thái và phiên bản phiếu.
2. Kiểm tra số lượng, cây/lô và vị trí.
3. Tạo cây vải/lô quản lý, cấp barcode tương ứng.
4. Ghi tồn đạt và hàng không đạt riêng.
5. Ghi lịch sử giao dịch.
6. Đánh dấu phiếu đã xác nhận.
   Bấm đúp hoặc retry phải trả kết quả cũ, không tạo thêm barcode hoặc cộng tồn hai lần.

7. Sau nhập — chỉ hiện việc cần làm tiếp

Trang chi tiết phiếu hiển thị:
Kết quả Hành động
Hàng đạt đã nhận In tem
Hàng chưa cất Xem danh sách chờ cất
Hàng không đạt Xem danh sách chờ xử lý/trả NCC

Chỉ hàng đạt và hoàn thành điều kiện cất mới được đưa vào tồn sẵn sàng xuất dùng. Hàng không đạt vẫn được theo dõi khi đang nằm tại kho, nhưng không xuất cho sản xuất.

In lại dùng barcode cũ. Phiếu đã xác nhận không sửa trực tiếp số lượng; cần nghiệp vụ điều chỉnh có lịch sử.

7. Cách làm để hệ thống nhanh và dễ bảo trì
   Vấn đề Thiết kế đề xuất
   Quá nhiều màn hình Một form chính, panel chi tiết cây/lô
   Nhập cùng dữ liệu nhiều lần Dùng chi tiết làm nguồn tính tổng, tự điền thông tin danh mục
   Tải toàn bộ danh mục Tìm kiếm và tải theo kết quả
   Tải lại trang khi sửa Chỉ cập nhật dòng hoặc panel liên quan
   Gọi API mỗi lần gõ số Tính tạm tại giao diện; lưu nháp/xác nhận theo thao tác rõ ràng
   Bấm lưu nhiều lần Khóa nút đang lưu và chống trùng tại backend
   Lưu lỗi làm mất công nhập Giữ form, chỉ rõ lỗi tại dòng, cho thử lại
   Hệ thống phức tạp sớm API thông thường; chưa cần WebSocket hoặc xử lý nền nếu dữ liệu thực tế chưa yêu cầu

Khi chọn nguyên liệu hoặc mở panel, giao diện phản hồi ngay bằng trạng thái chọn/đang tải. Chỉ báo “Đã lưu” sau khi server xác nhận.

8. Những kiểm tra tối thiểu phải có

- Phiếu có nhà cung cấp, kho và ít nhất một dòng thực nhận lớn hơn 0.
- Số lượng hợp lệ theo đơn vị; không đạt không vượt thực nhận.
- Chưa kiểm tra xong thì chưa xác nhận chính thức.
- Tổng cây/lô khớp số lượng dòng.
- Vị trí đúng kho, đang hoạt động và phù hợp loại hàng.
- Hàng không đạt có lý do và không vào tồn khả dụng.
- Barcode không trùng; retry không cộng tồn hai lần.
- Hai người sửa cùng phiếu được phát hiện bằng phiên bản dữ liệu.
- Phiếu đã xác nhận không bị sửa số lượng trực tiếp.
  Luồng người dùng chỉ cần nhớ: chọn hàng → nhập thực nhận và phần lỗi → chọn chỗ cất → xác nhận. Chi tiết cây vải, kiểm tra tồn và chống trùng được hệ thống xử lý phía sau.
