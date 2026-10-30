import chatRoutingService from './chatRouting.service.js';

/**
 * CHAT ROUTING CONTROLLER
 * Xử lý Webhook Facebook Messenger & Phân bổ hội thoại (UC-69)
 */

/**
 * 1. Facebook Webhook Verification (Handshake)
 * GET /api/conversations/routing/inbound-webhook
 * Được Meta gọi tới khi bấm "Xác minh và lưu"
 */
export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'arawms_fb_verify_token_2026';

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ [Facebook Webhook] Xác minh webhook thành công!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ [Facebook Webhook] Sai verify token!');
      return res.sendStatus(403);
    }
  }

  return res.sendStatus(400);
};

/**
 * 2. Tiếp nhận tin nhắn từ Facebook Messenger
 * POST /api/conversations/routing/inbound-webhook
 * Được Meta gửi tới khi khách hàng nhắn tin vào Fanpage
 */
export const handleInboundMessage = async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'page') {
      // Phản hồi 200 OK ngay cho Facebook trước để tránh timeout quá 20s
      res.status(200).send('EVENT_RECEIVED');

      for (const entry of body.entry) {
        const pageId = entry.id;
        const messagingList = entry.messaging || [];
        for (const webhookEvent of messagingList) {
          if (webhookEvent && (webhookEvent.message || webhookEvent.postback)) {
            const senderPsid = webhookEvent.sender?.id;
            const textPreview = webhookEvent.message?.text || webhookEvent.postback?.title || '[Tập tin/Hành động]';
            console.log(`📩 [Messenger Inbound - Page: ${pageId}] Nhận sự kiện từ PSID ${senderPsid}: "${textPreview}"`);

            // Xử lý lưu hội thoại và tự động phân bổ Seller (UC-69)
            try {
              await chatRoutingService.processInboundWebhookMessage(webhookEvent, pageId);
            } catch (serviceErr) {
              console.error('❌ [UC-69 Error] Lỗi khi xử lý phân bổ Seller:', serviceErr);
            }
          }
        }
      }
      return;
    }

    return res.sendStatus(404);
  } catch (error) {
    console.error('❌ [Facebook Webhook Error]:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
};

export default {
  verifyWebhook,
  handleInboundMessage,
};
