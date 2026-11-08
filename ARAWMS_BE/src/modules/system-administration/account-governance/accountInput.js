/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-04 - Kiểm tra tên, email và số điện thoại Việt Nam.
 */

export const validEmail = (value) => typeof value === 'string' && value.length <= 254
  && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(value)
  && !value.startsWith('.') && !value.includes('..') && !value.includes('.@');

export const validIdentifier = (value) => typeof value === 'string'
  && (value.includes('@') ? validEmail(value.trim()) : /^[A-Z0-9_-]{1,50}$/i.test(value.trim()));

export const normalizeFullName = (value) => typeof value === 'string'
  ? value.normalize('NFC').trim().replace(/ +/g, ' ') : '';
export const validFullName = (value) => value.length >= 2 && value.length <= 100
  && /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value)
  && (value.match(/\p{L}/gu) || []).length >= 2;

// UC-04: Chỉ nhận đúng 10 chữ số và bắt đầu bằng 0.
export const normalizePhone = (value) => {
  return typeof value === 'string' && value.length === 10 && /^0\d{9}$/.test(value) ? value : null;
};
