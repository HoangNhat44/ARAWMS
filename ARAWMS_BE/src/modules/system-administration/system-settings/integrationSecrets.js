/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-02 - Mã hóa khóa API tại máy chủ, không gửi khóa đã lưu về FE.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { httpError } from '../../../common/utils/httpError.js';

// Khóa phải ổn định giữa các lần khởi động; không dùng JWT_SECRET ngẫu nhiên của môi trường dev.
const key = () => {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw httpError(503, 'Cần SETTINGS_ENCRYPTION_KEY hoặc JWT_SECRET ổn định từ 32 ký tự để lưu khóa API.');
  return createHash('sha256').update(`arawms-integrations:${secret}`).digest();
};
export const encryptSecret = (value) => {
  // Mỗi lần lưu có IV riêng; GCM phát hiện được dữ liệu mã hóa đã bị sửa.
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['enc', 'v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
};
export const decryptSecret = (value) => {
  if (!value) return '';
  // Cho phép đọc khóa cũ dạng thường; các lần cập nhật mới luôn lưu dạng mã hóa.
  if (!value.startsWith('enc:v1:')) return value;
  try {
    const [, , iv, tag, data] = value.split(':');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch { throw httpError(503, 'Không đọc được khóa API. Cần kiểm tra khóa mã hóa trên máy chủ.'); }
};
