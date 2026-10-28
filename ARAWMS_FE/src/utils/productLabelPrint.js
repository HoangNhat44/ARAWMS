/*
 * File: productLabelPrint.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Prints one stable product-unit barcode per accepted finished product, using its Cloudinary image when available.
 */
import { code128Svg } from './barcodePrint';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

/** Each accepted physical unit produces exactly one printable label. */
export const printProductLabels = (labels, tab = window.open('', '_blank')) => {
  if (!tab) throw new Error('Trình duyệt đang chặn cửa sổ in tem');
  const articles = labels.map((label) => `<article>
    ${label.imageUrl ? `<img src="${escapeHtml(label.imageUrl)}" alt="${escapeHtml(label.barcode)}"/>` : code128Svg(label.barcode)}
    <strong>${escapeHtml(label.barcode)}</strong>
  </article>`).join('');
  tab.document.write(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Tem barcode sản phẩm</title>
    <style>body{font-family:Arial;margin:16px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    article{border:1px solid #bbb;padding:8px;break-inside:avoid;overflow:hidden;text-align:center}
    article img,svg{display:block;width:100%;height:auto}button{margin-bottom:12px}
    @media print{button{display:none}body{margin:0}}</style><button onclick="print()">In tem</button><main>${articles}</main></html>`);
  tab.document.close();
};
