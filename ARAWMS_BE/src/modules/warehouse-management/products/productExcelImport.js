/*
 * File: productExcelImport.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Validates product variation workbooks and saves new products with their SKUs.
 */
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import Product from "../../../models/Product.model.js";
import Sku from "../../../models/Sku.model.js";
import { copyProductMediaUrl, removeProductMedia } from "../../../common/services/productMediaStorage.js";

const headers = new Map([
  [1, "STT"],
  [2, "Mã sản phẩm"],
  [3, "Tên sản phẩm"],
  [5, "Mã mẫu mã"],
  [9, "Danh mục"],
  [21, "Giá bán"],
  [48, "SIZE (Thuộc tính)"],
]);
const sizes = new Set(["XS", "S", "M", "L", "XL", "XXL", "FREESIZE"]);
const codePattern = /^[\p{L}\p{N}_-]{2,64}$/u;
const clean = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim();
const cell = (row, column) => clean(row.getCell(column).text);
const key = (value) => value.toLocaleLowerCase("vi-VN");

/** Parses the first sheet and groups rows by STT and product code without changing stock. */
export const parseProductWorkbook = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet)
    throw Object.assign(new Error("File Excel không có trang dữ liệu"), {
      status: 400,
    });
  for (const [column, expected] of headers) {
    if (cell(sheet.getRow(1), column) !== expected) {
      throw Object.assign(
        new Error(`Cột ${column} phải là "${expected}" theo file mẫu`),
        { status: 400 },
      );
    }
  }

  const products = new Map();
  const sttCodes = new Map();
  const skuCodes = new Set();
  const barcodes = new Set();
  const errors = [];
  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const row = sheet.getRow(number);
    if (!row.hasValues) continue;
    const stt = cell(row, 1);
    const productCode = cell(row, 2).toUpperCase();
    const productName = cell(row, 3);
    const skuCode = cell(row, 5).toUpperCase();
    const category = cell(row, 9);
    const size = cell(row, 48).toUpperCase();
    const attribute = cell(row, 11).toUpperCase();
    const priceText = cell(row, 21);
    const price = Number(priceText.replace(/,/g, ""));
    const barcode = cell(row, 12);
    const imageUrl = cell(row, 6);
    const videoUrl = cell(row, 7);
    const description = cell(row, 34);
    const thresholdText = cell(row, 33);
    const threshold = thresholdText === "" ? 10 : Number(thresholdText);
    // The export has no color column; its product name or code ends with the color.
    const color = clean(
      productName.includes(" - ")
        ? productName.split(/\s+-\s+/).at(-1)
        : productCode.split("-").at(-1),
    );
    const rowErrors = [];
    if (!/^\d+$/.test(stt)) rowErrors.push("STT phải là số nguyên");
    if (!codePattern.test(productCode))
      rowErrors.push("Mã sản phẩm không hợp lệ");
    if (!productName || productName.length > 200)
      rowErrors.push("Tên sản phẩm không hợp lệ");
    if (!codePattern.test(skuCode)) rowErrors.push("Mã mẫu mã không hợp lệ");
    if (!category || category.length > 100)
      rowErrors.push("Danh mục không hợp lệ");
    if (!sizes.has(size)) rowErrors.push("Size không hợp lệ");
    if (attribute && attribute !== `SIZE: ${size}`)
      rowErrors.push("Cột Thuộc tính không khớp size");
    if (!priceText || !Number.isFinite(price) || price < 0)
      rowErrors.push("Giá bán không hợp lệ");
    if (!color || color.length > 80)
      rowErrors.push("Không xác định được màu từ tên sản phẩm");
    if (description.length > 2000) rowErrors.push("Mô tả quá 2000 ký tự");
    if (!Number.isSafeInteger(threshold) || threshold < 0)
      rowErrors.push("Ngưỡng cảnh báo không hợp lệ");
    for (const url of [imageUrl, videoUrl]) {
      if (url && (!/^https?:\/\//i.test(url) || url.length > 2000))
        rowErrors.push("URL ảnh/video không hợp lệ");
    }
    if (sttCodes.has(stt) && sttCodes.get(stt) !== productCode)
      rowErrors.push("Cùng STT phải có cùng mã sản phẩm");
    if (skuCodes.has(skuCode)) rowErrors.push("Mã mẫu mã bị trùng trong file");
    if (barcode && barcodes.has(barcode))
      rowErrors.push("Mã vạch bị trùng trong file");
    const product = products.get(productCode);
    if (
      product &&
      (product.stt !== stt ||
        product.productName !== productName ||
        product.category !== category ||
        product.color !== color ||
        product.imageUrl !== imageUrl ||
        product.videoUrl !== videoUrl)
    ) {
      rowErrors.push("Thông tin chung không khớp các dòng cùng sản phẩm");
    }
    if (product?.variants.some((variant) => variant.size === size))
      rowErrors.push("Size bị trùng trong sản phẩm");
    if (rowErrors.length) {
      errors.push({ row: number, message: rowErrors.join("; ") });
      continue;
    }

    sttCodes.set(stt, productCode);
    skuCodes.add(skuCode);
    if (barcode) barcodes.add(barcode);
    if (!product)
      products.set(productCode, {
        stt,
        productCode,
        productName,
        category,
        color,
        imageUrl,
        videoUrl,
        description,
        basePrice: price,
        variants: [],
      });
    products
      .get(productCode)
      .variants.push({ skuCode, size, price, barcode, threshold, row: number });
  }
  if (!products.size && !errors.length)
    errors.push({ row: 1, message: "File không có sản phẩm" });
  if (products.size > 500 || skuCodes.size > 5000)
    errors.push({
      row: 1,
      message: "File vượt giới hạn 500 sản phẩm hoặc 5000 biến thể",
    });
  return { products: [...products.values()], errors };
};

/** Finds codes and barcodes that would collide with existing catalog records. */
export const findImportConflicts = async (products) => {
  const codes = products.map((product) => product.productCode);
  const skus = products.flatMap((product) => product.variants);
  const [existingProducts, existingSkus] = await Promise.all([
    Product.find({ productCode: { $in: codes } })
      .select("productCode")
      .lean(),
    Sku.find({
      $or: [
        { skuCode: { $in: skus.map((sku) => sku.skuCode) } },
        { skuBarcode: { $in: skus.map((sku) => sku.barcode).filter(Boolean) } },
      ],
    })
      .select("skuCode skuBarcode")
      .lean(),
  ]);
  const errors = existingProducts.map((product) => ({
    row: 1,
    message: `Mã sản phẩm ${product.productCode} đã tồn tại`,
  }));
  for (const sku of existingSkus)
    errors.push({
      row: 1,
      message: `Mã mẫu mã hoặc mã vạch ${sku.skuCode} đã tồn tại`,
    });
  return errors;
};

/** Saves the validated catalog and SKUs in one transaction so partial imports roll back. */
export const saveImportedProducts = async (products) => {
  const uploadedAssets = [];
  const mediaByCode = new Map();
  let session;
  let committed = false;
  try {
    // Upload media before opening a MongoDB transaction to keep the transaction short.
    for (const item of products) {
      const media = {};
      if (item.imageUrl) {
        const image = await copyProductMediaUrl(item.imageUrl, item.productCode, 'image');
        uploadedAssets.push(image);
        media.thumbnailUrl = image.secure_url;
        media.imagePublicId = image.public_id;
      }
      if (item.videoUrl) {
        const video = await copyProductMediaUrl(item.videoUrl, item.productCode, 'video');
        uploadedAssets.push(video);
        media.videoUrl = video.secure_url;
        media.videoPublicId = video.public_id;
      }
      mediaByCode.set(item.productCode, media);
    }
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      for (const item of products) {
        // Stock columns describe another system's balances; receiving owns stock in ARAWMS.
        const [product] = await Product.create(
          [
            {
              productCode: item.productCode,
              productName: item.productName,
              sampleCode: item.productCode,
              category: item.category,
              description: item.description,
              basePrice: item.basePrice,
              ...mediaByCode.get(item.productCode),
              isActive: true,
            },
          ],
          { session },
        );
        await Sku.create(
          item.variants.map((variant) => ({
            productId: product._id,
            skuCode: variant.skuCode,
            skuBarcode: variant.barcode || `SKU-${variant.skuCode}`,
            styleName: item.productCode,
            color: item.color,
            size: variant.size,
            retailPrice: variant.price,
            variantKey: `${product._id}:${key(item.color)}:${variant.size}`,
            safetyStockThreshold: variant.threshold,
            isActive: true,
          })),
          { session, ordered: true },
        );
      }
    });
    committed = true;
  } catch (error) {
    if (!committed) await removeProductMedia(uploadedAssets);
    throw error;
  } finally {
    if (session) await session.endSession();
  }
};
