# QR đơn hàng: tích hợp hiện tại

## Danh sách và cấp QR hàng loạt

Màn hình `/orders/qr` tải toàn bộ đơn thật mà tài khoản được phép cấp QR cùng các đơn mẫu. Có thể tìm theo mã đơn, ID, người nhận hoặc trạng thái; chọn từng đơn hoặc chọn tất cả đơn hợp lệ đang hiển thị. Nút **Tạo / lấy QR hàng loạt** cấp tối đa 100 đơn mỗi yêu cầu và màn hình tự chia thành nhiều đợt nếu chọn nhiều hơn. Đơn `PENDING` được liệt kê nhưng phải mở và chốt trước khi chọn cấp QR. QR đã cấp được lấy lại theo mã hiện hành. Các QR trong vùng kết quả có thể in cùng lúc.

- `GET /api/orders/qr-list`: trả danh sách tóm tắt và trạng thái đã cấp QR, giới hạn theo quyền ADMIN hoặc sale sở hữu đơn thật; đơn mẫu dành cho người dùng đã đăng nhập.
- `POST /api/orders/packing-qr/bulk` với `{ "orderIds": ["..."] }`: trả kết quả riêng cho từng đơn, tối đa 100 ID duy nhất mỗi yêu cầu; đơn không đủ quyền hoặc chưa chốt trả mã lỗi tương ứng.

Chức năng hỗ trợ đơn `SalesOrder` đã lưu trong MongoDB và 5 đơn mẫu ở `don-hang-mau.json`. Đơn mẫu được đọc trực tiếp từ file, gắn `demoOnly: true`, không nhập giả vào `sales_orders`. QR mẫu lưu trong `demo_order_qr_tokens`; QR đơn thật lưu trong `order_qr_tokens`. Mỗi barcode trong `san-pham-mau-50-barcode.json` đại diện **một vật phẩm vật lý** và chỉ được gắn với đơn sau khi nhân viên kho quét được backend chấp nhận.

## Luồng sử dụng

1. Sale mở `/orders/qr`, tra đơn bằng `orderCode`/MongoDB `_id`. Nếu đơn thật còn `PENDING`, người có quyền chốt chuyển nó sang `CONFIRMED` và server cấp QR ngay; sản phẩm trên đơn lúc này chỉ là SKU/biến thể và số lượng. Đơn mẫu `DEMO-ORD-001` đến `DEMO-ORD-005` đã ở `READY_TO_PACK`.
2. Sale in QR. Với đơn đã chốt, nút **Tạo / lấy QR đơn hàng** trả lại mã đang hiệu lực. Server dùng token ngẫu nhiên 256 bit. QR dạng `PACK:v1:<token>`, không chứa PII hoặc barcode từng món.
3. Kho mở `/packing/qr`, quét QR bằng camera hoặc máy quét. Server xác thực QR, quyền người dùng và mở một `packing_session` ở `SCANNING`. Màn hình hiển thị thông tin người nhận của đơn thật và danh sách biến thể/số lượng cần lấy. File đơn mẫu không có thông tin khách, nên phần đó để trống.
4. Nhân viên lấy hàng, quét mã Code 128 trên **từng món**. Server kiểm tra tem tồn tại, đúng SKU/biến thể và kho, chưa gắn với đơn khác, chưa vượt số lượng; sau khi chấp nhận mới lưu `product_unit_allocation`, sự kiện quét và cập nhật tiến độ.
5. Khi đủ mọi dòng hàng, phiên chuyển `READY_TO_RECORD`. Camera bắt đầu quay ngay sau khi QR đơn được mở; trạng thái này xác nhận đã đủ barcode, chưa phải hoàn tất đóng gói hoặc bàn giao vận chuyển.
6. Khi mất/lộ QR, sale chọn **Thu hồi và cấp QR mới**. Mã cũ hết hiệu lực ngay sau khi cập nhật database.

QR là mã tra cứu dành cho người đã đăng nhập; bản thân nó không cấp quyền xem đơn. Đơn thật cho `ADMIN`, `SALES` là người bán của đơn, hoặc `WAREHOUSE_STAFF`/`WAREHOUSE_MANAGER` được gắn với tất cả kho trong reservation của đơn. Chỉ `ADMIN` và sale của đơn được cấp/thay QR; chỉ `ADMIN` và nhân viên kho đúng kho được mở phiên quét. ADMIN cấp role và `warehouseIds` qua API quản trị bên dưới; đăng ký công khai chỉ tạo `STAFF`. Đơn mẫu dùng được với mọi tài khoản đã đăng nhập.

## API

Các route dưới đây nằm sau `/api`, dùng `Authorization: Bearer <JWT>`. Kết quả theo `{ success, message, data }` và lỗi theo `{ success: false, message, errors: { code } }`.

| Method/path | Mục đích |
|---|---|
| `GET /orders/lookup?code=<orderCode-or-id>` | Xem đơn thật từ database hoặc đơn mẫu từ file. |
| `POST /orders/:id/confirm` | Sale chốt đơn thật từ `PENDING` sang `CONFIRMED` bằng cập nhật có điều kiện. |
| `POST /orders/:id/packing-qr` | Cấp/lấy QR đang hiệu lực cho đơn. |
| `POST /orders/:id/packing-qr/replace` | Thu hồi mã cũ, cấp mã mới. |
| `POST /packing/resolve-qr` với body `{ "qrValue": "PACK:v1:..." }` | Xác thực QR và lấy thông tin đơn. |
| `POST /packing/prepare` với `{ "qrValue", "stationId" }` | Mở/lấy phiên `SCANNING`, snapshot biến thể và giữ lease bàn kho. |
| `POST /packing/sessions/:id/heartbeat` với `{ "stationId", "leaseVersion" }` | Gia hạn lease. |
| `POST /packing/sessions/:id/release` với `{ "stationId", "leaseVersion" }` | Tạm dừng tại bàn trước khi chuyển sang đơn khác; tiến độ đã quét vẫn giữ lại. |
| `POST /packing/sessions/:id/scans` với `{ "stationId", "leaseVersion", "clientEventId", "barcode" }` | Đối soát và gắn vật phẩm; trả `ACCEPTED`/`REJECTED` cùng tiến độ server. |
| `POST /inventory/product-units` với `{ "barcode", "skuId", "warehouseId" }` | Quản trị viên đăng ký tem vật phẩm thật vào `product_units`. |
| `PATCH /admin/users/:id/access` với `{ "role": "WAREHOUSE_STAFF", "warehouseIds": ["<Config WAREHOUSE _id>"] }` | ADMIN gán nhân viên vào kho; có thể gán `SALES`, `STAFF`, `WAREHOUSE_MANAGER` theo cùng API. Không dùng để cấp ADMIN. |

`POST /packing/prepare` trả `data.order` với thông tin giao hàng cho người được cấp quyền và `data.session` gồm tiến độ đã được server xác nhận. Retry một lần quét phải giữ nguyên `clientEventId`. Event trước quay lưu `phase=PRE_RECORD`, `videoOffsetMs=null`.

Ví dụ kiểm tra với file mẫu: cấp QR cho `DEMO-ORD-001`, quét QR tại bàn kho, rồi lần lượt quét `DEMU00000001` và `DEMU00000002`. Hai barcode là hai món riêng của cùng `DEMO-VAR-01`; sau mã thứ hai phiên đạt `READY_TO_RECORD`. Quét `DEMU00000006` vào đơn này bị từ chối vì khác biến thể; quét lại mã đã nhận hoặc mã thứ ba cùng biến thể cũng bị từ chối. Dữ liệu demo vẫn không tạo `SalesOrder` thật.

## Ranh giới với bước đóng hàng tiếp theo

File sản phẩm mẫu quy định `UNIQUE_PER_PHYSICAL_UNIT`: 50 vật phẩm, barcode `CODE_128` riêng từng món. Model `Sku.barcodes` là mã chung của SKU, không dùng để đại diện từng món. Đơn demo đọc vật phẩm từ file; đơn thật chỉ quét được sau khi tem vật phẩm được đăng ký trong `product_units`. Allocation lưu riêng theo `sourceType` để demo không chiếm hàng thật. Video được quay khi mở QR đơn và tự kết thúc khi QR đơn kế tiếp được xác thực hoặc khi kết thúc đơn cuối. File chờ upload được giữ tạm trong OPFS, metadata và trạng thái queue ở IndexedDB; tối đa 2 upload chạy đồng thời. Cloudinary lưu video, còn `packing_videos`, phiên và đơn thật lưu metadata cùng URL. `POST /packing/sessions/:id/video/:recordingId/sync` đối chiếu Cloudinary và hoàn tất MongoDB khi upload thành công nhưng ghi DB lỗi. File OPFS chỉ bị xóa sau khi backend xác nhận `COMPLETED`. Bước này **chưa** trừ tồn, chốt final, repack, sửa scan hoặc bàn giao vận chuyển. `READY_TO_RECORD` không được coi là đủ điều kiện xuất kho.

Các collection mới và UNIQUE index được khởi tạo trước mutation đầu tiên. Chưa chạy migration hoặc ghi bản ghi demo/đơn thật lên Atlas trong lượt triển khai này; dữ liệu chỉ được ghi khi người dùng gọi API tương ứng. Việc thử giao dịch quét barcode với Atlas thật và thiết bị camera/máy quét thật vẫn cần được xác minh tại môi trường triển khai.

## Chạy và kiểm tra

- Backend: trong `ARAWMS_BE`, chạy `npm.cmd install`, cấu hình `MONGODB_URI` và `JWT_SECRET`, rồi `npm.cmd run dev`.
- Frontend: trong `ARAWMS_FE`, chạy `npm.cmd install` và `npm.cmd run dev`; Vite proxy `/api` sang cổng 5000.
- `npm.cmd test` trong backend kiểm tra định dạng/ngẫu nhiên của token và dữ liệu trả về khi quét. `npm.cmd run build` trong frontend kiểm tra bundle.
- Camera cần HTTPS hoặc localhost và quyền truy cập thiết bị. Chưa kiểm thử trên máy quét/camera thật hoặc vòng API với MongoDB Atlas trong lượt này.
- Đã kiểm tra Atlas có 1 đơn thật nhưng không có `DEMO-ORD-001`; đó là lý do trước đây mã mẫu trả `ORDER_NOT_FOUND`. Mã mẫu nay đọc từ file. Nếu dùng ID của một đơn thật, phải nhập MongoDB `_id`, không phải ID dạng chuỗi của file demo.
