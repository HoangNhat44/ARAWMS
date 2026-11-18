/*
 * File: cloudinaryFolders.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Defines Cloudinary folders for product media and packing/inspection videos.
 * QR and barcode label images are rendered on demand from codes in MongoDB and are never uploaded.
 */
export const ARASTORE_CLOUDINARY_ROOT = 'ARASTORE';

export const ARASTORE_CLOUDINARY_FOLDERS = Object.freeze({
  productImages: `${ARASTORE_CLOUDINARY_ROOT}/anh-mau-san-pham`,
  productVideos: `${ARASTORE_CLOUDINARY_ROOT}/video-mau-san-pham`,
  packingVideos: `${ARASTORE_CLOUDINARY_ROOT}/video-dong-hang`,
  packingVideoAssetFolder: 'Arastore/video-dong-hang',
  returnInspectionVideos: `${ARASTORE_CLOUDINARY_ROOT}/video-hang-hoan`,
  returnInspectionVideoAssetFolder: 'Arastore/video-hang-hoan',
});
