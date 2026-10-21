import express from 'express';
import {
  getConversations,
  getConversationById,
  getConversationMessages,
  sendCustomerMessage,
  addConversationTag,
  removeConversationTag,
} from './chatInterface.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { validateSendMessage } from './chatInterface.validation.js';

const router = express.Router();

router.use(authenticate);
router.use(authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER'));

// UC-72: Danh sách và chi tiết cuộc hội thoại
router.get('/', getConversations);
router.get('/:id', getConversationById);
router.get('/:id/messages', getConversationMessages);

// UC-74: Gửi tin nhắn cho khách hàng
router.post('/:id/messages', validateSendMessage, sendCustomerMessage);

// UC-73: Gắn / gỡ thẻ hội thoại
router.post('/:id/tags', addConversationTag);
router.delete('/:id/tags/:tag', removeConversationTag);

export default router;
