/*
 * File: backfill-packing-video-urls.mjs
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Backfills packing video URLs on existing orders.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import PackingSession from '../src/models/PackingSession.js';
import SalesOrder from '../src/models/SalesOrder.model.js';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
let updated = 0;
let alreadyLinked = 0;
let skipped = 0;

try {
  // Process only real sessions with saved videos; demo sessions must not update sales orders.
  const sessions = PackingSession.find({
    sourceType: 'REAL', orderId: { $exists: true }, 'video.url': { $exists: true },
  }).select('orderId video.url').lean().cursor();

  for await (const session of sessions) {
    const url = session.video?.url;
    if (!url) continue;
    // Never overwrite a different URL already linked to the order.
    const result = await SalesOrder.updateOne(
      { _id: session.orderId, $or: [
        { 'warehouseFulfillment.packagingVideoUrl': { $exists: false } },
        { 'warehouseFulfillment.packagingVideoUrl': null },
        { 'warehouseFulfillment.packagingVideoUrl': url },
      ] },
      { $set: { 'warehouseFulfillment.packagingVideoUrl': url } }
    );
    if (!result.matchedCount) skipped += 1;
    else if (result.modifiedCount) updated += 1;
    else alreadyLinked += 1;
  }
  console.log(JSON.stringify({ updated, alreadyLinked, skipped }));
} finally {
  await mongoose.disconnect();
}
