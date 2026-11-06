import CounterSequence from '../../models/CounterSequence.model.js';
import FabricRoll from '../../models/FabricRoll.model.js';
import MaterialStockLot from '../../models/MaterialStockLot.model.js';
import ProductUnit from '../../models/ProductUnit.js';
import Sku from '../../models/Sku.model.js';
import WarehouseBarcodeHistory from '../../models/WarehouseBarcodeHistory.model.js';
import WarehouseLocation from '../../models/WarehouseLocation.model.js';
import WarehouseStockBarcode from '../../models/WarehouseStockBarcode.model.js';

/** Issues one shared lot/roll code only during the confirmation transaction. */
export async function nextRawMaterialBarcode(session) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const barcode = await CounterSequence.getNextSequence('RAW_MATERIAL_STOCK_BARCODE', 'NPL', 6, { session });
    const existingBarcode = { $regex: `^${barcode}$`, $options: 'i' };
    const [lot, roll, product, sku, location, history, claim] = await Promise.all([
      MaterialStockLot.exists({ lotBarcode: existingBarcode }).session(session),
      FabricRoll.exists({ rollBarcode: existingBarcode }).session(session),
      ProductUnit.exists({ barcode: existingBarcode }).session(session),
      Sku.exists({ skuBarcode: existingBarcode }).session(session),
      WarehouseLocation.exists({ barcode: existingBarcode }).session(session),
      WarehouseBarcodeHistory.exists({ barcode: existingBarcode }).session(session),
      WarehouseStockBarcode.exists({ barcode }).session(session),
    ]);
    if (![lot, roll, product, sku, location, history, claim].some(Boolean)) return barcode;
  }
  throw new Error('Không cấp được barcode nguyên phụ liệu duy nhất');
}

/** Claims the code in a shared unique index together with the new stock object. */
export async function claimRawMaterialBarcode(entry, session) {
  await WarehouseStockBarcode.create([entry], { session });
}
