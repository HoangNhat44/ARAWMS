/*
 * File: check-warehouse-migration-snapshot.mjs
 * Description: Replays a private backup in a disposable replica set and checks migration idempotency.
 */
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const backupDirectory = process.argv[2];
if (!backupDirectory) throw new Error('Pass the backup directory');
const manifest = mongoose.mongo.BSON.EJSON.parse(await readFile(path.join(backupDirectory, 'manifest.ejson'), 'utf8'));
const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(repl.getUri(), { autoCreate: false, autoIndex: false });
try {
  for (const [name, details] of Object.entries(manifest.collections)) {
    const lines = (await readFile(path.join(backupDirectory, `${name}.ejsonl`), 'utf8'))
      .split(/\r?\n/).filter(Boolean);
    if (lines.length !== details.count) throw new Error(`Backup count mismatch: ${name}`);
    await mongoose.connection.db.createCollection(name);
    if (lines.length) await mongoose.connection.db.collection(name)
      .insertMany(lines.map((line) => mongoose.mongo.BSON.EJSON.parse(line)));
  }
  await mongoose.disconnect();
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const run = spawnSync(process.execPath, ['scripts/migrate-warehouse-collections.mjs', '--apply',
      '--backup-dir', backupDirectory],
      { cwd: process.cwd(), env: { ...process.env, MONGODB_URI: repl.getUri() },
        encoding: 'utf8', timeout: 60_000 });
    if (run.status !== 0) throw new Error(`Migration attempt ${attempt} failed: ${run.stderr || run.stdout}`);
  }
  await mongoose.connect(repl.getUri(), { autoCreate: false, autoIndex: false });
  for (const [name, details] of Object.entries(manifest.collections)) {
    const count = await mongoose.connection.db.collection(name).countDocuments();
    if (count !== details.count) throw new Error(`Source changed: ${name}`);
  }
  const originalOrders = (await readFile(path.join(backupDirectory, 'sales_orders.ejsonl'), 'utf8'))
    .split(/\r?\n/).filter(Boolean).map((line) => mongoose.mongo.BSON.EJSON.parse(line));
  for (const order of originalOrders) {
    const after = await mongoose.connection.db.collection('sales_orders')
      .findOne({ _id: order._id }, { projection: { updatedAt: 1 } });
    if (new Date(after?.updatedAt).getTime() !== new Date(order.updatedAt).getTime())
      throw new Error(`QR migration changed order version: ${order._id}`);
  }
  console.log(JSON.stringify({ migrationAttempts: 2, sourceCountsPreserved: true,
    outboundTickets: await mongoose.connection.db.collection('material_tickets')
      .countDocuments({ ticketType: 'OUTBOUND_WAREHOUSE' }),
    embeddedQr: await mongoose.connection.db.collection('sales_orders')
      .countDocuments({ 'qr.token': { $type: 'string' } }),
    embeddedClaims: await mongoose.connection.db.collection('product_units')
      .countDocuments({ 'packingClaim.sessionId': { $exists: true } }),
    embeddedVideos: await mongoose.connection.db.collection('packing_sessions')
      .countDocuments({ recordingId: { $type: 'string' } }) }));
} finally {
  await mongoose.disconnect().catch(() => {});
  await repl.stop();
}
