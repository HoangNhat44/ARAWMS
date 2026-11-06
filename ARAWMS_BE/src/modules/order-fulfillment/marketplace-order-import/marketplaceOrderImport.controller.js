/**
 * ============================================================================
 * @title        : Marketplace Order Import Controller
 * @author       : AraStore Backend Team
 * @createdDate  : 2026-11-02
 * @description  : Tiếp nhận request import đơn hàng đa kênh (Shopee, TikTok, Excel)
 *                 và phê duyệt từ Warehouse.
 * ============================================================================
 */

import * as marketplaceService from './marketplaceOrderImport.service.js';

/**
 * GET /api/orders/marketplace/channels
 * Lấy danh sách kênh bán hàng đa nguồn thực tế từ Database
 */
export const getSalesChannels = async (req, res) => {
  try {
    const channels = await marketplaceService.getSalesChannels();
    return res.status(200).json({ success: true, data: channels });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/orders/marketplace/channels/summary
 * Lấy tóm tắt trạng thái kết nối các kênh bán hàng thực tế từ Database (phục vụ Header Chips)
 */
export const getChannelsSummary = async (req, res) => {
  try {
    const summary = await marketplaceService.getChannelsSummary();
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/orders/marketplace/preview-excel
 * Đọc file Excel tải lên từ Seller và trả về kết quả kiểm tra hợp lệ
 */
export const previewExcelImport = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Vui lòng đính kèm file Excel (.xlsx)' });
    }

    const { channel = 'SHOPEE', sourceId = 'shopee_mall_01' } = req.body;
    const previewResult = await marketplaceService.parseExcelFile(req.file.buffer, channel, sourceId);

    return res.status(200).json({ success: true, data: previewResult });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/orders/marketplace/auto-provision-skus
 * Tự động tạo sản phẩm & SKU mới trong kho cho các sản phẩm chưa có mã
 */
export const autoProvisionSkus = async (req, res) => {
  try {
    const { items } = req.body;
    const result = await marketplaceService.autoProvisionSkus(items);
    return res.status(200).json({
      success: true,
      message: `Đã tự động khởi tạo thành công ${result.length} SKU mới vào kho!`,
      data: result,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/orders/marketplace/process-orders
 * Seller thực hiện "Xử lý đơn" (Tạo các đơn hàng hợp lệ vào hệ thống)
 */
export const processImportOrders = async (req, res) => {
  try {
    const { channel, sourceId, sourceName, orders } = req.body;
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ success: false, message: 'Dữ liệu đơn hàng không hợp lệ' });
    }

    const result = await marketplaceService.processImportOrders(
      { channel, sourceId, sourceName, orders },
      { channel, sourceId, sourceName },
      req.user,
      req
    );

    return res.status(201).json({
      success: true,
      message: `Đã xử lý và import thành công ${result.totalCreated} đơn hàng từ sàn ${sourceName || channel}! Chờ Warehouse duyệt.`,
      data: result,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/orders/marketplace/:id/warehouse-approve
 * Warehouse duyệt 1 đơn hàng import
 */
export const approveImportedOrder = async (req, res) => {
  try {
    const order = await marketplaceService.approveImportedOrder(req.params.id, req.user);
    return res.status(200).json({
      success: true,
      message: `Đã duyệt đơn hàng ${order.orderCode}! Tồn kho đã được giữ chỗ.`,
      data: order,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/orders/marketplace/warehouse-approve-bulk
 * Warehouse duyệt hàng loạt đơn hàng import
 */
export const approveImportedOrdersBulk = async (req, res) => {
  try {
    const { orderIds } = req.body;
    const result = await marketplaceService.approveImportedOrdersBulk(orderIds, req.user);
    return res.status(200).json({
      success: true,
      message: `Đã duyệt thành công ${result.successIds.length}/${orderIds.length} đơn hàng!`,
      data: result,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/orders/marketplace/template
 * Tải file Excel mẫu chuẩn theo sàn (Shopee / TikTok / ARA)
 */
export const downloadExcelTemplate = async (req, res) => {
  try {
    const { channel = 'SHOPEE' } = req.query;
    const buffer = await marketplaceService.generateExcelTemplate(channel);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ARA_Template_${channel}_Orders.xlsx`);
    res.setHeader('Content-Length', buffer.length);
    return res.end(buffer);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
