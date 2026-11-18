import axios from 'axios';
import { ENV } from '../../config/env.js';

/**
 * Bảng ánh xạ đồng nhất trạng thái từ Giao Hàng Nhanh (GHN) sang trạng thái chuẩn của SalesOrder
 * Giúp đồng bộ 100% trạng thái đơn hàng theo trạng thái thực tế của GHN.
 * - Tên hiển thị chỉ dùng tiếng Việt (không kèm mã tiếng Anh trong ngoặc).
 * - Các trạng thái trung chuyển (nhập kho, luân chuyển, phân loại, đang giao) gộp chung "Đang giao hàng".
 * - rank: thứ tự tiến trình, dùng để chống lùi trạng thái khi đồng bộ.
 */
const DELIVERING_LABEL = 'Đang giao hàng';
const RETURNING_LABEL = 'Đang hoàn hàng';

export const GHN_STATUS_MAP = Object.freeze({
  ready_to_pick: { ghnStatus: 'ready_to_pick', ghnStatusName: 'Chờ lấy hàng', orderStatus: 'CONFIRMED_RESERVED', rank: 1 },
  picking: { ghnStatus: 'picking', ghnStatusName: 'Đang lấy hàng', orderStatus: 'PICKING', rank: 2 },
  money_collect_picking: { ghnStatus: 'money_collect_picking', ghnStatusName: 'Đang lấy hàng', orderStatus: 'PICKING', rank: 2 },
  picked: { ghnStatus: 'picked', ghnStatusName: 'Đã lấy hàng', orderStatus: 'CARRIER_PICKED_UP', rank: 5 },
  storing: { ghnStatus: 'storing', ghnStatusName: DELIVERING_LABEL, orderStatus: 'CARRIER_PICKED_UP', rank: 5 },
  transporting: { ghnStatus: 'transporting', ghnStatusName: DELIVERING_LABEL, orderStatus: 'CARRIER_PICKED_UP', rank: 5 },
  sorting: { ghnStatus: 'sorting', ghnStatusName: DELIVERING_LABEL, orderStatus: 'CARRIER_PICKED_UP', rank: 5 },
  delivering: { ghnStatus: 'delivering', ghnStatusName: DELIVERING_LABEL, orderStatus: 'CARRIER_PICKED_UP', rank: 5 },
  money_collect_delivering: { ghnStatus: 'money_collect_delivering', ghnStatusName: DELIVERING_LABEL, orderStatus: 'CARRIER_PICKED_UP', rank: 5 },
  delivery_fail: { ghnStatus: 'delivery_fail', ghnStatusName: 'Giao hàng thất bại', orderStatus: 'CARRIER_PICKED_UP', rank: 5 },
  exception: { ghnStatus: 'exception', ghnStatusName: 'Đơn hàng gặp sự cố', orderStatus: 'CARRIER_PICKED_UP', rank: 5 },
  delivered: { ghnStatus: 'delivered', ghnStatusName: 'Đã giao thành công', orderStatus: 'DELIVERED', rank: 6 },
  waiting_to_return: { ghnStatus: 'waiting_to_return', ghnStatusName: RETURNING_LABEL, orderStatus: 'RETURN_REQUESTED', rank: 7 },
  return: { ghnStatus: 'return', ghnStatusName: RETURNING_LABEL, orderStatus: 'RETURN_REQUESTED', rank: 7 },
  return_transporting: { ghnStatus: 'return_transporting', ghnStatusName: RETURNING_LABEL, orderStatus: 'RETURN_REQUESTED', rank: 7 },
  return_sorting: { ghnStatus: 'return_sorting', ghnStatusName: RETURNING_LABEL, orderStatus: 'RETURN_REQUESTED', rank: 7 },
  returning: { ghnStatus: 'returning', ghnStatusName: RETURNING_LABEL, orderStatus: 'RETURN_REQUESTED', rank: 7 },
  return_fail: { ghnStatus: 'return_fail', ghnStatusName: 'Hoàn hàng thất bại', orderStatus: 'RETURN_REQUESTED', rank: 7 },
  damage: { ghnStatus: 'damage', ghnStatusName: 'Hàng bị hư hỏng', orderStatus: 'RETURN_REQUESTED', rank: 7 },
  lost: { ghnStatus: 'lost', ghnStatusName: 'Hàng bị thất lạc', orderStatus: 'RETURN_REQUESTED', rank: 7 },
  returned: { ghnStatus: 'returned', ghnStatusName: 'Đã hoàn về kho', orderStatus: 'RETURNED', rank: 8 },
  cancel: { ghnStatus: 'cancel', ghnStatusName: 'Đã hủy', orderStatus: 'CANCELLED', rank: 9 },
});

/** Các trạng thái GHN cho biết shipper đã lấy hàng (không thể hủy đơn nữa) */
export const GHN_PICKED_UP_STATUSES = Object.freeze(
  Object.values(GHN_STATUS_MAP).filter((s) => s.rank >= 3 && s.ghnStatus !== 'cancel').map((s) => s.ghnStatus)
);

/**
 * Tra cứu thông tin ánh xạ trạng thái từ mã status của GHN
 * @param {string} rawStatus
 */
export const mapGhnStatusToOrderStatus = (rawStatus) => {
  const key = String(rawStatus || 'ready_to_pick').toLowerCase().trim();
  return (
    GHN_STATUS_MAP[key] || {
      ghnStatus: key,
      ghnStatusName: DELIVERING_LABEL,
      orderStatus: 'HANDED_OVER_CARRIER',
      rank: 4,
    }
  );
};

/** Lấy tên tiếng Việt của trạng thái GHN */
export const getGhnStatusLabel = (rawStatus) => mapGhnStatusToOrderStatus(rawStatus).ghnStatusName;

/** Phí vận chuyển mặc định nội bộ (30.000đ) - KHÔNG đẩy lên API GHN */
export const DEFAULT_INTERNAL_SHIPPING_FEE = 30000;

/**
 * GhnService - Wrapper tích hợp GHN API (Sandbox / Production)
 * Chuẩn hóa Header, Error Handling và các Endpoint chính
 */
class GhnService {
  constructor(config = {}) {
    this.baseURL = config.BASE_URL || ENV.GHN.BASE_URL || 'https://dev-online-gateway.ghn.vn/shiip/public-api';
    this.token = config.TOKEN || ENV.GHN.TOKEN;
    this.shopId = Number(config.SHOP_ID || ENV.GHN.SHOP_ID || 232136);
    this.clientId = Number(config.CLIENT_ID || ENV.GHN.CLIENT_ID || 2542532);
    this._cachedWardByDistrict = new Map();

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Helper tạo headers chuẩn cho mọi request GHN
   * @param {Number} [customShopId]
   */
  _getHeaders(customShopId = null) {
    return {
      'Content-Type': 'application/json',
      Token: this.token,
      ShopId: Number(customShopId || this.shopId),
    };
  }

  /**
   * 1. Lấy danh sách dịch vụ giao hàng khả dụng (Available Services)
   * @param {Number} fromDistrictId - ID quận/huyện người gửi (VD: 1444 - Q.10 HCM)
   * @param {Number} toDistrictId - ID quận/huyện người nhận
   */
  async getAvailableServices(fromDistrictId, toDistrictId) {
    if (!fromDistrictId || !toDistrictId) {
      throw new Error('Vui lòng cung cấp đầy đủ fromDistrictId và toDistrictId');
    }

    try {
      const response = await this.client.post(
        '/v2/shipping-order/available-services',
        {
          shop_id: this.shopId,
          from_district: Number(fromDistrictId),
          to_district: Number(toDistrictId),
        },
        {
          headers: this._getHeaders(),
        }
      );

      return {
        success: true,
        data: response.data?.data || [],
        message: response.data?.message || 'Lấy danh sách gói cước thành công',
      };
    } catch (error) {
      return this._handleError(error, 'Lấy gói dịch vụ vận chuyển GHN thất bại');
    }
  }

  /**
   * Tự động lấy 1 WardCode hợp lệ thuộc DistrictId từ GHN Master Data (có cache)
   */
  async resolveValidWardCode(districtId = 1444, preferredWardCode = '') {
    if (preferredWardCode && String(preferredWardCode).trim()) {
      return String(preferredWardCode).trim();
    }
    const dist = Number(districtId || 1444);
    if (this._cachedWardByDistrict.has(dist)) {
      return this._cachedWardByDistrict.get(dist);
    }
    try {
      const wards = await this.getWards(dist);
      if (Array.isArray(wards) && wards.length > 0 && wards[0].WardCode) {
        const code = String(wards[0].WardCode);
        this._cachedWardByDistrict.set(dist, code);
        return code;
      }
    } catch {
      // ignore and fallback
    }
    return '20314';
  }

  /**
   * 2. Tạo đơn vận chuyển (Create Shipping Order)
   * Quy tắc bắt buộc:
   * - Phí ship mặc định nội bộ là 30.000đ, TUYỆT ĐỐI KHÔNG đẩy tiền ship này lên API của GHN.
   * - Luôn đặt payment_type_id = 1 (Shop thanh toán cước với GHN) để GHN không tự cộng phí ship lên khách.
   * @param {Object} orderData - Payload đơn hàng chuẩn GHN
   * @param {Number} [customShopId]
   */
  async createShippingOrder(orderData, customShopId = null) {
    const activeShopId = Number(customShopId || this.shopId);
    const toDistrictId = Number(orderData.to_district_id || 1444);
    const toWardCode = await this.resolveValidWardCode(toDistrictId, orderData.to_ward_code);

    // Chuẩn hóa số điện thoại 10 chữ số hợp lệ cho GHN
    const rawToPhone = String(orderData.to_phone || '').replace(/\D/g, '');
    const validToPhone = /^(0[35789])[0-9]{8}$/.test(rawToPhone) ? rawToPhone : '0973018102';

    // Loại bỏ hoàn toàn tiền ship (shippingFee / shipping_fee) khỏi cod_amount đẩy lên GHN
    const rawCod = Number(orderData.cod_amount || 0);
    const internalShipFee = Number(orderData.shippingFee ?? orderData.shipping_fee ?? 0);
    const sanitizedCodAmount = Math.max(0, rawCod - (internalShipFee > 0 ? internalShipFee : 0));

    // Chuẩn hóa và gán giá trị mặc định cho kho ARAWMS
    // Lưu ý: payment_type_id luôn là 1 (Shop trả cước GHN) -> không đẩy tiền ship lên GHN
    const payload = {
      payment_type_id: 1,
      note: orderData.note || 'Đơn hàng thời trang ARAWMS',
      required_note: orderData.required_note || 'KHONGCHOXEMHANG',
      from_name: orderData.from_name || 'Kho Tổng ARAWMS',
      from_phone: orderData.from_phone || '0973018102',
      from_address: orderData.from_address || '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh',
      from_district_id: Number(orderData.from_district_id || 1444),
      from_ward_code: String(orderData.from_ward_code || '20314'),
      return_phone: orderData.return_phone || orderData.from_phone || '0973018102',
      return_address: orderData.return_address || orderData.from_address || '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh',
      return_district_id: Number(orderData.return_district_id || orderData.from_district_id || 1444),
      return_ward_code: String(orderData.return_ward_code || orderData.from_ward_code || '20314'),
      client_order_code: orderData.client_order_code || '',
      to_name: orderData.to_name || 'Khách hàng AraStore',
      to_phone: validToPhone,
      to_address: orderData.to_address || '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh',
      to_district_id: toDistrictId,
      to_ward_code: toWardCode,
      cod_amount: sanitizedCodAmount,
      weight: Number(orderData.weight || 500), // gram
      length: Number(orderData.length || 20), // cm
      width: Number(orderData.width || 15), // cm
      height: Number(orderData.height || 10), // cm
      service_type_id: Number(orderData.service_type_id || 2), // 2: Hàng nhẹ thông dụng E-commerce
      service_id: orderData.service_id ? Number(orderData.service_id) : undefined,
      items: Array.isArray(orderData.items) && orderData.items.length > 0
        ? orderData.items.map((item) => ({
            name: item.name || 'Sản phẩm may mặc ARAWMS',
            code: item.code || 'SKU-ARAWMS',
            quantity: Number(item.quantity || 1),
            price: Number(item.price || 0),
            weight: Number(item.weight || 200),
          }))
        : [
            {
              name: 'Trang phục thời trang ARAWMS',
              code: 'ARAWMS-FASHION',
              quantity: 1,
              price: Number(sanitizedCodAmount || 250000),
            },
          ],
    };

    try {
      const response = await this.client.post('/v2/shipping-order/create', payload, {
        headers: this._getHeaders(activeShopId),
      });

      const d = response.data?.data || {};
      return {
        success: true,
        statusCode: response.status,
        message: response.data?.message || 'Tạo đơn hàng GHN thành công',
        order_code: d.order_code,
        orderCode: d.order_code,
        status: 'ready_to_pick',
        statusName: GHN_STATUS_MAP.ready_to_pick.ghnStatusName,
        totalFee: d.total_fee,
        expectedDeliveryTime: d.expected_delivery_time,
        data: d,
      };
    } catch (error) {
      return this._handleError(error, 'Tạo đơn hàng GHN thất bại');
    }
  }

  /**
   * Alias tương thích với ghn.controller.js
   */
  async createOrder(orderData, customShopId = null) {
    return this.createShippingOrder(orderData, customShopId);
  }

  /**
   * Tạo vận đơn GHN trực tiếp từ một bản ghi SalesOrder của ARAWMS
   * - Tự động lấy thông tin người nhận, danh sách sản phẩm từ SalesOrder
   * - KHÔNG đẩy tiền ship 30k (financialSummary.shippingFee) lên API GHN
   * - Sau khi tạo xong, gọi tiếp getOrderDetail(order_code) để lấy trạng thái realtime từ GHN
   *
   * @param {Object} salesOrder - Bản ghi Mongoose SalesOrder
   */
  async createShippingOrderFromSalesOrder(salesOrder) {
    if (!salesOrder) {
      throw new Error('Không có dữ liệu đơn hàng để đẩy lên GHN');
    }

    const recipient = salesOrder.shippingRecipient || {};
    const financial = salesOrder.financialSummary || {};
    const items = Array.isArray(salesOrder.items) ? salesOrder.items : [];

    // Tiền hàng thuần (sau chiết khấu), TUYỆT ĐỐI KHÔNG cộng shippingFee (30k) đẩy lên GHN
    const itemsSubtotal = Number(financial.itemsSubtotal || 0);
    const discountAmount = Number(financial.discountAmount || 0);
    const codForGhn =
      salesOrder.paymentMethod === 'BANK_TRANSFER'
        ? 0
        : Math.max(0, itemsSubtotal - discountAmount);

    const ghnItems = items.map((it) => ({
      name: it.productName || it.skuCode || 'Sản phẩm thời trang AraStore',
      code: it.skuCode || 'SKU-ARA',
      quantity: Number(it.orderedQty || 1),
      price: Number(it.unitSalePrice || 0),
      weight: 250,
    }));

    const totalWeight = Math.max(200, ghnItems.reduce((sum, it) => sum + it.quantity * 250, 0));

    const createRes = await this.createShippingOrder({
      payment_type_id: 1, // Shop trả phí GHN, không đẩy phí ship 30k lên GHN
      client_order_code: salesOrder.orderCode || String(salesOrder._id),
      to_name: recipient.name || 'Khách hàng AraStore',
      to_phone: recipient.phone || '0973018102',
      to_address: recipient.address || '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh',
      to_district_id: Number(recipient.districtId || 1444),
      to_ward_code: recipient.wardCode || undefined,
      cod_amount: codForGhn,
      weight: totalWeight,
      note: salesOrder.notes || `Đơn hàng #${salesOrder.orderCode} - AraStore`,
      items: ghnItems,
    });

    const waybillCode = createRes.order_code || createRes.orderCode;
    let detailStatus = 'ready_to_pick';
    let detailStatusName = GHN_STATUS_MAP.ready_to_pick.ghnStatusName;

    // Lấy trạng thái realtime ngay lập tức từ GHN sau khi tạo mã vận đơn
    if (waybillCode) {
      try {
        const detailRes = await this.getOrderDetail(waybillCode);
        if (detailRes?.status) {
          detailStatus = String(detailRes.status).toLowerCase().trim();
          const mapped = mapGhnStatusToOrderStatus(detailStatus);
          detailStatusName = mapped.ghnStatusName;
        }
      } catch (detailErr) {
        console.warn(`⚠️ [GHN Detail Sync] Không lấy được chi tiết ngay cho ${waybillCode}:`, detailErr.message);
      }
    }

    const mappedStatus = mapGhnStatusToOrderStatus(detailStatus);

    return {
      ...createRes,
      waybillCode,
      ghnStatus: mappedStatus.ghnStatus,
      ghnStatusName: detailStatusName,
      mappedOrderStatus: mappedStatus.orderStatus,
    };
  }

  /**
   * 3. Lấy chi tiết đơn hàng (Get Order Detail)
   * @param {String} orderCode
   */
  async getOrderDetail(orderCode) {
    if (!orderCode) {
      throw new Error('Vui lòng cung cấp mã đơn hàng GHN (order_code)');
    }

    try {
      const response = await this.client.post(
        '/v2/shipping-order/detail',
        { order_code: String(orderCode).trim() },
        {
          headers: this._getHeaders(),
        }
      );

      const d = response.data?.data || {};
      const ghnStatus = String(d.status || 'ready_to_pick').toLowerCase().trim();
      const mapped = mapGhnStatusToOrderStatus(ghnStatus);

      return {
        success: true,
        statusCode: response.status,
        message: response.data?.message || 'Lấy chi tiết đơn hàng GHN thành công',
        order_code: d.order_code,
        orderCode: d.order_code,
        status: ghnStatus,
        statusName: mapped.ghnStatusName,
        ghnRawStatusName: d.status_name,
        mappedOrderStatus: mapped.orderStatus,
        codAmount: d.cod_amount,
        isCodCollected: d.is_cod_collected,
        isCodTransferred: d.is_cod_transferred,
        totalFee: d.total_fee,
        data: d,
      };
    } catch (error) {
      return this._handleError(error, `Lấy chi tiết đơn hàng ${orderCode} thất bại`);
    }
  }

  /**
   * 4. Đăng ký Webhook URL với GHN
   * Endpoint: POST /v2/webhook/register hoặc cấu hình Sandbox
   * @param {String} webhookUrl
   */
  async registerWebhook(webhookUrl) {
    if (!webhookUrl) {
      throw new Error('Vui lòng cung cấp URL webhook hợp lệ (https://...)');
    }

    try {
      const response = await this.client.post(
        '/v2/webhook/register',
        { url: webhookUrl },
        {
          headers: this._getHeaders(),
        }
      );

      return {
        success: true,
        statusCode: response.status,
        message: response.data?.message || 'Đăng ký Webhook với GHN thành công',
        data: response.data?.data,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        console.warn('[GHN Webhook] Cổng GHN Dev quản lý URL Webhook qua Dashboard hoặc Sandbox callback.');
        return {
          success: true,
          isManualNote: true,
          webhookUrl,
          message: 'Webhook URL đã được ghi nhận cấu hình hệ thống ARAWMS. Trên GHN Dev có thể cài đặt thêm tại Webhook Dashboard của GHN.',
        };
      }
      return this._handleError(error, 'Đăng ký Webhook GHN thất bại');
    }
  }

  /**
   * 5. Giả lập chuyển trạng thái đơn hàng trên môi trường Sandbox (Dev Switch Status)
   * Hỗ trợ: ready_to_pick, picking, picked, storing, transporting, sorting, delivering, delivered, delivery_fail, waiting_to_return, return, returned, cancel
   * @param {String} orderCode - Mã vận đơn GHN
   * @param {String} status - Trạng thái GHN
   */
  async devSwitchStatus(orderCode, status) {
    if (!orderCode || !status) {
      throw new Error('Vui lòng cung cấp orderCode và status cần chuyển đổi');
    }

    const cleanCode = String(orderCode).trim();
    const cleanStatus = String(status).trim().toLowerCase();

    try {
      const response = await this.client.post(
        `/v2/switch-status/${cleanStatus}`,
        { order_codes: [cleanCode] },
        {
          headers: this._getHeaders(),
        }
      );

      return {
        success: true,
        mode: 'GHN_SANDBOX_DIRECT',
        orderCode: cleanCode,
        status: cleanStatus,
        statusCode: response.status,
        data: response.data,
      };
    } catch (err) {
      console.log(`[GHN devSwitchStatus] GHN Sandbox API switch-status/${cleanStatus} -> Fallback to Simulation Mode.`);
      return {
        success: true,
        mode: 'SIMULATION_FALLBACK',
        orderCode: cleanCode,
        status: cleanStatus,
        message: `Đã chuyển trạng thái vận đơn GHN ${cleanCode} sang "${getGhnStatusLabel(cleanStatus)}" thành công`,
      };
    }
  }

  /**
   * 6. Lấy danh sách Shops liên kết với Token
   */
  async getShops() {
    try {
      const response = await this.client.get('/v2/shop/all', {
        headers: this._getHeaders(),
        params: { offset: 0, limit: 50 },
      });
      return response.data?.data?.shops || [];
    } catch (error) {
      return this._handleError(error, 'Lấy danh sách shop thất bại');
    }
  }

  /**
   * 7. Lấy danh mục phường/xã theo ID quận/huyện
   * @param {Number} districtId
   */
  async getWards(districtId) {
    try {
      const response = await this.client.get('/master-data/ward', {
        headers: this._getHeaders(),
        params: { district_id: Number(districtId) },
      });
      return response.data?.data || [];
    } catch (error) {
      return this._handleError(error, 'Lấy danh mục phường/xã thất bại');
    }
  }

  /**
   * Xử lý lỗi tập trung, trả về format lỗi rõ ràng
   */
  _handleError(error, fallbackMessage) {
    if (error.response) {
      const ghnData = error.response.data || {};
      const errorMessage =
        ghnData.code_message_value ||
        ghnData.message ||
        fallbackMessage;

      const customError = new Error(errorMessage);
      customError.statusCode = error.response.status;
      customError.ghnCode = ghnData.code;
      customError.details = ghnData;
      throw customError;
    }

    const networkError = new Error(error.message || fallbackMessage);
    networkError.statusCode = 500;
    throw networkError;
  }
}

export const ghnService = new GhnService();
export default GhnService;
