import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { createTestToken } from './support/authSession.mjs';

test('workspace APIs reject guests and mismatched roles', async () => {
  const database = await MongoMemoryServer.create();
  try {
    await mongoose.connect(database.getUri());
    const tokens = {};
    for (const role of ['ACCOUNTANT', 'SELLER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'GARMENT_TECHNICIAN']) {
      tokens[role] = await createTestToken(role);
    }
    const cases = [
      ['get', '/api/owner/contracts/example', 'ACCOUNTANT'],
      ['get', '/api/payment-vouchers/categories', 'SELLER'],
      ['get', '/api/conversations', 'ACCOUNTANT'],
      ['get', '/api/stocktake/options', 'SELLER'],
      ['get', '/api/raw-material-inbound/options', 'SELLER'],
      ['post', '/api/raw-material-outbound/requests/id/approve-and-assign', 'WAREHOUSE_STAFF'],
      ['get', '/api/warehouse-putaway/tasks', 'WAREHOUSE_MANAGER'],
      ['post', '/api/products/bulk/documents', 'WAREHOUSE_STAFF'],
      ['get', '/api/products/configuration/id', 'WAREHOUSE_STAFF'],
      ['get', '/api/garment-technical/inbound-verification/options', 'ACCOUNTANT'],
      ['get', '/api/garment-technical/remnant-recovery/return-requests', 'GARMENT_TECHNICIAN'],
      ['get', '/api/shipping/orders', 'SELLER'],
      ['get', '/api/order-qr/orders', 'ACCOUNTANT'],
      ['get', '/api/packing/sessions/example', 'SELLER'],
    ];
    for (const [method, path, role] of cases) {
      assert.equal((await request(app)[method](path)).status, 401, path);
      assert.equal((await request(app)[method](path).auth(tokens[role], { type: 'bearer' })).status, 403, path);
    }
    const allowed = [
      ['/api/payment-vouchers/categories', 'ACCOUNTANT'],
      ['/api/products', 'WAREHOUSE_STAFF'],
      ['/api/raw-material-outbound/tickets', 'WAREHOUSE_STAFF'],
      ['/api/garment-technical/remnant-recovery/outbound-requests', 'WAREHOUSE_MANAGER'],
      ['/api/garment-technical/inbound-verification/options', 'GARMENT_TECHNICIAN'],
    ];
    for (const [path, role] of allowed) {
      assert.equal((await request(app).get(path).auth(tokens[role], { type: 'bearer' })).status, 200, path);
    }
  } finally {
    await mongoose.disconnect();
    await database.stop();
  }
});
