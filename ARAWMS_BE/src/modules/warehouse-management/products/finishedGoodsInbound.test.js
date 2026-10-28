/*
 * File: finishedGoodsInbound.test.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Unit tests for Finished Goods Inbound functionality
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../../app');
const Product = require('../../../models/Product.model');
const Sku = require('../../../models/Sku.model');
const FinishedGoodsBatch = require('../../../models/FinishedGoodsBatch.model');
const WarehouseLocation = require('../../../models/WarehouseLocation.model');
const InventoryTransaction = require('../../../models/InventoryTransaction.model');

describe('Finished Goods Inbound Module', () => {
  let testProduct;
  let testSku;
  let testLocation;
  let authToken;

  beforeAll(async () => {
    // Kết nối test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/arawms_test');
    }
  });

  afterAll(async () => {
    // Dọn dẹp test data
    await Product.deleteMany({ productCode: /^TEST-/ });
    await Sku.deleteMany({ skuCode: /^TEST-/ });
    await FinishedGoodsBatch.deleteMany({ batchCode: /^TEST-/ });
    await InventoryTransaction.deleteMany({ transactionCode: /^TEST-/ });
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Tạo test data
    testLocation = await WarehouseLocation.findOne({ 
      warehouseType: 'FINISHED_GOODS', 
      status: 'ACTIVE' 
    });

    if (!testLocation) {
      testLocation = await WarehouseLocation.create({
        locationCode: 'TEST-LOC-001',
        warehouseType: 'FINISHED_GOODS',
        status: 'ACTIVE',
        maxCapacity: 1000
      });
    }

    testProduct = await Product.create({
      productCode: `TEST-PROD-${Date.now()}`,
      productName: 'Test Product for Inbound',
      isActive: true
    });

    testSku = await Sku.create({
      skuCode: `TEST-SKU-${Date.now()}`,
      productId: testProduct._id,
      color: { name: 'White', code: 'WHT' },
      size: { name: 'M', code: 'M' },
      onHandQty: 0,
      reservedQty: 0,
      isActive: true
    });
  });

  afterEach(async () => {
    // Xóa test data sau mỗi test
    if (testProduct) await Product.findByIdAndDelete(testProduct._id);
    if (testSku) await Sku.findByIdAndDelete(testSku._id);
    await FinishedGoodsBatch.deleteMany({ skuId: testSku?._id });
    await InventoryTransaction.deleteMany({ skuId: testSku?._id });
  });

  describe('TC-FG-001: Create Finished Goods Batch - Valid Data', () => {
    test('Should successfully create a finished goods batch with valid data', async () => {
      const batchData = {
        batchCode: `TEST-BATCH-${Date.now()}`,
        skuId: testSku._id.toString(),
        locationId: testLocation._id.toString(),
        quantity: 100,
        manufacturingDate: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Test batch for unit testing'
      };

      const response = await request(app)
        .post('/api/products/finished-goods/batches')
        .send(batchData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.batch).toBeDefined();
      expect(response.body.data.batch.batchCode).toBe(batchData.batchCode);
      expect(response.body.data.batch.currentOnHandQty).toBe(100);

      // Verify SKU stock updated
      const updatedSku = await Sku.findById(testSku._id);
      expect(updatedSku.onHandQty).toBe(100);

      // Verify transaction recorded
      const transaction = await InventoryTransaction.findOne({
        skuId: testSku._id,
        transactionType: 'FINISHED_GOODS_INBOUND'
      });
      expect(transaction).toBeDefined();
      expect(transaction.quantityChange).toBe(100);
    });
  });

  describe('TC-FG-002: Create Batch - Invalid SKU', () => {
    test('Should fail when SKU does not exist', async () => {
      const batchData = {
        batchCode: `TEST-BATCH-${Date.now()}`,
        skuId: new mongoose.Types.ObjectId().toString(),
        locationId: testLocation._id.toString(),
        quantity: 100
      };

      const response = await request(app)
        .post('/api/products/finished-goods/batches')
        .send(batchData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toMatch(/SKU_NOT_FOUND|NOT_FOUND/);
    });
  });

  describe('TC-FG-003: Create Batch - Invalid Location', () => {
    test('Should fail when location does not exist or inactive', async () => {
      const batchData = {
        batchCode: `TEST-BATCH-${Date.now()}`,
        skuId: testSku._id.toString(),
        locationId: new mongoose.Types.ObjectId().toString(),
        quantity: 100
      };

      const response = await request(app)
        .post('/api/products/finished-goods/batches')
        .send(batchData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toMatch(/LOCATION_NOT_FOUND|NOT_FOUND/);
    });
  });

  describe('TC-FG-004: Create Batch - Invalid Quantity', () => {
    test('Should fail with negative quantity', async () => {
      const batchData = {
        batchCode: `TEST-BATCH-${Date.now()}`,
        skuId: testSku._id.toString(),
        locationId: testLocation._id.toString(),
        quantity: -10
      };

      const response = await request(app)
        .post('/api/products/finished-goods/batches')
        .send(batchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toMatch(/INVALID_QUANTITY|BAD_REQUEST/);
    });

    test('Should fail with zero quantity', async () => {
      const batchData = {
        batchCode: `TEST-BATCH-${Date.now()}`,
        skuId: testSku._id.toString(),
        locationId: testLocation._id.toString(),
        quantity: 0
      };

      const response = await request(app)
        .post('/api/products/finished-goods/batches')
        .send(batchData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('TC-FG-005: Create Batch - Duplicate Batch Code', () => {
    test('Should fail when batch code already exists', async () => {
      const batchCode = `TEST-BATCH-${Date.now()}`;
      
      // Create first batch
      await FinishedGoodsBatch.create({
        batchCode,
        skuId: testSku._id,
        locationId: testLocation._id,
        currentOnHandQty: 50
      });

      // Try to create duplicate
      const batchData = {
        batchCode,
        skuId: testSku._id.toString(),
        locationId: testLocation._id.toString(),
        quantity: 100
      };

      const response = await request(app)
        .post('/api/products/finished-goods/batches')
        .send(batchData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toMatch(/DUPLICATE|ALREADY_EXISTS/);
    });
  });

  describe('TC-FG-006: Update Batch Quantity', () => {
    test('Should successfully update batch quantity', async () => {
      // Create batch
      const batch = await FinishedGoodsBatch.create({
        batchCode: `TEST-BATCH-${Date.now()}`,
        skuId: testSku._id,
        locationId: testLocation._id,
        currentOnHandQty: 50
      });

      await Sku.findByIdAndUpdate(testSku._id, { onHandQty: 50 });

      const updateData = {
        quantityAdjustment: 25,
        reason: 'Found additional units'
      };

      const response = await request(app)
        .patch(`/api/products/finished-goods/batches/${batch._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.batch.currentOnHandQty).toBe(75);

      // Verify SKU updated
      const updatedSku = await Sku.findById(testSku._id);
      expect(updatedSku.onHandQty).toBe(75);
    });
  });

  describe('TC-FG-007: Get Batch Details', () => {
    test('Should retrieve batch details successfully', async () => {
      const batch = await FinishedGoodsBatch.create({
        batchCode: `TEST-BATCH-${Date.now()}`,
        skuId: testSku._id,
        locationId: testLocation._id,
        currentOnHandQty: 100
      });

      const response = await request(app)
        .get(`/api/products/finished-goods/batches/${batch._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.batch).toBeDefined();
      expect(response.body.data.batch.batchCode).toBe(batch.batchCode);
      expect(response.body.data.batch.currentOnHandQty).toBe(100);
    });
  });

  describe('TC-FG-008: List All Batches', () => {
    test('Should list all finished goods batches', async () => {
      // Create multiple batches
      await FinishedGoodsBatch.create([
        {
          batchCode: `TEST-BATCH-A-${Date.now()}`,
          skuId: testSku._id,
          locationId: testLocation._id,
          currentOnHandQty: 50
        },
        {
          batchCode: `TEST-BATCH-B-${Date.now()}`,
          skuId: testSku._id,
          locationId: testLocation._id,
          currentOnHandQty: 75
        }
      ]);

      const response = await request(app)
        .get('/api/products/finished-goods/batches')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.batches).toBeDefined();
      expect(Array.isArray(response.body.data.batches)).toBe(true);
      expect(response.body.data.batches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('TC-FG-009: Location Capacity Check', () => {
    test('Should fail when location exceeds capacity', async () => {
      // Set small capacity
      await WarehouseLocation.findByIdAndUpdate(testLocation._id, {
        maxCapacity: 10,
        currentOccupancy: 5
      });

      const batchData = {
        batchCode: `TEST-BATCH-${Date.now()}`,
        skuId: testSku._id.toString(),
        locationId: testLocation._id.toString(),
        quantity: 20 // Exceeds available capacity
      };

      const response = await request(app)
        .post('/api/products/finished-goods/batches')
        .send(batchData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toMatch(/CAPACITY_EXCEEDED|LOCATION_FULL/);
    });
  });

  describe('TC-FG-010: Transaction History', () => {
    test('Should record all inventory transactions', async () => {
      const batchData = {
        batchCode: `TEST-BATCH-${Date.now()}`,
        skuId: testSku._id.toString(),
        locationId: testLocation._id.toString(),
        quantity: 100
      };

      await request(app)
        .post('/api/products/finished-goods/batches')
        .send(batchData)
        .expect(201);

      const transactions = await InventoryTransaction.find({
        skuId: testSku._id
      }).sort({ createdAt: -1 });

      expect(transactions.length).toBeGreaterThan(0);
      expect(transactions[0].transactionType).toBe('FINISHED_GOODS_INBOUND');
      expect(transactions[0].quantityChange).toBe(100);
      expect(transactions[0].onHandAfter).toBe(100);
    });
  });
});
