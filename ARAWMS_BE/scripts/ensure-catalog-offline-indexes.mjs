/*
 * File: ensure-catalog-offline-indexes.mjs
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Creates the unique account and operation index required for catalog retry safety.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import CatalogOperation from '../src/models/CatalogOperation.model.js';
import Product from '../src/models/Product.model.js';

if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI');
try {
  await mongoose.connect(process.env.MONGODB_URI);
  const duplicates = await Product.aggregate([{ $match: { sampleCode: { $gt: '' } } },
    { $group: { _id: '$sampleCode', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } },
    { $limit: 1 }]);
  if (duplicates.length) throw new Error('products đã có mã mẫu trùng; cần xử lý trước khi tạo index duy nhất.');
  await CatalogOperation.createIndexes();
  await Product.collection.createIndex({ sampleCode: 1 }, { unique: true,
    partialFilterExpression: { sampleCode: { $gt: '' } } });
  console.log('Đã tạo index catalog_operations(ownerUserId, operationId) và products(sampleCode).');
} finally { await mongoose.disconnect(); }
