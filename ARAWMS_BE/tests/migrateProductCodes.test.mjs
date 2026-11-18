/*
 * File: migrateProductCodes.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-14
 * Description: Runs scripts/migrate-product-codes.mjs against legacy-shaped data in a throwaway database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/migrate-product-codes.mjs', import.meta.url));
let replicaSet;
let uri;
const oid = () => new mongoose.Types.ObjectId();
const ids = { sp: oid(), kem: oid(), den: oid(), ok: oid() };

test.before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  uri = replicaSet.getUri('ARAWMS_MIGRATION_TEST');
  await mongoose.connect(uri);
  const db = mongoose.connection;
  const product = (_id, productCode, sampleCode, extra = {}) => ({ _id, productCode, sampleCode, productName: productCode,
    category: 'Áo', basePrice: 1000, isActive: true, isDeleted: false, createdAt: new Date('2026-01-01'), ...extra });
  await db.collection('products').insertMany([
    product(ids.sp, 'SP-2026-00001', 'AT-001'),
    product(ids.kem, 'AL186-KEM', 'AL186-KEM', { createdAt: new Date('2026-02-01') }),
    product(ids.den, 'AL186-DEN', 'AL186-DEN', { createdAt: new Date('2026-03-01') }),
    product(ids.ok, 'NEW01', 'NEW01', { codeLockedAt: new Date() }),
  ]);
  const sku = (productId, skuCode, color, size, extra = {}) => ({ productId, skuCode, skuBarcode: `SKU-${skuCode}`,
    color, size, styleName: 'x', retailPrice: 1000, unitCogs: 300, isActive: true, isDeleted: false,
    variantKey: `${productId}:${color.toLowerCase()}:${size}`, ...extra });
  await db.collection('skus').insertMany([
    sku(ids.sp, 'SP-2026-00001-VABCDEF12', 'Trắng', 'M'),
    sku(ids.kem, 'AL186-KEM-M', 'Kem', 'M'),
    sku(ids.kem, 'AL186-KEM-L', 'Kem', 'L'),
    sku(ids.den, 'AL186-DEN-M', 'Đen', 'M'),
    sku(ids.ok, 'NEW01-DO-S', 'Đỏ', 'S'),
  ]);
  await db.collection('finished_goods_bulk_documents').insertOne({ items: [{ productId: ids.den, skuId: oid() }] });
  await db.collection('counter_sequences').insertOne({ sequenceKey: 'PRODUCT-2026', seq: 1 });
});
test.after(async () => { await mongoose.disconnect(); await replicaSet?.stop(); });

test('dry-run prints the plan and writes nothing', async () => {
  const { stdout } = await run(process.execPath, [script, `--uri=${uri}`]);
  assert.match(stdout, /SP-2026-00001 -> AT001/);
  assert.match(stdout, /AL186-KEM -> AL186 \+ gộp AL186-DEN/);
  assert.match(stdout, /AL186-DEN-M -> AL186-DEN-M \(chuyển sang SP chính\)/);
  assert.equal(await mongoose.connection.collection('products').countDocuments({ productCode: 'AT001' }), 0);
  assert.equal(await mongoose.connection.collection('counter_sequences').countDocuments(), 1);
});

test('apply renames codes, merges per-color products and keeps barcodes', async () => {
  const { stdout } = await run(process.execPath, [script, `--uri=${uri}`, '--apply']);
  assert.match(stdout, /Đã ghi xong/);
  const db = mongoose.connection;
  const sp = await db.collection('products').findOne({ _id: ids.sp });
  assert.equal(sp.productCode, 'AT001');
  assert.equal(sp.sampleCode, undefined, 'sampleCode is removed: productCode is the only code field');
  assert.equal((await db.collection('products').countDocuments({ sampleCode: { $exists: true } })), 0);
  assert.ok(sp.codeLockedAt);
  const al = await db.collection('products').findOne({ _id: ids.kem });
  assert.equal(al.productCode, 'AL186');
  const den = await db.collection('products').findOne({ _id: ids.den });
  assert.equal(den.isDeleted, true);
  assert.equal(String(den.mergedIntoProductId), String(ids.kem));
  const skus = await db.collection('skus').find({ productId: ids.kem }).sort({ skuCode: 1 }).toArray();
  assert.deepEqual(skus.map((item) => item.skuCode), ['AL186-DEN-M', 'AL186-KEM-L', 'AL186-KEM-M']);
  assert.ok(skus.every((item) => item.variantKey.startsWith(`${ids.kem}:`)));
  const white = await db.collection('skus').findOne({ productId: ids.sp });
  assert.equal(white.skuCode, 'AT001-TRANG-M');
  assert.equal(white.skuBarcode, 'SKU-SP-2026-00001-VABCDEF12', 'printed barcode must keep scanning');
  const doc = await db.collection('finished_goods_bulk_documents').findOne({});
  assert.equal(String(doc.items[0].productId), String(ids.kem));
  assert.equal(await db.collection('counter_sequences').countDocuments({ sequenceKey: /^PRODUCT-/ }), 0);
  assert.equal((await db.collection('products').findOne({ _id: ids.ok })).productCode, 'NEW01', 'valid product untouched');
  // Running again is a no-op.
  const again = await run(process.execPath, [script, `--uri=${uri}`]);
  assert.match(again.stdout, /Sản phẩm thay đổi: 0/);
  assert.match(again.stdout, /SKU đổi mã: 0/);
});
