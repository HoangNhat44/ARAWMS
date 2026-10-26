/*
 * File: ensure-arastore-cloudinary-folders.mjs
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Ensures required Cloudinary folders exist.
 */
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import { ARASTORE_CLOUDINARY_ROOT, ARASTORE_CLOUDINARY_FOLDERS } from '../src/config/cloudinaryFolders.js';

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  throw new Error('Thiếu cấu hình Cloudinary');
}
cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET, secure: true });

// Query before creating so rerunning setup does not duplicate Cloudinary folders.
const rootFolders = await cloudinary.api.root_folders();
if (!rootFolders.folders.some((folder) => folder.path.toLowerCase() === ARASTORE_CLOUDINARY_ROOT.toLowerCase())) {
  await cloudinary.api.create_folder(ARASTORE_CLOUDINARY_ROOT);
}

// Create each configured child folder under its existing parent.
for (const path of Object.values(ARASTORE_CLOUDINARY_FOLDERS)) {
  const parent = path.slice(0, path.lastIndexOf('/'));
  const subfolders = await cloudinary.api.sub_folders(parent);
  if (!subfolders.folders.some((folder) => folder.path.toLowerCase() === path.toLowerCase())) {
    await cloudinary.api.create_folder(path);
  }
}

const result = await cloudinary.api.sub_folders(ARASTORE_CLOUDINARY_ROOT);
console.log(JSON.stringify({ cloudName: CLOUDINARY_CLOUD_NAME,
  folders: result.folders.map((folder) => folder.path).sort() }, null, 2));
