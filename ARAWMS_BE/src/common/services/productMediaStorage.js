/*
 * File: productMediaStorage.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Names and stores product media in Cloudinary folders.
 */
import { v2 as cloudinary } from 'cloudinary';
import { ARASTORE_CLOUDINARY_FOLDERS } from '../../config/cloudinaryFolders.js';

/** Configures the shared Cloudinary client for product media operations. */
export const configureProductCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw Object.assign(new Error('Chưa cấu hình Cloudinary'), { status: 503, code: 'CLOUDINARY_NOT_CONFIGURED' });
  }
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET, secure: true });
};

/** Places media under the matching folder with the product code as its visible name. */
export const productMediaOptions = (productCode, kind, suffix = '') => {
  const folder = kind === 'video' ? ARASTORE_CLOUDINARY_FOLDERS.productVideos : ARASTORE_CLOUDINARY_FOLDERS.productImages;
  const name = suffix ? `${productCode}_${suffix}` : productCode;
  return {
    resource_type: kind === 'video' ? 'video' : 'image', type: 'upload',
    asset_folder: folder, public_id: `${folder}/${name}`, display_name: name,
    unique_filename: false, overwrite: false,
  };
};

/** Copies a publicly reachable Excel media URL into Cloudinary. */
export const copyProductMediaUrl = async (url, productCode, kind) => {
  configureProductCloudinary();
  const options = productMediaOptions(productCode, kind);
  const result = kind === 'video'
    ? await cloudinary.uploader.upload_large(url, options)
    : await cloudinary.uploader.upload(url, options);
  if (!result?.secure_url || !result?.public_id) throw new Error(`Cloudinary không trả về thông tin ${kind}`);
  return result;
};

/** Removes only assets created during a failed import attempt. */
export const removeProductMedia = async (assets) => {
  if (!assets.length) return;
  configureProductCloudinary();
  await Promise.allSettled(assets.map((asset) => cloudinary.uploader.destroy(asset.public_id, { resource_type: asset.resource_type })));
};
