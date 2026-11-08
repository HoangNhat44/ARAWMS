# AraStore Frontend

Giao diện React/Vite cho hệ thống quản lý kho nội bộ. Khu vực Owner nằm trong `src/pages/Owner/`; các trang đăng nhập và tài khoản được tái sử dụng cho nhiều vai trò.

## Chạy ứng dụng

Chạy `npm ci`, sau đó `npm run dev`. Vite dùng cổng 5173 và proxy `/api` đến BE ở cổng 5000; cấu hình môi trường theo dự án hiện có. `npm run build` tạo bản production trong `dist/`.

## Thay đổi giao diện

Dùng token trong `src/theme/wmsTheme.js`, màu CSS trong `src/styles/index.css`, component `src/components/ui/WmsControls.jsx` và `src/pages/Owner/OwnerUI.jsx`. Giữ hợp đồng sự kiện form, validation, payload và quyền truy cập hiện có. Trang dài dùng route riêng; modal chỉ dành cho thao tác ngắn và xác nhận.

Các trang Owner được tải theo route. Build hiện vẫn có cảnh báo chunk dùng chung lớn hơn 500 kB; build thành công, nhưng cần đo tải thực tế trước khi đặt ngân sách hiệu năng cho production.
