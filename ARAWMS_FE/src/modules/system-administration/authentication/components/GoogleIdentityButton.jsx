import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity } from '../services/googleIdentity';

export default function GoogleIdentityButton({ challenge, onCredential, onError, onBusyChange, disabled = false }) {
  const container = useRef(null);
  const handlers = useRef({ onCredential, onError, onBusyChange, disabled });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  handlers.current = { onCredential, onError, onBusyChange, disabled };
  useEffect(() => {
    let active = true;
    const element = container.current;
    loadGoogleIdentity().then((google) => {
      if (!active) return;
      google.initialize({
        client_id: challenge.clientId, nonce: challenge.nonce, auto_select: false, button_auto_select: false,
        callback: async ({ credential }) => {
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
    return () => { active = false; element?.replaceChildren(); };
  }, [challenge]);
  return <div className="ara-google-button">
    <div ref={container} aria-disabled={busy || disabled} style={{ pointerEvents: busy || disabled ? 'none' : undefined, opacity: busy || disabled ? 0.6 : 1 }} />
    {busy && <p role="status" className="ara-section-note">Đang xác minh Google...</p>}
  </div>;
}
