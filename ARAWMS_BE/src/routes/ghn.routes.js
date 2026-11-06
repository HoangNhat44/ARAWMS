import express from 'express';
import { ghnService } from '../services/ghn.service.js';
import { handleGhnWebhook, getWebhookHistory } from '../controllers/ghn.webhook.controller.js';

const router = express.Router();

/**
 * 1. Lấy danh sách gói cước khả dụng
 * POST /api/carriers/ghn/services
 * Body: { from_district_id, to_district_id }
 */
router.post('/services', async (req, res, next) => {
  try {
    const { from_district_id = 1444, to_district_id = 1442 } = req.body;
    const result = await ghnService.getAvailableServices(from_district_id, to_district_id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * 2. Tạo đơn vận chuyển GHN
 * POST /api/carriers/ghn/orders
 */
router.post('/orders', async (req, res, next) => {
  try {
    const orderData = req.body;
    const result = await ghnService.createShippingOrder(orderData);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * 3. Lấy chi tiết đơn hàng GHN
 * GET /api/carriers/ghn/orders/:orderCode
 */
router.get('/orders/:orderCode', async (req, res, next) => {
  try {
    const { orderCode } = req.params;
    const result = await ghnService.getOrderDetail(orderCode);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * 4. Đăng ký Webhook URL với GHN
 * POST /api/carriers/ghn/webhook/register
 * Body: { url: "https://your-domain.ngrok-free.app/api/ghn/webhook" }
 */
router.post('/webhook/register', async (req, res, next) => {
  try {
    const { url } = req.body;
    const result = await ghnService.registerWebhook(url);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * 5. Dev Switch Status giả lập trên Sandbox
 * POST /api/carriers/ghn/dev-switch-status
 * Body: { order_code, status }
 */
router.post('/dev-switch-status', async (req, res, next) => {
  try {
    const { order_code, status } = req.body;
    const result = await ghnService.devSwitchStatus(order_code, status);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * 6. Lấy danh sách shop liên kết
 * GET /api/carriers/ghn/shops
 */
router.get('/shops', async (req, res, next) => {
  try {
    const shops = await ghnService.getShops();
    return res.status(200).json({ success: true, total: shops.length, data: shops });
  } catch (error) {
    next(error);
  }
});

/**
 * 7. WEBHOOK RECEIVER: GHN bắn callback về
 * POST /api/carriers/ghn/webhook
 */
router.post('/webhook', handleGhnWebhook);

/**
 * 8. Lịch sử Webhook đã nhận (debug)
 * GET /api/carriers/ghn/webhook/history
 */
router.get('/webhook/history', getWebhookHistory);

/**
 * 9. ENDPOINT MÔ PHỎNG LUỒNG ĐẦY ĐỦ (FLOW SIMULATION)
 * POST /api/carriers/ghn/simulate-flow (hoặc /api/test/flow-simulate)
 * Luồng chạy tuần tự:
 * 1. Tạo đơn hàng thử nghiệm qua GHN
 * 2. Lấy order_code
 * 3. Chuyển trạng thái delivering -> delivered
 * 4. Gọi Webhook nội bộ để cập nhật đối soát COD
 */
router.post('/simulate-flow', async (req, res, next) => {
  try {
    const codAmount = Number(req.body.cod_amount || 450000);
    const stepLogs = [];

    // Bước 1: Lấy danh mục phường xã hợp lệ tại Quận 10
    const wards = await ghnService.getWards(1444);
    const targetWard = wards[0] || { WardName: 'Phường Võ Thị Sáu', WardCode: '90795' };

    stepLogs.push({
      step: 1,
      title: 'Khởi tạo đơn hàng trên GHN Sandbox',
      time: new Date().toISOString(),
    });

    const createOrderResult = await ghnService.createShippingOrder({
      to_name: 'Nguyễn Văn Khách Hàng Test',
      to_phone: '0973018102',
      to_address: `72 Thành Thái, ${targetWard.WardName}, Quận 10, TP.HCM`,
      to_district_id: 1444,
      to_ward_code: targetWard.WardCode,
      cod_amount: codAmount,
      note: 'Đơn test tự động hóa luồng ARAWMS x GHN',
    });

    const orderCode = createOrderResult.order_code || createOrderResult.orderCode;
    stepLogs.push({
      step: 2,
      title: 'Đã nhận mã vận đơn GHN',
      orderCode,
      totalFee: createOrderResult.totalFee,
    });

    // Bước 3: Đổi trạng thái sang Delivering
    const switchDelivering = await ghnService.devSwitchStatus(orderCode, 'delivering');
    stepLogs.push({
      step: 3,
      title: 'Chuyển trạng thái sang [delivering]',
      result: switchDelivering,
    });

    // Bước 4: Đổi trạng thái sang Delivered
    const switchDelivered = await ghnService.devSwitchStatus(orderCode, 'delivered');
    stepLogs.push({
      step: 4,
      title: 'Chuyển trạng thái sang [delivered]',
      result: switchDelivered,
    });

    // Bước 5: Giả lập kích hoạt webhook tương ứng để controller xử lý
    const webhookSimulation = {
      OrderCode: orderCode,
      Status: 'delivered',
      CODAmount: codAmount,
      Fee: createOrderResult.totalFee || 20900,
      Time: new Date().toISOString(),
    };

    // Tạo đối tượng mock response để gọi trực tiếp webhook controller
    let webhookResult = null;
    await handleGhnWebhook(
      { body: webhookSimulation },
      {
        status: (code) => ({
          json: (data) => {
            webhookResult = { statusCode: code, data };
          },
        }),
      }
    );

    stepLogs.push({
      step: 5,
      title: 'Webhook Controller đã tiếp nhận và cập nhật đối soát COD',
      webhookPayload: webhookSimulation,
      webhookResponse: webhookResult,
    });

    return res.status(200).json({
      success: true,
      message: 'Mô phỏng toàn bộ luồng tạo đơn -> chuyển trạng thái -> Webhook đối soát COD hoàn tất 100%!',
      orderCode,
      codAmount,
      steps: stepLogs,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
