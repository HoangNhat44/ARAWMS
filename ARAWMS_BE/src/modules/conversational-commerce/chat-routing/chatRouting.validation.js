/**
 * Validation rules cho Chat Routing
 */

export const validateWebhookQuery = (req, res, next) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!mode || !token || !challenge) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu các tham số webhook hub.mode, hub.verify_token hoặc hub.challenge',
    });
  }
  next();
};

export default {
  validateWebhookQuery,
};
