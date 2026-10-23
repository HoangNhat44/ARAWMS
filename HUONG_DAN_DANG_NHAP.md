# Đăng nhập AraWMS

- Hệ thống có 6 role: Chủ cửa hàng, Quản lý kho, Kỹ thuật xưởng, Nhân viên kho, Nhân viên bán hàng và Kế toán kho.
- Hiện hỗ trợ đăng nhập bằng email hoặc mã nhân viên cho 5 role nhân viên. Owner sẽ triển khai đăng nhập Google sau.
- Tài khoản phải đang hoạt động và được gán đúng role. Dữ liệu cũ thiếu `isDeleted` vẫn được đăng nhập; tài khoản đã đánh dấu xóa sẽ bị chặn.
- Bấm tên trên thanh điều hướng để xem/sửa hồ sơ hoặc đổi mật khẩu. Đăng xuất kết thúc phiên hiện tại; đổi mật khẩu kết thúc tất cả phiên.
- Không hỗ trợ role ADMIN hoặc đăng ký tài khoản công khai.

Mở hai terminal:

```powershell
cd "D:\do an\ARAWMS\ARAWMS_BE"
npm run dev
```

```powershell
cd "D:\do an\ARAWMS\ARAWMS_FE"
npm run dev
```

Truy cập http://localhost:5173. Nếu cổng đang được dùng, dừng phiên chạy cũ trước khi khởi động lại.
