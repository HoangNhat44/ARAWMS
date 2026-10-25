// Giới hạn cấp thử thách/kiểm tra Google theo IP; không thay thế khóa mật khẩu theo tài khoản.
const requests = new Map();
const windowMs = 5 * 60 * 1000;
export const googleRateLimit = (req, res, next) => {
  const now = Date.now();
  for (const [key, entry] of requests) if (entry.resetAt <= now) requests.delete(key);
  const key = req.ip;
  const entry = requests.get(key) || { count: 0, resetAt: now + windowMs };
  if ((!requests.has(key) && requests.size >= 10000) || entry.count >= 30) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    return res.status(429).json({ success: false, message: 'Quá nhiều yêu cầu Google. Vui lòng thử lại sau vài phút.' });
  }
  entry.count += 1;
  requests.set(key, entry);
  next();
};
