# GBR-01 và GBR-02 — đăng nhập, khôi phục mật khẩu

## Nội dung business rule

| Mã | Rule Statement | Thực hiện trong hệ thống |
| --- | --- | --- |
| GBR-01 | A deactivated user account must not access the system through password login, Google login, or an existing session. Password recovery must not reactivate a deactivated account. | Chỉ tài khoản ACTIVE, chưa xóa mềm và role đang hoạt động mới được truy cập. INACTIVE và LOCKED là trạng thái quản trị, không tự mở bằng Quên mật khẩu. |
| GBR-02 | After five consecutive incorrect password attempts, password sign-in requires a password reset through Forgot Password. The user verifies ownership through the registered email and sets a new password, without a 30-minute lock or contacting the Owner. | Lần sai thứ 5 trả mã PASSWORD_RESET_REQUIRED và hiện nút đặt lại mật khẩu. Không đổi status sang LOCKED và không tạo bộ đếm khóa 30 phút. |

Đăng nhập đúng trước lần sai thứ 5 đặt số lần sai về 0. Sau lần sai thứ 5, người dùng đặt lại mật khẩu qua email để tiếp tục đăng nhập bằng mật khẩu. Owner vẫn có thể xác thực bằng Google đã liên kết nếu tài khoản đang hoạt động; đăng nhập Google không xóa yêu cầu đặt lại mật khẩu.

## Luồng Quên mật khẩu

1. Chọn **Quên mật khẩu?** hoặc nút **Đặt lại mật khẩu qua email** sau lần sai thứ 5.
2. Nhập email hoặc mã nhân viên.
3. Mở email gửi tới địa chỉ đã đăng ký của tài khoản.
4. Mở liên kết và nhập mật khẩu mới cùng xác nhận.
5. Đăng nhập lại bằng mật khẩu mới.

Liên kết ngẫu nhiên 32 byte, chỉ lưu SHA-256 trong DB, hết hạn sau 15 phút và chỉ dùng một lần. Token nằm ở fragment của URL email; FE xóa fragment khỏi thanh địa chỉ sau khi đọc. Reset thành công xóa token, đặt lại số lần sai/yêu cầu reset, thu hồi mọi phiên. Mật khẩu mới phải khác mật khẩu cũ, có ít nhất 8 ký tự, tối đa 72 byte và không chỉ gồm khoảng trắng.

Thông báo gửi email giống nhau cho tài khoản tồn tại, không tồn tại hoặc vô hiệu hóa. Không gửi token về API/console, không cho nhập email nhận tùy ý khác với email đã đăng ký. Giới hạn một email/tài khoản/60 giây và 20 yêu cầu khôi phục/IP/15 phút trên mỗi tiến trình BE. Yêu cầu gửi email không tự đổi mật khẩu hoặc khóa tài khoản.

## Cấu hình gửi email thật

Thêm cấu hình vào `ARAWMS_BE/.env`, dùng `.env.example` làm mẫu:

```dotenv
MONGODB_URI=your-project-mongodb-uri
CLIENT_URL=http://localhost:5173

SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=AraWMS <your-sender@example.com>
```

Với SMTP dùng TLS trực tiếp ở cổng 465, đặt `SMTP_SECURE=true`. Production yêu cầu CLIENT_URL là HTTPS và SMTP mã hóa TLS. Không commit mật khẩu SMTP hoặc URI MongoDB.

Email đăng ký của tài khoản phải là hộp thư người dùng nhận được. Các địa chỉ dữ liệu mẫu không có hộp thư thật sẽ không dùng được để nhận liên kết.

Trước khi tra tài khoản, BE kiểm tra kết nối/xác thực SMTP. Nếu thiếu cấu hình, không kết nối được hoặc SMTP trả EAUTH/535, API báo lỗi 503 chung cho mọi tài khoản để người dùng biết chức năng chưa gửi được email. Không trả mật khẩu hoặc nội dung lỗi nhạy cảm của nhà cung cấp. Với Gmail, mật khẩu ứng dụng 16 ký tự có khoảng trắng chia nhóm được chuẩn hóa khi kết nối.

Nếu xác thực SMTP thành công nhưng gửi thư lỗi sau đó, token tương ứng được xóa; phản hồi vẫn dùng thông báo chung để tránh tiết lộ tài khoản. Theo dõi cảnh báo SMTP ở BE và gửi yêu cầu lại sau khi sửa cấu hình. SMTP_USER và mật khẩu ứng dụng phải thuộc cùng tài khoản gửi; địa chỉ email nhận có thể khác.

Trong lượt triển khai này không có file BE `.env`, nên chưa xác nhận kết nối MongoDB dự án và gửi email qua nhà cung cấp thật. Kiểm tra chức năng dùng database riêng cùng SMTP nội bộ.

## API và file

- POST `/api/auth/forgot-password`: `{ usernameOrEmail }`.
- POST `/api/auth/reset-password`: `{ token, newPassword, confirmPassword }`.
- FE: `/forgot-password`, `/reset-password#token=...`.

BE trong `src/modules/system-administration/authentication/`:

- `auth.service.js`: điều kiện tài khoản/role hoạt động cho GBR-01, đếm sai liên tiếp và GBR-02.
- `passwordRecovery.controller.js`, `passwordRecovery.service.js`, `passwordRecovery.validation.js`: API và validation khôi phục.
- `passwordRecovery.mailer.js`, `passwordRecovery.rateLimit.js`: gửi mail và giới hạn tần suất.

FE trong `src/modules/system-administration/authentication/`: tách pages, components, services và validation như phần đăng nhập hiện tại. Đổi mật khẩu trong `account-governance` cũng xóa token khôi phục cũ.

Không cần cập nhật thủ công DB để bỏ khóa thời gian cũ: logic mới không còn dùng `loginLockedUntil` để chờ 30 phút. Tài khoản cũ có ít nhất 5 lần sai được chuyển sang luồng Quên mật khẩu; trạng thái LOCKED/INACTIVE do quản trị không bị tự mở.

## Kiểm tra

- FE build thành công, kiểm tra cú pháp BE và diff.
- 84 kiểm tra API với MongoDB tạm (mongod cài sẵn, dữ liệu riêng) và SMTP nội bộ: 6 role hoạt động/vô hiệu hóa, chặn phiên cũ, Google, 5 lần sai, reset tức thì, hết hạn/token dùng lại, dữ liệu sai kiểu, role bị tắt, dữ liệu xóa mềm, thu hồi phiên và thiếu SMTP.
- Token Google trong kiểm tra dùng RSA tạm với bước xác minh chữ ký thật; không truy cập tài khoản Google của người dùng.
- Không gửi email ra ngoài, không thay đổi dữ liệu MongoDB dự án, không thêm file test vào source.

Tham khảo: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Nodemailer SMTP](https://nodemailer.com/smtp).
