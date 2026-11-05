# Gộp collection cho các chức năng kho

Backend mới ghi phiếu xuất nguyên liệu vào `material_tickets`, QR đơn hàng vào
`sales_orders.qr`, claim barcode vào `product_units.packingClaim` và trạng thái video vào
`packing_sessions`. Đường đọc dữ liệu cũ vẫn còn trong giai đoạn chuyển đổi. Giữ bốn
collection nguồn cho đến khi bản backend mới qua kiểm tra luồng ghi thực tế.

## Trình tự chuyển đổi

Chạy từ thư mục `ARAWMS_BE` với `MONGODB_URI` của ứng dụng. Khi chuyển đường ghi,
chỉ chạy một phiên bản backend; không để backend cũ và mới cùng ghi.
Sau bước sao lưu, đặt `$backupDir` bằng đường dẫn `backupDirectory` được in ra.

1. Tạm dừng thao tác ghi kho và tạo bản sao lưu riêng:
   `npm.cmd run warehouse:backup`
2. Kiểm tra bản sao trên replica set dùng một lần:
   `node scripts/check-warehouse-migration-snapshot.mjs $backupDir`
3. Kiểm tra dữ liệu nguồn mà không ghi:
   `npm.cmd run warehouse:migrate`
4. Tạo index và sao chép sang cấu trúc mới:
   `npm.cmd run warehouse:migrate -- --apply --backup-dir $backupDir`
5. Đối chiếu nguồn/đích và timestamp của đơn:
   `npm.cmd run warehouse:verify -- $backupDir`
6. Triển khai backend tương ứng và mở lại thao tác ghi. Kiểm tra bản nháp/xác nhận xuất,
   cấp/đổi/quét QR, hai trạm cùng quét barcode, gỡ mã/hủy phiên, đồng bộ lại video,
   hoàn tất đóng hàng, điều kiện giao vận, tồn kho, cất kệ và kiểm kê.

Bản sao gồm bốn collection nguồn và bốn collection đích ở định dạng BSON Extended JSON.
Nó có thể chứa dữ liệu khách hàng và token; thư mục mặc định được Git bỏ qua.
Migration chạy lại được và không xóa nguồn. Chỉ xóa collection cũ sau khi kiểm tra
bản triển khai và xác nhận không còn backend cũ ghi vào chúng.
