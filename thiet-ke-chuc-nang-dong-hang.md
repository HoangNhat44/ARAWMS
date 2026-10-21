# Thiết kế chức năng đóng hàng có video theo đơn hàng

> Lưu ý 21/10/2026: phần mô tả "quét trước quay" bên dưới là phương án thiết kế cũ. Luồng đang triển khai theo yêu cầu mới: quét QR mở đơn và bắt đầu quay ngay; quét QR đơn kế tiếp kết thúc video đơn hiện tại, đưa vào hàng chờ Cloudinary, rồi bắt đầu quay đơn mới. Cloudinary giữ video, MongoDB Atlas lưu URL và định danh; IndexedDB chỉ giữ bản tạm cho đến khi upload được xác nhận.

Ngày cập nhật: 19/10/2026 — bản 2, quét trước quay và chỉ dùng lần final. Đây là khung nghiệp vụ và triển khai, chưa phải mã nguồn hoàn chỉnh. Các thời lượng, độ phân giải và thời hạn lưu dưới đây là đề xuất cần hiệu chỉnh sau thử nghiệm tại kho.

## 1. Hướng triển khai đề xuất — cập nhật theo quy trình mới

Tích hợp module ngay trong website responsive hiện tại, dùng camera trình duyệt để quét QR/barcode và quay video trên Windows, macOS, iPad, điện thoại. Máy quét USB/Bluetooth chỉ là tùy chọn; không yêu cầu ứng dụng camera ngoài hoặc app native cho luồng chuẩn. Tái sử dụng backend, đăng nhập và đơn hàng hiện có.

Luồng chính:

1. Nhân viên đăng nhập, chọn bàn/thiết bị, bấm “Mở camera” để cấp quyền và kiểm tra khả năng quét/quay.
2. Quét QR đơn A → backend kiểm tra quyền và khóa đơn → tạo lần đóng A1 ở SCANNING → hiện chi tiết đơn, **chưa ghi hình**.
3. Quét barcode để đối soát và tạo danh sách hàng thực tế của A1. Không tự thêm mặt hàng ngoài đơn khách đã đặt; sai hàng phải bị chặn hoặc qua quy trình sửa đơn riêng.
4. Khi đủ hàng và tất cả scan đã được server xác nhận → READY_TO_RECORD → bấm “Bắt đầu quay”. Có thể tùy chọn tự bắt đầu sau scan cuối, nhưng phải có tín hiệu rõ, góc quay đúng và không phát sinh thao tác ghi hình ngoài dự kiến.
5. Dừng bộ giải mã mã hàng, cố định thiết bị hướng vào bàn, quay từ trước lúc đưa hàng vào kiện đến khi niêm phong. Danh sách hàng bị khóa trong lúc quay.
6. Đóng xong: bấm “Hoàn tất” hoặc quét QR B. QR B hợp lệ kết thúc video A rồi mở B ở **SCANNING, không tự quay B**. B chỉ quay sau khi đã quét đủ barcode của chính B.
7. Video A upload nền; chỉ khi đủ điều kiện, server mới chốt A1 là final. Có thể quét hàng B trong khi tải A nếu thiết bị còn tài nguyên và trang vẫn hoạt động.
8. Khi đóng lại A, tạo A2, quét lại từ đầu và quay mới. Chỉ lần được chốt final hiện hành được dùng cho khách/xuất kho; lịch sử chỉ dành cho đối soát nội bộ theo quyền và retention.
9. Đơn cuối được kết thúc bằng nút “Hoàn tất / Kết thúc ca”.

**Đánh giá luồng quét trước rồi quay:** hợp lý hơn cho một camera tích hợp trên điện thoại/iPad vì có thể lần lượt dùng camera để quét và quay, giảm tranh chấp thiết bị và tải xử lý. Đổi lại, video không ghi lại việc quét barcode và không tự chứng minh hàng được quét là hàng đã cho vào thùng. Cần quy trình giữ hàng đã quét trong vùng kiểm soát và ghi toàn bộ thao tác đưa hàng vào kiện. Nếu nghiệp vụ đòi chứng minh liên tục từ quét đến niêm phong thì cần phương án quay trong lúc quét, thay vì coi hai phương án có cùng giá trị chứng cứ.

**Các bất biến:** không chờ upload A để xử lý B; không dùng QR bất kỳ làm ngắt video; không tự cộng barcode các lần đóng; không lấy lần có số thứ tự lớn nhất hoặc upload về sau cùng làm final.

## 2. Những quyết định nghiệp vụ cần thống nhất

| Nội dung | Đề xuất ban đầu |
|---|---|
| Phạm vi MVP | Một bàn/thiết bị xử lý một đơn tại một thời điểm; nhiều lần đóng nhưng tối đa một final hiện hành |
| Định danh sản phẩm | Phân biệt barcode SKU và serial từng món; không tự coi SKU là mã duy nhất của từng vật phẩm |
| Quét đơn kế tiếp khi chưa quay | Không được coi đơn hiện tại đã hoàn tất; chỉ hủy/tạm lưu rõ ràng, hoặc quay trước khi chuyển |
| Đơn bị hủy / đã đóng | Chặn mặc định; đóng lại cần quyền và tạo phiên mới |
| Một đơn nhiều kiện | MVP giới hạn một kiện hoặc bổ sung `package_id`; phải chốt trước khi làm database |
| Âm thanh | Tắt mặc định để giảm dữ liệu riêng tư không cần thiết |
| Lưu video | Ví dụ 90 ngày; quyết định theo nhu cầu xử lý khiếu nại và chính sách dữ liệu |
| Mất mạng | Cho phiên đang quay tiếp tục trong giới hạn bộ đệm; MVP không mở đơn mới khi chưa xác thực được backend |
| Video bắt buộc | Chưa tải và xác minh thành công thì chưa cho qua cổng “đủ bằng chứng để xuất kho” |
| Quyền xem của khách | Chỉ xem video thuộc đơn đã được xác minh là của mình; QR kho không phải vé xem video |

## 3. QR của đơn hàng

### 3.1. Nội dung QR

Không nhúng tên khách, số điện thoại, địa chỉ hoặc toàn bộ JSON đơn hàng vào QR. QR chỉ chứa định danh ngẫu nhiên, ví dụ `PACK:v1:<random-token>`; backend ánh xạ token sang đơn hàng. Mã hiển thị đơn hàng vẫn có thể in riêng để nhân viên đối chiếu.

- Dùng bộ sinh số ngẫu nhiên mật mã, tối thiểu 128 bit; đặt UNIQUE ở database cho token và ánh xạ đơn đang có hiệu lực.
- Mỗi đơn một QR đang hoạt động; in lại sử dụng cùng mã nếu chưa thu hồi. Khi lộ mã, thu hồi và cấp mã thay thế, mã cũ không còn được chấp nhận.
- Có thể lưu hash token để giảm lộ lọt từ database. Việc in lại khi chỉ lưu hash cần lấy lại QR đã lưu an toàn hoặc cấp mã mới theo quy trình.
- QR là công cụ tra cứu trong phiên nhân viên đã đăng nhập, không phải cơ chế xác thực hay phân quyền.
- Tách rõ prefix QR đơn và barcode sản phẩm; chỉ nhận định dạng hợp lệ. Không tự mở URL bất kỳ từ máy quét.
- Backend kiểm tra tenant, kho, quyền người dùng, trạng thái đơn, phiên bản đơn và khóa đồng thời trước khi trả dữ liệu.

### 3.2. Dữ liệu hiển thị

Mã đơn, người nhận với thông tin tối thiểu cần thiết, ảnh sản phẩm, SKU, biến thể, số lượng yêu cầu/đã quét, ghi chú đóng gói và cảnh báo hàng đặc biệt. Che số điện thoại/địa chỉ nếu nhân viên không cần toàn bộ. Lưu snapshot danh sách hàng và phiên bản đơn khi bắt đầu; nếu đơn thay đổi giữa chừng phải yêu cầu đối soát lại.

## 4. Thiết bị và ghi hình

### 4.1. Quét và quay ngay trên website đa thiết bị

- Dùng `getUserMedia` trên HTTPS; camera được cấp quyền qua thao tác của người dùng. Preview dùng `playsinline`, `muted`; ưu tiên camera sau qua `facingMode: ideal environment` trên mobile, có bộ chọn camera.
- Một CameraController quản lý stream theo các mode SCAN_ORDER, SCAN_ITEMS, RECORD_PACKING, SCAN_NEXT_ORDER; không để thư viện scanner tự đóng stream recorder đang dùng.
- Feature detection cho `BarcodeDetector` và các format thực tế. API này chưa phổ biến đồng đều; cần decoder JavaScript/WASM dự phòng tương thích, ví dụ một giải pháp dựa trên ZXing sau PoC và kiểm tra dependency. Giải mã tại thiết bị, không gửi frame camera sang dịch vụ thứ ba mặc định.
- Với nhận diện video liên tục, một mã nằm trước ống kính nhiều frame chỉ sinh một lần quét. Chỉ nhận lại sau khi mã rời vùng quét và đưa vào lại hoặc nhân viên bấm “Quét món tiếp theo”. Đặc biệt cần cơ chế này với nhiều món chung SKU; debounce theo mili giây đơn thuần dễ cộng thừa.
- Khi quét đủ hàng, tắt vòng decode, đưa camera về góc bàn, kiểm tra preview rồi bắt đầu recorder. Không cần mở stream camera thứ hai.
- Trong lúc quay, tắt nhận barcode sản phẩm. Nếu muốn giữ thao tác QR kế tiếp kết thúc video: decoder chỉ tìm prefix QR đơn trên **chính stream đang quay**, với tần suất giới hạn; đặt QR trong vùng camera thấy được. Đổi góc máy để tìm QR có thể làm mất cảnh niêm phong; ưu tiên nút “Hoàn tất” trên thiết bị cầm tay. Nếu hiệu năng không đạt, dùng nút này rồi quét QR kế tiếp sau khi dừng, vẫn hoàn toàn trong web.
- Không đổi camera/resolution giữa lúc quay. Nếu cần chuyển camera để quét QR B, phải hoàn tất video A trước; không mở camera khác âm thầm.
- Điện thoại/iPad cần giá đỡ và nguồn điện để quay thao tác đóng hàng rõ, tránh cầm máy vừa đóng. Responsive chỉ bảo đảm bố cục, không bảo đảm camera/codec/chạy nền có cùng khả năng.

| Nhóm thiết bị | Phạm vi kiểm thử trước khi công bố hỗ trợ |
|---|---|
| Windows | Chrome/Edge, webcam và camera rời; tùy chọn scanner |
| macOS | Safari và Chrome, quyền camera, định dạng ghi/phát |
| iPad | Safari trên iPadOS thực tế, camera sau, xoay màn hình, RAM/bộ đệm |
| iPhone | Safari trên phiên bản iOS thực tế, camera sau, khóa màn hình và gián đoạn |
| Android | Chrome trên các máy kho dùng thực tế, camera sau, hiệu năng decoder |

Không ép một MIME cho mọi máy: thử `isTypeSupported`, khởi tạo recorder và ghi/phát thử; lưu MIME/codec thực tế. Backend chuẩn hóa bản phát nếu cần, giữ bản gốc riêng tư. Không cam kết mọi trình duyệt/phiên bản đều hỗ trợ; công bố ma trận đã test và thông báo rõ khi thiết bị không đạt.

Tab phải ở foreground khi quay. Theo dõi `visibilitychange`, `pagehide`, track mute/ended, thời gian không có dữ liệu và lỗi recorder; không kết luận gián đoạn chỉ vì một chunk đến chậm, cần đối chiếu track và timestamp thực tế. Chuyển app, nhận cuộc gọi hoặc khóa màn hình có thể gián đoạn; đánh dấu INTERRUPTED khi có nghi ngờ và không tự chốt final. PWA và service worker không bảo đảm quay/upload tiếp khi hệ điều hành treo trang. Wake lock chỉ hỗ trợ nếu có, không thay thế phát hiện lỗi. Sau gián đoạn yêu cầu quay lại lần mới nếu không chứng minh được tính liên tục.

### 4.2. MediaRecorder và bộ đệm

1. Kiểm tra `getUserMedia`, codec qua `MediaRecorder.isTypeSupported`, camera và dung lượng trước ca.
2. Khởi tạo stream một lần; mỗi phiên dùng recorder và vùng đệm riêng. Không dừng camera mỗi lần đổi đơn.
3. Bắt đầu ghi khi đã cấp phiên hợp lệ, quét đủ hàng và khóa danh sách; chỉ báo “ĐANG QUAY” sau khi recorder thực sự hoạt động. Nhân viên bắt đầu thao tác sau tín hiệu này.
4. Nhận `dataavailable` theo chu kỳ ngắn, ví dụ 2–5 giây, lưu thứ tự chunk trong bộ đệm bền vững như IndexedDB/OPFS phù hợp với trình duyệt đã chọn.
5. Không giữ toàn bộ ca trong RAM. Chunk MediaRecorder không mặc nhiên là file độc lập phát được; giữ đúng thứ tự trong cùng phiên và tạo file cuối hợp lệ. Không tải từng Blob bất kỳ như các video riêng rồi giả định Cloudinary tự ghép.
6. Khi dừng phải đợi chunk cuối và sự kiện `stop` trước khi chốt manifest, kích thước, hash và đưa vào hàng đợi.
7. Theo dõi `track ended`, recorder error, camera mất kết nối, tab bị treo, đầy bộ nhớ và thời lượng quá giới hạn. Ngừng nhận đơn mới khi không bảo đảm bằng chứng.
8. Scan trước quay có `phase=PRE_RECORD`, thời gian server và `video_offset_ms=null`; không gán mốc giả trong video. Chỉ sự kiện thực sự xảy ra trong lúc quay mới có offset monotonic. Không tính thời lượng bằng số chunk vì `timeslice` không chính xác tuyệt đối.

Khởi điểm thử nghiệm: 720p hoặc 1080p, 15–24 fps, khoảng 1,5–3 Mbps, không âm thanh. Kiểm tra thực tế xem có đọc được chi tiết sản phẩm; không chọn chỉ dựa vào dung lượng.

**Giới hạn:** thao tác stop/start hai recorder không bảo đảm chuyển cảnh không mất frame. MVP cần báo rõ thời gian chuyển và không cho thao tác hàng trong khoảng này. Nếu yêu cầu không mất khung hình, cần một thiết kế recorder liên tục và cắt theo mốc được PoC riêng; thiết kế đó phức tạp hơn, cần giới hạn đoạn liên tục để không giữ cả ca trong một file rủi ro cao.

## 5. Máy trạng thái và chuyển đơn an toàn

Tách trạng thái nghiệp vụ khỏi trạng thái video.

| Đối tượng | Trạng thái gợi ý |
|---|---|
| Phiên đóng hàng | PREPARING, SCANNING, READY_TO_RECORD, RECORDING, COMPLETED_PENDING_VIDEO, FINAL, SUPERSEDED, REOPENED, INTERRUPTED, ABORTED |
| Video | BUFFERING, QUEUED, UPLOADING, VERIFYING, READY, FAILED, DELETING, DELETED |
| Đơn | Dùng trạng thái hệ thống hiện có; thêm điều kiện đủ hàng và bằng chứng thay vì thay toàn bộ quy trình |

### 5.1. Quy trình chuyển A → B theo luồng quét trước quay

1. Đưa các thao tác vào hàng xử lý tuần tự tại bàn; không chuyển hai lần song song.
2. QR A đang làm chỉ báo “đơn hiện tại”, không tự tạo lần đóng lại.
3. QR B chỉ được dùng để hoàn tất A khi A đang RECORDING và nhân viên đã niêm phong. Xác thực B và giữ lease trước; B không hợp lệ thì A tiếp tục quay.
4. Kiểm tra A đã có snapshot hàng được xác nhận và không có gián đoạn; chặn mọi thay đổi barcode trong quá trình quay.
5. Dừng recorder A, đợi chunk cuối/stop, lưu manifest bền vững, kết thúc nghiệp vụ A ở COMPLETED_PENDING_VIDEO, đưa video vào queue. A chưa là final chỉ vì recorder đã dừng.
6. Mở B ở SCANNING, hiện tiến độ barcode bằng 0. Bắt đầu quay B chỉ sau khi đủ hàng và đã đặt camera đúng góc. Không khởi động recorder B ngay khi quét QR B.
7. Nếu A còn SCANNING/READY_TO_RECORD khi quét B, không tự hoàn tất A; hiển thị thao tác tiếp tục hoặc hủy/tạm lưu có audit. Phiên tạm lưu vẫn tuân thủ lease, không giữ khóa vô hạn.
8. Worker tải A và yêu cầu chốt final theo điều kiện tại mục 5.3. Không tham chiếu biến UI `currentOrder`.
9. Nếu lỗi ở bất kỳ phase nào, hiển thị trạng thái thực và cho khôi phục; không báo B đang quay hoặc A final khi chưa đúng.

Camera, bộ đệm và backend không thuộc cùng một transaction; dùng transition ID, trạng thái bền vững và thao tác idempotent để phục hồi.

### 5.2. Định danh bất biến để tránh gắn nhầm video

Mỗi phiên có `session_id`, `order_id`, `station_id`, `operator_id`, `attempt_no`. Mỗi video/upload có `video_id`, `upload_attempt_id`, resource ID riêng. Callback recorder, tác vụ upload và webhook mang các ID này, không suy ra từ đơn đang mở. Một đơn có thể có nhiều phiên và nhiều video; không ghi đè bằng một trường `order.video_url` duy nhất.

Khóa đơn phía server bằng lease có heartbeat và fencing token/version. Unique constraint bảo đảm tối đa một phiên hoạt động theo phạm vi đã chọn. Client cũ hết lease không được tiếp tục ghi sự kiện vào phiên đã được bàn khác tiếp quản.

### 5.3. Nhiều lần đóng, một final và barcode lặp giữa các lần

**Mô hình:** lần đóng là một snapshot độc lập. Đơn có `current_attempt_id`, `packing_revision`, `final_session_id` nullable và `evidence_status`. Mỗi lần có `attempt_no`, `supersedes_session_id`, snapshot hàng, scan events và video riêng. Final không được tính bằng `MAX(attempt_no)`, thời gian upload hoặc webhook đến cuối.

1. Khi mở đóng lại, kiểm tra quyền, lý do và tình trạng vận chuyển. Đơn đã xuất/giao cần quy trình trả hàng/thu hồi riêng, không mở lại tùy tiện.
2. Transaction mở A2: tăng revision, tạo lần mới và đặt `current_attempt_id=A2`; vô hiệu final hiện hành bằng cách đặt `final_session_id=null`, `evidence_status=REPACK_REQUIRED`. Đặt lần final trước thành REOPENED/SUPERSEDED theo chính sách. Giữ tham chiếu final trước trong lịch sử và audit, không tiếp tục cung cấp như bằng chứng kiện hiện tại. Thu hồi phiên xem cũ hoặc kiểm tra lại revision mỗi request.
3. A2 bắt đầu số lượng 0, quét lại tất cả món; không copy số lượng của A1 thành hàng đã xác nhận. Có thể hiển thị A1 để đối chiếu nhưng không dùng làm kết quả A2.
4. Một serial xuất hiện ở A1 và A2 của **cùng đơn** là lịch sử hợp lệ. Constraint trong một lần là UNIQUE `(session_id, product_unit_id)` cho scan được chấp nhận; không UNIQUE serial trên toàn bộ scan history.
5. Tách `product_unit_allocations` quản lý quyền giữ món cho đơn khỏi scan history. Cùng serial vẫn thuộc đơn A khi đóng lại, không trừ tồn/allocate thêm. Đơn khác không được giữ cùng vật phẩm đang được allocate cho A. Dùng bản ghi allocation hiện hành duy nhất theo vật phẩm và transaction/version.
6. Với barcode SKU, đếm trong phạm vi `(session_id, order_item_id)`, không cộng A1 + A2. SKU giống nhau ở nhiều lần/đơn là bình thường; idempotency chỉ loại bản gửi lại cùng sự kiện.
7. Nếu A2 đổi serial X sang Y: giữ X cho A trong lúc đối soát, reserve Y nếu hợp lệ; khi commit thay thế thì reconcile X/Y bằng transaction và nghiệp vụ tồn kho. Chỉ giải phóng X sau khi xác nhận hàng quay lại tồn khả dụng, không tự giải phóng vì nhân viên không quét X ở lần mới.
8. Chốt final là thao tác server có điều kiện: attempt đúng `current_attempt_id`, revision khớp, hoàn tất quay không gián đoạn, snapshot còn hợp lệ, đủ hàng/serial, video READY và đối soát tồn hợp lệ. Cập nhật `final_session_id` và trạng thái trong transaction/CAS; UNIQUE/ràng buộc bảo đảm một final hiện hành.
9. Ví dụ A1 đang upload, A2 đã được mở: webhook A1 về chỉ được đánh video A1 READY, **không được chốt A1 final**. Upload A2 retry không tự mở A3; chỉ thao tác đóng lại chủ động mới tạo attempt mới.
10. A2 lỗi/hủy: không tự phục hồi final A1 vì kiện có thể đã mở. Chặn xuất kho và báo thiếu bằng chứng; quay A3 hoặc quản lý xác minh và xử lý theo quy trình có audit.

Khách và luồng xuất kho chỉ đọc `final_session_id` hiện hành với evidence READY. “Chỉ lấy final” là quy tắc sử dụng; không cần xóa ngay mọi dấu vết cũ. Video lần cũ chỉ nội bộ theo quyền và có thể xóa sau khoảng phục hồi ngắn theo chính sách, giữ metadata/audit tối thiểu; không xóa bản cũ trước khi bảo đảm không có khiếu nại/legal hold.

### 5.4. Ví dụ barcode đóng lại

| Tình huống | Kết quả |
|---|---|
| A1 quét serial X; A2 cùng đơn quét lại X | Chấp nhận một lần trong A2, không tăng allocation/tồn lần hai |
| A2 quét X lần hai | Báo đã quét trong lần này; retry cùng event trả kết quả trước |
| B1 đơn khác quét X khi X đang thuộc A | Chặn xung đột allocation |
| A1 SKU P số lượng 2; A2 SKU P số lượng 2 | Final A2 có 2 món, không thành 4 |
| A1 upload về sau A2 đã final | Chỉ cập nhật video lịch sử, không thay final A2 |
| A2 quay lỗi khi đóng lại | Không có final hiện hành, không xuất kho bằng A1 |

## 6. Quét barcode và đối soát sản phẩm

### 6.1. SKU khác với serial

- EAN/UPC hoặc barcode SKU thường dùng chung cho nhiều sản phẩm cùng loại. Quét 3 lần chỉ chứng minh 3 sự kiện quét, không chứng minh có 3 vật phẩm khác nhau.
- Nếu cần định danh từng món: dùng serial/IMEI hoặc tem mã riêng từng đơn vị tồn kho; kiểm tra serial tồn tại, đúng SKU, đúng kho, chưa gắn cho đơn khác.
- Với hàng chỉ có SKU: lưu `scan_event_id` và tăng số lượng; ghi rõ mức chứng cứ này. Không tạo “serial giả” từ barcode SKU.
- Nếu mã GS1 có cả GTIN, serial, lot hoặc hạn dùng, cần parser và quy tắc dữ liệu phù hợp trước khi đưa vào đối soát.

### 6.2. Xử lý một lần quét

1. Nhận chuỗi từ scanner với prefix/suffix được cấu hình; validate định dạng và giới hạn độ dài.
2. Xác định đây là QR đơn hay mã hàng. Khóa UI để dữ liệu không rơi vào ô ghi chú đang focus.
3. Gửi `session_id`, `client_event_id`, sequence, `phase=PRE_RECORD`, `video_offset_ms=null` và thời gian lên backend.
4. Trong transaction: kiểm tra phiên đang hợp lệ, SKU thuộc snapshot đơn, số lượng chưa vượt và serial chưa quét trong lần hiện tại và allocation không xung đột với đơn khác; cho phép lịch sử cùng đơn có serial này ở lần cũ. Trả accepted/rejected cùng số lượng đã xác nhận.
5. UI chỉ tăng số lượng chính thức khi server chấp nhận; báo âm thanh/màu khác nhau cho thành công và lỗi.
6. Retry dùng cùng event ID để không cộng hai lần. Chống máy quét phát lặp bằng khoảng chống dội ngắn đã thử nghiệm, tránh gộp nhầm hai món cùng SKU được quét hợp lệ liên tiếp.
7. Sửa quét bằng sự kiện đảo/correction có người thực hiện và lý do, không xóa lịch sử.

Các lần quét trước quay được hiển thị trong timeline chuẩn bị, không có seek tới frame video tương ứng; bản thân quét barcode không chứng minh vật phẩm thật đã nằm trong thùng. Cần bố trí camera và thao tác chuẩn để thấy quá trình đưa hàng vào kiện và niêm phong.

## 7. Kiến trúc thành phần

| Thành phần | Trách nhiệm |
|---|---|
| Màn hình bàn đóng hàng | Camera, quét, UI, state machine, bộ đệm và hàng đợi bền vững |
| Backend nghiệp vụ | Xác thực, phân quyền, QR, khóa phiên, đối soát và giao dịch dữ liệu |
| Database | Snapshot đơn, phiên, scan events, manifest, video metadata, audit |
| Vùng staging riêng tư | Nhận file từ bàn kho, giữ tạm để retry và kiểm tra; có TTL và dọn rác |
| Queue + worker | Xác minh media, tải Cloudinary, retry, đối soát và xóa theo hạn |
| Cloudinary | Lưu và phân phối video theo cấu hình truy cập đã chọn |
| Dịch vụ xem video | Kiểm tra quyền theo đơn, cấp phiên xem hoặc proxy stream |
| Giám sát | Cảnh báo camera, upload backlog, file thiếu, truy cập bất thường |

**Khuyến nghị cho MVP ưu tiên kiểm soát:** client gửi file vào staging riêng tư qua upload có thể tiếp tục; worker dùng credential server tải Cloudinary. Đổi lại có thêm lưu trữ tạm và băng thông.

Phương án khác là client tải trực tiếp Cloudinary bằng chữ ký server. Chỉ chọn sau PoC về chính sách ký, kiểm tra nội dung, retry và khôi phục khi mất phản hồi. Dù chọn phương án nào, server phải xác minh resource trước khi gắn với đơn.

## 8. Luồng upload và xác minh Cloudinary

1. Tạo `video_id` và khóa upload dự kiến từ phiên trên server. Chọn `resource_type=video`, `type=authenticated`, không cho ghi đè video cũ; tên tài nguyên không có thông tin khách.
2. Client hoàn tất file đúng thứ tự, lưu manifest, SHA-256, thời điểm và số byte; chuyển QUEUED. Hash client hỗ trợ phát hiện lỗi truyền, chưa phải bằng chứng chống nhân viên giả mạo.
3. Upload staging theo giao thức resumable được chọn; endpoint giới hạn kích thước, thời lượng, định dạng và quyền phiên. Không dùng tên file hay MIME do client khai làm kiểm tra duy nhất.
4. Worker xác minh file media, tính hash phía server và ghi metadata. Nếu cần chuyển mã, giữ hash và file gốc riêng với bản chuyển mã.
5. Worker upload Cloudinary theo SDK/API hiện hành; file lớn dùng cơ chế chunked phù hợp. Chunk upload theo giao thức Cloudinary khác với chunk MediaRecorder. Chỉ kết luận xong khi có kết quả cuối cùng, không phải khi một chunk thành công.
6. Nếu timeout sau khi gửi, đối soát tài nguyên dự kiến trước khi tạo upload khác. Retry có exponential backoff/jitter, giới hạn lần thử và hàng lỗi cần xử lý.
7. Backend xác minh kết quả hoặc webhook bằng SDK, chữ ký và thời gian; kiểm tra tài nguyên thuộc upload attempt dự kiến, loại delivery, bytes, định dạng và trạng thái xử lý. Chặn replay và xử lý webhook lặp/out-of-order.
8. Chỉ chuyển video READY khi file đã tồn tại và các bản cần phát đã sẵn sàng. READY không tự thay final; kiểm tra current attempt/revision theo mục 5.3 trước khi chốt final. Lưu `asset_id`, `public_id`, `version`, `resource_type`, `delivery_type`, duration, bytes, format và timestamps.
9. `secure_url` nếu lưu chỉ là metadata nội bộ; HTTPS không đồng nghĩa có kiểm soát truy cập. Không trả URL upload response trực tiếp cho khách.
10. Xóa bộ đệm và staging sau khi xác minh thành công theo TTL ngắn, có xử lý dữ liệu lỗi cần phục hồi. Job đối soát tìm video mồ côi, upload thiếu, tài nguyên trùng và trạng thái treo.

## 9. Bảo mật video — yêu cầu bắt buộc

### 9.1. Truy cập Cloudinary

- Không dùng delivery type `upload` công khai cho bằng chứng đóng hàng.
- Ưu tiên `authenticated` để bảo vệ cả bản gốc và bản biến đổi. Cloudinary `private` bảo vệ bản gốc nhưng các bản biến đổi có thể công khai; cần thử truy cập thực tế trước khi dùng.
- **Signed delivery URL không mặc nhiên hết hạn.** Không gắn thêm trường `expires_at` tùy ý rồi cho rằng Cloudinary sẽ thực thi.
- Hai hướng: (A) token-based access có thời hạn nếu gói/cấu hình Cloudinary hỗ trợ và đã kiểm thử; (B) backend proxy stream sau xác thực, không redirect làm lộ URL nguồn lâu dài. Proxy phải hỗ trợ HTTP Range, kiểm tra quyền ở các request mới và không cache công khai.
- `private_download_url` là một khả năng tải có thời hạn được tài liệu mô tả; không mặc nhiên dùng thay cho streaming HLS/MP4. Xác minh tương thích với delivery type và player trong PoC.
- Với HLS/DASH, bảo vệ playlist, segments, thumbnail, preview và mọi rendition; chỉ bảo vệ URL playlist là chưa đủ.
- Kiểm tra strict transformations/allowlist để hạn chế tạo bản ngoài chính sách. Không coi CORS hoặc URL khó đoán là phân quyền.

### 9.2. Cấp quyền xem qua hệ thống

1. Người xem đăng nhập hoặc dùng link ứng dụng có token ngẫu nhiên thời hạn ngắn theo đơn đã xác minh. Không xác minh chỉ bằng mã đơn hoặc số điện thoại dễ đoán.
2. Backend kiểm tra tenant, chủ sở hữu đơn hoặc vai trò CSKH/quản lý và mục đích truy cập.
3. Tạo phiên xem ngắn, ví dụ 5–15 phút, gắn `video_id`, người xem, scope và hạn dùng. Đây là TTL ứng dụng; quyền tại Cloudinary cũng phải được thực thi bằng token được hỗ trợ hoặc proxy.
4. Ghi audit ai xem/tải/chia sẻ, khi nào và lý do. Có cơ chế thu hồi phiên xem; link đã cấp cần được xét cùng hành vi cache, không hứa thu hồi tức thì mọi byte đã tải.
5. Tùy nhu cầu có bản dành cho khách đã che thông tin và watermark mã đơn/người xem. Giữ bản gốc riêng tư, không ghi đè.

Không thể ngăn tuyệt đối người đã xem hợp lệ quay màn hình hoặc sao chép. Ẩn nút download và watermark chỉ hỗ trợ giảm rủi ro/truy vết, không phải bảo vệ tuyệt đối.

### 9.3. Bí mật, API và thiết bị

- API secret Cloudinary chỉ nằm ở backend/secret manager; không đặt trong frontend, mã QR, log, repository hoặc cấu hình công khai. API key/cloud name không thay thế secret.
- MVP upload qua worker giảm việc phát chữ ký cho client. Nếu upload trực tiếp, server chỉ ký tập tham số allowlist đã gắn upload attempt, không ký JSON tùy ý từ client. Không mặc định chữ ký upload là token dùng một lần; chặn replay ở nghiệp vụ, đặt ID cố định và quota.
- RBAC: nhân viên tạo phiên và quét tại kho được cấp; CSKH xem theo đơn; quản lý xử lý ngoại lệ; quyền xóa/cấu hình tách riêng. Kiểm tra quyền ở từng resource để chặn IDOR.
- HTTPS/TLS; chống CSRF nếu dùng cookie; rate limit các endpoint QR, upload và xem; validate input, CSP và giảm script bên thứ ba trên màn hình quay.
- Không log token QR đầy đủ, URL ký, token xem hoặc dữ liệu cá nhân không cần thiết. Hạn chế quyền tài khoản Cloudinary, bật bảo vệ quản trị và luân chuyển secret.
- Máy kho dùng tài khoản quản lý, khóa màn hình, mã hóa ổ đĩa, không cho người dùng khác truy cập profile/bộ đệm. IndexedDB không tự tạo bảo mật khỏi người có quyền máy hoặc XSS.
- Nếu cần mã hóa bộ đệm ứng dụng, thiết kế quản lý khóa và khôi phục rõ ràng; khóa lưu cạnh file không bảo vệ khỏi mọi tấn công. Không xóa cache trước khi upload đã xác minh.

### 9.4. Tính toàn vẹn và thời hạn lưu

Lưu hash file gốc do server tính, timeline quét append-only, thời gian server, nhân viên, bàn, các gián đoạn và mọi thao tác đóng lại. Hash chứng minh file có thay đổi so với bản đã nhận hay không; không chứng minh cảnh quay là thật hoặc không bị sửa trước khi gửi. Nếu có yêu cầu chứng cứ cao hơn, cân nhắc thiết bị được quản lý, ingest trực tiếp và kho gốc bất biến bên cạnh Cloudinary.

Thiết lập `retention_until`, legal hold khi đang có khiếu nại và quyền duyệt xóa. Job xóa xử lý bản gốc, renditions, staging, cache và backup theo khả năng/cấu hình nhà cung cấp; ghi kết quả và retry lỗi, giữ tombstone không chứa nội dung. Không cam kết xóa ngay bản đã được người xem tải xuống. Thông báo việc ghi hình cho nhân viên, giảm thu thập dữ liệu ngoài mục đích; rà soát yêu cầu bảo vệ dữ liệu và chuyển dữ liệu theo bối cảnh triển khai trước production.

## 10. Khung dữ liệu

| Bảng | Trường chính và ràng buộc |
|---|---|
| `order_qr_tokens` | id, tenant_id, order_id, token_hash UNIQUE, version, revoked_at; một mã hoạt động/đơn |
| `packing_stations` | id, warehouse_id, device_id, status, last_seen_at |
| `packing_sessions` | id, order_id, attempt_no UNIQUE theo đơn, supersedes_session_id, packing_revision, package_id nếu có, operator_id, station_id, state, order_version, lease_version, recording_health, scan_started_at, recording_started_at, ended_at, interrupted_reason |
| `order_packing_state` | order_id UNIQUE, current_attempt_id, packing_revision, final_session_id nullable, evidence_status, version |
| `product_unit_allocations` | product_unit_id UNIQUE cho allocation hiện hành, order_id, allocation_version, state; tách khỏi lịch sử các lần quét |
| `packing_session_items` | session_id, order_item_id, sku_id, snapshot_qty, accepted_qty, snapshot dữ liệu cần thiết |
| `packing_scan_events` | id, session_id, client_event_id UNIQUE trong phạm vi thiết bị/tenant, sequence, barcode, sku_id, serial_id nullable, result, rejection_reason, phase, video_offset_ms nullable, client_time, server_time |
| `product_units` | id, sku_id, serial UNIQUE theo quy tắc hãng/tenant, warehouse_id, assignment; chỉ cần nếu có serial |
| `packing_videos` | id, session_id, state, asset_id UNIQUE, public_id, version, delivery_type, format, duration, bytes, original_sha256, retention_until, ready_at |
| `video_upload_attempts` | id, video_id, expected_resource_id, state, retry_count, verified_at, error_code |
| `packing_transitions` | idempotency_key, station_id, from_session, to_session, phase, recovery_info |
| `video_access_sessions` | id/token_hash, video_id, viewer_id, scope, expires_at, revoked_at |
| `audit_logs` | actor, action, resource, reason, timestamp, request_id; hạn chế chỉnh sửa |

Các bảng đều cần phạm vi tenant/kho phù hợp. Việc giữ khóa đơn, cập nhật số lượng và gán serial phải thực hiện an toàn trong transaction. Không chỉ kiểm tra tại frontend. Thêm outbox hoặc cơ chế giao nhận bền vững khi transaction DB phát tác vụ sang queue.

## 11. Khung API

| API minh họa | Hành vi |
|---|---|
| `POST /orders/{id}/packing-qr` | Tạo/lấy mã đang hiệu lực, kiểm tra quyền in |
| `POST /packing/resolve-qr` | Resolve QR trong phiên đăng nhập; trả thông tin tối thiểu |
| `POST /packing/sessions/prepare` | Kiểm tra đơn, giữ khóa, tạo PREPARING |
| `POST /packing/sessions/{id}/start-recording` | Kiểm tra đủ scan, khóa snapshot, cấp quyền bắt đầu quay theo version |
| `POST /packing/sessions/{id}/recording-started` | Xác nhận recorder thực sự start; nếu recorder lỗi thì hủy trạng thái khởi động có kiểm soát |
| `POST /orders/{id}/repack` | Mở attempt mới, tăng revision, vô hiệu final hiện hành, giữ lịch sử và allocation |
| `POST /packing/sessions/{id}/finalize` | Thao tác server kiểm tra READY + current attempt/revision, commit final idempotent |
| `POST /packing/sessions/{id}/scans` | Ghi sự kiện idempotent, đối soát trong transaction |
| `POST /packing/transitions` | Điều phối chuyển phiên theo các phase; có API truy vấn/khôi phục |
| `POST /packing/sessions/{id}/finish` | Chốt đơn cuối/ngoại lệ; không đồng nghĩa video READY |
| `POST /packing/sessions/{id}/heartbeat` | Gia hạn lease có kiểm tra version |
| `POST /packing/videos/{id}/uploads` | Tạo tác vụ upload gắn đúng phiên |
| `POST /packing/videos/{id}/uploads/{attempt}/complete` | Yêu cầu xác minh; client không tự đặt READY |
| `POST /integrations/cloudinary/webhook` | Xác minh chữ ký, idempotency và correlation |
| `GET /orders/{id}/packing-evidence` | Mặc định chỉ final hiện hành; lịch sử qua scope nội bộ riêng |
| `POST /packing/videos/{id}/view-sessions` | Tạo quyền xem ngắn hạn |
| `GET /video-view/{token}` | Xác thực phiên xem, token delivery hoặc proxy có Range |

Mutation cần idempotency key, optimistic version/fencing token khi phù hợp và mã lỗi ổn định như `ORDER_LOCKED`, `ITEM_NOT_IN_ORDER`, `QTY_EXCEEDED`, `SERIAL_ALREADY_ASSIGNED`, `VIDEO_NOT_READY`.

## 12. Các tình huống lỗi phải thiết kế trước

| Tình huống | Hành vi mong đợi |
|---|---|
| Quét lại QR đang quay | Báo trùng, không tách video |
| QR kế tiếp sai / không có quyền / bị khóa | Giữ A quay; báo lý do |
| A còn thiếu / chưa quay / có pending scan | Không cho hoàn tất; hủy hoặc tạm lưu phải là thao tác rõ ràng |
| Quét hàng khi đang chuyển đơn | Chặn rõ ràng, không gán tự động sang A hay B |
| Hai bàn cùng nhận một đơn | Server chỉ cấp một lease hợp lệ |
| Camera lỗi / stream ended | Cảnh báo, ngừng thao tác hàng, đánh dấu gián đoạn |
| Mất mạng | Lưu bền vững phiên hiện tại; không mở đơn mới chưa xác thực; hiển thị scan chưa xác nhận |
| Upload A chậm, B đang quay | A tiếp tục retry nền; mọi tác vụ giữ ID của A |
| Upload thành công nhưng mất response | Đối soát resource dự kiến, không tạo video mới tùy tiện |
| Webhook lặp hoặc đến trễ | Xử lý idempotent, không ghi lùi trạng thái READY |
| Tab đóng / máy khởi động lại | Phục hồi hàng đợi đã lưu; file quay dở có thể không phát được, đánh dấu thiếu bằng chứng và cần xử lý |
| Bộ nhớ đệm gần đầy | Dừng nhận đơn mới trước ngưỡng; không xóa video chưa xác minh |
| Không còn đơn kế tiếp | Nút kết thúc đơn/ca, chờ flush rồi báo rõ trạng thái upload |
| Đơn đổi sản phẩm giữa phiên | Kiểm tra version, đóng băng hoàn tất và đối soát lại |

Không dựa vào `beforeunload` hoặc upload lúc đóng tab để bảo đảm dữ liệu. Thiết kế web không bảo đảm không mất dữ liệu khi mất điện hoặc hệ điều hành thu hồi trang; phải đo khả năng khôi phục trên máy thật và đánh dấu thiếu bằng chứng thay vì tự chốt final.

## 13. Kế hoạch build trực tiếp trong dự án — thực hiện lần lượt

Phần này là chỉ dẫn triển khai cho lập trình viên/Codex khi đưa tài liệu vào repository. Phải đọc cùng các quy tắc nghiệp vụ và bảo mật ở các mục trên. Thực hiện một bước, xác minh đạt đầu ra rồi mới sang bước tiếp theo. Không coi tài liệu này là yêu cầu thay toàn bộ stack hoặc xây một website riêng.

### Bước 01 — Khảo sát repository và lập bản đồ tích hợp

**Công việc**
- Đọc AGENTS.md nếu có, README, cấu hình package, cấu trúc frontend/backend và các script chạy/kiểm thử.
- Xác định framework, cách routing, UI components, responsive, auth/RBAC, tenant/kho, API, database/ORM, quản lý tồn, storage và queue đang dùng.
- Đọc model đơn hàng/sản phẩm/barcode/serial; tìm nơi cập nhật trạng thái xuất kho và nơi hiện chi tiết đơn.
- Liệt kê đường dẫn file/module dự kiến sửa theo cấu trúc thực tế; không bịa tên thư mục hoặc tự chọn framework mới.
- Kiểm tra có tích hợp Cloudinary chưa; chỉ đọc tên biến môi trường cần dùng, không in giá trị secret.
- Nếu quy tắc nghiệp vụ trong code khác tài liệu, ghi rõ khác biệt và giải quyết trước khi sửa luồng xuất kho.

**Hoàn thành khi:** có bản đồ tích hợp, lệnh chạy dự án, cách kiểm thử, loại barcode thực tế và danh sách thay đổi. Chỉ hỏi khi thiếu thông tin bắt buộc không suy ra được từ code.

### Bước 02 — Tạo khung module và kiểm chứng camera trên web

**Công việc**
- Tạo route màn hình đóng hàng trong hệ thống hiện có, đặt sau đăng nhập và quyền kho; bổ sung navigation theo quy ước dự án.
- Tạo CameraController dùng chung, preview và các mode quét/quay; xử lý cấp/từ chối quyền, chọn camera và giải phóng stream khi rời màn hình.
- Tích hợp adapter giải mã QR/barcode: feature detection và decoder dự phòng; kiểm tra đúng format mã của kho.
- Ghi thử một đoạn bằng MediaRecorder, nhận chunk cuối và phát lại. Chọn MIME theo runtime, không hardcode chỉ WebM hoặc chỉ MP4.
- Bổ sung màn hình báo thiết bị không hỗ trợ, lỗi quyền hoặc thiếu camera; không hiển thị thành công giả.
- Kiểm thử desktop và ít nhất một thiết bị mobile/iPad thực tế. Nếu chưa có thiết bị, ghi rõ phần chưa xác minh.

**Hoàn thành khi:** quét được QR/barcode và quay/phát lại ngay trong web; chưa cần tích hợp nghiệp vụ hoàn chỉnh hoặc upload production.

### Bước 03 — Bổ sung schema và migration

**Công việc**
- Triển khai các thực thể ở mục 10 theo database đang có: trạng thái đóng của đơn, lần đóng, snapshot hàng, sự kiện quét, allocation serial, video, upload attempt, transition và audit.
- Bổ sung current_attempt_id, packing_revision và final_session_id; không dùng một video_url làm nguồn sự thật.
- Tạo index/constraint cho mã QR, attempt_no theo đơn, event idempotency, một phiên hoạt động và một allocation hiện hành theo vật phẩm.
- Không đặt UNIQUE serial trên toàn bộ scan history. Chỉ chặn trùng serial được chấp nhận trong cùng lần đóng và allocation xung đột giữa đơn.
- Chọn transaction/CAS theo database thực tế. Nếu dùng MongoDB, xác minh môi trường hỗ trợ transaction và dùng index/partial index phù hợp; không chuyển SQL trong tài liệu thành lệnh MongoDB máy móc.
- Tạo migration theo quy trình repository, tương thích dữ liệu đơn cũ. Không tự áp dụng migration phá dữ liệu lên production.

**Hoàn thành khi:** schema áp dụng được ở môi trường phát triển và các ràng buộc được kiểm tra bằng dữ liệu hai lần đóng của cùng đơn.

### Bước 04 — API QR và mở lần đóng

**Công việc**
- Tạo/lấy QR đơn từ token ngẫu nhiên, không đưa PII vào QR; bổ sung vị trí hiển thị/in QR ở chi tiết đơn.
- Làm API resolve QR và prepare attempt theo mục 11; kiểm tra auth, tenant, kho, trạng thái đơn và quyền thao tác.
- Thực hiện lease, heartbeat và fencing version; xử lý hai thiết bị nhận cùng đơn.
- Quét lại QR đang làm chỉ trả phiên hiện tại, không tự mở lần mới. Đóng lại phải qua hành động riêng.
- Trả snapshot đơn và số lượng của chính attempt, không cộng dữ liệu lịch sử.

**Hoàn thành khi:** quét QR mở đúng đơn ở SCANNING; QR sai/không có quyền bị chặn và hai bàn không cùng giữ phiên hợp lệ.

### Bước 05 — Backend đối soát barcode và allocation

**Công việc**
- Triển khai API scans có client_event_id, session_id, sequence, phase PRE_RECORD và video_offset_ms null.
- Đối soát SKU/biến thể/số lượng/serial với snapshot; không sửa danh sách khách đặt chỉ vì quét thêm mã.
- Dùng transaction để tăng số lượng, ghi event và giữ allocation; cùng event gửi lại không cộng lần hai.
- Cho phép cùng serial được quét trong lần đóng mới của cùng đơn mà không tạo allocation hay trừ tồn lần nữa.
- Chặn serial thuộc đơn khác; triển khai correction có lý do và quy trình thay serial theo mục 5.3.
- Chỉ chuyển READY_TO_RECORD sau khi mọi scan được backend xác nhận.

**Hoàn thành khi:** kiểm tra được đúng/sai SKU, vượt số lượng, retry, serial trùng trong lần hiện tại, serial lặp giữa các lần cùng đơn và serial xung đột đơn khác.

### Bước 06 — Hoàn thiện UI quét hàng responsive

**Công việc**
- Hiển thị thông tin đơn tối thiểu, danh sách hàng, tiến độ, trạng thái kết nối và lỗi rõ ràng.
- Kết nối API QR/scans, chỉ cập nhật số lượng chính thức sau phản hồi chấp nhận.
- Chống đọc lặp mã đứng yên; hỗ trợ đưa món tiếp theo cùng SKU vào quét mà không bị gộp sai.
- Chỉ bật nút Bắt đầu quay khi đủ hàng, không có request pending và camera sẵn sàng.
- Bố cục desktop có thể chia panel; mobile/iPad ưu tiên preview, tiến độ và nút thao tác đủ lớn.
- Không để chuỗi scanner tùy chọn nhập nhầm vào ô ghi chú; tất cả thao tác vẫn nằm trong website.

**Hoàn thành khi:** hoàn thành được QR → quét đủ hàng trên desktop/mobile, phản hồi UI khớp dữ liệu server.

### Bước 07 — Ghi video, khóa snapshot và kết thúc lần đóng

**Công việc**
- Làm API start-recording để xác nhận điều kiện, version và khóa snapshot; UI start recorder và xác nhận recording-started.
- Nếu recorder không start được, xử lý trạng thái khởi động lỗi; không hiển thị ĐANG QUAY.
- Tắt decoder mã hàng, hướng dẫn đặt camera vào bàn, quay toàn bộ thao tác cho hàng vào kiện và niêm phong.
- Lưu các chunk theo thứ tự và manifest riêng cho từng session_id/video_id; giới hạn bộ đệm và dung lượng.
- Theo dõi visibility/track/error, đánh dấu gián đoạn cần xử lý; không tiếp tục như thể video liên tục.
- Nút Hoàn tất phải flush chunk cuối và đợi stop trước khi đưa video vào queue.
- Muốn thay sản phẩm sau khi quay phải dừng/hủy và tạo lần đóng mới, không sửa snapshot âm thầm.

**Hoàn thành khi:** video phát lại được, thuộc đúng attempt, UI và backend đồng bộ trạng thái; lỗi camera không được hoàn tất như phiên hợp lệ.

### Bước 08 — Chuyển đơn và hàng đợi cục bộ

**Công việc**
- Triển khai transition tuần tự A → B theo mục 5.1, khóa thao tác cạnh tranh và xử lý retry.
- Nút Hoàn tất là luồng luôn có; hỗ trợ quét QR B trên stream hiện có khi đang quay nếu PoC hiệu năng đạt.
- QR B hợp lệ kết thúc A và mở B ở SCANNING; không tự quay B.
- QR sai không ngắt A; QR A không tách video; đang quét hàng A thì QR B không tự coi A hoàn tất.
- Mỗi upload callback giữ session_id/video_id bất biến; không lấy currentOrder từ UI.
- Phục hồi hàng đợi đã lưu khi mở lại trang, báo file quay dở không hợp lệ; không hứa khôi phục được mọi gián đoạn.

**Hoàn thành khi:** chạy A → B → C và đơn cuối, không lẫn video hoặc barcode giữa các đơn; có trạng thái rõ khi lỗi ở từng phase.

### Bước 09 — Pipeline upload riêng tư tới Cloudinary

**Công việc**
- Dùng hạ tầng staging/queue hiện có nếu phù hợp; tạo worker tải Cloudinary bằng secret phía server.
- Thêm cấu hình môi trường qua cơ chế repository và .env.example chỉ có placeholder; không commit credentials.
- Triển khai upload attempt, kiểm tra file, hash phía server, retry/backoff và đối soát khi mất response.
- Upload resource_type video, type authenticated, tên tài nguyên không có PII, không ghi đè attempt cũ.
- Xác minh kết quả/webhook bằng SDK/API hiện hành; xử lý lặp/out-of-order và liên kết theo ID server đã cấp.
- Chỉ đánh video READY khi đã xác minh xong; chưa chốt final bằng payload client hoặc webhook đơn thuần.
- Giới hạn upload đồng thời, quota bộ đệm và trạng thái backlog; không xóa local trước khi xác minh.

**Hoàn thành khi:** A upload nền trong lúc B xử lý; retry không tạo nhầm tài nguyên và video không truy cập công khai.

### Bước 10 — Chốt final và triển khai đóng lại

**Công việc**
- Tạo hàm nghiệp vụ dùng chung tryFinalizeAttempt với transaction/CAS và idempotency.
- Kiểm tra current_attempt_id/revision, đủ hàng, video READY, không gián đoạn chưa giải quyết và allocation hợp lệ.
- Chỉ cập nhật final_session_id khi mọi điều kiện đạt; bổ sung điều kiện này vào cổng xuất kho thực tế của dự án.
- Làm hành động Đóng lại có quyền/lý do; tăng revision, vô hiệu final cũ, tạo attempt mới có tiến độ 0.
- Khi attempt mới lỗi/hủy, không tự khôi phục final cũ.
- Callback video cũ chỉ cập nhật tài nguyên lịch sử; không được thay final hiện hành.
- Không tự xóa video cũ ngay khi repack; dùng chính sách retention và audit đã thiết kế.

**Hoàn thành khi:** đóng lại với cùng serial không lỗi hoặc trừ tồn hai lần; chỉ final hiện hành được dùng cho khách/xuất kho; race webhook cũ bị chặn.

### Bước 11 — Tra cứu và xem video theo quyền

**Công việc**
- Bổ sung mục Bằng chứng đóng hàng ở chi tiết đơn, mặc định đọc final_session_id hiện hành.
- Lịch sử attempt chỉ dành cho quyền nội bộ; không trả toàn bộ lịch sử cho khách.
- Triển khai view session và phương án proxy có Range hoặc token delivery thực sự có hạn dùng đã PoC.
- Kiểm tra quyền theo tenant/đơn/người xem và revision ở backend; thu hồi quyền cũ khi repack.
- Bảo vệ cả original/renditions/thumbnail/segments; không gửi URL nguồn lâu dài hoặc secret cho client.
- Ghi audit xem/tải; không ghi token/URL có chữ ký vào log và analytics.

**Hoàn thành khi:** người được phép xem được đúng final; sửa ID, link hết hạn, link đã thu hồi và truy cập nguồn không phép bị chặn.

### Bước 12 — Vận hành, kiểm thử tích hợp và bàn giao

**Công việc**
- Thêm job reconciliation, dọn staging/local, retention và legal hold; có retry và audit xóa.
- Dashboard cho phiên gián đoạn, video thiếu, upload lỗi, backlog và bộ đệm gần đầy.
- Viết kiểm thử nghiệp vụ có giá trị: allocation qua nhiều lần đóng, idempotency, hai bàn, final CAS và webhook cũ.
- Kiểm thử tích hợp vòng lặp QR → barcode → quay → upload → final → đóng lại; kiểm tra mất mạng, reload, camera lỗi và trạng thái chưa READY.
- Chạy kiểm tra auth/IDOR, bảo vệ tài nguyên video và kiểm thử thiết bị theo mục 4.1; không đánh dấu đã test nếu chỉ giả lập viewport.
- Chạy lint/typecheck/build/test theo repository; cập nhật README hướng dẫn cấu hình, chạy worker và xử lý sự cố.
- Báo rõ phần hoàn tất, phần chưa kiểm chứng trên thiết bị thật và cấu hình còn thiếu. Không tự công khai website/video hoặc thay đổi production nếu chưa nằm trong phạm vi được giao.

**Hoàn thành khi:** các tiêu chí mục 14 đạt, build chạy được, có hướng dẫn vận hành và pilot tại một bàn trước rollout.

### Quy tắc áp dụng xuyên suốt khi Codex thực hiện

- Tận dụng stack và UI của dự án; không tạo một demo độc lập thay chức năng tích hợp.
- Có thể dùng mock tối thiểu ở PoC, nhưng luồng hoàn chỉnh phải nối backend/database thật ở môi trường phát triển; không báo xong với dữ liệu giả.
- Dữ liệu final, số lượng và allocation do backend quyết định; frontend chỉ hiển thị kết quả được xác nhận.
- Không ghi đè lịch sử, bỏ qua quyền hoặc làm video public để giải quyết nhanh lỗi.
- Với thay đổi nguồn chỉ trong repository đã sync git, giữ trong repository; không tải mã nguồn/secret dự án lên nơi khác.
- Sau mỗi bước, ghi lại file/module đã sửa, kết quả xác minh và việc còn thiếu; chỉ chuyển bước khi dependency trước đã đạt.


## 14. Checklist nghiệm thu

- [ ] QR duy nhất trong database, không chứa PII, mã đã thu hồi không còn dùng được.
- [ ] Quét A mở SCANNING, chưa quay; chỉ đủ hàng mới bắt đầu quay và lỗi recorder không báo thành công.
- [ ] Sai SKU, vượt số lượng, serial trùng trong cùng lần hoặc thuộc đơn khác bị chặn; cùng serial ở lần đóng lại cùng đơn được chấp nhận đúng một lần.
- [ ] Quét lại A không dừng video; QR B không hợp lệ không làm A dừng.
- [ ] Chuyển A → B đúng phiên trong cả callback chậm; có tín hiệu ngừng thao tác trong khoảng chuyển.
- [ ] B quét hàng rồi quay được khi A upload; QR B không tự quay; đóng đơn cuối không cần QR tiếp theo.
- [ ] A2 mở làm vô hiệu final A1; webhook A1 về muộn không lấy lại final; A2 lỗi không tự dùng A1.
- [ ] Barcode cùng đơn qua hai lần không cộng số lượng hoặc trừ tồn hai lần; thay serial phải reconcile.
- [ ] Camera decode một mã đứng yên không cộng liên tục; đưa món tiếp theo cùng SKU vẫn quét được.
- [ ] Windows/macOS/iPad/iPhone/Android qua ma trận máy thực; kiểm tra codec, camera, xoay máy, cuộc gọi, khóa màn hình, nền và bộ đệm.
- [ ] Hai bàn không đóng cùng một phiên hợp lệ; client hết lease không sửa được dữ liệu.
- [ ] File lỗi, thiếu chunk hoặc chưa được xác minh không được đánh READY.
- [ ] Mất mạng/response và webhook lặp không làm gắn nhầm hoặc nhân đôi video.
- [ ] Không đọc được video đơn khác bằng sửa ID, đoán mã đơn hoặc dùng QR kho.
- [ ] Truy cập không phép vào original, transformed video, thumbnail và segments đều bị chặn.
- [ ] Cơ chế hết hạn thực sự có hiệu lực tại nơi phân phối; không chỉ hết hạn ở frontend.
- [ ] Secret, URL nguồn lâu dài và token không xuất hiện trong bundle/log/analytics.
- [ ] Thử xóa theo retention và legal hold; ghi nhận giới hạn backup/cache.
- [ ] Có dashboard phiên bị gián đoạn, upload backlog, video thiếu và hướng dẫn phục hồi.

## 15. Ước lượng tài nguyên và vận hành

Công thức gần đúng, chưa bao gồm overhead: `MB/video = bitrate Mbps × thời lượng giây / 8`.

Ví dụ 2 Mbps × 180 giây ≈ 45 MB/đơn. Với 1.000 đơn/ngày: khoảng 45 GB/ngày, 90 ngày khoảng 4,05 TB bản gốc, chưa tính renditions, staging, backup hoặc lượt xem.

10 bàn cùng tạo dữ liệu ở 2 Mbps tương đương trung bình khoảng 20 Mbps đầu vào video; upload dồn khi kết thúc đơn có thể tạo đỉnh cao hơn. Đo mạng thực, giới hạn số upload song song và đặt ngưỡng backlog/quota thay vì chỉ tính tốc độ danh nghĩa.

Theo dõi: tỷ lệ đơn có final hiện hành và video READY, thời gian từ finish đến READY, thời lượng/bytes bất thường, dung lượng bộ đệm, upload retry, phiên mất camera, lệch thời gian, lỗi lease, truy cập bị từ chối và chi phí storage/delivery/transformation. Không ghi token hoặc dữ liệu nhạy cảm vào metrics.

## 16. Nguồn kỹ thuật và cách sử dụng

Tài liệu chính thức đã đối chiếu ngày 19/10/2026; cần kiểm tra lại SDK và tính năng trong gói tài khoản khi triển khai. Kiến trúc, API, schema và các giá trị cấu hình trong bản này là đề xuất thiết kế, không phải cấu hình mặc định do nhà cung cấp cam kết.

1. Cloudinary — Access control: https://cloudinary.com/documentation/control_access_to_media
   - Đối chiếu khác biệt `private`/`authenticated`, signed URL và các cơ chế phân phối có kiểm soát.
2. Cloudinary — Upload: https://cloudinary.com/documentation/upload_images
   - Tham khảo API/SDK và upload file lớn; triển khai theo giao thức thực tế, không đồng nhất chunk upload với chunk recorder.
3. MDN — getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
   - Điều kiện HTTPS/secure context và quyền truy cập camera.
4. MDN — MediaRecorder dataavailable: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event
   - Chu kỳ `timeslice` có thể lệch; cần đợi dữ liệu cuối và đo thời gian độc lập.

5. MDN — Barcode Detection API: https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
   - Kiểm tra tính tương thích và format; cần decoder dự phòng cho luồng camera đa trình duyệt.

## 17. Cách giao việc build từ tài liệu này

Đặt tài liệu trong thư mục tài liệu của repository theo quy ước dự án, rồi giao nhiệm vụ:

> Đọc toàn bộ file thiết kế chức năng đóng hàng, đặc biệt mục 13. Khảo sát dự án ở bước 01, sau đó triển khai lần lượt bước 02–12 theo dependency. Tích hợp vào website hiện có; giữ đúng final/repack/barcode và bảo mật video. Sau mỗi bước xác minh phù hợp, báo kết quả thực tế và tiếp tục phần đã được giao. Không thay thế chức năng bằng demo hoặc báo xong khi còn dùng mock. Nếu thiếu credential hoặc thiết bị thật, hoàn thành phần độc lập trước và nêu phần bị chặn; không bịa kết quả kiểm thử.

Nếu muốn chia từng đợt, giao rõ phạm vi: bước 01–03, bước 04–06, bước 07–10, cuối cùng bước 11–12. Mỗi đợt giữ nguyên quy tắc nghiệp vụ và đầu ra ở mục 13.
