/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04, UC-05 - Tải thư viện Google Identity Services dùng
 * chung.
 */

let scriptPromise;

// Dùng một script Google Identity Services cho toàn bộ ứng dụng.
// UC-04, UC-05: Tái sử dụng thư viện Google đã tải, tránh chèn nhiều script.
export const loadGoogleIdentity = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timer = setTimeout(() => { script.remove(); scriptPromise = null; reject(new Error('Tải Google quá lâu. Vui lòng thử lại.')); }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else { script.remove(); scriptPromise = null; reject(new Error('Không khởi tạo được đăng nhập Google.')); }
    };
    script.onerror = () => {
      clearTimeout(timer); script.remove(); scriptPromise = null;
      reject(new Error('Không tải được Google. Hãy kiểm tra kết nối và thử lại.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
};
