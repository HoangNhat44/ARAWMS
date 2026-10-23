import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BitArray, Code128Reader } = require('@zxing/library');
const bundle = readdirSync(new URL('../dist/assets/', import.meta.url))
  .find((name) => name.startsWith('barcodePrint-') && name.endsWith('.js'));
if (!bundle) throw new Error('Hãy build frontend trước khi kiểm tra barcode');
const { code128Svg } = await import(new URL(`../dist/assets/${bundle}`, import.meta.url));
const barcode = 'ARA12345678901234567890';
const svg = code128Svg(barcode);
const width = Number(svg.match(/<svg[^>]+width="(\d+)"/)[1]);
const row = new BitArray(width);
for (const match of svg.matchAll(/<rect x="(\d+)" y="12" width="(\d+)" height="78"\/>/g)) {
  row.setRange(Number(match[1]), Number(match[1]) + Number(match[2]));
}
const actual = new Code128Reader().decodeRow(0, row).getText();
if (actual !== barcode) throw new Error(`Barcode giải mã sai: ${actual}`);
console.log(`Barcode Code 128 giải mã đúng: ${actual}`);
