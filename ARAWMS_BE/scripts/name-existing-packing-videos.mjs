/*
 * File: name-existing-packing-videos.mjs
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Sets existing packing videos' Cloudinary display names to their order codes.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import PackingVideo from '../src/models/PackingVideo.js';
import SalesOrder from '../src/models/SalesOrder.model.js';

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, MONGODB_URI } = process.env;
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !MONGODB_URI) {
  throw new Error('Thiếu cấu hình MongoDB hoặc Cloudinary');
}
cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET, secure: true });

try {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const videos = await PackingVideo.find({ cloudinaryPublicId: { $exists: true } })
    .select('orderId cloudinaryPublicId').lean();
  for (const video of videos) {
    const value = String(video.orderId);
    const order = mongoose.isValidObjectId(value)
      ? await SalesOrder.findById(value).select('orderCode').lean() : null;
    const orderCode = order?.orderCode || value;
    if (!/^[\p{L}\p{N}_.-]{2,100}$/u.test(orderCode)) throw new Error(`Mã đơn hàng không hợp lệ: ${orderCode}`);
    await cloudinary.api.update(video.cloudinaryPublicId, {
      resource_type: 'video', type: 'authenticated', display_name: orderCode,
    });
    console.log(`${video.cloudinaryPublicId} -> ${orderCode}`);
  }
  console.log(`Đã đặt tên ${videos.length} video đóng hàng.`);
} finally {
  await mongoose.disconnect();
}
