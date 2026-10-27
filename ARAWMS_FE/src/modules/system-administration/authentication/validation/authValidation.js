/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-04; GBR-02 - Kiểm tra mật khẩu và xác nhận mật khẩu
 * trên giao diện.
 */

// UC-01, UC-04: Chặn mật khẩu trống hoặc vượt quá giới hạn bcrypt.
export const passwordError = (value, label = 'Mật khẩu') => {
  if (typeof value !== 'string' || !value) return label + ' không được để trống.';
  if (new TextEncoder().encode(value).length > 72) return label + ' không được vượt quá 72 byte.';
  return '';
};

// UC-04, GBR-02: Kiểm tra độ dài mật khẩu mới và ô xác nhận.
export const newPasswordError = (password, confirmation) => {
  const invalid = passwordError(password, 'Mật khẩu mới');
  if (invalid) return invalid;
  if (!password.trim() || password.length < 8) return 'Mật khẩu mới phải có ít nhất 8 ký tự.';
  if (password !== confirmation) return 'Xác nhận mật khẩu mới không khớp.';
  return '';
};
