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
import Customer from '../../../models/Customer.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import { emitMarketplaceOrdersImported } from '../../../config/socket.js';

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
 * Phân tích file Excel tải lên từ Seller (Shopee / TikTok / ARA Template)
 */
export const parseExcelFile = async (fileBuffer, channel, sourceId) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('File Excel rỗng hoặc không có bảng tính hợp lệ');
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // Bỏ qua dòng tiêu đề 1
    if (rowNumber === 1) return;
    const values = row.values;
    rows.push({
      rowNumber,
      externalOrderCode: String(values[1] || '').trim(),
      customerName: String(values[2] || '').trim(),
      phone: String(values[3] || '').trim().replace(/[^0-9]/g, ''),
      address: String(values[4] || '').trim(),
      skuCode: String(values[5] || '').trim().toUpperCase(),
      quantity: Number(values[6]) || 1,
      unitPrice: Number(values[7]) || 0,
      trackingCode: String(values[8] || '').trim(),
      notes: String(values[9] || '').trim(),
    });
  });

  if (rows.length === 0) {
    throw new Error('Không tìm thấy dữ liệu đơn hàng trong file Excel');
  }

  // Nhóm theo mã đơn hàng ngoài sàn (externalOrderCode)
  const groupedOrdersMap = new Map();
  for (const r of rows) {
    if (!r.externalOrderCode) continue;

    if (!groupedOrdersMap.has(r.externalOrderCode)) {
      groupedOrdersMap.set(r.externalOrderCode, {
        externalOrderCode: r.externalOrderCode,
        customerName: r.customerName || 'Khách Sàn TMĐT',
        phone: r.phone || '0900000000',
        address: r.address || 'Địa chỉ sàn TMĐT',
        trackingCode: r.trackingCode || '',
        notes: r.notes || '',
        items: [],
      });
    }

    groupedOrdersMap.get(r.externalOrderCode).items.push({
      skuCode: r.skuCode,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
    });
  }

  const parsedOrders = Array.from(groupedOrdersMap.values());
  const validatedOrders = [];

  // Xác thực từng đơn hàng và SKU trong kho
  for (const ord of parsedOrders) {
    let orderValid = true;
    let warningMessage = '';
    const validatedItems = [];
    let itemsTotal = 0;

    // Kiểm tra đơn trùng lặp trong hệ thống
    const existingOrder = await SalesOrder.findOne({
      'sourceDetails.externalOrderCode': ord.externalOrderCode,
    }).lean();

    if (existingOrder) {
      orderValid = false;
      warningMessage = `Mã đơn sàn ${ord.externalOrderCode} đã được import trước đó (${existingOrder.orderCode})`;
    }

    for (const item of ord.items) {
      const skuDoc = await Sku.findOne({
        $or: [{ skuCode: item.skuCode }, { skuBarcode: item.skuCode }],
      }).lean();

      if (!skuDoc) {
        orderValid = false;
        warningMessage = `Mã SKU [${item.skuCode}] không tồn tại trong kho`;
        validatedItems.push({
          skuCode: item.skuCode,
          skuId: null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          availableQty: 0,
          isValidSku: false,
        });
      } else {
        const available = (skuDoc.onHandQty || 0) - (skuDoc.reservedQty || 0);
        const finalPrice = item.unitPrice > 0 ? item.unitPrice : (skuDoc.retailPrice || 0);
        itemsTotal += item.quantity * finalPrice;

        validatedItems.push({
          skuCode: skuDoc.skuCode,
          skuId: skuDoc._id,
          skuBarcode: skuDoc.skuBarcode,
          productName: skuDoc.styleName || skuDoc.productName || skuDoc.skuCode,
          quantity: item.quantity,
          unitPrice: finalPrice,
          availableQty: available,
          isValidSku: true,
          isStockSufficient: available >= item.quantity,
        });

        if (available < item.quantity) {
          warningMessage = (warningMessage ? warningMessage + '; ' : '') + `SKU [${skuDoc.skuCode}] tồn khả dụng không đủ (còn ${available}, cần ${item.quantity})`;
        }
      }
    }

    validatedOrders.push({
      ...ord,
      items: validatedItems,
      totalAmount: itemsTotal,
      isValid: orderValid,
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
    // 1. Tạo hoặc lấy thông tin khách hàng
    let customerDoc = await Customer.findOne({ phone: ord.phone });
    if (!customerDoc) {
      const customerCode = await CounterSequence.getNextSequence('CUSTOMER_CODE', 'CUST', 5);
      customerDoc = await Customer.create({
        customerCode,
        fullName: ord.customerName || 'Khách hàng Sàn TMĐT',
        phone: ord.phone || '0900000000',
        shippingAddresses: [
          {
            recipientName: ord.customerName,
            phone: ord.phone,
            addressLine: ord.address,
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
        totalOrderAmount: itemsSubtotal,
        expectedCodAmount: itemsSubtotal,
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
 */
export const generateExcelTemplate = async (channelType = 'SHOPEE') => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('DANH_SACH_DON_HANG');

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

  // Định dạng tiêu đề
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: channelType === 'SHOPEE' ? 'FFEE4D2D' : channelType === 'TIKTOK' ? 'FF000000' : 'FF8A6A46' },
  };

  // Thêm dữ liệu mẫu minh họa
  sheet.addRow({
    externalCode: channelType === 'SHOPEE' ? 'SHOPEE-202611-001' : 'TIKTOK-99827361',
    custName: 'Nguyễn Thị Thu Hà',
    phone: '0987654321',
    address: 'Số 18 Hoàng Cầu, Đống Đa, Hà Nội',
    skuCode: 'DAM-DA-HOI-DO-M',
    qty: 1,
    price: 650000,
    tracking: channelType === 'SHOPEE' ? 'SPXVN029381726' : 'JNT-TK-889123',
    notes: 'Giao giờ hành chính',
  });

  sheet.addRow({
    externalCode: channelType === 'SHOPEE' ? 'SHOPEE-202611-002' : 'TIKTOK-99827362',
    custName: 'Trần Minh Anh',
    phone: '0912345678',
    address: 'Chung cư Masteri Thảo Điền, Quận 2, TP.HCM',
    skuCode: 'AO-SO-MI-LUA-L',
    qty: 2,
    price: 450000,
    tracking: channelType === 'SHOPEE' ? 'SPXVN029381727' : 'JNT-TK-889124',
    notes: 'Gọi trước khi giao',
  });

  return await workbook.xlsx.writeBuffer();
};
