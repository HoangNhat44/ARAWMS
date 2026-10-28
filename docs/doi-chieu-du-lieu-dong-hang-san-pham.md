Luồng nhập nguyên phụ liệu hiện tại sẽ bắt đầu trực tiếp từ phiếu giao hàng thực tế của nhà cung cấp. Quản lý kho tự chọn nguyên phụ liệu, nhập số lượng, kiểm tra và xác nhận nhập kho.

Toàn bộ chức năng có thể chia thành 5 màn hình hoặc 5 bước trên cùng một màn hình:
Thông tin giao hàng → Nguyên phụ liệu và kiểm nhận → Chi tiết cây/lô → Vị trí kho → Xác nhận và in tem

Ví dụ xuyên suốt:

- Nhà cung cấp giao 600 m vải cotton trắng.
- Thực tế nhận được 590 m.
- Trong đó 570 m đạt, 20 m không đạt.
- Thiếu giao so với chứng từ: 10 m.
- Chỉ 570 m đạt được nhập vào tồn sử dụng; 20 m không đạt được theo dõi riêng.

1. Danh sách phiếu nhập nguyên phụ liệu
   Đường dẫn gợi ý:
   Kho nguyên phụ liệu
   → Phiếu nhập
   → Danh sách phiếu nhập

Màn hình hiển thị:
Cột Nội dung
Mã phiếu nhập Mã do hệ thống sinh
Ngày nhận Ngày nhận hàng thực tế
Nhà cung cấp Tên nhà cung cấp
Mã chứng từ giao Mã phiếu giao của NCC nếu có
Kho nhận Kho nguyên phụ liệu
Người tạo Nhân viên tạo phiếu
Trạng thái Nháp, đã xác nhận, đã hủy…
Thao tác Xem, tiếp tục nhập, in tem…

Bộ lọc:

- Mã phiếu.
- Nhà cung cấp.
- Ngày nhận từ ngày–đến ngày.
- Trạng thái.
- Kho.
  Nút chính: + Tạo phiếu nhập.

Không cần hiển thị tổng số lượng chung cho phiếu có nhiều đơn vị. Ví dụ không cộng 590 mét + 100 cuộn + 3.000 chiếc. 2. Bước 1 — Thông tin giao hàng
Khi bấm Tạo phiếu nhập, hiển thị form:
Trường Bắt buộc Mô tả
Mã phiếu nhập Tự sinh Ví dụ PNNL-000001
Loại phiếu Tự điền Nhập nguyên phụ liệu từ nhà cung cấp
Nhà cung cấp Có Chọn từ danh sách NCC
Mã chứng từ giao hàng Không bắt buộc Mã phiếu giao của NCC
Ngày nhận thực tế Có Mặc định ngày hiện tại
Kho nhận Có Chọn kho nguyên phụ liệu
Người giao Có Tên người giao từ NCC
Người nhận Tự điền Tài khoản đang đăng nhập
Ghi chú Không Ghi chú về việc giao hàng
Tệp đính kèm Không Phiếu giao, ảnh kiện hàng, biên bản…

Kiểm tra dữ liệu

- Nhà cung cấp phải tồn tại và được phép giao dịch.
- Kho phải là kho nguyên phụ liệu đang hoạt động.
- Người dùng phải có quyền nhập hàng vào kho được chọn.
- Mã chứng từ được chuẩn hóa khoảng trắng trước khi lưu.
- Nếu cùng nhà cung cấp đã có chứng từ trùng, cảnh báo để đối chiếu. Không tự chặn hoàn toàn vì một chứng từ có thể liên quan nhiều đợt giao; quy tắc cuối cùng tùy cách NCC phát hành chứng từ.
- Tệp đính kèm giới hạn định dạng và dung lượng theo cấu hình.
- Không cho ngày nhận ở tương lai, trừ trường hợp hệ thống cho phép và có quyền phù hợp.
  Nút thao tác:
  Hủy Lưu nháp Tiếp tục →

3. Bước 2 — Chọn nguyên phụ liệu
   Quản lý bấm + Thêm nguyên phụ liệu.

Một cửa sổ hoặc panel tìm kiếm hiện:
Mã Tên nguyên phụ liệu Loại Màu/quy cách Đơn vị
NL-001 Vải cotton Vải Trắng, khổ 1,6 m Mét
PL-001 Chỉ may Phụ liệu Trắng, cuộn 5.000 m Cuộn
PL-002 Cúc áo Phụ liệu Trắng, 12 mm Chiếc

Cho tìm theo mã, tên, loại và quy cách.

Sau khi chọn, nguyên liệu được thêm vào phiếu. Nếu chưa có trong danh mục:

- Người có quyền chọn Tạo nguyên phụ liệu mới.
- Sau khi tạo xong, quay lại phiếu và chọn nguyên liệu vừa tạo.
- Không tự tạo danh mục mới từ một chuỗi tên nhập vào phiếu.
  Kiểm tra khi thêm
- Nguyên phụ liệu phải đang hoạt động.
- Một dòng phải xác định rõ nguyên liệu, màu và quy cách.
- Nếu chọn lại cùng nguyên liệu/cùng quy cách, hệ thống có thể gộp hoặc yêu cầu mở chi tiết các lô khác nhau. Không tự tạo các dòng trùng khó đối soát.
- Nếu có nhiều lô nhuộm hoặc đơn vị giá khác nhau, cho ghi chi tiết riêng trong cùng dòng hoặc tách dòng theo quy tắc đã chọn.

4. Bước 3 — Nhập số lượng và kết quả kiểm nhận
   Bảng chính:
   Nguyên phụ liệu NCC báo giao Thực nhận Đạt Không đạt Chờ kiểm tra Chênh lệch
   Vải cotton trắng — m 600 590 570 20 0 -10
   Chỉ trắng — cuộn 100 100 95 5 0 0

Ý nghĩa từng cột

- NCC báo giao: số ghi trên chứng từ hoặc do NCC thông báo; nếu không có thì có thể để trống.
- Thực nhận: số đã nhận và kiểm đếm tại kho.
- Đạt: số đủ điều kiện nhập sử dụng.
- Không đạt: số đã nhận nhưng có lỗi.
- Chờ kiểm tra: số chưa có kết luận.
- Chênh lệch: Thực nhận − NCC báo giao; chỉ tính khi có số báo giao.
  Ví dụ:
  NCC báo giao: 600 m
  Thực nhận: 590 m
  Đạt: 570 m
  Không đạt: 20 m
  Chờ kiểm tra: 0 m

Chênh lệch giao = 590 − 600 = -10 m

Công thức bắt buộc
Thực nhận = Đạt + Không đạt + Chờ kiểm tra

Kiểm tra dữ liệu

- Số lượng không được âm.
- Vật tư tính theo chiếc/cuộn dùng số nguyên nếu quy cách yêu cầu.
- Vải theo mét được nhập số lẻ theo độ chính xác của hệ thống.
- Không có NCC báo giao thì không hiển thị chênh lệch giả bằng 0.
- Nếu Thực nhận = 0, không tạo cây hoặc lô nhập từ dòng đó.
- Nếu có hàng không đạt, yêu cầu lý do hoặc kết quả kiểm tra.
- Tổng đạt + không đạt + chờ không được vượt hoặc nhỏ hơn thực nhận.
- Cho lưu nháp khi còn chờ kiểm tra.
  Đề xuất MVP: chỉ cho xác nhận chính thức phiếu khi Chờ kiểm tra = 0. Nếu sau này cần nhập trước phần đạt và xử lý phần còn lại sau, bổ sung cơ chế xác nhận từng phần.
  Kết quả kiểm tra chất lượng
  Nếu có bộ phận KCS riêng:
- KCS xác nhận kết quả.
- Quản lý kho xem hoặc liên kết biên bản KCS.
- Người không có quyền không sửa kết luận đã duyệt.
  Nếu chưa có module KCS, có thể cho người có quyền nhập trực tiếp kết quả và ghi rõ:
  Người kiểm tra
  Thời gian kiểm tra
  Kết luận
  Ghi chú

Hàm xử lý gợi ý
addMaterialToReceipt(receiptId, materialId)

updateReceiptLine(receiptId, receiptLineId, input)

calculateDeliveryDifference(reportedQuantity, receivedQuantity)

validateInspectionQuantities(receiptLine)

saveInspectionResult(receiptId, receiptLineId, inspection)

Backend cần tính và kiểm tra lại số liệu; không phụ thuộc số tổng frontend gửi lên. 5. Bước 4A — Chi tiết từng cây vải
Với nguyên liệu loại vải, hiển thị nút Chi tiết cây vải.

Bảng:
STT Mã cây NCC Màu Lô nhuộm Khổ Chiều dài Cân nặng Kết quả
1 NCC-001 Trắng LOT-A 1,6 m 200 m 42 kg Đạt
2 NCC-002 Trắng LOT-A 1,6 m 190 m 40 kg Đạt
3 NCC-003 Trắng LOT-A 1,6 m 180 m 38 kg Đạt
4 NCC-004 Trắng LOT-A 1,6 m 20 m 4 kg Không đạt

Cuối bảng:
4 cây • Tổng 590 m
Đạt: 3 cây / 570 m
Không đạt: 1 cây / 20 m

Thao tác

- - Thêm cây
- Nhân bản dòng nếu các cây cùng quy cách.
- Import Excel nếu có nhiều cây.
- Xóa dòng khi phiếu chưa xác nhận.
- Chỉnh sửa cây khi phiếu còn nháp.
  Mã barcode nội bộ hiển thị:
  Barcode: Sẽ tạo khi xác nhận phiếu

Validate từng cây

- Chiều dài phải lớn hơn 0.
- Khổ vải phải lớn hơn 0 nếu quản lý theo khổ.
- Cân nặng không được âm.
- Đơn vị của chiều dài và khổ phải rõ ràng.
- Cây không đạt cần lý do.
- Tổng chiều dài mọi cây phải khớp số thực nhận.
- Tổng chiều dài cây đạt phải khớp số đạt.
- Tổng chiều dài cây không đạt phải khớp số không đạt.
- Một mã cây NCC bị lặp trong cùng phiếu phải cảnh báo để đối chiếu.
- Không coi mã cây NCC là barcode nội bộ nếu hệ thống chưa quy định như vậy.
  Trường hợp một cây chỉ lỗi một phần
  Ví dụ cây dài 100 m, trong đó 10 m có lỗi.

Giai đoạn đầu nên xử lý theo một trong hai cách được kho quy định:

1. Giữ toàn cây chờ xử lý, chưa nhập khả dụng.
2. Tách vật lý và đo lại thành các phần được chấp nhận và không đạt.
   Khi chưa tách, không tự tạo một cây 100 m và thêm một khúc 10 m, vì sẽ làm tồn thành 110 m.
   Hàm gợi ý
   addFabricRoll(receiptId, receiptLineId, roll)

updateFabricRoll(receiptId, receiptLineId, rollId, input)

removeFabricRoll(receiptId, receiptLineId, rollId)

calculateFabricRollTotals(rolls)

validateFabricRollDetails(receiptLine, rolls)

6. Bước 4B — Chi tiết lô phụ liệu
   Với chỉ, cúc, khóa kéo, bao bì, hiển thị nút Chi tiết lô phụ liệu.
   Trường Ví dụ
   Mã lô NCC LOT-CUC-01
   Số bao gói 30
   Đơn vị bao gói Túi
   Quy cách 100 chiếc/túi
   Số lượng quy đổi 3.000 chiếc
   Số lượng thực kiểm 3.000 chiếc
   Đạt 3.000 chiếc
   Không đạt 0
   Hạn dùng Nếu vật tư có yêu cầu

Quy đổi
Số lượng quy đổi = Số bao gói × Số đơn vị trong mỗi bao gói

Ví dụ:
30 túi × 100 chiếc/túi = 3.000 chiếc

Nếu một số túi được mở ra kiểm đếm và thực tế không đủ, phải cho nhập số thực kiểm; không bắt buộc luôn bằng số quy đổi trên nhãn.
Validate

- Số bao gói và quy cách phải lớn hơn 0.
- Đơn vị quy đổi phải phù hợp với nguyên liệu.
- Số đạt + không đạt khớp số thực kiểm.
- Mã lô trùng cần cảnh báo để quyết định nhập chung lô hay tách lô.
- Không nhập một lô nhiều vị trí bằng cách tạo trùng số lượng tồn.
- Tổng các lô phải khớp dòng nguyên phụ liệu.
  Hàm gợi ý
  calculateConvertedQuantity(packageCount, quantityPerPackage)

addMaterialLot(receiptId, receiptLineId, lot)

updateMaterialLot(receiptId, receiptLineId, lotId, input)

validateMaterialLotTotals(receiptLine, lots)

7. Bước 5 — Phân bổ vị trí kho
   Mỗi cây vải hoặc lô phụ liệu cần xác định vị trí.

Người dùng chọn:
Khu vực → Kệ → Tầng/ô chứa
Zone → Rack → Shelf

Với vải
Mỗi cây được chọn một vị trí:
Cây Chiều dài Kết quả Vị trí
Cây 01 200 m Đạt A–01–01
Cây 02 190 m Đạt A–01–02
Cây 04 20 m Không đạt Khu chờ xử lý

Với phụ liệu
Một lô có thể chia nhiều vị trí:
Lô cúc trắng Vị trí Số lượng
LOT-CUC-01 B–01–01 2.000 chiếc
LOT-CUC-01 B–01–02 1.000 chiếc

Validate

- Vị trí phải thuộc đúng kho nhận.
- Vị trí đang hoạt động và phù hợp loại hàng.
- Tổng phân bổ phải bằng số lượng cần cất khi hoàn thành bước.
- Không cho phân bổ quá số lượng.
- Hàng không đạt phải đặt ở khu chờ xử lý/cách ly.
- Nếu có giới hạn sức chứa, phải kiểm tra trước khi xác nhận.
- Đổi kệ sau này không được thay ngày nhập hoặc nguồn gốc lô dùng cho FIFO.
  Hàm gợi ý
  getAvailableLocations(warehouseId, materialType, qualityStatus)

assignFabricRollLocation(rollId, locationId)

assignMaterialLotLocations(lotId, allocations)

validateLocationAllocations(receiptId)

8. Bước 6 — Tổng kết trước xác nhận
   Hiển thị một trang chỉ đọc gồm:
   Thông tin giao hàng

- Nhà cung cấp.
- Chứng từ giao hàng.
- Ngày nhận.
- Người giao/người nhận.
- Kho.
  Thông tin hàng
- Từng nguyên phụ liệu.
- Số báo giao, thực nhận, đạt, không đạt.
- Danh sách cây vải/lô phụ liệu.
- Vị trí được chọn.
- Kết quả kiểm tra và ghi chú.
  Ví dụ:
  Nguyên phụ liệu Thực nhận Đạt Không đạt Đơn vị
  Vải cotton trắng 590 570 20 Mét
  Chỉ trắng 100 95 5 Cuộn
  Cúc trắng 3.000 3.000 0 Chiếc

Nút:
← Quay lại Lưu nháp Xác nhận nhập kho

Trước khi xác nhận, hiển thị hộp thoại tóm tắt:
Xác nhận nhập phiếu này? Hệ thống sẽ tạo mã barcode, ghi nhận tồn và lưu lịch sử giao dịch.

9. Xử lý khi xác nhận nhập kho
   Hàm chính:
   confirmMaterialReceipt(
   receiptId,
   expectedVersion,
   idempotencyKey
   )

Backend xử lý theo thứ tự

1. Kiểm tra người dùng có quyền xác nhận.
2. Kiểm tra phiếu tồn tại và đang ở trạng thái cho phép.
3. Kiểm tra expectedVersion để tránh người khác đã sửa phiếu.
4. Đọc lại nguyên liệu, kết quả kiểm tra, cây/lô và vị trí từ database.
5. Validate tổng số lượng, trạng thái chất lượng và phân bổ.
6. Tạo bản ghi FabricRoll cho từng cây.
7. Tạo bản ghi lô tồn phụ liệu theo cấu trúc hiện có hoặc model bổ sung.
8. Sinh barcode nội bộ duy nhất cho từng đối tượng được quản lý.
9. Ghi nhận hàng đạt và hàng không đạt theo trạng thái riêng.
10. Cập nhật tồn tổng hợp của nguyên phụ liệu theo quy tắc hệ thống.
11. Ghi InventoryTransaction.
12. Chuyển phiếu sang Đã xác nhận.
13. Ghi SystemLog.
    Các thay đổi dữ liệu liên quan phải nhất quán. Nếu xử lý lỗi, không được để tình trạng đã cộng tồn nhưng chưa tạo đủ cây/lô.
    Chống xác nhận trùng

- Frontend vô hiệu nút khi đang xử lý.
- Backend dùng idempotencyKey.
- Nhấn đúp hoặc retry cùng yêu cầu trả về kết quả cũ.
- Cùng khóa nhưng payload khác phải báo xung đột.
- Không sinh thêm barcode hoặc cộng tồn lần hai.
  Nếu số cây rất lớn và xử lý nền, có thể thêm trạng thái:
  Đang xác nhận

Chỉ báo hoàn tất khi dữ liệu tồn và barcode đã được tạo đầy đủ. 10. Barcode và in tem
Cây vải
Mỗi cây có một barcode nội bộ riêng, liên kết:
Barcode → cây vải → nguyên liệu → phiếu nhập → vị trí

Thông tin trên tem:

- Tên nguyên liệu.
- Barcode và mã đọc được bằng mắt.
- Màu.
- Khổ vải.
- Chiều dài lúc nhập.
- Lô nhuộm nếu có.
- Ngày nhập.
- Vị trí.
  Chiều dài in trên tem là chiều dài ban đầu. Sau khi xuất/cắt, chiều dài còn lại phải tra cứu trong hệ thống.
  Phụ liệu
  Sinh barcode theo lô hoặc bao gói nếu kho cần quản lý ở cấp đó.
  In lại
- In lại dùng barcode đã cấp.
- Không tạo cây/lô mới.
- Không tăng tồn.
- Ghi lịch sử in lại nếu hệ thống cần kiểm soát.
  Hàm:
  getMaterialLabels(receiptId, selectedIds)

generateLabelPrintData(materialObjectIds)

recordLabelReprint(receiptId, selectedIds)

11. Hàng không đạt và trả nhà cung cấp
    Khi xác nhận phiếu, phần không đạt được theo dõi ở khu xử lý riêng và không thuộc tồn khả dụng.

Các trạng thái:
Trạng thái Ý nghĩa
PENDING_DECISION Đã nhận, đang chờ quyết định
WAITING_FOR_RETURN Đã quyết định trả NCC, hàng còn ở kho
RETURNED_TO_SUPPLIER Đã bàn giao thực tế cho NCC
WAITING_FOR_REPLACEMENT Chờ NCC giao hàng thay thế
RESOLVED Đã xử lý xong theo chứng từ liên quan

Quản lý chọn Tạo phiếu trả NCC, nhập:

- Nguyên liệu/cây/lô.
- Số lượng.
- Lý do trả.
- Ngày bàn giao.
- Người giao và người nhận.
- Biên bản hoặc ảnh.
  Không chuyển thành Đã trả NCC khi chưa có xác nhận bàn giao thực tế.

Hàng NCC giao thay thế được ghi nhận bằng phiếu nhập mới, liên kết hồ sơ trả cũ để đối soát. 12. Trạng thái phiếu và quyền chỉnh sửa
Trạng thái Chỉnh sửa Có ghi nhận tồn?
Nháp Được sửa theo quyền Chưa
Chờ kiểm tra Sửa theo quyền/quy trình Chưa
Sẵn sàng xác nhận Có thể quay lại sửa Chưa
Đang xác nhận Khóa thao tác Đang xử lý
Đã xác nhận Không sửa trực tiếp số lượng Đã ghi nhận
Đã hủy Không sửa Chưa ghi nhận hoặc đã xử lý đảo theo quy trình

Sau khi phiếu đã xác nhận, sai số lượng cần đi qua nghiệp vụ điều chỉnh/đảo chứng từ có quyền và audit. Không sửa thẳng số đã nhập khiến lịch sử tồn mất nhất quán. 13. Các bảng MongoDB liên quan
Theo tài liệu database AraWMS đã trao đổi, có thể bắt đầu từ:
Model Vai trò
MaterialTicket Phiếu nhập, dòng nguyên liệu, kiểm nhận và trạng thái
RawMaterial Danh mục nguyên phụ liệu và dữ liệu tổng hợp
FabricRoll Chi tiết từng cây vải
WarehouseLocation Zone, Rack, Shelf
InventoryTransaction Lịch sử biến động tồn
Supplier Nhà cung cấp
CounterSequence Sinh mã phiếu/barcode theo quy tắc dự án
SystemLog Nhật ký thao tác

Với phụ liệu, cần kiểm tra hệ thống đã lưu được lô + vị trí + số lượng hay chưa. Nếu chưa có, cân nhắc thêm model như MaterialStockLot và dữ liệu phân bổ theo vị trí.

Trước khi code migration, cần đọc schema thực tế để tái sử dụng các trường đang có, tránh tạo collection trùng chức năng. 14. Thứ tự triển khai đề xuất

1. Tạo danh sách phiếu và form thông tin giao hàng.
2. Tạo/lưu nháp phiếu, chọn nguyên phụ liệu và nhập số lượng.
3. Thêm validate kiểm nhận và quyền xác nhận chất lượng.
4. Làm chi tiết từng cây vải.
5. Làm chi tiết lô phụ liệu và quy đổi đơn vị.
6. Làm phân bổ vị trí.
7. Làm API xác nhận, sinh barcode và ghi tồn chống trùng.
8. Làm trang chi tiết phiếu, in tem và in lại.
9. Làm xử lý hàng không đạt, trả và nhận hàng thay thế.
10. Kiểm thử từ tạo nháp đến xác nhận, gồm lỗi mạng, bấm đúp, barcode trùng và nhiều người thao tác cùng phiếu.
