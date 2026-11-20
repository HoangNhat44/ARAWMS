/*
 * File: locationLabelPrint.js
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Writes shelf-bin QR labels into an already opened print window.
 */
import { escapeHtml } from './warehouseFormat';

/** One large label: location code, QR image and the bin barcode. */
export const writeLocationLabel = (tab, { locationCode, barcode, imageUrl }) => {
  tab.document.open();
  tab.document.write(`<!doctype html><html><head><title>Tem QR vị trí kho</title>
    <style>body{font-family:Arial,sans-serif;text-align:center;padding:24px}
    img{display:block;width:70mm;max-width:100%;height:auto;margin:16px auto;image-rendering:pixelated}
    strong{display:block;font-size:24px;margin:16px}
    @media print{button{display:none}}</style></head><body>
    <button onclick="window.print()">In tem</button><strong>${escapeHtml(locationCode)}</strong>
    <img src="${imageUrl}" alt="QR ${escapeHtml(locationCode)}">
    <p>${escapeHtml(barcode)}</p></body></html>`);
  tab.document.close();
};

/** Several labels, two per row. */
export const writeLocationLabels = (tab, labels) => {
  tab.document.open();
  tab.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tem vị trí kho</title><style>
    body{font-family:Arial,sans-serif;padding:20px}button{margin-bottom:16px}.labels{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    article{border:1px solid #bbb;padding:15px;text-align:center;break-inside:avoid}strong{display:block;font-size:20px}
    img{display:block;width:55mm;max-width:100%;margin:12px auto}@media print{button{display:none}}
    </style></head><body><button onclick="window.print()">In tem</button><div class="labels">${labels.map((label) =>
    `<article><strong>${escapeHtml(label.locationCode)}</strong><img src="${label.imageUrl}" alt="QR ${escapeHtml(label.locationCode)}"><code>${escapeHtml(label.barcode)}</code></article>`).join('')}</div></body></html>`);
  tab.document.close();
};
