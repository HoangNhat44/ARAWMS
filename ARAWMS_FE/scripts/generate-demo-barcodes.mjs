import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { BitArray, Code128Reader } = require('@zxing/library');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'san-pham-mau-50-barcode.json');
const output = path.join(root, 'docs', 'barcode-mau');
const patterns = Code128Reader.CODE_PATTERNS;
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]);

function encodeCode128B(value) {
  if (!/^[\x20-\x7e]+$/.test(value)) throw new Error(`Code 128 B không hỗ trợ mã: ${value}`);
  const values = [104, ...Array.from(value, (char) => char.charCodeAt(0) - 32)];
  const checksum = values.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  values.push(checksum, 106);
  return values.flatMap((code) => Array.from(patterns[code]));
}

function barcodeSvg(product) {
  const runs = encodeCode128B(product.barcode);
  const scale = 3;
  const quiet = 15;
  const width = (runs.reduce((sum, run) => sum + run, 0) + quiet * 2) * scale;
  let x = quiet * scale;
  const bars = runs.map((run, index) => {
    const segment = index % 2 === 0
      ? `<rect x="${x}" y="40" width="${run * scale}" height="90"/>` : '';
    x += run * scale;
    return segment;
  }).join('');
  const title = `${product.productName} · ${product.color} · ${product.size} · ${product.id}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="170" viewBox="0 0 ${width} 170" role="img" aria-label="Code 128 ${escapeXml(product.barcode)}">
<rect width="100%" height="100%" fill="#fff"/>
<text x="50%" y="25" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#111">${escapeXml(title)}</text>
<g fill="#000">${bars}</g>
<text x="50%" y="155" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" letter-spacing="2" fill="#111">${escapeXml(product.barcode)}</text>
</svg>\n`;
}

function verifySvg(svg, expected) {
  const width = Number(svg.match(/<svg[^>]+width="(\d+)"/)[1]);
  const row = new BitArray(width);
  for (const match of svg.matchAll(/<rect x="(\d+)" y="40" width="(\d+)" height="90"\/>/g)) {
    const x = Number(match[1]);
    row.setRange(x, x + Number(match[2]));
  }
  const actual = new Code128Reader().decodeRow(0, row).getText();
  if (actual !== expected) throw new Error(`Ảnh ${expected} giải mã thành ${actual}`);
}

const fixture = JSON.parse(await readFile(source, 'utf8'));
if (fixture.demoOnly !== true || fixture.barcodePolicy !== 'UNIQUE_PER_PHYSICAL_UNIT') {
  throw new Error('File mẫu không phải danh sách barcode riêng từng vật phẩm.');
}
const products = fixture.products;
if (new Set(products.map((item) => item.barcode)).size !== products.length) {
  throw new Error('Có barcode trùng trong file mẫu.');
}
await mkdir(output, { recursive: true });
for (const product of products) {
  if (product.barcodeFormat !== 'CODE_128' || !/^[A-Za-z0-9_-]{3,128}$/.test(product.barcode)) {
    throw new Error(`Barcode không hợp lệ: ${product.id}`);
  }
  const svg = barcodeSvg(product);
  verifySvg(svg, product.barcode);
  await writeFile(path.join(output, `${product.barcode}.svg`), svg, 'utf8');
}
const cards = products.map((product) => `<article>
  <img src="${encodeURIComponent(product.barcode)}.svg" alt="Barcode ${escapeXml(product.barcode)}">
  <p><strong>${escapeXml(product.productName)}</strong> · ${escapeXml(product.color)} · ${escapeXml(product.size)}<br>${escapeXml(product.id)} · ${escapeXml(product.sku)}</p>
  <a href="${encodeURIComponent(product.barcode)}.svg" download="${escapeXml(product.barcode)}.svg">Tải ảnh SVG</a>
</article>`).join('\n');
const html = `<!doctype html>
<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Barcode sản phẩm mẫu</title>
<style>
body{font:16px Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#222}
main{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
article{border:1px solid #ccc;padding:12px;break-inside:avoid}img{display:block;width:100%;max-width:700px;height:auto}p{line-height:1.5}
@media print{body{margin:0;max-width:none}article{border:1px solid #888}a,button{display:none}}
</style>
<h1>50 barcode sản phẩm mẫu · Code 128</h1>
<p>Mỗi ảnh ứng với một vật phẩm trong <code>san-pham-mau-50-barcode.json</code>. Mở ảnh trên thiết bị khác hoặc in trang này để quét bằng camera. Với đơn DEMO-ORD-001, quét DEMU00000001 và DEMU00000002.</p>
<button onclick="print()">In toàn bộ tem</button><main>${cards}</main></html>\n`;
await writeFile(path.join(output, 'index.html'), html, 'utf8');
console.log(`Đã tạo ${products.length} ảnh Code 128 và index.html tại ${output}`);
