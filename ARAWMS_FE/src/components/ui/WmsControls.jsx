/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: Component Ant Design dùng chung, giữ cách nhận sự kiện của các form đang có.
 */
import { Children, cloneElement, forwardRef, isValidElement, useId, useRef, useState } from 'react';
import { Button, Checkbox, DatePicker, Form, Input, Select } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { useHref, useNavigate } from 'react-router-dom';
dayjs.locale('vi');

// Giữ mặc định submit như nút HTML; các nút chỉ mở/đóng form luôn truyền type="button".
export const WmsButton = forwardRef(function WmsButton({ type, className = '', danger, children, ...props }, ref) {
  const variant = className.includes('btn-ara-primary') ? 'primary' : className.includes('ara-text-button') || className.includes('input-action-btn') ? 'text' : 'default';
  return <Button {...props} ref={ref} htmlType={type || 'submit'} type={variant} danger={danger} className={`wms-button ${className}`}>{children}</Button>;
});

// Link điều hướng có hình thức nút Ant Design, vẫn hỗ trợ mở tab mới bằng Ctrl/click giữa.
export function WmsLinkButton({ to, state, className = '', children, disabled, ...props }) {
  const navigate = useNavigate(); const href = useHref(to);
  if (disabled) return <Button {...props} disabled className={`wms-button ${className}`}>{children}</Button>;
  return <Button {...props} href={href} type={className.includes('btn-ara-primary') ? 'primary' : 'default'} className={`wms-button ${className}`}
    onClick={(event) => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(to, { state }); } }}>{children}</Button>;
}

// Input dùng Ant Design nhưng vẫn giữ value/onChange/name, validation HTML và luồng OTP/mật khẩu cũ.
export const WmsInput = forwardRef(function WmsInput({ type = 'text', className = '', children, ...props }, ref) {
  if (type === 'checkbox') return <Checkbox {...props} ref={ref} className={`wms-checkbox ${className}`}>{children}</Checkbox>;
  if (type === 'date') return <WmsDateInput {...props} forwardedRef={ref} className={className} />;
  return <Input {...props} ref={ref} type={type} className={`wms-input ${className}`} />;
});
function WmsDateInput({ value, onChange, required, forwardedRef, ...props }) {
  const ref = useRef(null); const date = value ? dayjs(value) : null;
  return <span className="wms-date-field"><DatePicker {...props} ref={(instance) => { ref.current = instance; if (typeof forwardedRef === 'function') forwardedRef(instance); else if (forwardedRef) forwardedRef.current = instance; }}
    value={date?.isValid() ? date : null} format="DD/MM/YYYY" aria-required={required || undefined} placeholder="Chọn ngày"
    onChange={(next) => onChange?.({ target: { value: next?.format('YYYY-MM-DD') || '', name: props.name } })} />
    {required && <input className="wms-select-validation" aria-hidden="true" tabIndex={-1} value={value || ''} required onChange={() => {}}
      onInvalid={(event) => { event.preventDefault(); ref.current?.focus(); }} />}</span>;
}
export const WmsTextArea = forwardRef(function WmsTextArea(props, ref) {
  return <Input.TextArea rows={4} {...props} ref={ref} className={`wms-textarea ${props.className || ''}`} />;
});

export function WmsSelect({ children, onChange, value, required, className = '', id, ...props }) {
  const ref = useRef(null);
  const options = Children.toArray(children).filter(isValidElement).map((option) => ({
    value: option.props.value, label: option.props.children, disabled: option.props.disabled,
  }));
  // Ô kiểm tra ẩn giữ required của form HTML; lỗi được đưa tiêu điểm về Select đang thấy.
  return <span className={`wms-select-field ${className}`}><Select {...props} ref={ref} id={id} value={value} options={options}
    aria-required={required || undefined} onChange={(next) => onChange?.({ target: { value: next, name: props.name } })} />
    {required && <input className="wms-select-validation" aria-hidden="true" tabIndex={-1} value={value ?? ''} required onChange={() => {}}
      onInvalid={(event) => { event.preventDefault(); ref.current?.focus(); }} />}</span>;
}

// Form.Item cung cấp nhãn, dấu bắt buộc và lỗi dễ hiểu mà không đổi handler nghiệp vụ.
export function WmsField({ children, htmlFor, required, className = '', ...props }) {
  const generated = useId(); const [error, setError] = useState('');
  const nodes = Children.toArray(children);
  const index = nodes.findIndex((child) => isValidElement(child) && [WmsInput, WmsSelect, WmsTextArea].includes(child.type));
  // Nhãn có input ở wrapper riêng (các form xác thực cũ) vẫn liên kết bằng htmlFor.
  if (index < 0) return <label {...props} htmlFor={htmlFor} className={`wms-label ${className}`}>{required && <span className="wms-required" aria-hidden="true">* </span>}{children}</label>;
  const control = nodes[index]; const label = nodes.filter((_, i) => i !== index); const id = htmlFor || control.props.id || `wms-field-${generated}`;
  if (control.props.type === 'checkbox') return <Form.Item className={`wms-form-item wms-checkbox-item ${className}`}>
    {cloneElement(control, { id, children: label })}</Form.Item>;
  return <Form.Item {...props} className={`wms-form-item ${className}`} htmlFor={id} label={<span id={`${id}-label`}>{label}</span>}
    required={control.props.required} colon={false} layout="vertical" validateStatus={error ? 'error' : undefined} help={error ? <span id={`${id}-error`}>{error}</span> : undefined}>
    <div onInvalidCapture={(event) => setError(event.target.validity?.valueMissing ? 'Vui lòng nhập thông tin bắt buộc.' : event.target.validationMessage)}
      onInputCapture={() => setError('')}>
      {cloneElement(control, { id, 'aria-labelledby': `${id}-label`, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined })}
    </div></Form.Item>;
}
