/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Hạn chế gửi quá nhiều yêu cầu khôi phục
 * mật khẩu.
 */

const requests = new Map();
const windowMs = 15 * 60 * 1000;
// GBR-02: Giới hạn số yêu cầu khôi phục theo IP để tránh gửi email liên tục.
export const recoveryRateLimit = (req, res, next) => {
  const now = Date.now();
  for (const [key, value] of requests) if (value.expiresAt <= now) requests.delete(key);
  const entry = requests.get(req.ip) || { count: 0, expiresAt: now + windowMs };
  if (entry.count >= 20 || (!requests.has(req.ip) && requests.size >= 10000)) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))));
    return res.status(429).json({ success: false, message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' });
  }
  entry.count += 1; requests.set(req.ip, entry);
  next();
};
