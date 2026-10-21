import { readFile } from 'node:fs/promises';
import ProductUnit from '../../models/ProductUnit.js';

const demoUnitsUrl = new URL('../../../san-pham-mau-50-barcode.json', import.meta.url);

export const findProductUnit = async (sourceType, barcode, dbSession) => {
  if (sourceType === 'DEMO') {
    const fixture = JSON.parse(await readFile(demoUnitsUrl, 'utf8'));
    if (fixture.demoOnly !== true || fixture.barcodePolicy !== 'UNIQUE_PER_PHYSICAL_UNIT') return null;
    return fixture.products.find((unit) => unit.barcode === barcode) || null;
  }
  return ProductUnit.findOne({ barcode }).session(dbSession).lean();
};
