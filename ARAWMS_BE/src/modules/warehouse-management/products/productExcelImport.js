/*
 * File: productExcelImport.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Validates product variation workbooks and saves new products with their SKUs.
 *              One product per product code (e.g. AL186); every color × size row is a variant whose
 *              SKU code is generated as PRODUCTCODE-COLORCODE-SIZE (see common/utils/productCode.js).
 */
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import Product from "../../../models/Product.model.js";
import Sku from "../../../models/Sku.model.js";
import { copyProductMediaUrl, removeProductMedia } from "../../../common/services/productMediaStorage.js";
import {
  buildSkuCode, colorNameFromCode, isValidProductCode, normalizeColorKey, normalizeProductCode,
  splitColoredProductCode, toColorCode,
} from "../../../common/utils/productCode.js";

// Column 5 "Mã mẫu mã" of the source export is no longer read: SKU codes are generated.
const headers = new Map([
  [1, "STT"],
  [2, "Mã sản phẩm"],
  [3, "Tên sản phẩm"],
  [9, "Danh mục"],
  [21, "Giá bán"],
  [48, "SIZE (Thuộc tính)"],
]);
const sizes = new Set(["XS", "S", "M", "L", "XL", "XXL", "FREESIZE"]);
const COLOR_HEADERS = new Set(["màu", "màu sắc"]);
const clean = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim();
const cell = (row, column) => clean(row.getCell(column).text);

/** Finds an optional "Màu" / "Màu sắc" column anywhere in the header row. */
const findColorColumn = (headerRow) => {
  let found = 0;
  headerRow.eachCell({ includeEmpty: false }, (item, column) => {
    if (!found && COLOR_HEADERS.has(clean(item.text).toLocaleLowerCase("vi-VN"))) found = column;
  });
  return found;
};

/**
 * Reads the color and the shared product name of one row. A filled "Màu" cell wins and the name
 * is kept (minus a trailing " - <color>"); otherwise the color is the part after the
 * last " - " in the name, e.g. "Áo len - Kem".
 */
const splitNameAndColor = (rawName, colorCell, hasColorColumn) => {
  // "Tên - Màu" and "Tên- Màu" both count; a hyphen inside a word ("T-shirt") does not.
  const parts = rawName.split(/\s+-\s*|\s*-\s+/);
  const suffix = parts.length > 1 ? parts.at(-1) : "";
  // An empty "Màu" cell falls back to the name suffix, so one file may mix both styles.
  const color = hasColorColumn && clean(colorCell) ? colorCell : suffix;
  const sameAsSuffix = suffix && normalizeColorKey(suffix) === normalizeColorKey(color);
  return { color: clean(color), productName: sameAsSuffix ? parts.slice(0, -1).join(" - ") : rawName };
};

/** Colors written in capitals ("HỒNG") are stored as "Hồng"; mixed case is kept as typed. */
const displayColor = (value) => {
  const text = clean(value);
  if (!text || text !== text.toLocaleUpperCase("vi-VN")) return text;
  const lower = text.toLocaleLowerCase("vi-VN");
  return lower.charAt(0).toLocaleUpperCase("vi-VN") + lower.slice(1);
};

/** Parses the first worksheet using the exported variation-column layout.
 * Rows with the same product code become one product; their shared fields must agree and
 * each color × size pair must be unique. Row errors are collected for preview and no
 * inventory quantities are imported.
 * @param {Buffer} buffer Uploaded XLSX bytes.
 * @returns {Promise<{products: Array, errors: Array}>} Parsed products and row errors.
 */
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
  const colorColumn = findColorColumn(sheet.getRow(1));

  const products = new Map();
  const sttCodes = new Map();
  const barcodes = new Set();
  const errors = [];
  let variantCount = 0;
  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const row = sheet.getRow(number);
    if (!row.hasValues) continue;
    const stt = cell(row, 1);
    const rawCode = cell(row, 2);
    // Source files may carry the color in the code ("CV90-KEM"): the product is CV90, the color Kem.
    const colored = splitColoredProductCode(rawCode);
    const productCode = colored ? colored.productCode : normalizeProductCode(rawCode);
    const named = splitNameAndColor(cell(row, 3), colorColumn ? cell(row, colorColumn) : "", Boolean(colorColumn));
    // Color source order: "Màu" column, then the name suffix, then the color in the code.
    const color = displayColor(named.color) || (colored ? colorNameFromCode(colored.colorSegment) : "");
    const { productName } = named;
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
    const colorCode = toColorCode(color);
    const rowErrors = [];
    if (!/^\d+$/.test(stt)) rowErrors.push("STT phải là số nguyên");
    if (!isValidProductCode(productCode))
      rowErrors.push(rawCode.includes("-")
        ? `Mã sản phẩm "${rawCode}" không hợp lệ (dạng AL186 hoặc AL186-KEM, chỉ một dấu gạch trước màu)`
        : "Mã sản phẩm cần 2–20 chữ in hoa hoặc số, không dấu");
    // A color written in the name or the "Màu" column must agree with the color in the code.
    if (colored && named.color && !toColorCode(named.color).startsWith(toColorCode(colored.colorSegment)))
      rowErrors.push(`Màu trong mã "${rawCode}" khác màu "${named.color}" ghi ở tên hoặc cột Màu`);
    if (!productName || productName.length > 200)
      rowErrors.push("Tên sản phẩm không hợp lệ");
    if (!category || category.length > 100)
      rowErrors.push("Danh mục không hợp lệ");
    if (!sizes.has(size)) rowErrors.push("Size không hợp lệ");
    if (attribute && attribute !== `SIZE: ${size}`)
      rowErrors.push("Cột Thuộc tính không khớp size");
    if (!priceText || !Number.isFinite(price) || price < 0)
      rowErrors.push("Giá bán không hợp lệ");
    if (!color || color.length > 80 || !colorCode)
      rowErrors.push('Không xác định được màu (ghi màu trong mã dạng AL186-KEM, cột Màu hoặc tên dạng "Tên - Màu")');
    if (description.length > 2000) rowErrors.push("Mô tả quá 2000 ký tự");
    if (!Number.isSafeInteger(threshold) || threshold < 0)
      rowErrors.push("Ngưỡng cảnh báo không hợp lệ");
    if (barcode.length > 128 || /\s/.test(barcode)) rowErrors.push("Mã vạch không hợp lệ");
    for (const url of [imageUrl, videoUrl]) {
      if (url && (!/^https?:\/\//i.test(url) || url.length > 2000))
        rowErrors.push("URL ảnh/video không hợp lệ");
    }
    if (sttCodes.has(stt) && sttCodes.get(stt) !== productCode)
      rowErrors.push("Cùng STT phải có cùng mã sản phẩm");
    if (barcode && barcodes.has(barcode))
      rowErrors.push("Mã vạch bị trùng trong file");
    const product = products.get(productCode);
    if (
      // STT is not compared: the source export numbers each color code (CV90-KEM, CV90-DEN) separately.
      product &&
      // Images and videos are not compared either: each color row may bring its own picture.
      (product.productName !== productName ||
        product.category !== category)
    ) {
      rowErrors.push("Thông tin chung không khớp các dòng cùng mã sản phẩm");
    }
    if (product?.variants.some((variant) => normalizeColorKey(variant.color) === normalizeColorKey(color) && variant.size === size))
      rowErrors.push("Màu và size bị trùng trong sản phẩm");
    const sameCode = product?.variants.find((variant) => toColorCode(variant.color) === colorCode &&
      normalizeColorKey(variant.color) !== normalizeColorKey(color));
    if (sameCode) rowErrors.push(`Màu "${color}" trùng mã ${colorCode} với màu "${sameCode.color}"`);
    if (rowErrors.length) {
      errors.push({ row: number, message: rowErrors.join("; ") });
      continue;
    }

    sttCodes.set(stt, productCode);
    if (barcode) barcodes.add(barcode);
    if (!product)
      products.set(productCode, {
        stt,
        productCode,
        productName,
        category,
        imageUrl,
        videoUrl,
        description,
        basePrice: price,
        imageUrls: [],
        variants: [],
        rows: [],
      });
    products
      .get(productCode)
      .variants.push({ color, size, price, barcode, threshold, row: number });
    products.get(productCode).rows.push(number);
    // First image is the cover; other distinct images (usually one per color) become extra images.
    const target = products.get(productCode);
    if (imageUrl && !target.imageUrls.includes(imageUrl)) target.imageUrls.push(imageUrl);
    if (!target.imageUrl) target.imageUrl = imageUrl;
    if (!target.videoUrl) target.videoUrl = videoUrl;
    variantCount += 1;
  }
  if (!products.size && !errors.length)
    errors.push({ row: 1, message: "File không có sản phẩm" });
  if (products.size > 500 || variantCount > 5000)
    errors.push({
      row: 1,
      message: "File vượt giới hạn 500 sản phẩm hoặc 5000 biến thể",
    });
  return { products: [...products.values()], errors };
};

/** SKU code and barcode each variant will receive. */
const variantCodes = (product) => product.variants.map((variant) => {
  const skuCode = buildSkuCode(product.productCode, variant.color, variant.size);
  return { skuCode, barcode: variant.barcode || skuCode };
});

/** Checks incoming product codes, generated SKU codes, and barcodes against MongoDB.
 * The caller must stop import when any conflict is returned, including a code
 * belonging to a soft-deleted record because the database index still reserves it.
 */
export const findImportConflicts = async (products) => {
  const codes = products.map((product) => product.productCode);
  const generated = products.flatMap(variantCodes);
  const [existingProducts, existingSkus] = await Promise.all([
    // Legacy products keep their code in sampleCode until the migration runs. TODO(xóa sampleCode): productCode only.
    Product.find({ $or: [{ productCode: { $in: codes } }, { sampleCode: { $in: codes } }] })
      .select("productCode sampleCode")
      .lean(),
    Sku.find({
      $or: [
        { skuCode: { $in: generated.map((item) => item.skuCode) } },
        { skuBarcode: { $in: generated.map((item) => item.barcode) } },
      ],
    })
      .select("skuCode skuBarcode")
      .lean(),
  ]);
  const errors = existingProducts.map((product) => ({
    row: 1,
    message: `Mã sản phẩm ${codes.includes(product.productCode) ? product.productCode : product.sampleCode} đã tồn tại`,
  }));
  for (const sku of existingSkus)
    errors.push({
      row: 1,
      message: `Mã SKU hoặc mã vạch ${sku.skuCode} đã tồn tại`,
    });
  return errors;
};

/** Copies remote media into code-named Cloudinary assets, then creates catalog records.
 * Media is uploaded before opening the MongoDB transaction; a failed database
 * import rolls back product and SKU records and attempts to remove new assets.
 * @param {Array} products Validated products from parseProductWorkbook.
 */
export const saveImportedProducts = async (products) => {
  const uploadedAssets = [];
  const mediaByCode = new Map();
  let session;
  let committed = false;
  try {
    // Upload media before opening a MongoDB transaction to keep the transaction short.
    for (const item of products) {
      const media = {};
      const imageUrls = item.imageUrls?.length ? item.imageUrls : [item.imageUrl].filter(Boolean);
      for (const [index, url] of imageUrls.entries()) {
        // The cover keeps the plain code-named asset; extra images get "_2", "_3"… so none overwrite it.
        const image = await copyProductMediaUrl(url, item.productCode, 'image', index ? String(index + 1) : '');
        uploadedAssets.push(image);
        if (index === 0) { media.thumbnailUrl = image.secure_url; media.imagePublicId = image.public_id; }
        else (media.additionalImageUrls ||= []).push(image.secure_url);
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
        // Imported products are ACTIVE, so their code is locked immediately.
        const [product] = await Product.create(
          [
            {
              productCode: item.productCode,
              productName: item.productName,
              category: item.category,
              description: item.description,
              basePrice: item.basePrice,
              ...mediaByCode.get(item.productCode),
              isActive: true,
              codeLockedAt: new Date(),
            },
          ],
          { session },
        );
        const codes = variantCodes(item);
        await Sku.create(
          item.variants.map((variant, index) => ({
            productId: product._id,
            skuCode: codes[index].skuCode,
            skuBarcode: codes[index].barcode,
            styleName: item.productCode,
            color: variant.color,
            size: variant.size,
            retailPrice: variant.price,
            variantKey: `${product._id}:${normalizeColorKey(variant.color)}:${variant.size}`,
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
