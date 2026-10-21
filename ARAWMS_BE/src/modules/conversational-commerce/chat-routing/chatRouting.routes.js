import express from 'express';
import { verifyWebhook, handleInboundMessage } from './chatRouting.controller.js';

const router = express.Router();

/**
 * Route Webhook Facebook Messenger
 * Endpoint: /api/conversations/routing/inbound-webhook
 */
router.get('/inbound-webhook', verifyWebhook);
router.post('/inbound-webhook', handleInboundMessage);

export default router;
