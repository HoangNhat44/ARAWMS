import { Code128Reader } from '@zxing/library';

export const code128Svg = (value) => {
  if (!/^[A-Z0-9_-]{3,128}$/.test(value)) throw new Error('Barcode không hợp lệ');
  const patterns = Code128Reader.CODE_PATTERNS;
  const codes = [104, ...Array.from(value, (char) => char.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  codes.push(checksum, 106);
  const runs = codes.flatMap((code) => Array.from(patterns[code]));
  let x = 24;
  const bars = runs.map((run, index) => {
    const bar = index % 2 === 0 ? `<rect x="${x}" y="12" width="${run * 2}" height="78"/>` : '';
    x += run * 2;
    return bar;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x + 24}" height="116" viewBox="0 0 ${x + 24} 116"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g><text x="50%" y="108" text-anchor="middle" font-family="Arial" font-size="14">${value}</text></svg>`;
};

export const printBarcodes = (barcodes, tab = window.open('', '_blank')) => {
  if (!tab) throw new Error('Trình duyệt đang chặn cửa sổ in tem');
  const labels = barcodes.map((barcode) => `<article>${code128Svg(barcode)}</article>`).join('');
  tab.document.write(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Tem barcode thành phẩm</title><style>body{font-family:Arial;margin:16px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}article{border:1px solid #bbb;padding:8px;break-inside:avoid;overflow:hidden}svg{display:block;width:100%;height:auto}button{margin-bottom:12px}@media print{button{display:none}body{margin:0}}</style><button onclick="print()">In tem</button><main>${labels}</main></html>`);
  tab.document.close();
};
