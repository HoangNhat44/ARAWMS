// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-01/04/06 - Nhãn và hướng dẫn tiếng Việt phổ thông.
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06 đến UC-20 - Validation FE, BE tiếp tục kiểm tra độc lập.
 */
import { fullNameError } from './accountValidation';
// UC-06: Báo lỗi ngay tại form; cùng giới hạn mã/tên/email/điện thoại với BE.
export const employeeError = (form) => {
  if (!/^[A-Z0-9][A-Z0-9_-]{1,29}$/i.test(form.employeeCode.trim())) return 'Mã nhân viên cần 2–30 chữ cái, số, gạch nối hoặc gạch dưới.';
  const nameError = fullNameError(form.fullName); if (nameError) return nameError;
  if (form.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Địa chỉ thư điện tử không hợp lệ.';
  if (form.phone && !/^0\d{9}$/.test(form.phone)) return 'Số điện thoại cần 10 chữ số, bắt đầu bằng 0.';
  if (!form.roleCode || form.roleCode === 'OWNER') return 'Cần chọn vai trò nhân viên.';
  // Đếm byte UTF-8 thay vì chỉ đếm ký tự để mật khẩu có dấu không vượt giới hạn bcrypt.
  if (!form.password.trim() || form.password.length < 8 || new TextEncoder().encode(form.password).length > 72) return 'Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte.';
  if (form.password !== form.confirmPassword) return 'Xác nhận mật khẩu không khớp.';
  return '';
};
// UC-07/08/09: Lý do phải đủ để hiểu vì sao tài khoản hoặc quyền bị thay đổi.
export const reasonError = (value) => value.trim().length < 5 || value.length > 500 || /[\u0000-\u001f\u007f]/u.test(value)
  ? 'Lý do cần từ 5 đến 500 ký tự, không chứa ký tự điều khiển.' : '';
// Lấy ngày theo giờ Việt Nam, không dùng múi giờ mặc định của thiết bị.
export const todayOwner = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const defaultOwnerDates = () => { const to = todayOwner(); return { from: `${to.slice(0, 7)}-01`, to }; };
// UC-12/13/14/17: Kiểm tra ngày tồn tại, đúng thứ tự và không quá 366 ngày trước khi gọi API.
export const dateRangeError = ({ from, to }) => {
  const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!date(from) || !date(to)) return 'Cần nhập hai ngày hợp lệ.';
  const span = Date.parse(to) - Date.parse(from);
  return span < 0 || span >= 366 * 86400000 ? 'Khoảng ngày cần đúng thứ tự và tối đa 366 ngày.' : '';
};
