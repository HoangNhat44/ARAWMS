export const passwordError = (value, label = 'Mật khẩu') => {
  if (typeof value !== 'string' || !value) return label + ' không được để trống.';
  if (new TextEncoder().encode(value).length > 72) return label + ' không được vượt quá 72 byte.';
  return '';
};
