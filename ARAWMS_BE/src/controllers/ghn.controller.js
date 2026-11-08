import { ghnService } from '../services/ghn.service.js';

/**
 * Tạo đơn hàng giao hàng GHN
 * POST /api/carriers/ghn/orders
 */
export const createGhnOrder = async (req, res, next) => {
  try {
    const shopId = req.headers['shopid'] || req.query.shopId;
    const result = await ghnService.createOrder(req.body, shopId);
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy chi tiết đơn hàng GHN
 * GET /api/carriers/ghn/orders/:orderCode
 * hoặc POST /api/carriers/ghn/orders/detail
 */
export const getGhnOrderDetail = async (req, res, next) => {
  try {
    const orderCode = req.params.orderCode || req.body.order_code || req.query.order_code;
    const result = await ghnService.getOrderDetail(orderCode);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy danh sách shop liên kết với Token
 * GET /api/carriers/ghn/shops
 */
export const getGhnShops = async (req, res, next) => {
  try {
    const shops = await ghnService.getShops();
    return res.status(200).json({
      success: true,
      data: shops,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Chạy test toàn diện 2 API (Tạo đơn hàng -> Lấy chi tiết đơn hàng)
 * POST /api/carriers/ghn/test
 */
export const testGhnFlow = async (req, res, next) => {
  try {
    // 1. Payload chuẩn theo đề bài của user
    const samplePayload = {
      payment_type_id: 2,
      note: 'Hàng thử nghiệm - Không giao',
      required_note: 'KHONGCHOXEMHANG',
      to_name: 'Nguyễn Văn Test',
      to_phone: '0987654321',
      to_address: '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh',
      to_ward_code: '20314',
      to_district_id: 1444,
      weight: 200,
      length: 10,
      width: 10,
      height: 10,
      service_type_id: 2,
      items: [
        {
          name: 'Áo thun test',
          code: 'TEST01',
          quantity: 1,
          price: 100000,
          length: 10,
          width: 10,
          height: 10,
          weight: 200,
        },
      ],
      ...req.body,
    };

    // 2. Gọi tạo đơn hàng
    const createResult = await ghnService.createOrder(samplePayload);
    const orderCode = createResult.orderCode;

    // 3. Gọi lấy chi tiết đơn hàng
    const detailResult = await ghnService.getOrderDetail(orderCode);

    return res.status(200).json({
      success: true,
      message: '✅ Kiểm thử tích hợp GHN Dev/Staging thành công 100%!',
      summary: {
        orderCode: orderCode,
        totalFee: createResult.totalFee,
        expectedDeliveryTime: createResult.expectedDeliveryTime,
        status: detailResult.status,
        statusName: detailResult.statusName,
      },
      step1_createOrder: createResult,
      step2_getOrderDetail: detailResult,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createGhnOrder,
  getGhnOrderDetail,
  getGhnShops,
  testGhnFlow,
};
