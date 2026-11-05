/**
 * ============================================================================
 * @title        : Marketplace Order Import Service (Mentor Feedback 4.3.3)
 * @author       : AraStore Backend Team
 * @createdDate  : 2026-11-02
 * @description  : Xử lý quy trình:
 *                 1. Quản lý cấu hình Đa Kênh (Nhiều Facebook Page, Nhiều TikTok Shop, Shopee Store).
 *                 2. Đọc và phân tích cú pháp File Excel từ Shopee, TikTok Shop hoặc File mẫu ARA.
 *                 3. Khái niệm "Xử lý đơn" (Marketplace Order Processing): Xác thực SKU, tồn kho,
 *                    tạo đơn hàng với nguồn gốc rõ ràng (sourceDetails).
 *                 4. Quy trình duyệt kho (Warehouse Approval): Kho kiểm tra và duyệt lại trước khi xuất kho.
 * ============================================================================
 */

import ExcelJS from 'exceljs';
import SalesOrder from '../../../models/SalesOrder.model.js';
import Sku from '../../../models/Sku.model.js';
import Product from '../../../models/Product.model.js';
import Customer from '../../../models/Customer.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import { emitMarketplaceOrdersImported } from '../../../config/socket.js';

/**
 * Hàm chuẩn hoá chuỗi tiêu đề cột (bỏ dấu tiếng Việt, ký tự đặc biệt, đưa về chữ thường)
 */
const normalizeHeader = (str) => {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

const escapeRegex = (str) => String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const matchesAny = (normalizedText, keywords) => {
  return keywords.some((kw) => normalizedText === kw || normalizedText.includes(kw));
};

/**
 * Phân tách các sản phẩm trong trường hợp ô "Tên sản phẩm" chứa nhiều món
 * Ví dụ: "SET AL186+AK001 HỒNG S HỒNG S x 1, AL182 ÁO LEN VÂN MÂY VIỀN ĐEN - KEM SIZE: S x 1"
 */
export const splitOrderItemsFromCell = (rawCellText, defaultQty = 1, defaultPrice = 0) => {
  if (!rawCellText || typeof rawCellText !== 'string') return [];
  const text = rawCellText.trim();
  if (!text) return [];

  let itemStrings = [];
  if (text.includes('\n')) {
    itemStrings = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } else if (/(?<=x\s*\d+)\s*,\s*/i.test(text)) {
    itemStrings = text.split(/(?<=x\s*\d+)\s*,\s*/i).map((s) => s.trim()).filter(Boolean);
  } else {
    itemStrings = [text];
  }

  return itemStrings.map((subStr) => {
    const qtyMatch = subStr.match(/x\s*(\d+)\s*$/i);
    const itemQty = qtyMatch ? parseInt(qtyMatch[1], 10) : (itemStrings.length === 1 ? defaultQty : 1);
    return {
      rawSkuOrName: subStr,
      quantity: Math.max(1, itemQty || 1),
      unitPrice: defaultPrice > 0 && itemStrings.length === 1 ? defaultPrice : 0,
    };
  });
};

/**
 * Thuật toán thông minh tự động tìm kiếm và ghép SKU trong kho từ tên sản phẩm hoặc mã SKU sàn
 * Hỗ trợ các chuỗi tên từ Shopee/TikTok như:
 * "CV68 CHÂN VÁY XẾP LY BÊN ĐÍNH PHA LÊ CAO CẤP - KEM size: M x 1"
 * "SET AL186+AK001 KEM M BE M x 1"
 * "V178 VÁY XÒE 2 DÂY VIỀN REN XẾP LY CHÂN (KÈM ĐAI) - HỒNG SIZE: S x 1"
 */
export const findMatchingSku = async (rawInput) => {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const cleaned = rawInput.trim();
  if (!cleaned) return null;

  // 1. Khớp chính xác skuCode (không phân biệt hoa thường) hoặc skuBarcode
  let sku = await Sku.findOne({
    $or: [
      { skuCode: cleaned.toUpperCase() },
      { skuBarcode: cleaned },
    ],
  }).populate('productId').lean();
  if (sku) return sku;

  // 2. Bóc tách các thuộc tính nhận diện từ tên sản phẩm
  // Size: size: M, size M, Size: L, hoặc các size chuẩn
  const sizeMatch = cleaned.match(/size\s*[:=\-\s]\s*([A-Za-z0-9]+)/i)
    || cleaned.match(/\b(XS|S|M|L|XL|XXL|FREESIZE)\b/i);
  const extractedSize = sizeMatch ? sizeMatch[1].toUpperCase() : null;

  // Màu sắc (ví dụ: "- KEM", "- ĐEN", "- TRẮNG", hoặc từ khóa màu)
  const colorMatch = cleaned.match(/-\s*([^:;\-\n]+?)(?:\s+size|\s+x\d+|$)/i)
    || cleaned.match(/màu\s*[:=\-\s]\s*([^\s:;,]+)/i)
    || cleaned.match(/\b(KEM|HỒNG|TRẮNG|TRANG|ĐEN|DEN|BE|NÂU|NAU|ĐỎ|DO|XANH|GHI)\b/i);
  const extractedColor = colorMatch ? colorMatch[1].trim() : null;

  // Tìm tất cả ứng viên mã sản phẩm trong chuỗi (chữ kèm số như AL186, AK001, V178, CV68, Q22...)
  const codeTokens = cleaned.match(/\b[A-Za-z]+[0-9]+[A-Za-z0-9_-]*\b/g) || [];
  if (codeTokens.length === 0) {
    const firstWord = cleaned.match(/^([A-Za-z0-9_-]{2,30})/);
    if (firstWord && !['SET', 'BO', 'COMBO', 'AO', 'VAY', 'QUAN', 'DAM'].includes(normalizeHeader(firstWord[1]))) {
      codeTokens.push(firstWord[1]);
    }
  }

  for (const token of codeTokens) {
    const codePrefix = token.toUpperCase();

    // Chiến lược A: Tìm SKU theo skuCode bắt đầu bằng codePrefix
    const skuQuery = {
      skuCode: new RegExp('^' + escapeRegex(codePrefix), 'i'),
    };
    if (extractedSize) skuQuery.size = extractedSize;
    if (extractedColor) skuQuery.color = new RegExp(escapeRegex(extractedColor), 'i');

    sku = await Sku.findOne(skuQuery).populate('productId').lean();
    if (sku) return sku;

    if (extractedSize) {
      sku = await Sku.findOne({
        skuCode: new RegExp('^' + escapeRegex(codePrefix), 'i'),
        size: extractedSize,
      }).populate('productId').lean();
      if (sku) return sku;
    }

    sku = await Sku.findOne({
      skuCode: new RegExp('^' + escapeRegex(codePrefix), 'i'),
    }).populate('productId').lean();
    if (sku) return sku;

    // Chiến lược B: Khớp sản phẩm qua Product model (productCode hoặc sampleCode)
    const product = await Product.findOne({
      $or: [
        { productCode: new RegExp('^' + escapeRegex(codePrefix) + '$', 'i') },
        { sampleCode: new RegExp('^' + escapeRegex(codePrefix) + '$', 'i') },
      ],
    }).lean();

    if (product) {
      const pSkuQuery = { productId: product._id };
      if (extractedSize) pSkuQuery.size = extractedSize;
      if (extractedColor) pSkuQuery.color = new RegExp(escapeRegex(extractedColor), 'i');
      sku = await Sku.findOne(pSkuQuery).populate('productId').lean();
      if (sku) return sku;

      if (extractedSize) {
        sku = await Sku.findOne({ productId: product._id, size: extractedSize }).populate('productId').lean();
        if (sku) return sku;
      }

      sku = await Sku.findOne({ productId: product._id }).populate('productId').lean();
      if (sku) return sku;
    }

    // Chiến lược C: Khớp styleName chứa codePrefix
    const styleQuery = {
      styleName: new RegExp(escapeRegex(codePrefix), 'i'),
    };
    if (extractedSize) styleQuery.size = extractedSize;
    sku = await Sku.findOne(styleQuery).populate('productId').lean();
    if (sku) return sku;
  }

  // Chiến lược D: Khớp từ ngữ trong tên sản phẩm
  const titleWithoutAttrs = cleaned.split(/[-:]/)[0].trim();
  if (titleWithoutAttrs.length >= 3) {
    const words = titleWithoutAttrs.split(/\s+/).filter((w) => w.length >= 2 && !['SET', 'COMBO', 'BỘ'].includes(w.toUpperCase()));
    if (words.length > 0) {
      const regexStr = words.map((w) => escapeRegex(w)).join('.*');
      sku = await Sku.findOne({
        $or: [
          { styleName: new RegExp(regexStr, 'i') },
          { skuCode: new RegExp(regexStr, 'i') },
        ],
        ...(extractedSize ? { size: extractedSize } : {}),
      }).populate('productId').lean();
      if (sku) return sku;
    }
  }

  return null;
};

/**
 * Danh mục các kênh bán hàng đa nguồn được cấu hình trong hệ thống
 */
export const CONFIGURED_SALES_CHANNELS = [
  {
    channel: 'FACEBOOK',
    sourceType: 'FANPAGE',
    sourceId: 'fb_page_01',
    sourceName: 'Fanpage - ARA Thời Trang Thiết Kế',
    isActive: true,
  },
  {
    channel: 'FACEBOOK',
    sourceType: 'FANPAGE',
    sourceId: 'fb_page_02',
    sourceName: 'Fanpage - ARA Đầm Dạ Hội & Cao Cấp',
    isActive: true,
  },
  {
    channel: 'TIKTOK',
    sourceType: 'TIKTOK_SHOP',
    sourceId: 'tiktok_shop_01',
    sourceName: 'TikTok Shop - ARA Official Store',
    isActive: true,
  },
  {
    channel: 'TIKTOK',
    sourceType: 'TIKTOK_SHOP',
    sourceId: 'tiktok_shop_02',
    sourceName: 'TikTok Shop - ARA Studio Outlet',
    isActive: true,
  },
  {
    channel: 'SHOPEE',
    sourceType: 'SHOPEE_STORE',
    sourceId: 'shopee_mall_01',
    sourceName: 'Shopee Mall - ARA Flagship Store',
    isActive: true,
  },
  {
    channel: 'EXCEL_IMPORT',
    sourceType: 'EXCEL_CUSTOM',
    sourceId: 'excel_general',
    sourceName: 'File Excel Tổng Hợp Nội Bộ',
    isActive: true,
  },
];

/**
 * Lấy danh sách các kênh / nguồn bán hàng có sẵn
 */
export const getSalesChannels = () => {
  return CONFIGURED_SALES_CHANNELS;
};

/**
 * Phân tích file Excel tải lên từ Seller (Shopee / TikTok / ARA Template / Vận chuyển)
 * Hỗ trợ nhận diện cột tự động linh hoạt (Header Auto-Detection)
 */
export const parseExcelFile = async (fileBuffer, channel, sourceId) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('File Excel rỗng hoặc không có bảng tính hợp lệ');
  }

  // 1. Quét tìm dòng tiêu đề trong 5 dòng đầu tiên
  let headerRowNumber = -1;
  const colMapping = {};

  for (let r = 1; r <= Math.min(5, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    let matchedKeywordsCount = 0;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const textNorm = normalizeHeader(cell.text || cell.value);
      if (matchesAny(textNorm, [
        'ma don hang rieng', 'ma don hang', 'ma don san', 'ma don', 'external order code', 'order id',
        'ten san pham', 'ten hang hoa', 'ten hang', 'san pham',
        'ma sku', 'sku', 'so luong', 'sl', 'tien thu ho', 'don gia',
        'ten khach hang', 'khach hang', 'so dien thoai', 'sdt', 'dia chi', 'stt'
      ])) {
        matchedKeywordsCount++;
      }
    });

    if (matchedKeywordsCount >= 2) {
      headerRowNumber = r;
      break;
    }
  }

  // Nếu tìm thấy dòng tiêu đề, tiến hành ánh xạ cột
  if (headerRowNumber !== -1) {
    const headerRow = worksheet.getRow(headerRowNumber);
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const textNorm = normalizeHeader(cell.text || cell.value);
      if (!textNorm) return;

      if (matchesAny(textNorm, ['ma don hang rieng', 'ma don hang', 'ma don san', 'ma don', 'external order code', 'order id', 'order code'])) {
        if (!colMapping.externalOrderCode) colMapping.externalOrderCode = colNumber;
      } else if (matchesAny(textNorm, ['ma sku barcode', 'ma sku', 'sku code', 'sku', 'ma barcode', 'barcode', 'ma vach', 'ma sku nguoi ban', 'seller sku'])) {
        if (!colMapping.skuCode) colMapping.skuCode = colNumber;
      } else if (matchesAny(textNorm, ['ten san pham', 'ten hang hoa', 'ten hang', 'san pham', 'product name', 'ten mat hang'])) {
        if (!colMapping.productName) colMapping.productName = colNumber;
      } else if (matchesAny(textNorm, ['ten bien the', 'bien the', 'variation', 'phan loai hang', 'thuoc tinh', 'phan loai'])) {
        if (!colMapping.variation) colMapping.variation = colNumber;
      } else if (textNorm === 'sl' || textNorm.split(' ').includes('sl') || textNorm.includes('so luong') || textNorm.includes('quantity') || textNorm.includes('qty')) {
        if (!colMapping.quantity) colMapping.quantity = colNumber;
      } else if (matchesAny(textNorm, ['tien thu ho', 'tien cod', 'cod', 'don gia vnd', 'don gia', 'gia ban', 'thanh tien', 'tong tien', 'price', 'amount', 'gia', 'tong so tien thanh toan', 'gia goc'])) {
        if (!colMapping.unitPrice) colMapping.unitPrice = colNumber;
      } else if (matchesAny(textNorm, ['ten khach hang', 'ten nguoi nhan', 'nguoi nhan', 'khach hang', 'customer name', 'ho va ten', 'ho ten', 'buyer', 'recipient name'])) {
        if (!colMapping.customerName) colMapping.customerName = colNumber;
      } else if (matchesAny(textNorm, ['so dien thoai', 'so dt', 'sdt', 'dien thoai', 'phone', 'tel', 'mobile', 'so dien thoai nguoi nhan'])) {
        if (!colMapping.phone) colMapping.phone = colNumber;
      } else if (matchesAny(textNorm, ['so nha ngo ngach hem', 'so nha', 'dia chi chi tiet', 'dia chi 1', 'detailed address'])) {
        if (!colMapping.addressDetail) colMapping.addressDetail = colNumber;
      } else if (matchesAny(textNorm, ['duong pho phuong xa quan huyen tinh thanh pho', 'duong pho', 'phuong xa', 'quan huyen', 'tinh thanh', 'tinh thanh pho', 'dia chi 2'])) {
        if (!colMapping.addressArea) colMapping.addressArea = colNumber;
      } else if (matchesAny(textNorm, ['dia chi giao hang', 'dia chi nhan hang', 'dia chi', 'address', 'full address'])) {
        if (!colMapping.fullAddress) colMapping.fullAddress = colNumber;
      } else if (matchesAny(textNorm, ['ma van don san tracking', 'ma van don san', 'ma van don', 'ma tracking', 'tracking code', 'tracking', 'waybill', 'tracking id', 'tracking number'])) {
        if (!colMapping.trackingCode) colMapping.trackingCode = colNumber;
      } else if (matchesAny(textNorm, ['ghi chu them', 'ghi chu don', 'ghi chu', 'note', 'notes', 'ghi chu cua nguoi mua', 'buyer message'])) {
        if (!colMapping.notes) colMapping.notes = colNumber;
      } else if (matchesAny(textNorm, ['kl kg', 'khoi luong', 'trong luong', 'weight'])) {
        if (!colMapping.weight) colMapping.weight = colNumber;
      } else if (matchesAny(textNorm, ['hoa toc 0 1', 'hoa toc', 'giao hoa toc', 'express'])) {
        if (!colMapping.isExpress) colMapping.isExpress = colNumber;
      } else if (matchesAny(textNorm, ['giao toi'])) {
        if (!colMapping.eveningDelivery) colMapping.eveningDelivery = colNumber;
      } else if (matchesAny(textNorm, ['shop tra ship', 'shop tra cuoc', 'shop tra phi'])) {
        if (!colMapping.shopPaysShip) colMapping.shopPaysShip = colNumber;
      }
    });
  } else {
    // Fallback nếu không xác định được dòng tiêu đề: Giả định layout mặc định 9 cột cũ
    headerRowNumber = 1;
    colMapping.externalOrderCode = 1;
    colMapping.customerName = 2;
    colMapping.phone = 3;
    colMapping.fullAddress = 4;
    colMapping.skuCode = 5;
    colMapping.quantity = 6;
    colMapping.unitPrice = 7;
    colMapping.trackingCode = 8;
    colMapping.notes = 9;
  }

  const rows = [];
  const startRow = headerRowNumber + 1;

  for (let r = startRow; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    if (!row.hasValues) continue;

    const getVal = (col) => {
      if (!col) return '';
      const cell = row.getCell(col);
      return String(cell.text || cell.value || '').trim();
    };

    const externalOrderCode = getVal(colMapping.externalOrderCode);
    if (!externalOrderCode) continue;

    const rawSku = getVal(colMapping.skuCode);
    const rawProd = getVal(colMapping.productName);
    const rawVariation = getVal(colMapping.variation);
    const combinedProd = rawVariation ? `${rawProd} - ${rawVariation}` : rawProd;
    const rawSkuOrName = rawSku || combinedProd;

    const rawQty = getVal(colMapping.quantity);
    const quantity = Math.max(1, parseInt(rawQty, 10) || 1);

    const rawPrice = getVal(colMapping.unitPrice);
    const unitPrice = Number(String(rawPrice || 0).replace(/[^0-9]/g, '')) || 0;

    const customerName = getVal(colMapping.customerName) || 'Khách Sàn TMĐT';
    const rawPhone = getVal(colMapping.phone);
    const phone = rawPhone || '0900000000';

    const fullAddr = getVal(colMapping.fullAddress);
    const addrDetail = getVal(colMapping.addressDetail);
    const addrArea = getVal(colMapping.addressArea);
    const address = fullAddr || [addrDetail, addrArea].filter(Boolean).join(', ') || 'Địa chỉ sàn TMĐT';

    const trackingCode = getVal(colMapping.trackingCode);
    const rawNotes = getVal(colMapping.notes);
    const weight = getVal(colMapping.weight);
    const isExpress = getVal(colMapping.isExpress);
    const eveningDelivery = getVal(colMapping.eveningDelivery);
    const shopPaysShip = getVal(colMapping.shopPaysShip);

    const noteParts = [];
    if (rawNotes) noteParts.push(rawNotes);
    if (isExpress === '1' || isExpress === 1 || String(isExpress).toLowerCase().includes('hỏa tốc')) {
      noteParts.push('Giao hỏa tốc');
    }
    if (eveningDelivery === '1' || eveningDelivery === 1 || String(eveningDelivery).toLowerCase().includes('tối')) {
      noteParts.push('Giao tối');
    }
    if (shopPaysShip === '1' || shopPaysShip === 1) {
      noteParts.push('Shop trả ship');
    }
    if (weight) {
      noteParts.push(`KL: ${weight}kg`);
    }

    const parsedItems = splitOrderItemsFromCell(rawSkuOrName, quantity, unitPrice);

    rows.push({
      rowNumber: r,
      externalOrderCode,
      customerName,
      phone,
      address,
      items: parsedItems,
      totalCodAmount: unitPrice,
      trackingCode,
      notes: noteParts.join(' | '),
    });
  }

  if (rows.length === 0) {
    throw new Error('Không tìm thấy dữ liệu đơn hàng trong file Excel. Vui lòng kiểm tra lại cấu trúc file.');
  }

  // Nhóm theo mã đơn hàng ngoài sàn (externalOrderCode)
  const groupedOrdersMap = new Map();
  for (const r of rows) {
    if (!r.externalOrderCode) continue;

    if (!groupedOrdersMap.has(r.externalOrderCode)) {
      groupedOrdersMap.set(r.externalOrderCode, {
        externalOrderCode: r.externalOrderCode,
        customerName: r.customerName,
        phone: r.phone,
        address: r.address,
        trackingCode: r.trackingCode || '',
        notes: r.notes || '',
        totalCodAmount: r.totalCodAmount || 0,
        items: [],
      });
    }

    groupedOrdersMap.get(r.externalOrderCode).items.push(...r.items);
  }

  const parsedOrders = Array.from(groupedOrdersMap.values());
  const validatedOrders = [];

  // Xác thực từng đơn hàng và tìm kiếm SKU tương ứng trong kho
  for (const ord of parsedOrders) {
    let warningMessage = '';
    const validatedItems = [];
    let itemsTotal = 0;

    // Kiểm tra đơn trùng lặp trong hệ thống
    const existingOrder = await SalesOrder.findOne({
      'sourceDetails.externalOrderCode': ord.externalOrderCode,
    }).lean();

    if (existingOrder) {
      warningMessage = `Mã đơn sàn ${ord.externalOrderCode} đã được import trước đó (${existingOrder.orderCode})`;
    }

    for (const item of ord.items) {
      const skuDoc = await findMatchingSku(item.rawSkuOrName);

      if (!skuDoc) {
        const missingWarn = `Chưa khớp được SKU kho cho sản phẩm: "${item.rawSkuOrName}"`;
        warningMessage = warningMessage ? `${warningMessage}; ${missingWarn}` : missingWarn;

        validatedItems.push({
          skuCode: item.rawSkuOrName || 'CHƯA_GÁN_SKU',
          rawProductName: item.rawSkuOrName,
          skuId: null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          availableQty: 0,
          isValidSku: false,
          isStockSufficient: false,
        });
      } else {
        const available = Math.max(0, (skuDoc.onHandQty || 0) - (skuDoc.reservedQty || 0));
        const finalPrice = item.unitPrice > 0 ? item.unitPrice : (skuDoc.retailPrice || 0);
        itemsTotal += item.quantity * finalPrice;
        const sufficient = available >= item.quantity;

        validatedItems.push({
          skuCode: skuDoc.skuCode,
          skuId: skuDoc._id,
          skuBarcode: skuDoc.skuBarcode,
          productName: skuDoc.styleName || skuDoc.skuCode,
          color: skuDoc.color,
          size: skuDoc.size,
          rawProductName: item.rawSkuOrName,
          quantity: item.quantity,
          unitPrice: finalPrice,
          availableQty: available,
          isValidSku: true,
          isStockSufficient: sufficient,
        });

        if (!sufficient) {
          const stockWarn = `SKU [${skuDoc.skuCode}] tồn khả dụng thấp (còn ${available}, cần ${item.quantity})`;
          warningMessage = warningMessage ? `${warningMessage}; ${stockWarn}` : stockWarn;
        }
      }
    }

    // Đơn hợp lệ để import khi không bị trùng và tất cả sản phẩm đều đã được xác định SKU trong hệ thống
    const allItemsHaveValidSku = validatedItems.length > 0 && validatedItems.every((it) => it.isValidSku);
    const isOrderImportable = !existingOrder && allItemsHaveValidSku;

    validatedOrders.push({
      ...ord,
      items: validatedItems,
      totalAmount: itemsTotal > 0 ? itemsTotal : (ord.totalCodAmount || 0),
      isValid: isOrderImportable,
      warningMessage,
    });
  }

  return {
    channel,
    sourceId,
    totalParsedOrders: validatedOrders.length,
    validOrdersCount: validatedOrders.filter((o) => o.isValid).length,
    invalidOrdersCount: validatedOrders.filter((o) => !o.isValid).length,
    orders: validatedOrders,
  };
};

/**
 * Tự động khởi tạo danh mục Product và SKU trong kho cho các sản phẩm chưa có trong hệ thống
 */
export const autoProvisionSkus = async (items) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const createdSkus = [];

  for (const it of items) {
    const rawName = String(it.rawProductName || it.skuCode || '').trim();
    if (!rawName) continue;

    // Kiểm tra xem đã khớp SKU nào chưa
    const matchedSku = await findMatchingSku(rawName);
    if (matchedSku) {
      createdSkus.push({
        _id: matchedSku._id,
        skuCode: matchedSku.skuCode,
        skuBarcode: matchedSku.skuBarcode,
        productName: matchedSku.styleName || matchedSku.skuCode,
        color: matchedSku.color,
        size: matchedSku.size,
        availableQty: Math.max(0, (matchedSku.onHandQty || 0) - (matchedSku.reservedQty || 0)),
        rawProductName: rawName,
        retailPrice: matchedSku.retailPrice || 0,
      });
      continue;
    }

    // Trích xuất thuộc tính size
    const sizeMatch = rawName.match(/size\s*[:=\-\s]\s*([A-Za-z0-9]+)/i)
      || rawName.match(/\b(XS|S|M|L|XL|XXL|FREESIZE)\b/i);
    const size = sizeMatch ? sizeMatch[1].toUpperCase() : 'FREESIZE';

    // Trích xuất màu sắc
    const colorMatch = rawName.match(/-\s*([^:;\-\n]+?)(?:\s+size|\s+x\d+|$)/i)
      || rawName.match(/màu\s*[:=\-\s]\s*([^\s:;,]+)/i)
      || rawName.match(/\b(KEM|HỒNG|TRẮNG|TRANG|ĐEN|DEN|BE|NÂU|NAU|ĐỎ|DO|XANH|GHI)\b/i);
    const color = colorMatch ? colorMatch[1].trim().toUpperCase() : 'TIÊU CHUẨN';

    // Trích xuất mã sản phẩm (chữ + số)
    const codeTokens = rawName.match(/\b[A-Za-z]+[0-9]+[A-Za-z0-9_-]*\b/g) || [];
    let code = codeTokens[0] ? codeTokens[0].toUpperCase() : null;
    if (!code) {
      const first = rawName.match(/^([A-Za-z0-9_-]{2,30})/);
      code = first ? first[1].toUpperCase() : `SP-${Date.now().toString().slice(-4)}`;
    }

    const productCode = code;
    const titleClean = rawName.replace(/x\s*\d+$/i, '').trim();

    let product = await Product.findOne({ productCode });
    if (!product) {
      product = await Product.create({
        productCode,
        productName: titleClean,
        sampleCode: productCode,
        category: 'Thời Trang Thiết Kế',
        basePrice: it.unitPrice || 350000,
        isActive: true,
      });
    }

    const normalizedColor = normalizeHeader(color).toUpperCase().replace(/\s+/g, '');
    const skuCode = `${productCode}-${size}-${normalizedColor || 'STD'}`.toUpperCase();
    const skuBarcode = skuCode;

    let sku = await Sku.findOne({ skuCode });
    if (!sku) {
      sku = await Sku.create({
        skuCode,
        skuBarcode,
        productId: product._id,
        styleName: `${productCode}-${color}`,
        color,
        size,
        retailPrice: it.unitPrice || product.basePrice || 350000,
        unitCogs: Math.round((it.unitPrice || product.basePrice || 350000) * 0.5),
        onHandQty: 100, // Khởi tạo tồn kho sẵn sàng phục vụ xuất bán
        reservedQty: 0,
        isActive: true,
      });
    }

    createdSkus.push({
      _id: sku._id,
      skuCode: sku.skuCode,
      skuBarcode: sku.skuBarcode,
      productName: product.productName || sku.styleName,
      color: sku.color,
      size: sku.size,
      availableQty: Math.max(0, (sku.onHandQty || 0) - (sku.reservedQty || 0)),
      rawProductName: rawName,
      retailPrice: sku.retailPrice,
    });
  }

  return createdSkus;
};

/**
 * Seller thực hiện "Xử lý đơn" (Marketplace Order Processing)
 * Lưu các đơn hàng hợp lệ vào hệ thống với importStatus: 'PENDING_WAREHOUSE_APPROVAL'
 */
export const processImportOrders = async (ordersData, sourceInfo, user, req) => {
  const { channel, sourceId, sourceName, orders } = ordersData;

  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error('Không có đơn hàng hợp lệ nào được chọn để xử lý');
  }

  const batchCode = await CounterSequence.getNextSequence('IMPORT_BATCH', 'BATCH', 4);
  const createdOrders = [];

  for (const ord of orders) {
    // 1. Tạo hoặc lấy thông tin khách hàng (xử lý trường hợp số điện thoại bị ẩn sao từ sàn TMĐT)
    let customerDoc = null;
    const isMaskedPhone = ord.phone && ord.phone.includes('*');

    if (ord.phone && !isMaskedPhone && ord.phone.length >= 9) {
      customerDoc = await Customer.findOne({ phone: ord.phone });
    }

    if (!customerDoc) {
      const customerCode = await CounterSequence.getNextSequence('CUSTOMER_CODE', 'CUST', 5);
      customerDoc = await Customer.create({
        customerCode,
        fullName: ord.customerName || 'Khách hàng Sàn TMĐT',
        phone: ord.phone || '0900000000',
        addresses: [
          {
            recipientName: ord.customerName,
            phone: ord.phone,
            fullAddress: ord.address,
            isDefault: true,
          },
        ],
      });
    }

    // 2. Chuẩn bị danh sách sản phẩm
    const processedItems = [];
    let itemsSubtotal = 0;

    for (const item of ord.items) {
      if (!item.skuId) continue;
      const skuDoc = await Sku.findById(item.skuId);
      if (!skuDoc) continue;

      const price = Number(item.unitPrice) || skuDoc.retailPrice || 0;
      const qty = Number(item.quantity) || 1;
      itemsSubtotal += price * qty;

      processedItems.push({
        skuId: skuDoc._id,
        skuCode: skuDoc.skuCode,
        skuBarcode: skuDoc.skuBarcode,
        productName: skuDoc.styleName || skuDoc.skuCode,
        color: skuDoc.color || item.color,
        size: skuDoc.size || item.size,
        orderedQty: qty,
        unitSalePrice: price,
        unitCogsSnapshot: skuDoc.unitCogs || 0,
        fifoPickList: [],
        packedScannedQty: 0,
      });
    }

    if (processedItems.length === 0) continue;

    // 3. Tạo mã đơn hàng hệ thống ARA
    const orderCode = await CounterSequence.getNextSequence('ORDER_CODE', 'ARA', 6);
    const totalOrderAmount = ord.totalAmount > 0 ? ord.totalAmount : itemsSubtotal;

    const newSalesOrder = await SalesOrder.create({
      orderCode,
      customerId: customerDoc._id,
      sellerId: user._id,
      orderType: 'DIRECT_SALES',
      channel: channel || 'SHOPEE',
      sourceDetails: {
        sourceType: sourceInfo?.sourceType || 'SHOPEE_STORE',
        sourceId: sourceId || sourceInfo?.sourceId || 'shopee_default',
        sourceName: sourceName || sourceInfo?.sourceName || 'Kênh TMĐT',
        externalOrderCode: ord.externalOrderCode,
        externalTrackingCode: ord.trackingCode || '',
        importBatchCode: batchCode,
      },
      status: 'PENDING',
      importStatus: 'PENDING_WAREHOUSE_APPROVAL',
      importedBySellerId: user._id,
      importedAt: new Date(),
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      notes: ord.notes ? `[Import Sàn]: ${ord.notes}` : `[Import Sàn ${channel}]`,
      shippingRecipient: {
        name: ord.customerName,
        phone: ord.phone,
        address: ord.address,
      },
      warehouseFulfillment: {
        waybillCode: ord.trackingCode || '',
      },
      items: processedItems,
      financialSummary: {
        itemsSubtotal,
        shippingFee: 0,
        discountAmount: 0,
        totalOrderAmount,
        expectedCodAmount: totalOrderAmount,
      },
    });

    createdOrders.push(newSalesOrder);
  }

  // Bắn thông báo Realtime tự động gửi đến Kho (Warehouse) qua Socket.io
  emitMarketplaceOrdersImported({
    batchCode,
    channel,
    sourceName: sourceName || channel,
    orderCount: createdOrders.length,
    importedBy: user.fullName || user.username,
    message: `Seller vừa import ${createdOrders.length} đơn hàng từ ${sourceName || channel} (Mã lô: ${batchCode}). Kho cần duyệt lại!`,
    createdAt: new Date(),
  });

  // Ghi SystemLog kiểm toán
  try {
    await SystemLog.create({
      actorId: user._id,
      actorRole: user.roleCode || 'SELLER',
      majorFeature: 'Order Fulfillment',
      subFeature: 'Marketplace Order Import',
      action: 'IMPORT_MARKETPLACE_ORDERS',
      targetCollection: 'SalesOrder',
      targetCode: batchCode,
      afterSnapshot: {
        batchCode,
        channel,
        sourceId,
        sourceName,
        ordersCount: createdOrders.length,
      },
      ipAddress: req?.ip || '127.0.0.1',
    });
  } catch (err) {
    console.error('Lỗi ghi SystemLog import:', err.message);
  }

  return {
    batchCode,
    totalCreated: createdOrders.length,
    orders: createdOrders,
  };
};

/**
 * Kho (Warehouse) thực hiện duyệt đơn hàng import từ Seller (GBR-10: Kích hoạt giữ chỗ tồn kho)
 */
export const approveImportedOrder = async (orderId, warehouseUser) => {
  const order = await SalesOrder.findById(orderId);
  if (!order) {
    throw new Error('Đơn hàng không tồn tại');
  }

  if (order.importStatus !== 'PENDING_WAREHOUSE_APPROVAL') {
    throw new Error(`Đơn hàng không ở trạng thái chờ kho duyệt (Hiện tại: ${order.importStatus})`);
  }

  // Kiểm tra tồn kho khả dụng và giữ chỗ (Reserve)
  for (const item of order.items) {
    const sku = await Sku.findById(item.skuId);
    if (!sku) {
      throw new Error(`Sản phẩm SKU ${item.skuCode} không tồn tại`);
    }

    const available = (sku.onHandQty || 0) - (sku.reservedQty || 0);
    if (available < item.orderedQty) {
      throw new Error(`SKU ${sku.skuCode} không đủ tồn kho khả dụng (Còn ${available}, cần ${item.orderedQty})`);
    }

    // Tăng số lượng giữ chỗ
    sku.reservedQty = (sku.reservedQty || 0) + item.orderedQty;
    await sku.save();
  }

  order.importStatus = 'APPROVED';
  order.status = 'CONFIRMED_RESERVED';
  order.warehouseFulfillment = {
    ...order.warehouseFulfillment,
    stockReservedAt: new Date(),
  };
  order.approvedByWarehouseStaffId = warehouseUser._id;
  order.approvedAt = new Date();

  await order.save();

  return order;
};

/**
 * Kho (Warehouse) duyệt hàng loạt đơn hàng import
 */
export const approveImportedOrdersBulk = async (orderIds, warehouseUser) => {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một đơn hàng để duyệt');
  }

  const results = {
    successIds: [],
    failedList: [],
  };

  for (const id of orderIds) {
    try {
      await approveImportedOrder(id, warehouseUser);
      results.successIds.push(id);
    } catch (err) {
      results.failedList.push({ id, error: err.message });
    }
  }

  return results;
};

/**
 * Tạo file Excel mẫu chuẩn (Template) cho Shopee, TikTok Shop hoặc Excel nội bộ
 * Trả về Node Buffer hợp lệ để client mở không bị lỗi định dạng
 */
export const generateExcelTemplate = async (channelType = 'SHOPEE') => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('DANH_SACH_DON_HANG');

  const isMarketplaceShipping = channelType === 'SHOPEE' || channelType === 'TIKTOK' || channelType === 'MARKETPLACE_SHIPPING';

  if (isMarketplaceShipping) {
    // 14 cột theo định dạng file xuất đơn vận chuyển Shopee / TikTok thực tế
    sheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã đơn hàng riêng', key: 'externalCode', width: 26 },
      { header: 'Tên sản phầm', key: 'productName', width: 50 },
      { header: 'SL', key: 'qty', width: 10 },
      { header: 'KL (KG)', key: 'weight', width: 12 },
      { header: 'Hoả tốc (0/1)', key: 'express', width: 15 },
      { header: 'Tiền thu hộ', key: 'cod', width: 16 },
      { header: 'Ghi chú thêm', key: 'notes', width: 30 },
      { header: 'Tên khách hàng', key: 'custName', width: 22 },
      { header: 'Số điện thoại', key: 'phone', width: 18 },
      { header: 'Đường/phố, phường/xã, quận/huyện, tỉnh/thành phố', key: 'addressArea', width: 44 },
      { header: 'Số nhà, ngõ/ngách, hẻm', key: 'addressDetail', width: 40 },
      { header: 'Giao tối', key: 'eveningDelivery', width: 12 },
      { header: 'Shop trả ship', key: 'shopPaysShip', width: 15 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: channelType === 'SHOPEE' ? 'FFEE4D2D' : 'FF000000' },
    };

    // Dữ liệu mẫu thực tế
    sheet.addRow({
      stt: 1,
      externalCode: channelType === 'TIKTOK' ? '578912345678901234' : '2611015VRW3EUQ',
      productName: 'CV68 CHÂN VÁY XẾP LY BÊN ĐÍNH PHA LÊ CAO CẤP - KEM size: M x 1',
      qty: 1,
      weight: 1,
      express: 0,
      cod: 386818,
      notes: channelType === 'TIKTOK' ? 'Đồng kiểm TikTok Shop' : 'Cho khách xem hàng trước khi nhận',
      custName: 'Đặng Mai Chi',
      phone: '0987654321',
      addressArea: 'Phường Vĩnh Phúc, Thành phố Vĩnh Yên, Phú Thọ',
      addressDetail: 'Số 18 Định Trung',
      eveningDelivery: 0,
      shopPaysShip: 1,
    });

    sheet.addRow({
      stt: 2,
      externalCode: channelType === 'TIKTOK' ? '578912345678901235' : '2611015XYZ89AB',
      productName: 'DAM-DA-HOI-DO-M Đầm dạ hội lụa dáng dài xẻ tà - ĐỎ size: M x 1',
      qty: 2,
      weight: 1.5,
      express: 1,
      cod: 1250000,
      notes: 'Giao giờ hành chính, gọi trước khi đến',
      custName: 'Trần Minh Anh',
      phone: '0912345678',
      addressArea: 'Phường Thảo Điền, Thành phố Thủ Đức, TP. Hồ Chí Minh',
      addressDetail: 'Chung cư Masteri Thảo Điền, Tháp T2',
      eveningDelivery: 0,
      shopPaysShip: 0,
    });
  } else {
    // 9 cột chuẩn ARA Tiêu chuẩn
    sheet.columns = [
      { header: 'Mã Đơn Sàn (External Order Code)', key: 'externalCode', width: 28 },
      { header: 'Tên Khách Hàng', key: 'custName', width: 22 },
      { header: 'Số Điện Thoại', key: 'phone', width: 16 },
      { header: 'Địa Chỉ Giao Hàng', key: 'address', width: 35 },
      { header: 'Mã SKU / Barcode', key: 'skuCode', width: 20 },
      { header: 'Số Lượng', key: 'qty', width: 12 },
      { header: 'Đơn Giá (VND)', key: 'price', width: 16 },
      { header: 'Mã Vận Đơn Sàn (Tracking)', key: 'tracking', width: 24 },
      { header: 'Ghi Chú Đơn', key: 'notes', width: 25 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF8A6A46' },
    };

    sheet.addRow({
      externalCode: 'FB-202611-001',
      custName: 'Nguyễn Thị Thu Hà',
      phone: '0987654321',
      address: 'Số 18 Hoàng Cầu, Đống Đa, Hà Nội',
      skuCode: 'DAM-DA-HOI-DO-M',
      qty: 1,
      price: 650000,
      tracking: 'SPXVN029381726',
      notes: 'Giao giờ hành chính',
    });

    sheet.addRow({
      externalCode: 'FB-202611-002',
      custName: 'Trần Minh Anh',
      phone: '0912345678',
      address: 'Chung cư Masteri Thảo Điền, Quận 2, TP.HCM',
      skuCode: 'AO-SO-MI-LUA-L',
      qty: 2,
      price: 450000,
      tracking: 'SPXVN029381727',
      notes: 'Gọi trước khi giao',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
