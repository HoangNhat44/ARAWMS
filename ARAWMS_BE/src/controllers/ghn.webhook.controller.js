/**
 * ghn.webhook.controller.js
 * Controller tiếp nhận và xử lý sự kiện Webhook từ Giao Hàng Nhanh (GHN)
 */

// Bộ nhớ đệm (In-memory cache) mô phỏng kiểm tra tính lũy kế (Idempotency)
// Trong production, có thể lưu vào Redis hoặc MongoDB SalesOrder
const processedWebhookEvents = new Map();

/**
 * Endpoint: POST /api/carriers/ghn/webhook (hoặc /api/ghn/webhook)
 * GHN bắn sự kiện thay đổi trạng thái đơn hàng và COD
 */
export const handleGhnWebhook = async (req, res) => {
  const receivedAt = new Date().toISOString();
  const payload = req.body || {};

  // 1. Trích xuất payload linh hoạt (hỗ trợ cả chuẩn PascalCase OrderCode lẫn camelCase order_code của GHN)
  const orderCode = payload.OrderCode || payload.order_code || payload.Order_Code;
  const status = (payload.Status || payload.status || '').toLowerCase().trim();
  const codAmount = Number(payload.CODAmount ?? payload.cod_amount ?? 0);
  const fee = Number(payload.Fee ?? payload.total_fee ?? payload.fee ?? 0);
  const eventTime = payload.Time || payload.time || receivedAt;

  console.log('\n========================================================');
  console.log(`[GHN WEBHOOK RECEIVED] ${receivedAt}`);
  console.log(`- Mã vận đơn (OrderCode): ${orderCode}`);
  console.log(`- Trạng thái (Status): ${status}`);
  console.log(`- Tiền thu hộ COD: ${codAmount.toLocaleString('vi-VN')} ₫`);
  console.log(`- Cước phí: ${fee.toLocaleString('vi-VN')} ₫`);
  console.log(`- Thời gian sự kiện: ${eventTime}`);
  console.log('========================================================\n');

  // 2. Validate dữ liệu đầu vào bắt buộc
  if (!orderCode || !status) {
    console.error('[GHN Webhook Error] Thiếu OrderCode hoặc Status trong payload:', payload);
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu webhook không hợp lệ: Yêu cầu bắt buộc phải có OrderCode và Status.',
    });
  }

  // 3. Triển khai tính lũy kế (Idempotency Check)
  // Nếu webhook gửi lại trùng sự kiện và cùng trạng thái trong thời gian ngắn -> bỏ qua xử lý lặp
  const eventKey = `${orderCode}_${status}`;
  if (processedWebhookEvents.has(eventKey)) {
    console.log(`[GHN Webhook Idempotency] Sự kiện [${eventKey}] đã được xử lý trước đó. Bỏ qua ghi nhận trùng lặp.`);
    return res.status(200).json({
      success: true,
      idempotent: true,
      message: 'Sự kiện đã được ghi nhận trước đó (Idempotent OK).',
    });
  }

  // Đánh dấu sự kiện đã xử lý
  processedWebhookEvents.set(eventKey, {
    orderCode,
    status,
    codAmount,
    fee,
    processedAt: receivedAt,
  });

  // 4. Xử lý Logic Nghiệp vụ theo từng Status của GHN
  try {
    switch (status) {
      case 'ready_to_pick':
        console.log(`[ARAWMS State Machine] Đơn hàng ${orderCode}: Chờ tài xế GHN đến kho lấy hàng.`);
        break;

      case 'picking':
        console.log(`[ARAWMS State Machine] Đơn hàng ${orderCode}: Tài xế GHN đang trên đường đến kho lấy hàng.`);
        break;

      case 'storing':
        console.log(`[ARAWMS State Machine] Đơn hàng ${orderCode}: Kiện hàng may mặc đã nhập vào kho trung chuyển GHN.`);
        break;

      case 'delivering':
        console.log(`[ARAWMS State Machine] Đơn hàng ${orderCode}: Shipper GHN đang đi giao đến người nhận.`);
        break;

      case 'delivered':
        console.log(`[ARAWMS State Machine] Đơn hàng ${orderCode}: GIAO THÀNH CÔNG!`);
        console.log(`=> Kích hoạt ghi nhận đối soát COD: Tiền thực thu từ khách = ${codAmount.toLocaleString('vi-VN')} ₫.`);
        break;

      case 'cancel':
        console.log(`[ARAWMS State Machine] Đơn hàng ${orderCode}: ĐƠN ĐÃ BỊ HỦY. Tiến hành hoàn kho sản phẩm.`);
        break;

      case 'return':
      case 'returned':
        console.log(`[ARAWMS State Machine] Đơn hàng ${orderCode}: GIAO THẤT BẠI / CHUYỂN HOÀN. Tiếp nhận hàng hoàn tại kho.`);
        break;

      default:
        console.log(`[ARAWMS State Machine] Đơn hàng ${orderCode}: Trạng thái khác [${status}].`);
        break;
    }

    // 5. Luôn phản hồi HTTP 200 OK ngay lập tức cho GHN để tránh retry timeout
    return res.status(200).json({
      success: true,
      orderCode,
      status,
      message: `Webhook đã xử lý thành công trạng thái [${status}] cho đơn hàng ${orderCode}.`,
    });
  } catch (error) {
    console.error(`[GHN Webhook Internal Error] Lỗi khi xử lý đơn ${orderCode}:`, error.message);
    // Vẫn trả về 200 kèm cảnh báo để webhook GHN không bị treo retry liên tục
    return res.status(200).json({
      success: true,
      hasWarning: true,
      message: 'Đã nhận webhook nhưng có cảnh báo trong quá trình cập nhật nội bộ.',
    });
  }
};

/**
 * Lấy lịch sử sự kiện webhook đã nhận (phục vụ debug/kiểm tra)
 */
export const getWebhookHistory = (req, res) => {
  const events = Array.from(processedWebhookEvents.values()).reverse();
  return res.status(200).json({
    success: true,
    total: events.length,
    data: events,
  });
};

