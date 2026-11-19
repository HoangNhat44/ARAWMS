/*
 * File: warehouseFormat.js
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Formatting helpers shared by the warehouse screens and label printing.
 */

/** Escapes text for insertion into HTML written to a print window. */
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

/** ID of a populated document, a plain ID object, or an ID string. */
export const toId = (value) => String(value?._id || value?.id || value || '');

/** Vietnamese number format; missing values show as 0. */
export const formatNumber = (value, options) => Number(value || 0).toLocaleString('vi-VN', options);

/** Amount in Vietnamese dong, e.g. "125.000 ₫"; missing values show as 0. */
export const formatVnd = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;

/** Amount in dong as on order labels, e.g. "125.000 đ"; a missing amount shows as "—". */
export const formatOrderMoney = (value) => (value == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`);

/** Short date and time, e.g. "18/11/26 14:05"; a missing date shows as "—". */
export const formatShortDateTime = (value) => (value ? new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value)) : '—');
