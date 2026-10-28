/*
 * File: orderQrImageStorage.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Renders order QR labels and stores their images in Cloudinary.
 */
import { createHash } from 'node:crypto';
import bwipjs from 'bwip-js';
import { v2 as cloudinary } from 'cloudinary';
import { ARASTORE_CLOUDINARY_FOLDERS } from '../../config/cloudinaryFolders.js';
import { configureProductCloudinary } from './productMediaStorage.js';

const safeSegment = (value) => String(value || '').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 80);

/** Uses the token digest for an opaque, stable Cloudinary ID per QR version. */
export const orderQrPublicId = (orderCode, token) => {
  const digest = createHash('sha256').update(token).digest('hex');
  return `${ARASTORE_CLOUDINARY_FOLDERS.orderQr}/${safeSegment(orderCode)}/${digest}`;
};

/** Returns only a Cloudinary reference; the PNG never enters MongoDB. */
export async function uploadOrderQrImage(orderCode, qrValue, token) {
  configureProductCloudinary();
  const publicId = orderQrPublicId(orderCode, token);
  const png = await bwipjs.toBuffer({ bcid: 'qrcode', text: qrValue, scale: 5, padding: 12 });
  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ resource_type: 'image', type: 'authenticated',
      format: 'png', asset_folder: publicId.slice(0, publicId.lastIndexOf('/')),
      public_id: publicId, overwrite: true, unique_filename: false },
    (error, result) => error ? reject(error) : resolve(result));
    stream.end(png);
  });
  if (!uploaded?.public_id) throw new Error('Cloudinary không trả về định danh ảnh QR');
  return uploaded.public_id;
}

/** Signs image delivery so the token cannot be read from a public asset URL. */
export function orderQrImageUrl(publicId) {
  configureProductCloudinary();
  return cloudinary.url(publicId, { secure: true, resource_type: 'image', type: 'authenticated',
    sign_url: true, format: 'png' });
}

export async function removeOrderQrImage(publicId) {
  if (!publicId) return;
  configureProductCloudinary();
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'authenticated' });
}
