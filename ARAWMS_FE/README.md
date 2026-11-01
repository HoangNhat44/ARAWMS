# AraStore Frontend

Giao diện React/Vite cho hệ thống quản lý kho nội bộ. Khu vực Owner nằm trong `src/pages/Owner/`; các trang đăng nhập và tài khoản được tái sử dụng cho nhiều vai trò.

- [Quy chuẩn UI đầy đủ từ UIdesign.docx](../docs/UI_DESIGN_SYSTEM.md)
- [Màn hình Owner, chức năng và responsive](../docs/OWNER_UI_STRUCTURE.md)
- [Use case, Major Feature, Sub Feature và business rule](../docs/OWNER_USE_CASES.md)

## Chạy ứng dụng

Chạy `npm ci`, sau đó `npm run dev`. Vite dùng cổng 5173 và proxy `/api` đến BE ở cổng 5000; cấu hình môi trường theo dự án hiện có. `npm run build` tạo bản production trong `dist/`.

## Kiểm thử giao diện

Chạy `npm run test:ui` khi máy đã cài Google Chrome. Playwright mở Chrome headless, chạy Vite riêng trên `127.0.0.1:5197`, chặn API bằng dữ liệu giả lập và chặn kết nối ra ngoài. Bộ kiểm thử không đăng nhập bằng tài khoản thật, không ghi DB và không gửi yêu cầu GHN.

Kiểm tra gồm các màn hình Owner ở 320/390/768/1280/1440px, lỗi JavaScript, tràn ngang, điều hướng bàn phím, các form/thao tác chính và accessibility tự động theo WCAG 2.2 AA. Kết quả tự động không thay thế kiểm tra trình đọc màn hình, thiết bị thật hoặc Google OAuth thật. Ảnh chụp nằm trong `test-results/` sau khi chạy và được bỏ qua bởi Git.

## Thay đổi giao diện

Dùng token trong `src/theme/wmsTheme.js`, màu CSS trong `src/styles/index.css`, component `src/components/ui/WmsControls.jsx` và `src/pages/Owner/OwnerUI.jsx`. Giữ hợp đồng sự kiện form, validation, payload và quyền truy cập hiện có. Trang dài dùng route riêng; modal chỉ dành cho thao tác ngắn và xác nhận.

Các trang Owner được tải theo route. Build hiện vẫn có cảnh báo chunk dùng chung lớn hơn 500 kB; build thành công, nhưng cần đo tải thực tế trước khi đặt ngân sách hiệu năng cho production.
