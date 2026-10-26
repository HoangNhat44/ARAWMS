# Đối chiếu dữ liệu thật cho thêm sản phẩm và đóng hàng

Nguồn đối chiếu: `chú thích AraWMS.docx` (mô tả vai trò của 32 collection) và các Mongoose model trong backend. Tài liệu DOCX mô tả nghiệp vụ từng collection, không quy định chi tiết field; field dưới đây theo schema và code đang chạy.

| Collection | Vai trò trong hai chức năng |
| --- | --- |
| `counter_sequences` | Sinh `Product.productCode` duy nhất khi tạo sản phẩm. |
| `products` | Lưu mẫu sản phẩm, giá cơ bản, trạng thái và media. |
| `skus` | Lưu biến thể màu/size, giá bán, tổng tồn và tổng số đã giữ. `skuBarcode` định danh biến thể, không thay cho tem từng chiếc. |
| `warehouse_locations` | Xác định vị trí thành phẩm, quyền truy cập của nhân viên và sức chứa. |
| `finished_goods_batches` | Ghi tồn và số đã giữ theo lô/vị trí FIFO. |
| `finished_goods_bulk_documents` | Ghi phiếu kiểm nhận và barcode của từng chiếc khi nhập kho qua luồng hàng loạt. |
| `product_units` | Collection bổ trợ: barcode Code 128 duy nhất của từng chiếc, liên kết SKU, lô và vị trí. |
| `sales_orders` | Cung cấp SKU, số lượng và lô đã giữ; nhận trạng thái `PACKED`, người đóng và URL video. |
| `order_qr_tokens` | Token QR riêng của đơn thật; QR chỉ chứa token, không chứa thông tin khách hàng. |
| `packing_sessions`, `packing_scan_events`, `product_unit_allocations`, `packing_videos` | Collection bổ trợ cho khóa bàn, quét không trùng, chống gán một chiếc vào hai đơn và lưu/khôi phục video. |
| `inventory_transactions` | Ghi biến động `ORDER_PACK_DEDUCT` với tồn và số giữ chỗ trước/sau khi hoàn tất video. |

## Kiểm tra dữ liệu MongoDB ngày 2026-10-25

- Có 1 sản phẩm, 1 SKU, 1 lô thành phẩm, 6 đơn hàng và 1 vị trí kho.
- `product_units` đang rỗng. Không thể quét barcode từng chiếc của lô cũ cho đến khi tem vật lý được nhập hoặc phát hành và gắn lên hàng.
- SKU ghi 100 chiếc tồn, còn lô thành phẩm ghi 50 chiếc. Vị trí kho ghi `currentOccupancy = 1`. Không đủ bằng chứng để tự sửa các số tồn này; cần đối soát hàng và phiếu nhập/xuất.
- Lô thành phẩm hiện trỏ tới `KHO-NVL-A01-01`, nhưng vị trí này được khai báo `RAW_MATERIAL`. Cần xác nhận vị trí thành phẩm vật lý trước khi chuyển lô hoặc đổi loại vị trí.
- Một đơn `CONFIRMED_RESERVED` có phân bổ FIFO hợp lệ. Hai đơn khác cùng trạng thái chưa có danh sách lô/vị trí đã giữ nên bị chặn mở phiên đóng hàng cho đến khi được phân bổ.
- Cả 5 phiên đóng hàng cũ là `DEMO`; chưa có phiên đơn thật cần bù trừ tồn kho/video khi đổi luồng.

## Quy tắc áp dụng trong code

- API QR và đóng hàng chỉ tra `sales_orders`; dữ liệu JSON mẫu không còn được dùng trong luồng này.
- Khi chốt đơn `PENDING`, backend giữ tồn SKU và từng lô theo FIFO, ghi `ORDER_RESERVE`, lưu `fifoPickList` rồi chuyển sang `CONFIRMED_RESERVED` trong một giao dịch.
- Nhân viên chỉ đóng đơn có phân bổ lô/vị trí FIFO đầy đủ và thuộc các vị trí họ được gán.
- Tem quét phải trùng SKU, lô và vị trí đã giữ, còn ở trạng thái `AVAILABLE`, chưa gán cho đơn khác.
- Khi video được xác nhận, cùng một giao dịch MongoDB cập nhật đơn, phiên đóng hàng, trạng thái tem, tồn SKU/lô/vị trí và sổ biến động. Lỗi ở một bước làm giao dịch thất bại để có thể đồng bộ lại video.
- Phiếu nhập kho mới sinh `product_units` có `batchId`; lô cũ cần đối soát tem trước khi có thể quét.
- API xuất kho thủ công không cho trừ SKU đã được quản lý theo lô khi chưa có quy trình quét tem xuất kho, để tránh lệch giữa tổng tồn và lô/tem.
