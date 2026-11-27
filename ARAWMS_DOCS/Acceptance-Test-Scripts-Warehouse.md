# ACCEPTANCE TEST SCRIPTS – KHO NGUYÊN PHỤ LIỆU & THÀNH PHẨM

**Hệ thống:** ARAWMS
**Phạm vi:** Nhập nguyên phụ liệu (NPL), Nhập thành phẩm (xếp kệ, hàng lỗi), Xuất nguyên phụ liệu, Phân quyền
**Loại test:** User Acceptance Test (UAT)

> File chỉ gồm các kịch bản đã được kiểm chứng **PASS** bằng integration test của dự án
> (`ARAWMS_BE/tests/*.test.mjs`, chạy ngày 26/11/2026, DB tạm MongoMemoryServer).
> Cột "Test đối chiếu" ghi tên test tự động chứng minh kịch bản.

---

## 1. Thông tin chung

### 1.1 Tài khoản

| Vai trò | Ký hiệu |
|---|---|
| Quản lý kho | WM |
| Nhân viên kho | WS |
| Kỹ thuật xưởng | GT |
| Kế toán kho | ACC |
| Nhân viên bán hàng | SELLER |

### 1.2 Dữ liệu chuẩn bị

- Layout kho đã publish, có ô (bin) ACTIVE ở kho NPL và kho thành phẩm.
- Nguyên liệu: 1 loại vải (mét) và 1 loại phụ liệu (cái).
- 1 SKU thành phẩm.
- Máy in tem (hoặc in PDF), máy quét hoặc camera điện thoại.

---

## 2. LUỒNG A – NHẬP NGUYÊN PHỤ LIỆU

### ATS-A01: Nhập NPL mua trực tiếp và xác nhận nhập kho

**Test đối chiếu:** `materialDirectReceipt.test.mjs` → *direct purchase stores separate prices and confirms stock once without a plan* ✔

| Mục | Nội dung |
|---|---|
| **Vai trò** | WM |
| **Tiền điều kiện** | Ghi lại tồn hiện tại của phụ liệu cần nhập |

| # | Thao tác | Kết quả mong đợi | KQ |
|---|---|---|---|
| 1 | Vào **Raw Material → Nhập NPL**, tạo phiếu nhập mua trực tiếp (không theo kế hoạch). Nhập 2 dòng cùng phụ liệu: 5 cái giá 2, 7 cái giá 3, chọn ô kho → Lưu | Phiếu ở trạng thái **Sẵn sàng xác nhận**. Mỗi dòng giữ đúng đơn giá riêng | |
| 2 | Bấm **Xác nhận nhập kho** | Phiếu chuyển **Hoàn tất**. Tồn phụ liệu **tăng 12** | |
| 3 | Bấm xác nhận lại lần nữa | Tồn **không** bị cộng thêm (chỉ nhập 1 lần) | |
| 4 | Bấm **In tem** | Có **2 tem**, mã dạng `NPL-xxxxxx`, không trùng nhau. Tem ghi đúng đơn giá, số lượng, tên nơi mua, mã phiếu | |
| 5 | Lọc danh sách phiếu theo nguồn **Mua trực tiếp** | Phiếu vừa tạo xuất hiện. Không xuất hiện khi lọc **Theo kế hoạch** | |
| 6 | Tạo phiếu nhập vải cuộn 2 cuộn → Xác nhận → In tem | Có **2 tem** riêng cho 2 cuộn, đơn vị **mét** | |
| 7 | Tạo phiếu với đơn vị tính không đúng của nguyên liệu → Xác nhận | Hệ thống **từ chối** xác nhận | |

**Tiêu chí chấp nhận:** Tồn tăng đúng và chỉ 1 lần. Mỗi lô hoặc cuộn có barcode riêng. Đơn giá từng dòng được giữ nguyên.

---

## 3. LUỒNG B – NHẬP THÀNH PHẨM (XẾP KỆ & HÀNG LỖI)

### ATS-B01: Xếp hàng thành phẩm lên kệ bằng quét mã

**Test đối chiếu:** `putawayBulk.test.mjs` (7/7 ✔)

| Mục | Nội dung |
|---|---|
| **Vai trò** | WS |
| **Tiền điều kiện** | Có phiếu nhập thành phẩm đã xác nhận, có việc xếp kệ và tem đã in |

| # | Thao tác | Kết quả mong đợi | KQ |
|---|---|---|---|
| 1 | Vào **Putaway**, mở việc xếp, chọn **20 tem** đã in, quét mã ô kho **1 lần** | Cả 20 chiếc được xếp vào ô. Tiến độ cập nhật | |
| 2 | Xếp từng chiếc: quét ô rồi quét tem từng chiếc | Từng chiếc được ghi nhận | |
| 3 | SKU được phân bổ vào **2 ô** khác nhau | Mỗi ô có kế hoạch riêng. Phải quét **từng ô** | |
| 4 | Chọn ô thứ 2 của SKU, quét các tem đã chọn | Tem được xếp vào đúng ô thứ 2 | |

### ATS-B02: Quét sai khi xếp kệ

**Test đối chiếu:** `putawayBulk.test.mjs` ✔

| # | Thao tác (WS) | Kết quả mong đợi | KQ |
|---|---|---|---|
| 1 | Quét mã ô **không đúng** ô được phân bổ | **Không** chiếc nào được xếp | |
| 2 | Trong nhóm tem có **1 tem không hợp lệ**, quét ô | **Cả nhóm** không được xếp (huỷ toàn bộ thao tác) | |
| 3 | Chọn **nhiều tem hơn** số ô còn cần | Bị từ chối | |

### ATS-B03: Hàng lỗi vào kho lỗi và xuất hàng lỗi

**Test đối chiếu:** `defectWarehouse.test.mjs` (4/4 ✔)

| # | Vai trò | Thao tác | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| 1 | WM | Vào **Kho hàng lỗi** | Chiếc lỗi đang chờ kho hiển thị **Chờ xử lý** và được đếm theo SKU | |
| 2 | WM | Xác nhận nhập hàng lỗi vào kho | Chiếc chuyển **DEFECTIVE**. Tồn **hàng bán được không đổi** | |
| 3 | WM | Xem báo cáo tồn kho | Số hàng lỗi được đếm theo từng chiếc thực tế | |
| 4 | WM | Xuất hàng lỗi **không nhập lý do** | Bị từ chối | |
| 5 | WM | Xuất hàng lỗi có lý do | Chiếc chuyển **DEFECT_OUT** | |

---

## 4. LUỒNG C – XUẤT NGUYÊN PHỤ LIỆU

### ATS-C01: Phiếu xuất NPL trực tiếp

**Test đối chiếu:** `materialOutbound.test.mjs` → *a checked roll and lot deduct once; a draft does not reserve stock* ✔

| Mục | Nội dung |
|---|---|
| **Vai trò** | WM |
| **Tiền điều kiện** | Có 1 cuộn vải và 1 lô phụ liệu trong kho. Ghi lại tồn |

| # | Thao tác | Kết quả mong đợi | KQ |
|---|---|---|---|
| 1 | Vào **Xuất nguyên phụ liệu**, tạo phiếu xuất cho cuộn vải và lô phụ liệu → Lưu nháp | Tồn **không đổi**. Phiếu nháp không giữ chỗ hàng | |
| 2 | Bấm **Kiểm tra** rồi **Xác nhận** | Tồn cuộn vải và lô phụ liệu **giảm đúng** số đã xuất | |
| 3 | Gửi xác nhận lại lần nữa | Tồn **không** bị trừ thêm (chỉ trừ 1 lần) | |

---

## 5. PHÂN QUYỀN

### ATS-X01: Chặn truy cập sai vai trò

**Test đối chiếu:** `roleAccess.test.mjs` → *workspace APIs reject guests and mismatched roles* ✔

| # | Vai trò | Thao tác | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| 1 | Chưa đăng nhập | Truy cập chức năng nhập hoặc xuất kho | Bị yêu cầu đăng nhập (401) | |
| 2 | SELLER | Mở chức năng nhập NPL | Không có quyền (403) | |
| 3 | WS | Duyệt và giao việc xuất NPL | Không có quyền (403) | |
| 4 | WS | Tạo phiếu nhập hoặc xuất thành phẩm | Không có quyền (403) | |
| 5 | WM | Mở màn hình việc xếp kệ của nhân viên | Không có quyền (403) | |
| 6 | WS | Xem danh sách phiếu xuất NPL | Được phép | |
| 7 | GT | Mở chức năng kiểm hàng nhập | Được phép | |

---

## 6. BẢNG TỔNG HỢP

| Mã | Tên kịch bản | Test tự động | Người test | Ngày | Kết quả UAT |
|---|---|---|---|---|---|
| ATS-A01 | Nhập NPL mua trực tiếp | ✔ Pass | | | |
| ATS-B01 | Xếp thành phẩm lên kệ | ✔ Pass | | | |
| ATS-B02 | Quét sai khi xếp kệ | ✔ Pass | | | |
| ATS-B03 | Hàng lỗi vào kho lỗi và xuất lỗi | ✔ Pass | | | |
| ATS-C01 | Phiếu xuất NPL trực tiếp | ✔ Pass | | | |
| ATS-X01 | Phân quyền | ✔ Pass | | | |

**Ký xác nhận nghiệm thu:**

| Vai trò | Họ tên | Chữ ký | Ngày |
|---|---|---|---|
| Người test | | | |
| Đại diện người dùng | | | |
