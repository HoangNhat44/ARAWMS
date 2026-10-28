/*
 * File: packingVerification.test.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Unit tests for Packing Verification (Quét mã đóng hàng)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../../app');
const SalesOrder = require('../../../models/SalesOrder.model');
const ProductUnit = require('../../../models/ProductUnit.js');
const PackingSession = require('../../../models/PackingSession.js');
const PackingScanEvent = require('../../../models/PackingScanEvent.js');
const OrderQrToken = require('../../../models/OrderQrToken.js');
const Sku = require('../../../models/Sku.model');

describe('Packing Verification Module (Quét mã đóng hàng)', () => {
  let testOrder;
  let testSku;
  let testQrToken;
  let testProductUnits;
  let packingSession;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/arawms_test');
    }
  });

  afterAll(async () => {
    await SalesOrder.deleteMany({ orderCode: /^TEST-/ });
    await ProductUnit.deleteMany({ barcode: /^TEST-/ });
    await PackingSession.deleteMany({ orderCode: /^TEST-/ });
    await PackingScanEvent.deleteMany({});
    await OrderQrToken.deleteMany({});
    await Sku.deleteMany({ skuCode: /^TEST-/ });
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Tạo test SKU
    testSku = await Sku.create({
      skuCode: `TEST-SKU-${Date.now()}`,
      productId: new mongoose.Types.ObjectId(),
      color: { name: 'Red', code: 'RED' },
      size: { name: 'L', code: 'L' },
      onHandQty: 100,
      reservedQty: 10,
      isActive: true
    });

    // Tạo test order
    testOrder = await SalesOrder.create({
      orderCode: `TEST-ORD-${Date.now()}`,
      status: 'CONFIRMED_RESERVED',
      items: [{
        skuId: testSku._id,
        skuCode: testSku.skuCode,
        orderedQty: 2,
        quantity: 2,
        fifoPickList: [{
          batchId: new mongoose.Types.ObjectId(),
          locationId: new mongoose.Types.ObjectId(),
          allocatedQty: 2,
          pickedConfirmed: false
        }]
      }],
      recipient: {
        name: 'Test Customer',
        phone: '0123456789',
        address: 'Test Address'
      }
    });

    // Tạo QR token
    const token = `test_token_${Date.now()}`;
    testQrToken = await OrderQrToken.create({
      orderId: testOrder._id,
      token,
      issuedBy: new mongoose.Types.ObjectId()
    });

    // Tạo product units
    testProductUnits = await ProductUnit.insertMany([
      {
        barcode: `TEST-UNIT-001-${Date.now()}`,
        skuId: testSku._id,
        batchId: testOrder.items[0].fifoPickList[0].batchId,
        status: 'IN_STOCK',
        locationId: testOrder.items[0].fifoPickList[0].locationId
      },
      {
        barcode: `TEST-UNIT-002-${Date.now()}`,
        skuId: testSku._id,
        batchId: testOrder.items[0].fifoPickList[0].batchId,
        status: 'IN_STOCK',
        locationId: testOrder.items[0].fifoPickList[0].locationId
      }
    ]);
  });

  afterEach(async () => {
    if (testOrder) await SalesOrder.findByIdAndDelete(testOrder._id);
    if (testSku) await Sku.findByIdAndDelete(testSku._id);
    if (testQrToken) await OrderQrToken.findByIdAndDelete(testQrToken._id);
    if (testProductUnits) {
      await ProductUnit.deleteMany({ 
        barcode: { $in: testProductUnits.map(u => u.barcode) } 
      });
    }
    if (packingSession) await PackingSession.findByIdAndDelete(packingSession._id);
  });

  describe('TC-PACK-001: Scan Order QR - Valid', () => {
    test('Should successfully resolve QR and open packing session', async () => {
      const qrValue = `PACK:v1:${testQrToken.token}`;

      const response = await request(app)
        .post('/api/packing/qr/resolve')
        .send({ qrValue })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.order).toBeDefined();
      expect(response.body.data.order.orderCode).toBe(testOrder.orderCode);
      expect(response.body.data.order.items.length).toBe(1);
    });
  });

  describe('TC-PACK-002: Scan Order QR - Invalid', () => {
    test('Should fail with invalid QR format', async () => {
      const response = await request(app)
        .post('/api/packing/qr/resolve')
        .send({ qrValue: 'INVALID_QR_FORMAT' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toMatch(/INVALID_QR|QR_NOT_FOUND/);
    });
  });

  describe('TC-PACK-003: Start Packing Session', () => {
    test('Should successfully start a packing session', async () => {
      const response = await request(app)
        .post('/api/packing/prepare')
        .send({ orderCode: testOrder.orderCode })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.session).toBeDefined();
      expect(response.body.data.session.orderCode).toBe(testOrder.orderCode);
      expect(response.body.data.session.status).toBe('ACTIVE');

      packingSession = await PackingSession.findOne({ 
        orderCode: testOrder.orderCode 
      });
      expect(packingSession).toBeDefined();
    });
  });

  describe('TC-PACK-004: Scan Product Unit - Valid', () => {
    test('Should successfully scan product unit barcode', async () => {
      // Start session first
      const sessionResponse = await request(app)
        .post('/api/packing/prepare')
        .send({ orderCode: testOrder.orderCode })
        .expect(200);

      const sessionId = sessionResponse.body.data.session._id;
      packingSession = await PackingSession.findById(sessionId);

      // Scan first unit
      const scanResponse = await request(app)
        .post(`/api/packing/sessions/${sessionId}/scan`)
        .send({ barcode: testProductUnits[0].barcode })
        .expect(200);

      expect(scanResponse.body.success).toBe(true);
      expect(scanResponse.body.data.session.scannedUnits.length).toBe(1);
      expect(scanResponse.body.data.session.scannedUnits[0].barcode)
        .toBe(testProductUnits[0].barcode);

      // Verify scan event recorded
      const scanEvent = await PackingScanEvent.findOne({
        sessionId,
        barcode: testProductUnits[0].barcode
      });
      expect(scanEvent).toBeDefined();
      expect(scanEvent.scanResult).toBe('VALID');
    });
  });

  describe('TC-PACK-005: Scan Product Unit - Duplicate', () => {
    test('Should fail when scanning same unit twice', async () => {
      // Start session
      const sessionResponse = await request(app)
        .post('/api/packing/prepare')
        .send({ orderCode: testOrder.orderCode })
        .expect(200);

      const sessionId = sessionResponse.body.data.session._id;
      packingSession = await PackingSession.findById(sessionId);

      // Scan unit first time
      await request(app)
        .post(`/api/packing/sessions/${sessionId}/scan`)
        .send({ barcode: testProductUnits[0].barcode })
        .expect(200);

      // Scan same unit again
      const duplicateResponse = await request(app)
        .post(`/api/packing/sessions/${sessionId}/scan`)
        .send({ barcode: testProductUnits[0].barcode })
        .expect(409);

      expect(duplicateResponse.body.success).toBe(false);
      expect(duplicateResponse.body.error.code).toMatch(/ALREADY_SCANNED|DUPLICATE/);
    });
  });

  describe('TC-PACK-006: Scan Product Unit - Wrong SKU', () => {
    test('Should fail when scanning unit not in order', async () => {
      // Create unit with different SKU
      const wrongSku = await Sku.create({
        skuCode: `TEST-WRONG-SKU-${Date.now()}`,
        productId: new mongoose.Types.ObjectId(),
        isActive: true
      });

      const wrongUnit = await ProductUnit.create({
        barcode: `TEST-WRONG-UNIT-${Date.now()}`,
        skuId: wrongSku._id,
        status: 'IN_STOCK'
      });

      // Start session
      const sessionResponse = await request(app)
        .post('/api/packing/prepare')
        .send({ orderCode: testOrder.orderCode })
        .expect(200);

      const sessionId = sessionResponse.body.data.session._id;
      packingSession = await PackingSession.findById(sessionId);

      // Try to scan wrong unit
      const scanResponse = await request(app)
        .post(`/api/packing/sessions/${sessionId}/scan`)
        .send({ barcode: wrongUnit.barcode })
        .expect(400);

      expect(scanResponse.body.success).toBe(false);
      expect(scanResponse.body.error.code).toMatch(/WRONG_SKU|SKU_NOT_IN_ORDER/);

      // Cleanup
      await Sku.findByIdAndDelete(wrongSku._id);
      await ProductUnit.findByIdAndDelete(wrongUnit._id);
    });
  });

  describe('TC-PACK-007: Complete Packing Session', () => {
    test('Should complete session when all units scanned', async () => {
      // Start session
      const sessionResponse = await request(app)
        .post('/api/packing/prepare')
        .send({ orderCode: testOrder.orderCode })
        .expect(200);

      const sessionId = sessionResponse.body.data.session._id;
      packingSession = await PackingSession.findById(sessionId);

      // Scan all required units
      await request(app)
        .post(`/api/packing/sessions/${sessionId}/scan`)
        .send({ barcode: testProductUnits[0].barcode })
        .expect(200);

      await request(app)
        .post(`/api/packing/sessions/${sessionId}/scan`)
        .send({ barcode: testProductUnits[1].barcode })
        .expect(200);

      // Check session status
      const updatedSession = await PackingSession.findById(sessionId);
      expect(updatedSession.scannedUnits.length).toBe(2);
      expect(updatedSession.isComplete).toBe(true);
      expect(updatedSession.status).toBe('COMPLETED');
    });
  });

  describe('TC-PACK-008: Release Packing Session', () => {
    test('Should successfully release active session', async () => {
      // Start session
      const sessionResponse = await request(app)
        .post('/api/packing/prepare')
        .send({ orderCode: testOrder.orderCode })
        .expect(200);

      const sessionId = sessionResponse.body.data.session._id;
      packingSession = await PackingSession.findById(sessionId);

      // Release session
      const releaseResponse = await request(app)
        .post(`/api/packing/sessions/${sessionId}/release`)
        .expect(200);

      expect(releaseResponse.body.success).toBe(true);

      // Verify session released
      const releasedSession = await PackingSession.findById(sessionId);
      expect(releasedSession.status).toBe('RELEASED');
      expect(releasedSession.releasedAt).toBeDefined();
    });
  });

  describe('TC-PACK-009: Cancel Packing Session', () => {
    test('Should successfully cancel active session', async () => {
      // Start session
      const sessionResponse = await request(app)
        .post('/api/packing/prepare')
        .send({ orderCode: testOrder.orderCode })
        .expect(200);

      const sessionId = sessionResponse.body.data.session._id;
      packingSession = await PackingSession.findById(sessionId);

      // Cancel session
      const cancelResponse = await request(app)
        .post(`/api/packing/sessions/${sessionId}/cancel`)
        .send({ reason: 'Test cancellation' })
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);

      // Verify session cancelled
      const cancelledSession = await PackingSession.findById(sessionId);
      expect(cancelledSession.status).toBe('CANCELLED');
      expect(cancelledSession.cancelledAt).toBeDefined();
    });
  });

  describe('TC-PACK-010: Session Heartbeat', () => {
    test('Should successfully renew session lease', async () => {
      // Start session
      const sessionResponse = await request(app)
        .post('/api/packing/prepare')
        .send({ orderCode: testOrder.orderCode })
        .expect(200);

      const sessionId = sessionResponse.body.data.session._id;
      packingSession = await PackingSession.findById(sessionId);
      const initialHeartbeat = packingSession.heartbeatAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Send heartbeat
      const heartbeatResponse = await request(app)
        .post(`/api/packing/sessions/${sessionId}/heartbeat`)
        .expect(200);

      expect(heartbeatResponse.body.success).toBe(true);

      // Verify heartbeat updated
      const updatedSession = await PackingSession.findById(sessionId);
      expect(updatedSession.heartbeatAt).not.toEqual(initialHeartbeat);
      expect(new Date(updatedSession.heartbeatAt).getTime())
        .toBeGreaterThan(new Date(initialHeartbeat).getTime());
    });
  });
});
