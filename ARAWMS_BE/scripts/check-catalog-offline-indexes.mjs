/*
 * File: check-catalog-offline-indexes.mjs
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Reports catalog index readiness without changing database data or structure.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI');
let connection;
try {
  connection = await mongoose.createConnection(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false }).asPromise();
  const db = connection.db;
  const products = db.collection('products');
  const duplicate = await products.aggregate([{ $match: { sampleCode: { $gt: '' } } },
    { $group: { _id: '$sampleCode', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } },
    { $limit: 1 }]).toArray();
  const productIndexes = await products.listIndexes().toArray();
  const hasSampleCodeIndex = productIndexes.some((index) => index.unique && index.key?.sampleCode === 1);
  const operationCollection = await db.listCollections({ name: 'catalog_operations' }).toArray();
  const operationIndexes = operationCollection.length
    ? await db.collection('catalog_operations').listIndexes().toArray() : [];
  const hasOperationIndex = operationIndexes.some((index) => index.unique &&
    index.key?.ownerUserId === 1 && index.key?.operationId === 1);
  console.log(JSON.stringify({ duplicateSampleCode: duplicate.length > 0,
    sampleCodeUniqueIndex: hasSampleCodeIndex, catalogOperationUniqueIndex: hasOperationIndex }));
} finally { await connection?.close(); }
