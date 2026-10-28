/*
 * File: drop-obsolete-sku-index.mjs
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Removes a legacy SKU index that conflicts with the current variant schema.
 */
import "dotenv/config";
import mongoose from "mongoose";

const indexName = "productCode_1_color.code_1_size.code_1";
if (!process.env.MONGODB_URI) throw new Error("Thiếu MONGODB_URI");

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const skus = mongoose.connection.collection("skus");
  const indexes = await skus.indexes();
  if (!indexes.some((index) => index.name === indexName)) {
    console.log("Index SKU cũ đã được gỡ trước đó.");
  } else {
    const legacyCount = await skus.countDocuments({
      productCode: { $exists: true },
    });
    if (legacyCount)
      throw new Error(
        `Còn ${legacyCount} SKU dùng cấu trúc cũ; cần kiểm tra dữ liệu trước khi gỡ index`,
      );
    // The current SKU schema stores productId, color text, size text, and variantKey.
    await skus.dropIndex(indexName);
    console.log(`Đã gỡ index không còn dùng: ${indexName}`);
  }
} finally {
  await mongoose.disconnect();
}
