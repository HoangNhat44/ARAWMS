import 'dotenv/config';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import PackingVideo from '../src/models/PackingVideo.js';
import { ARASTORE_CLOUDINARY_FOLDERS } from '../src/config/cloudinaryFolders.js';

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, MONGODB_URI } = process.env;
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !MONGODB_URI) {
  throw new Error('Thiếu cấu hình Cloudinary hoặc MongoDB');
}
cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET, secure: true });

await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  const videos = await PackingVideo.find({ cloudinaryPublicId: { $exists: true } })
    .select('cloudinaryPublicId cloudinaryUrl').lean();
  let moved = 0;
  let alreadyOrganized = 0;
  for (const video of videos) {
    const publicId = video.cloudinaryPublicId;
    const before = await cloudinary.api.resource(publicId, { resource_type: 'video', type: 'authenticated' });
    if (before.public_id !== publicId || before.secure_url !== video.cloudinaryUrl) {
      throw new Error(`Metadata video không khớp: ${publicId}`);
    }
    if (before.asset_folder?.toLowerCase() === ARASTORE_CLOUDINARY_FOLDERS.packingVideos.toLowerCase()) {
      alreadyOrganized += 1;
      continue;
    }
    if (typeof before.asset_folder !== 'string') {
      throw new Error('Tài khoản không hỗ trợ chuyển asset_folder mà vẫn giữ nguyên URL');
    }
    await cloudinary.uploader.explicit(publicId, { resource_type: 'video', type: 'authenticated',
      asset_folder: ARASTORE_CLOUDINARY_FOLDERS.packingVideos });
    const after = await cloudinary.api.resource(publicId, { resource_type: 'video', type: 'authenticated' });
    if (after.public_id !== publicId || after.secure_url !== before.secure_url ||
        after.asset_folder?.toLowerCase() !== ARASTORE_CLOUDINARY_FOLDERS.packingVideos.toLowerCase()) {
      throw new Error(`Không xác nhận được vị trí mới của video: ${publicId}`);
    }
    moved += 1;
  }
  console.log(JSON.stringify({ moved, alreadyOrganized, total: videos.length }));
} finally {
  await mongoose.disconnect();
}
