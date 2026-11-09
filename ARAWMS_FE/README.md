# AraStore Frontend

Giao diện React/Vite cho hệ thống quản lý kho nội bộ. Khu vực Owner nằm trong `src/pages/Owner/`; các trang đăng nhập và tài khoản được tái sử dụng cho nhiều vai trò.

## Chạy ứng dụng

Chạy `npm ci`, sau đó `npm run dev`. Vite dùng cổng 5173 và proxy `/api` đến BE ở cổng 5000; cấu hình môi trường theo dự án hiện có. `npm run build` tạo bản production trong `dist/`.

## Điều hướng theo vai trò

| Mã vai trò | Phân hệ | Trang mặc định sau đăng nhập |
| :--- | :--- | :--- |
| `OWNER` | Chủ cửa hàng | `/owner/dashboard` |
| `WAREHOUSE_MANAGER` | Quản lý kho | `/warehouse/raw-materials/inbound` |
| `WAREHOUSE_STAFF` | Nhân viên kho | `/warehouse/putaway` |
| `GARMENT_TECHNICIAN` | Kỹ thuật may / KCS | `/garment/material-inbound-verification` |
| `ACCOUNTANT` | Kế toán | `/accountant` |
| `SELLER` | Bán hàng và CSKH (Saler) | `/seller/chat` |

Trang được yêu cầu trước khi đăng nhập chỉ được mở lại nếu tài khoản có đúng vai trò. Truy cập URL của phân hệ khác hiển thị trang 403. Mọi vai trò có thể quản lý hồ sơ ở `/account`.

General Manager và BOM Manager hiện chưa có mã tài khoản và phân hệ riêng trong ứng dụng. Automated System là actor tích hợp tự động.

## Thay đổi giao diện

Dùng token trong `src/theme/wmsTheme.js`, màu CSS trong `src/styles/index.css`, component `src/components/ui/WmsControls.jsx` và `src/pages/Owner/OwnerUI.jsx`. Giữ hợp đồng sự kiện form, validation, payload và quyền truy cập hiện có. Trang dài dùng route riêng; modal chỉ dành cho thao tác ngắn và xác nhận.

Các trang Owner được tải theo route. Build hiện vẫn có cảnh báo chunk dùng chung lớn hơn 500 kB; build thành công, nhưng cần đo tải thực tế trước khi đặt ngân sách hiệu năng cho production.
