/*
 * File: remove-legacy-code-image-fields.mjs
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Removes obsolete Cloudinary references for QR and barcode label images.
 * QR and barcode images are now rendered on demand from the codes themselves, so these fields
 * are no longer read anywhere. Only the image reference fields are unset; tokens, barcodes and
 * every other field stay untouched.
 *
 * Usage:
 *   node scripts/remove-legacy-code-image-fields.mjs           # dry-run: counts only
 *   node scripts/remove-legacy-code-image-fields.mjs --apply   # unset the fields
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const apply = process.argv.includes('--apply');

// Raw collection names are used because the fields were removed from the Mongoose schemas.
const TARGETS = [
  { collection: 'sales_orders', fields: ['qr.qrImagePublicId'] },
  { collection: 'order_qr_tokens', fields: ['qrImagePublicId'] },
  { collection: 'product_units', fields: ['barcodeImageUrl', 'barcodeImagePublicId'] },
  { collection: 'fabric_rolls', fields: ['barcodeImageUrl', 'barcodeImagePublicId'] },
  { collection: 'material_stock_lots', fields: ['barcodeImageUrl', 'barcodeImagePublicId'] },
];

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Thiếu MONGODB_URI');

await mongoose.connect(uri);
try {
  const db = mongoose.connection.db;
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  const report = [];
  for (const { collection, fields } of TARGETS) {
    if (!existing.has(collection)) {
      report.push({ collection, skipped: 'collection không tồn tại' });
      continue;
    }
    const filter = { $or: fields.map((field) => ({ [field]: { $exists: true } })) };
    const matched = await db.collection(collection).countDocuments(filter);
    let modified = 0;
    if (apply && matched) {
      const result = await db.collection(collection).updateMany(filter,
        { $unset: Object.fromEntries(fields.map((field) => [field, ''])) });
      modified = result.modifiedCount;
      const remaining = await db.collection(collection).countDocuments(filter);
      if (remaining) throw new Error(`${collection}: còn ${remaining} bản ghi chưa xoá trường cũ`);
    }
    report.push({ collection, fields, documentsWithFields: matched, ...(apply ? { modified } : {}) });
  }
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', report }, null, 2));
} finally {
  await mongoose.disconnect();
}
