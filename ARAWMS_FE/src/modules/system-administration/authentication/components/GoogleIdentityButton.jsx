/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04, UC-05 - Hiển thị nút Google dùng cho đăng nhập và liên
 * kết.
 */

import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity } from '../services/googleIdentity';

export default function GoogleIdentityButton({ challenge, onCredential, onError, onBusyChange, disabled = false }) {
  const container = useRef(null);
  const handlers = useRef({ onCredential, onError, onBusyChange, disabled });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  handlers.current = { onCredential, onError, onBusyChange, disabled };
  // UC-04, UC-05: Gắn mã nonce do BE cấp vào lần xác thực Google này.
  useEffect(() => {
    let active = true;
    const element = container.current;
    loadGoogleIdentity().then((google) => {
      if (!active) return;
      google.initialize({
        client_id: challenge.clientId, nonce: challenge.nonce, auto_select: false, button_auto_select: false,
        /*
         * UC-04, UC-05: Gửi kết quả Google về BE; không tự quyết định quyền
         * đăng nhập trên FE.
         */
        callback: async ({ credential }) => {
          /*
           * Không gửi lặp yêu cầu khi đang xử lý hoặc khi nút không được phép
           * dùng.
           */
          if (!active || inFlight.current || handlers.current.disabled) return;
          inFlight.current = true; setBusy(true); handlers.current.onBusyChange?.(true);
          try { await handlers.current.onCredential({ credential, challengeId: challenge.challengeId }); }
          catch (error) { if (active) handlers.current.onError(error); }
          finally {
            inFlight.current = false;
            handlers.current.onBusyChange?.(false);
            if (active) setBusy(false);
          }
        },
      });
      google.renderButton(element, {
        // Nút medium không hiển thị tên/email từ phiên Google của trình duyệt.
        type: 'standard', theme: 'outline', size: 'medium', text: 'signin_with', locale: 'vi',
        width: Math.max(200, Math.min(300, element.parentElement?.clientWidth || 300)),
      });
    }).catch((error) => { if (active) handlers.current.onError(error); });
    // Dọn nút khi rời trang để không xử lý kết quả của màn hình đã đóng.
    return () => { active = false; element?.replaceChildren(); };
  }, [challenge]);
  return <div className="ara-google-button">
    <div ref={container} aria-disabled={busy || disabled} style={{ pointerEvents: busy || disabled ? 'none' : undefined, opacity: busy || disabled ? 0.6 : 1 }} />
    {busy && <p role="status" className="ara-section-note">Đang xác minh Google...</p>}
  </div>;
}
