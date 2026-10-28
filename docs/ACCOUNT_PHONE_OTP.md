# Email liên kết và đổi số điện thoại

Mọi vai trò vào **Tài khoản của tôi → Liên kết Google**, xác nhận mật khẩu và chọn Google. Email vừa xác minh sẽ thay email đăng nhập và nhận thư khôi phục/OTP. Hủy Google chỉ bỏ cách đăng nhập Google; email đăng nhập vẫn giữ nguyên. Liên kết Google khác sẽ đổi email đăng nhập lần nữa. Các tài khoản không được dùng trùng email hoặc Google.

Email đăng nhập hiển thị từ trường `email` trong User. Khi liên kết, BE đồng bộ trường này với email Google đã xác minh. Dữ liệu Owner đã liên kết từ bản cũ cũng đã được đồng bộ.

## Đổi số điện thoại

1. Ô **Số điện thoại** nằm ngay dưới **Họ và tên**. Nhập số mới gồm đúng 10 chữ số và bắt đầu bằng `0`, ví dụ `0912345678`. Không nhận dạng `+84`, khoảng trắng, chữ hoặc số dài/ngắn hơn 10 chữ số.
Họ tên và số điện thoại đều bắt buộc. Khi bấm ra ngoài form trước khi lưu, nội dung đang sửa trở về giá trị đã lưu. Chuyển giữa hai ô hoặc bấm Lưu thay đổi vẫn giữ dữ liệu vừa nhập.

2. Bấm **Lưu thay đổi**. Nếu chỉ đổi họ tên, hồ sơ được lưu ngay. Nếu số điện thoại thay đổi, hệ thống gửi OTP tới email đã xác minh khi liên kết Google rồi mở phần xác nhận. Chưa lưu họ tên và số mới ở bước này.
3. Nhập OTP sáu chữ số rồi bấm **Xác nhận lưu thay đổi**. BE lưu họ tên và số mới cùng lúc. Có thể bấm **Sửa lại thông tin** để quay lại, hoặc **Gửi lại OTP** sau thời gian chờ.

OTP có hạn 5 phút, dùng một lần, tối đa 5 lần thử. Chờ 60 giây giữa hai lần gửi; mỗi tài khoản tối đa 5 email trong 15 phút. Mã mới thay mã cũ. DB chỉ lưu HMAC của OTP, gắn với tài khoản, phiên, email, số mới và dấu mật khẩu. Thay email, liên kết/hủy Google, đổi mật khẩu hoặc kết thúc phiên làm mã cũ không còn dùng được. SMTP gửi lỗi thì mã bị hủy, số điện thoại không đổi.

Dùng cấu hình SMTP đang có trong `ARAWMS_BE/.env`, giống Quên mật khẩu. Khởi động lại BE sau khi thay cấu hình. Không đưa SMTP_PASS lên Git. Xem thêm `docs/AUTHENTICATION_BUSINESS_RULES.md`.

## File và API

- BE: `src/modules/system-administration/account-governance/phoneChange.controller.js`, `phoneChange.service.js`, `phoneChange.validation.js`, `phoneChange.mailer.js`; khai báo đường dẫn API trong `accountGovernance.routes.js`, kiểm tra tên/email/số trong `accountInput.js`.
- Model: `src/models/PhoneChangeChallenge.model.js`, collection `phone_change_challenges`; unique theo tài khoản và TTL dọn dữ liệu sau một ngày. Khi BE chạy, Mongoose tạo index theo cấu hình hiện tại.
- FE: `src/pages/` chỉ chứa JSX. `ProfileForm.jsx` gộp cả phần nhập thông tin và xác nhận OTP. API đặt trong `src/services/`, kiểm tra dữ liệu trong `src/utils/`, CSS chung trong `src/styles/accountAuth.css`. Phần đăng nhập Google gộp vào `LoginPage.jsx`, form đặt lại mật khẩu gộp vào `ResetPasswordPage.jsx`.
- `POST /api/accounts/me/phone/otp`: `{ "phone": "0912345678", "fullName": "Nguyễn Văn An" }`, cần phiên đăng nhập; họ tên và số điện thoại đều bắt buộc. OTP gắn với nội dung đã kiểm tra trên BE.
- `POST /api/accounts/me/phone/confirm`: `{ "challengeId": "mã yêu cầu trả về", "otp": "6 chữ số trong email" }`, cần cùng phiên.
- API cập nhật hồ sơ thông thường không được đổi số điện thoại để bỏ qua OTP. Họ tên nhận 2–100 ký tự, chỉ gồm chữ và dấu câu thông dụng; email/mã nhân viên được kiểm tra ở cả FE và BE. Dòng trạng thái được bỏ khỏi màn hình tài khoản; GBR-01 vẫn được kiểm tra trên BE.

Xác minh Google tiếp tục dựa trên chữ ký, `aud`, hạn token, `sub`, email đã xác minh và nonce dùng một lần theo [tài liệu Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
