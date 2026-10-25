# Đăng nhập Owner và liên kết Google

## Dùng ngay bằng tài khoản

- Email: `owner@arawms.com` hoặc mã `EMP001`.
- Mật khẩu được cấp cho Owner chưa có mật khẩu: `12345678`.
- Vào **Tài khoản của tôi** để đổi mật khẩu. Đổi mật khẩu sẽ kết thúc các phiên đăng nhập trên thiết bị.
- Các role nhân viên tiếp tục dùng luồng đăng nhập hiện tại.

Mở hai terminal PowerShell:

```powershell
cd "D:\do an\ARAWMS\ARAWMS_BE"
npm install
npm run dev
```

```powershell
cd "D:\do an\ARAWMS\ARAWMS_FE"
npm install
npm run dev
```

Truy cập http://localhost:5173. BE dùng cổng 5000. Nếu báo cổng đang được sử dụng, kiểm tra terminal BE đã chạy và dùng phiên đó, hoặc dừng đúng phiên cũ bằng Ctrl+C rồi khởi động lại.

## Bật Google khi chưa có Client ID

1. Vào [Google Cloud Console – Clients](https://console.cloud.google.com/auth/clients), tạo hoặc chọn project.
2. Trong **Google Auth Platform → Branding**, thiết lập tên AraWMS và email hỗ trợ.
3. Tạo OAuth Client, loại **Web application**.
4. Trong **Authorized JavaScript origins**, thêm `http://localhost` và `http://localhost:5173`. Nếu dùng tên miền/cổng khác, thêm đúng origin đó.
5. Sao chép Client ID có đuôi `.apps.googleusercontent.com`.
6. Thêm vào file `ARAWMS_BE/.env`:

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
CLIENT_URL=http://localhost:5173
```

7. Khởi động lại BE và tải lại trang FE. FE tự lấy Client ID từ BE, không cần biến môi trường Google riêng.
8. Dùng nút Google trên trang đăng nhập sau khi liên kết theo hướng dẫn dưới đây.

Ứng dụng dùng JavaScript callback của Google Identity Services, nên luồng này không cần Client Secret hoặc redirect callback URL. Không nhập Client Secret vào FE. Chỉ dùng thông tin định danh cơ bản, không yêu cầu quyền đọc Gmail hay Drive.

Nguồn: [Thiết lập Google Identity Services](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

## Liên kết lần đầu

1. Đăng nhập Owner bằng email/mã nhân viên và mật khẩu.
2. Bấm tên tài khoản trên thanh điều hướng, mở **Tài khoản của tôi**.
3. Trong **Liên kết Google**, nhập mật khẩu hiện tại và bấm **Xác nhận và chọn Google**.
4. Bấm nút Google, chọn tài khoản Google muốn liên kết và xác nhận.
5. Trang hiển thị **Đã liên kết Google** và email Google.
6. Đăng xuất. Trở lại trang đăng nhập, chọn Google vừa liên kết để đăng nhập vào chính tài khoản Owner cũ.

Email Google có thể khác email nội bộ `owner@arawms.com`. Email đăng nhập nội bộ, mã nhân viên và role không thay đổi. Chỉ Google đã liên kết mới đăng nhập được; chọn một Google bất kỳ sẽ không tự tạo Owner.

Một Google chỉ liên kết được với một tài khoản. Đăng nhập mật khẩu vẫn dùng được sau khi liên kết. Khi Google chưa cấu hình hoặc không tải được, giao diện hiển thị thông báo và cho phép dùng tài khoản.

## Hủy liên kết và đổi tài khoản Google

1. Vào **Tài khoản của tôi → Liên kết Google**, bấm **Hủy liên kết**.
2. Nhập mật khẩu tài khoản AraWMS và bấm **Xác nhận hủy liên kết**. Bấm **Giữ liên kết** nếu đổi ý.
3. Sau khi hủy, Google cũ không đăng nhập được nữa. Phiên hiện tại được giữ lại, các phiên trên thiết bị khác bị thu hồi.
4. Nhập lại mật khẩu và chọn Google mới để liên kết.

Hủy liên kết vẫn thực hiện được khi cấu hình Google đang tắt. Mỗi lần liên kết/hủy làm tăng phiên bản liên kết trong User; yêu cầu liên kết cũ không thể tự khôi phục Google đã hủy, kể cả khi gửi đồng thời.

## Cấu trúc file

BE: `src/modules/system-administration/`

- `authentication/auth.*`: đăng nhập tài khoản, tạo phiên, đăng xuất.
- `authentication/googleAuth.controller.js`, `googleAuth.service.js`: đăng nhập Owner bằng Google.
- `authentication/googleIdentity.service.js`: cấp và xác minh thử thách, kiểm tra Google ID token.
- `authentication/googleRateLimit.js`: giới hạn yêu cầu Google.
- `account-governance/googleLink.controller.js`, `googleLink.service.js`: xác nhận mật khẩu và liên kết Google.
- `account-governance/googleLink.validation.js`: kiểm tra mật khẩu xác nhận liên kết/hủy.
- `authentication/googleAuth.validation.js`: kiểm tra payload xác thực Google.
- `account-governance/accountGovernance.*`: xem/cập nhật hồ sơ, đổi mật khẩu cho cả Owner.
- `src/models/User.model.js`: lưu Google ID, email, ngày liên kết.
- `src/models/GoogleAuthChallenge.model.js`: thử thách dùng một lần, hết hạn sau 5 phút, có TTL index.

FE: `src/modules/system-administration/`

- `authentication/components/GoogleLogin.jsx`: khối đăng nhập Google.
- `authentication/components/GoogleIdentityButton.jsx`: nút Google dùng chung.
- `authentication/services/googleIdentity.js`: tải Google Identity Services.
- `account-governance/components/GoogleLinkCard.jsx`: liên kết và trạng thái Google.
- `systemAdministration.css`: bổ sung giao diện theo màu sắc, bố cục hiện tại.

## API

| Phương thức | Đường dẫn | Mục đích |
| --- | --- | --- |
| GET | /api/auth/google/config | Trạng thái cấu hình và Client ID công khai |
| POST | /api/auth/google/challenge | Tạo thử thách đăng nhập |
| POST | /api/auth/google/login | Đăng nhập bằng credential, challengeId và rememberMe |
| POST | /api/accounts/me/google/challenge | Owner xác nhận currentPassword để liên kết |
| POST | /api/accounts/me/google | Owner gửi credential và challengeId để hoàn tất liên kết |
| DELETE | /api/accounts/me/google | Owner gửi currentPassword để hủy liên kết |

Các API tài khoản cần Bearer token. Dữ liệu Google được xác minh trên BE bằng thư viện `google-auth-library`: chữ ký, issuer, audience, hạn token, email đã xác minh và nonce. Google `sub` là định danh liên kết, không dùng email để tự nhận quyền Owner. Thử thách liên kết gắn với tài khoản, phiên và mật khẩu tại thời điểm xác nhận; không thể dùng lại sau khi đã tiêu thụ.

Google login và mật khẩu dùng cùng cơ chế session hiện có: 8 giờ, hoặc 7 ngày nếu ghi nhớ đăng nhập. Đăng xuất thu hồi phiên hiện tại. Tài khoản/role bị khóa hoặc xóa mềm không được đăng nhập. Các thao tác được ghi SystemLog. Giới hạn Google là 30 yêu cầu/IP/5 phút trên mỗi tiến trình BE.

Nguồn: [Xác minh Google ID token trên server](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Chuẩn bị Owner trên môi trường khác

`scripts/prepareOwnerLogin.js` mặc định chỉ đọc trạng thái Owner. Không tự tạo Owner mới, không ghi đè mật khẩu đã có.

```powershell
cd "D:\do an\ARAWMS\ARAWMS_BE"
node scripts/prepareOwnerLogin.js
$env:OWNER_INITIAL_PASSWORD = "mat-khau-ban-chon"
node scripts/prepareOwnerLogin.js --apply
Remove-Item Env:OWNER_INITIAL_PASSWORD
```

Chế độ `--apply` tạo unique index cho Google ID và chỉ cấp mật khẩu cho Owner đang thiếu mật khẩu. DB của dự án hiện tại đã được chuẩn bị.

## Kiểm tra đã thực hiện

- FE build thành công; kiểm tra cú pháp JS BE và lỗi khoảng trắng trong diff.
- 98 kiểm tra tích hợp trên API với MongoDB: đăng nhập, xác nhận mật khẩu, liên kết/hủy/đổi Google, thu hồi phiên khác, từ chối Google cũ, ngăn yêu cầu liên kết cũ khôi phục liên kết, token sai chữ ký/issuer/audience/nonce/hết hạn, chống replay, liên kết trùng, khóa tài khoản, đổi mật khẩu và thiếu cấu hình Google.
- Rà validation BE/FE: trường trống, sai kiểu, mật khẩu quá 72 byte, mật khẩu mới quá ngắn/chỉ chứa khoảng trắng/không khớp, email hoặc role gửi thêm, họ tên quá dài, số điện thoại sai và payload Google không hợp lệ.
- Google token trong kiểm tra tích hợp dùng cặp khóa RSA tạm; vẫn chạy bước xác minh chữ ký của thư viện Google. Chỉ thay nguồn chứng chỉ trong tiến trình kiểm tra, không sửa mã xác minh của ứng dụng.
- Tài khoản và bản ghi kiểm tra đã được dọn. Không thêm file test vào dự án.
- Kiểm tra token Google tự ký chỉ phục vụ kiểm tra API; không thay thế việc chọn tài khoản Google thật trên trình duyệt.
