/*
 * File: smoke-warehouse-reads.mjs
 * Description: Calls read-only warehouse API routes without printing business data.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
await mongoose.connect(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false,
  serverSelectionTimeoutMS: 10_000 });
try {
  const paths = [
    '/api/raw-material-inbound/plans',
    '/api/raw-material-outbound/options',
    '/api/raw-material-outbound/tickets',
    '/api/products/bulk/documents',
    '/api/order-qr/orders',
    '/api/stocktake/options',
    '/api/warehouse-layout/layout',
    '/api/warehouse-putaway/tasks',
  ];
  const results = [];
  for (const path of paths) {
    const response = await request(app).get(path);
    results.push({ path, status: response.status });
  }
  console.log(JSON.stringify(results));
  if (results.some((result) => result.status !== 200)) process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
