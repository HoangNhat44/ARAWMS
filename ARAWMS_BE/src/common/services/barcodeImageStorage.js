/*
 * File: barcodeImageStorage.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Renders physical Code 128 labels and stores one deterministic Cloudinary image per received finished product or raw-material object.
 */
import bwipjs from 'bwip-js';
import { v2 as cloudinary } from 'cloudinary';
import FinishedGoodsBulkDocument from '../../models/FinishedGoodsBulkDocument.model.js';
import Product from '../../models/Product.model.js';
import ProductUnit from '../../models/ProductUnit.js';
import FabricRoll from '../../models/FabricRoll.model.js';
import MaterialStockLot from '../../models/MaterialStockLot.model.js';
import RawMaterial from '../../models/RawMaterial.model.js';
import { ARASTORE_CLOUDINARY_FOLDERS } from '../../config/cloudinaryFolders.js';
import { configureProductCloudinary } from './productMediaStorage.js';

const id = (value) => String(value || '');
const runningJobs = new Map();
const safeSegment = (value) => String(value || '').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 80);

/** Generates a scannable PNG whose visible text matches the persisted object barcode. */
export const renderBarcodePng = (barcode) => bwipjs.toBuffer({ bcid: 'code128', text: barcode,
  scale: 3, height: 16, includetext: true, textxalign: 'center', paddingwidth: 12, paddingheight: 10 });

/** Uses a stable public ID so a retry replaces the same asset instead of making a second label. */
async function uploadBarcode(folder, catalogCode, barcode) {
  configureProductCloudinary();
  const assetFolder = `${folder}/${safeSegment(catalogCode)}`;
  const publicId = `${assetFolder}/${safeSegment(barcode)}`;
  const png = await renderBarcodePng(barcode);
  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ resource_type: 'image', format: 'png',
      asset_folder: assetFolder, public_id: publicId, overwrite: true, unique_filename: false },
    (error, result) => error ? reject(error) : resolve(result));
    stream.end(png);
  });
  if (!uploaded?.secure_url || !uploaded?.public_id) throw new Error('Cloudinary không trả về ảnh barcode');
  return { barcodeImageUrl: uploaded.secure_url, barcodeImagePublicId: uploaded.public_id };
}

/** Limits concurrent Cloudinary writes while continuing past individual failures for retry. */
async function uploadMissing(objects, saveOne) {
  let cursor = 0;
  const failures = [];
  const workers = Array.from({ length: Math.min(4, objects.length) }, async () => {
    while (cursor < objects.length) {
      const object = objects[cursor++];
      try { await saveOne(object); }
      catch (error) { failures.push({ barcode: object.barcode || object.rollBarcode || object.lotBarcode,
        message: error.message }); }
    }
  });
  await Promise.all(workers);
  return failures;
}

/** Uploads one image for every accepted finished product unit in a receiving document. */
export async function syncFinishedGoodsBarcodeImages(documentId) {
  const document = await FinishedGoodsBulkDocument.findOne({ _id: documentId, direction: 'IN', isDeleted: { $ne: true } })
    .select('items.productId items.skuId').lean();
  if (!document) throw new Error('Không tìm thấy phiếu nhập thành phẩm');
  const products = await Product.find({ _id: { $in: document.items.map((item) => item.productId) } })
    .select('productCode').lean();
  const byProduct = new Map(products.map((item) => [id(item._id), item.productCode]));
  const codeBySku = new Map(document.items.map((item) => [id(item.skuId), byProduct.get(id(item.productId))]));
  const missing = await ProductUnit.find({ receivingDocumentId: documentId,
    $or: [{ barcodeImageUrl: { $exists: false } }, { barcodeImageUrl: null }, { barcodeImageUrl: '' }] })
    .select('barcode skuId').lean();
  const failures = await uploadMissing(missing, async (unit) => {
    const productCode = codeBySku.get(id(unit.skuId));
    if (!productCode) throw new Error('Không tìm thấy mã sản phẩm cho tem');
    const asset = await uploadBarcode(ARASTORE_CLOUDINARY_FOLDERS.productBarcodes, productCode, unit.barcode);
    await ProductUnit.updateOne({ _id: unit._id }, { $set: asset });
  });
  return { attempted: missing.length, failures };
}

/** Uploads one image per physical fabric roll or accessory lot on a confirmed receipt. */
export async function syncRawMaterialBarcodeImages(receiptId) {
  const [rolls, lots] = await Promise.all([
    FabricRoll.find({ inboundTicketId: receiptId,
      $or: [{ barcodeImageUrl: { $exists: false } }, { barcodeImageUrl: null }, { barcodeImageUrl: '' }] })
      .select('rollBarcode rawMaterialId').lean(),
    MaterialStockLot.find({ inboundTicketId: receiptId,
      $or: [{ barcodeImageUrl: { $exists: false } }, { barcodeImageUrl: null }, { barcodeImageUrl: '' }] })
      .select('lotBarcode rawMaterialId').lean(),
  ]);
  const materials = await RawMaterial.find({ _id: { $in: [...rolls, ...lots].map((item) => item.rawMaterialId) } })
    .select('materialCode').lean();
  const codeById = new Map(materials.map((item) => [id(item._id), item.materialCode]));
  const objects = [...rolls.map((item) => ({ ...item, barcode: item.rollBarcode, model: FabricRoll })),
    ...lots.map((item) => ({ ...item, barcode: item.lotBarcode, model: MaterialStockLot }))];
  const failures = await uploadMissing(objects, async (object) => {
    const materialCode = codeById.get(id(object.rawMaterialId));
    if (!materialCode) throw new Error('Không tìm thấy mã nguyên phụ liệu cho tem');
    const asset = await uploadBarcode(ARASTORE_CLOUDINARY_FOLDERS.rawMaterialBarcodes, materialCode, object.barcode);
    await object.model.updateOne({ _id: object._id }, { $set: asset });
  });
  return { attempted: objects.length, failures };
}

/** Schedules a retryable image job without making the stock transaction wait for Cloudinary. */
export function scheduleBarcodeImages(kind, sourceId) {
  const key = `${kind}:${sourceId}`;
  if (runningJobs.has(key)) return runningJobs.get(key);
  const job = Promise.resolve().then(() => kind === 'FINISHED_GOODS'
    ? syncFinishedGoodsBarcodeImages(sourceId) : syncRawMaterialBarcodeImages(sourceId))
    .then((result) => {
      if (result.failures.length) console.error('[Barcode images] Incomplete', key, result.failures);
      return result;
    })
    .catch((error) => { console.error('[Barcode images] Failed', key, error); return { attempted: 0, failures: [{ message: error.message }] }; })
    .finally(() => runningJobs.delete(key));
  runningJobs.set(key, job);
  return job;
}
