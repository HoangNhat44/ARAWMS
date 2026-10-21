import axios from 'axios';
import { ENV } from '../config/env.js';

class GhnService {
  constructor(config = {}) {
    this.baseURL = config.BASE_URL || ENV.GHN.BASE_URL;
    this.token = config.TOKEN || ENV.GHN.TOKEN;
    this.shopId = config.SHOP_ID || ENV.GHN.SHOP_ID;
    this.clientId = config.CLIENT_ID || ENV.GHN.CLIENT_ID;

    // Axios client instance with standard timeout
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Helper: Resolve valid ShopId
   * (In GHN Dev, client_id is often mistaken for shop_id. If client_id is provided, resolve to real shop_id)
   */
  async resolveShopId(providedShopId) {
    const targetShopId = providedShopId ? Number(providedShopId) : Number(this.shopId);
    if (targetShopId && targetShopId !== this.clientId) {
      return targetShopId;
    }

    try {
      const shops = await this.getShops();
      if (shops && shops.length > 0) {
        return shops[0]._id;
      }
    } catch {
      // Fallback to configured shopId
    }

    return targetShopId || 232136;
  }

  /**
   * 1. Create Shipping Order
   * @param {Object} orderData - Payload for creating order
   * @param {Number|String} [customShopId] - Optional Shop ID override
   */
  async createOrder(orderData, customShopId = null) {
    const activeShopId = await this.resolveShopId(customShopId);

    // Chuẩn bị payload: Nếu thiếu thông tin kho gửi (tài khoản test chưa tạo địa chỉ kho), bổ sung mặc định
    const payload = {
      from_name: orderData.from_name || 'Kho Tổng ARAWMS',
      from_phone: orderData.from_phone || '0973018102',
      from_address: orderData.from_address || '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh',
      from_district_id: orderData.from_district_id || 1444,
      from_ward_code: orderData.from_ward_code || '20314',
      return_phone: orderData.return_phone || orderData.from_phone || '0973018102',
      return_address: orderData.return_address || orderData.from_address || '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh',
      return_district_id: orderData.return_district_id || orderData.from_district_id || 1444,
      return_ward_code: orderData.return_ward_code || orderData.from_ward_code || '20314',
      ...orderData,
    };

    // Chuẩn hóa to_ward_code nếu user truyền mã cũ (20308 -> 20314 đối với P14 Q10)
    if (payload.to_ward_code === '20308' && payload.to_district_id === 1444) {
      payload.to_ward_code = '20314';
    }

    try {
      const response = await this.client.post('/v2/shipping-order/create', payload, {
        headers: {
          Token: this.token,
          ShopId: activeShopId,
        },
      });

      return {
        success: true,
        statusCode: response.status,
        message: response.data.message || 'Tạo đơn hàng GHN thành công',
        orderCode: response.data.data?.order_code,
        totalFee: response.data.data?.total_fee,
        expectedDeliveryTime: response.data.data?.expected_delivery_time,
        data: response.data.data,
      };
    } catch (error) {
      return this._handleError(error, 'Tạo đơn hàng GHN thất bại');
    }
  }

  /**
   * 2. Get Order Detail
   * @param {String} orderCode - GHN order code (e.g. L8MXXX)
   */
  async getOrderDetail(orderCode) {
    if (!orderCode) {
      throw new Error('Vui lòng cung cấp mã đơn hàng GHN (order_code)');
    }

    try {
      const response = await this.client.post(
        '/v2/shipping-order/detail',
        { order_code: orderCode.trim() },
        {
          headers: {
            Token: this.token,
          },
        }
      );

      return {
        success: true,
        statusCode: response.status,
        message: response.data.message || 'Lấy chi tiết đơn hàng GHN thành công',
        orderCode: response.data.data?.order_code,
        status: response.data.data?.status,
        statusName: response.data.data?.status_name,
        codAmount: response.data.data?.cod_amount,
        shippingFee: response.data.data?.total_fee,
        toName: response.data.data?.to_name,
        toPhone: response.data.data?.to_phone,
        toAddress: response.data.data?.to_address,
        data: response.data.data,
      };
    } catch (error) {
      return this._handleError(error, `Lấy chi tiết đơn hàng ${orderCode} thất bại`);
    }
  }

  /**
   * 3. Get All Shops linked with Token
   */
  async getShops() {
    try {
      const response = await this.client.get('/v2/shop/all', {
        headers: {
          Token: this.token,
        },
        params: {
          offset: 0,
          limit: 50,
        },
      });

      return response.data?.data?.shops || [];
    } catch (error) {
      return this._handleError(error, 'Lấy danh sách shop thất bại');
    }
  }

  /**
   * 4. Master data: Get Wards by District ID
   */
  async getWards(districtId) {
    try {
      const response = await this.client.get('/master-data/ward', {
        headers: {
          Token: this.token,
        },
        params: {
          district_id: districtId,
        },
      });

      return response.data?.data || [];
    } catch (error) {
      return this._handleError(error, 'Lấy danh sách phường/xã thất bại');
    }
  }

  /**
   * Error normalizer
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

// Export singleton instance as well as the class
export const ghnService = new GhnService();
export default GhnService;
