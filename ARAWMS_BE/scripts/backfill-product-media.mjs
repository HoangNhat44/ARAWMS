/*
 * File: backfill-product-media.mjs
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Copies product media URLs into named Cloudinary folders and updates catalog links.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import Product from '../src/models/Product.model.js';
import { configureProductCloudinary, copyProductMediaUrl, productMediaOptions } from '../src/common/services/productMediaStorage.js';

if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI');
configureProductCloudinary();

/** Reuses an asset from a previous interrupted run before copying its source URL. */
const ensureAsset = async (url, productCode, kind) => {
  const options = productMediaOptions(productCode, kind);
  try {
    return await cloudinary.api.resource(options.public_id, { resource_type: options.resource_type, type: 'upload' });
  } catch (error) {
    if (error?.http_code !== 404 && error?.error?.http_code !== 404) throw error;
    return copyProductMediaUrl(url, productCode, kind);
  }
};

let updated = 0;
let skipped = 0;
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const products = await Product.find({ isDeleted: { $ne: true } }).select('productCode thumbnailUrl imagePublicId videoUrl videoPublicId');
  for (const product of products) {
    for (const { kind, urlField, idField } of [
      { kind: 'image', urlField: 'thumbnailUrl', idField: 'imagePublicId' },
      { kind: 'video', urlField: 'videoUrl', idField: 'videoPublicId' },
    ]) {
      const sourceUrl = product[urlField];
      if (!sourceUrl || product[idField]) { skipped += 1; continue; }
      const asset = await ensureAsset(sourceUrl, product.productCode, kind);
      if (!asset?.secure_url || !asset?.public_id) throw new Error(`Thiếu thông tin Cloudinary cho ${product.productCode}`);
      const result = await Product.updateOne(
        { _id: product._id, [urlField]: sourceUrl, [idField]: { $exists: false } },
        { $set: { [urlField]: asset.secure_url, [idField]: asset.public_id } },
      );
      if (result.modifiedCount) { updated += 1; console.log(`${product.productCode}: ${kind} -> ${asset.public_id}`); }
    }
  }
  console.log(JSON.stringify({ updated, skipped }));
} finally {
  await mongoose.disconnect();
}
