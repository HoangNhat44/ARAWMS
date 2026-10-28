/**
 * ============================================================================
 * @title        : Toast Notification Context & Provider (React-Bootstrap)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-28
 * @lastModified : 2026-10-28
 * @description  : Hệ thống thông báo Web Notification (Toast) thay thế toàn bộ
 *                 window.alert() của trình duyệt, hiển thị mượt mà ở góc phải màn hình
 *                 bằng React-Bootstrap ToastContainer & Toast.
 * @module       : Common / Notification
 * @layer        : Front-end
 * ============================================================================
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';

const ToastContext = createContext(null);

const VARIANT_ICONS = {
  success: { icon: 'bi-check-circle-fill', color: 'text-success', title: 'Thành công' },
  danger:  { icon: 'bi-x-circle-fill',     color: 'text-danger',  title: 'Lỗi' },
  warning: { icon: 'bi-exclamation-triangle-fill', color: 'text-warning', title: 'Cảnh báo' },
  info:    { icon: 'bi-info-circle-fill',  color: 'text-primary', title: 'Thông báo' },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(({ message, title, variant = 'info', delay = 3500 }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, title, variant, delay }]);
    return id;
  }, []);

  const showSuccess = useCallback((message, title) => {
    return showToast({ message, title, variant: 'success' });
  }, [showToast]);

  const showError = useCallback((message, title) => {
    return showToast({ message, title, variant: 'danger' });
  }, [showToast]);

  const showWarning = useCallback((message, title) => {
    return showToast({ message, title, variant: 'warning' });
  }, [showToast]);

  const showInfo = useCallback((message, title) => {
    return showToast({ message, title, variant: 'info' });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo, removeToast }}>
      {children}

      {/* Vị trí hiển thị Toast cố định ở góc trên bên phải */}
      <ToastContainer
        position="top-end"
        className="p-3 position-fixed"
        style={{ zIndex: 99999, top: 12, right: 12 }}
      >
        {toasts.map((t) => {
          const meta = VARIANT_ICONS[t.variant] || VARIANT_ICONS.info;
          return (
            <Toast
              key={t.id}
              onClose={() => removeToast(t.id)}
              show={true}
              delay={t.delay}
              autohide
              className="shadow-lg border-0 mb-2 overflow-hidden"
              style={{ minWidth: 280, maxWidth: 420 }}
            >
              <Toast.Header className="d-flex align-items-center gap-2 border-bottom py-2">
                <i className={`bi ${meta.icon} ${meta.color} fs-6`} />
                <strong className="me-auto text-dark" style={{ fontSize: '0.85rem' }}>
                  {t.title || meta.title}
                </strong>
                <small className="text-muted" style={{ fontSize: '0.72rem' }}>Vừa xong</small>
              </Toast.Header>
              <Toast.Body className="bg-white text-dark small py-2.5 px-3" style={{ fontSize: '0.84rem', lineHeight: 1.45 }}>
                {t.message}
              </Toast.Body>
            </Toast>
          );
        })}
      </ToastContainer>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

export default ToastContext;
