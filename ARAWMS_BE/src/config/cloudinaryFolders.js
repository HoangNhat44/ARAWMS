/*
 * File: cloudinaryFolders.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Defines Cloudinary folders for product and packing assets.
 */
export const ARASTORE_CLOUDINARY_ROOT = 'ARASTORE';

export const ARASTORE_CLOUDINARY_FOLDERS = Object.freeze({
  productImages: `${ARASTORE_CLOUDINARY_ROOT}/anh-mau-san-pham`,
  productVideos: `${ARASTORE_CLOUDINARY_ROOT}/video-mau-san-pham`,
  orderQr: `${ARASTORE_CLOUDINARY_ROOT}/qr-don-hang`,
  productBarcodes: `${ARASTORE_CLOUDINARY_ROOT}/barcode-san-pham`,
  rawMaterialBarcodes: `${ARASTORE_CLOUDINARY_ROOT}/barcode-nguyen-phu-lieu`,
  packingVideos: `${ARASTORE_CLOUDINARY_ROOT}/video-dong-hang`,
});
