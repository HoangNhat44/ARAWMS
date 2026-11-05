/*
 * File: backup-warehouse-collections.mjs
 * Description: Saves restorable BSON Extended JSON snapshots before warehouse collection migration.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';

const collections = [
  'material_outbounds', 'material_tickets', 'order_qr_tokens', 'sales_orders',
  'product_unit_allocations', 'product_units', 'packing_videos', 'packing_sessions',
];
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
const destination = path.resolve(process.argv[2] || path.join('..', '.migration-backups',
  `warehouse-${new Date().toISOString().replace(/[:.]/g, '-')}`));
await mkdir(destination, { recursive: true, mode: 0o700 });
await mongoose.connect(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false,
  serverSelectionTimeoutMS: 10_000 });
try {
  const manifest = { createdAt: new Date().toISOString(), collections: {} };
  for (const name of collections) {
    const collection = mongoose.connection.db.collection(name);
    const stream = createWriteStream(path.join(destination, `${name}.ejsonl`), { mode: 0o600 });
    let count = 0;
    try {
      for await (const row of collection.find({})) {
        if (!stream.write(`${mongoose.mongo.BSON.EJSON.stringify(row)}\n`)) await once(stream, 'drain');
        count += 1;
      }
    } finally {
      stream.end();
      await once(stream, 'finish');
    }
    const indexes = await collection.listIndexes().toArray().catch((error) =>
      error.codeName === 'NamespaceNotFound' ? [] : Promise.reject(error));
    manifest.collections[name] = { count, indexes };
  }
  await writeFile(path.join(destination, 'manifest.ejson'),
    mongoose.mongo.BSON.EJSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ backupDirectory: destination,
    counts: Object.fromEntries(Object.entries(manifest.collections).map(([name, value]) => [name, value.count])) }));
} finally {
  await mongoose.disconnect();
}
