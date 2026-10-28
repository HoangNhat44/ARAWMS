/*
 * File: materialLabelPrint.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Prints persisted supplier material roll and lot barcodes with the physical identification details needed at the shelf.
 */
import { code128Svg } from './barcodePrint';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

/** Reprints the same saved barcode without creating another stock object. */
export const printMaterialLabels = (labels, tab = window.open('', '_blank')) => {
  if (!tab) throw new Error('Trình duyệt đang chặn cửa sổ in tem');
  const articles = labels.map((label) => `<article>
    <strong>${escapeHtml(label.materialCode)} · ${escapeHtml(label.materialName)}</strong>
    ${label.imageUrl ? `<img src="${escapeHtml(label.imageUrl)}" alt="${escapeHtml(label.barcode)}"/>` : code128Svg(label.barcode)}
    <p>Màu: ${escapeHtml(label.color || '—')} · Khổ: ${escapeHtml(label.widthCm ? `${label.widthCm} cm` : '—')}</p>
    <p>Số lượng lúc nhập: ${escapeHtml(label.quantity)} ${escapeHtml(label.unit || '')}</p>
    <p>Lô NCC: ${escapeHtml(label.supplierLotCode || '—')} · Ngày nhập: ${escapeHtml(label.receivedAt?.slice(0, 10) || '—')}</p>
    <p>Vị trí: ${escapeHtml((label.locationCodes || []).join(', ') || '—')} · ${label.quality === 'REJECTED' ? 'HÀNG KHÔNG ĐẠT' : 'HÀNG ĐẠT'}</p>
  </article>`).join('');
  tab.document.write(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Tem nguyên phụ liệu</title>
    <style>body{font-family:Arial;margin:16px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    article{border:1px solid #bbb;padding:8px;break-inside:avoid;overflow:hidden}svg,article img{display:block;width:100%;height:auto}
    p{margin:5px 0;font-size:12px}button{margin-bottom:12px}@media print{button{display:none}body{margin:0}}</style>
    <button onclick="print()">In tem</button><main>${articles}</main></html>`);
  tab.document.close();
};
